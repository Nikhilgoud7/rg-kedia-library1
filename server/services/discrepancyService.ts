import { PrismaClient, Prisma } from '@prisma/client';
import { logAdminAction } from '../lib/auditLogger.js';

const prisma = new PrismaClient();

export const DISCREPANCY_STATUSES = {
  OPEN: 'OPEN',
  UNDER_INVESTIGATION: 'UNDER_INVESTIGATION',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type DiscrepancyStatus = (typeof DISCREPANCY_STATUSES)[keyof typeof DISCREPANCY_STATUSES];

export const DISCREPANCY_CATEGORIES = {
  MISSING_PHYSICAL_BOOK: 'MISSING_PHYSICAL_BOOK',
  DAMAGED_BOOK: 'DAMAGED_BOOK',
  INCORRECT_BARCODE: 'INCORRECT_BARCODE',
  DUPLICATE_BARCODE: 'DUPLICATE_BARCODE',
  INCORRECT_SHELF_LOCATION: 'INCORRECT_SHELF_LOCATION',
  INVENTORY_COUNT_MISMATCH: 'INVENTORY_COUNT_MISMATCH',
  UNREGISTERED_PHYSICAL_BOOK: 'UNREGISTERED_PHYSICAL_BOOK',
  INCORRECT_STATUS: 'INCORRECT_STATUS',
  OTHER: 'OTHER',
} as const;

export type DiscrepancyCategory = (typeof DISCREPANCY_CATEGORIES)[keyof typeof DISCREPANCY_CATEGORIES];

export const DISCREPANCY_SEVERITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type DiscrepancySeverity = (typeof DISCREPANCY_SEVERITIES)[keyof typeof DISCREPANCY_SEVERITIES];

export const ALLOWED_DISCREPANCY_TRANSITIONS: Record<DiscrepancyStatus, DiscrepancyStatus[]> = {
  OPEN: ['UNDER_INVESTIGATION', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED'],
  UNDER_INVESTIGATION: ['ACTION_REQUIRED', 'RESOLVED', 'CLOSED'],
  ACTION_REQUIRED: ['UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'UNDER_INVESTIGATION'],
  CLOSED: [], // Terminal immutable state
};

export interface CreateDiscrepancyDTO {
  auditId: string;
  bookId?: string;
  bookCopyId?: string;
  barcode?: string;
  category: DiscrepancyCategory;
  severity?: DiscrepancySeverity;
  description: string;
}

export interface DiscrepancyFilterDTO {
  auditId?: string;
  status?: DiscrepancyStatus;
  category?: DiscrepancyCategory;
  severity?: DiscrepancySeverity;
  search?: string;
  page?: number;
  limit?: number;
}

export interface RecordCorrectiveActionDTO {
  actionTaken: string;
  resultingStatus?: DiscrepancyStatus;
  notes?: string;
}

export class DiscrepancyService {
  /**
   * Lists discrepancies with comprehensive filtering and pagination.
   */
  public static async getDiscrepancies(filters: DiscrepancyFilterDTO = {}): Promise<{
    discrepancies: any[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditDiscrepancyWhereInput = {};

    if (filters.auditId) {
      where.auditId = filters.auditId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.severity) {
      where.severity = filters.severity;
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { barcode: { contains: q } },
        { description: { contains: q } },
        { book: { title: { contains: q } } },
      ];
    }

    const [discrepancies, totalCount] = await Promise.all([
      prisma.auditDiscrepancy.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: 'desc' }, { discoveredDate: 'desc' }],
        include: {
          book: { select: { id: true, title: true, author: true } },
          bookCopy: { select: { id: true, copyNumber: true, status: true, shelfLocation: true } },
          audit: { select: { id: true, auditNumber: true, type: true, title: true } },
          correctiveActions: {
            orderBy: { actionDate: 'desc' },
            include: { performedBy: { select: { id: true, name: true, role: true } } },
          },
        },
      }),
      prisma.auditDiscrepancy.count({ where }),
    ]);

    return {
      discrepancies,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single discrepancy with full history of corrective actions.
   */
  public static async getDiscrepancyById(id: string): Promise<any> {
    const discrepancy = await prisma.auditDiscrepancy.findUnique({
      where: { id },
      include: {
        book: { select: { id: true, title: true, author: true, isbn: true, shelfLocation: true } },
        bookCopy: {
          select: {
            id: true,
            copyNumber: true,
            barcode: true,
            status: true,
            condition: true,
            shelfLocation: true,
          },
        },
        audit: { select: { id: true, auditNumber: true, type: true, title: true, status: true } },
        correctiveActions: {
          orderBy: { actionDate: 'desc' },
          include: { performedBy: { select: { id: true, name: true, role: true } } },
        },
      },
    });

    if (!discrepancy) {
      throw { status: 404, error: 'Audit discrepancy not found.' };
    }

    return discrepancy;
  }

  /**
   * Manually logs an audit discrepancy (e.g. physical book discovered damaged or uncataloged).
   */
  public static async createDiscrepancy(dto: CreateDiscrepancyDTO, actorId: string): Promise<any> {
    const { auditId, bookId, bookCopyId, barcode, category, severity, description } = dto;

    if (!auditId || !category || !description || !description.trim()) {
      throw { status: 400, error: 'auditId, category, and description are required.' };
    }

    // Verify audit
    const audit = await prisma.libraryAudit.findUnique({
      where: { id: auditId },
    });

    if (!audit) {
      throw { status: 404, error: 'Associated library audit not found.' };
    }

    if (audit.status === 'CLOSED') {
      throw { status: 400, error: 'Cannot log discrepancies against a CLOSED audit engagement.' };
    }

    const discrepancy = await prisma.auditDiscrepancy.create({
      data: {
        auditId,
        bookId: bookId || null,
        bookCopyId: bookCopyId || null,
        barcode: barcode?.trim() || null,
        category,
        severity: severity || 'MEDIUM',
        description: description.trim(),
        status: 'OPEN',
      },
      include: {
        book: { select: { title: true } },
        bookCopy: { select: { copyNumber: true, status: true } },
      },
    });

    await logAdminAction({
      actorId,
      action: 'AUDIT_DISCREPANCY_LOGGED',
      targetId: discrepancy.id,
      details: {
        auditNumber: audit.auditNumber,
        category,
        severity: discrepancy.severity,
      },
    });

    return discrepancy;
  }

  /**
   * Records a formal corrective action against a discrepancy and updates its workflow status.
   * Enforces immutability: closed discrepancies cannot be modified.
   */
  public static async recordCorrectiveAction(
    discrepancyId: string,
    dto: RecordCorrectiveActionDTO,
    actorId: string
  ): Promise<any> {
    const { actionTaken, resultingStatus, notes } = dto;

    if (!actionTaken || typeof actionTaken !== 'string' || !actionTaken.trim()) {
      throw { status: 400, error: 'actionTaken description is required.' };
    }

    const discrepancy = await prisma.auditDiscrepancy.findUnique({
      where: { id: discrepancyId },
      include: { audit: true },
    });

    if (!discrepancy) {
      throw { status: 404, error: 'Audit discrepancy not found.' };
    }

    // Immutability Check: Closed discrepancies are locked
    if (discrepancy.status === DISCREPANCY_STATUSES.CLOSED) {
      throw {
        status: 400,
        error: 'Discrepancy is already CLOSED and immutable. No further corrective actions may be logged.',
      };
    }

    // Validate resulting status transition if specified
    const nextStatus = resultingStatus
      ? (String(resultingStatus).trim().toUpperCase() as DiscrepancyStatus)
      : (discrepancy.status as DiscrepancyStatus);

    if (resultingStatus && !Object.values(DISCREPANCY_STATUSES).includes(nextStatus)) {
      throw {
        status: 400,
        error: `Invalid resulting status "${resultingStatus}". Allowed statuses: ${Object.values(DISCREPANCY_STATUSES).join(', ')}`,
      };
    }

    if (resultingStatus && nextStatus !== discrepancy.status) {
      const allowed = ALLOWED_DISCREPANCY_TRANSITIONS[discrepancy.status as DiscrepancyStatus];
      if (!allowed.includes(nextStatus)) {
        throw {
          status: 400,
          error: `Invalid status transition from ${discrepancy.status} to ${nextStatus}. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'None (Terminal)'}`,
        };
      }
    }

    const isResolvedOrClosed = nextStatus === 'RESOLVED' || nextStatus === 'CLOSED';

    const [action, updatedDiscrepancy] = await prisma.$transaction([
      prisma.auditCorrectiveAction.create({
        data: {
          discrepancyId,
          actionTaken: actionTaken.trim(),
          performedById: actorId,
          resultingStatus: nextStatus,
          notes: notes?.trim() || null,
        },
        include: {
          performedBy: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.auditDiscrepancy.update({
        where: { id: discrepancyId },
        data: {
          status: nextStatus,
          resolutionNotes: notes?.trim() ? notes.trim() : actionTaken.trim(),
          resolvedAt: isResolvedOrClosed ? new Date() : undefined,
          resolvedById: isResolvedOrClosed ? actorId : undefined,
        },
        include: {
          book: { select: { title: true } },
          bookCopy: { select: { copyNumber: true, barcode: true } },
          correctiveActions: {
            orderBy: { actionDate: 'desc' },
            include: { performedBy: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    await logAdminAction({
      actorId,
      action: 'AUDIT_CORRECTIVE_ACTION_LOGGED',
      targetId: discrepancy.id,
      details: {
        auditId: discrepancy.auditId,
        actionTaken: actionTaken.trim(),
        previousStatus: discrepancy.status,
        resultingStatus: nextStatus,
      },
    });

    return {
      action,
      discrepancy: updatedDiscrepancy,
    };
  }
}
