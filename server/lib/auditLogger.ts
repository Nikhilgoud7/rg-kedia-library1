import { Prisma } from '@prisma/client';
import prisma from '../middleware/auth.js';

export const AUDIT_ACTIONS = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  USER_DELETED: 'USER_DELETED',
  BOOK_CREATED: 'BOOK_CREATED',
  BOOK_UPDATED: 'BOOK_UPDATED',
  BOOK_DELETED: 'BOOK_DELETED',
  BOOK_COPY_UPDATED: 'BOOK_COPY_UPDATED',
  BOOK_COPY_CREATED: 'BOOK_COPY_CREATED',
  BOOK_COPY_DELETED: 'BOOK_COPY_DELETED',
  BOOK_COPY_LOST: 'BOOK_COPY_LOST',
  BOOK_COPY_DAMAGED: 'BOOK_COPY_DAMAGED',
  BOOK_COPY_WITHDRAWN: 'BOOK_COPY_WITHDRAWN',
  LENDING_APPROVED: 'LENDING_APPROVED',
  LENDING_REJECTED: 'LENDING_REJECTED',
  LENDING_RETURNED: 'LENDING_RETURNED',
  EXAM_PAPER_UPLOADED: 'EXAM_PAPER_UPLOADED',
  EXAM_PAPER_DELETED: 'EXAM_PAPER_DELETED',
  INVENTORY_RECONCILED: 'INVENTORY_RECONCILED',
  BOOK_EXPORTED: 'BOOK_EXPORTED',
  BOOK_COVER_UPDATED: 'BOOK_COVER_UPDATED',
  BOOK_COVER_DELETED: 'BOOK_COVER_DELETED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

export interface AuditLogParams {
  actorId: string;
  action: AuditAction;
  targetId?: string | null;
  details?: Record<string, any> | string | null;
  tx?: Prisma.TransactionClient;
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /hash/i,
  /authorization/i,
  /cookie/i,
];

function sanitizeDetails(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(sanitizeDetails);
  }
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key))) {
      continue; // Strip sensitive key completely
    }
    if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeDetails(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Persists an administrative activity to the AuditLog table.
 * Strips sensitive keys (passwords, tokens, hashes) from details.
 */
export async function logAdminAction({
  actorId,
  action,
  targetId,
  details,
  tx,
}: AuditLogParams): Promise<void> {
  const client = tx || prisma;
  let safeDetails: string | null = null;

  if (details !== undefined && details !== null) {
    if (typeof details === 'string') {
      try {
        const parsed = JSON.parse(details);
        safeDetails = JSON.stringify(sanitizeDetails(parsed));
      } catch {
        safeDetails = details;
      }
    } else {
      safeDetails = JSON.stringify(sanitizeDetails(details));
    }
  }

  await client.auditLog.create({
    data: {
      actorId,
      action,
      targetId: targetId ?? null,
      details: safeDetails,
    },
  });
}
