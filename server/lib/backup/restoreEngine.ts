// server/lib/backup/restoreEngine.ts — Database Disaster Recovery Restore Engine
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  CompleteBackupArchive,
  EncryptedBackupEnvelope,
  RestoreOptions,
  RestoreResult,
} from './types.js';
import { decryptPayload, redactSecrets } from './cryptoUtils.js';
import { verifyBackupFile } from './verifyEngine.js';

export const APPROVED_TEST_ENDPOINT_PATTERNS = [
  'ep-autumn-sky-b3vpykh4',
  'localhost',
  '127.0.0.1',
];

/**
 * Validates that the target database connection is in the approved test database allowlist.
 * Throws a fatal safety error if targeting an unapproved host or production.
 *
 * STRICT RECOVERY SAFETY:
 * Production restoration is strictly blocked by default to prevent accidental data loss.
 */
export function validateRestoreDatabaseTarget(targetDbUrl?: string): { host: string } {
  if (!targetDbUrl || typeof targetDbUrl !== 'string' || !targetDbUrl.trim()) {
    throw new Error('NO_DATABASE_CONFIGURED: Missing database connection URL for restoration.');
  }

  let host = '';
  try {
    const parsedUri = new URL(targetDbUrl.replace('prisma://', 'postgres://'));
    host = (parsedUri.host || '').toLowerCase();
  } catch {
    throw new Error('MALFORMED_URL: Target database URL is malformed and could not be parsed.');
  }

  if (!host) {
    throw new Error('MALFORMED_URL: Target database URL does not specify a valid host.');
  }

  const isApproved = APPROVED_TEST_ENDPOINT_PATTERNS.some((pattern) => host.includes(pattern));
  if (!isApproved) {
    throw new Error(
      `RESTORE_TARGET_BLOCKED: Host "${host}" is not in the approved test database allowlist. Production restoration is strictly blocked.`
    );
  }

  return { host };
}

/**
 * Restores a validated backup into the target database.
 *
 * TRANSACTIONAL GUARANTEE (DR-9C-02):
 * All destructive deletions and subsequent repopulations are executed inside a single
 * atomic Prisma transaction (prisma.$transaction). If an error occurs at any point
 * during restoration, all mutations are automatically rolled back, leaving the pre-existing
 * database state completely intact.
 */
export async function restoreDatabaseBackup(
  prisma: PrismaClient,
  filePath: string,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  const startTime = Date.now();

  // 1. Strict Target Database Safety Guard
  if (!options.skipSafetyCheck) {
    const targetUrl = process.env.DATABASE_URL || '';
    validateRestoreDatabaseTarget(targetUrl);
  }

  // 2. Pre-flight Integrity Verification
  await verifyBackupFile(filePath, { encryptionKey: options.encryptionKey });

  // 3. Read and parse archive
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawContent);

  let archive: CompleteBackupArchive;
  if (parsed?.format === 'RG_KEDIA_ENCRYPTED_BACKUP_V1') {
    if (!options.encryptionKey) {
      throw new Error('RESTORE_FAILED: Backup is encrypted but no encryption key was provided.');
    }
    const decryptedJson = decryptPayload(parsed as EncryptedBackupEnvelope, options.encryptionKey);
    archive = JSON.parse(decryptedJson);
  } else {
    archive = parsed as CompleteBackupArchive;
  }

  const { metadata, data } = archive;

  // 4. Dry Run Check — Guarantees ZERO database mutations
  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      restoredCounts: metadata.recordCounts,
      durationMs: Date.now() - startTime,
    };
  }

  // 5. Execute restore in an atomic Prisma transaction
  try {
    await prisma.$transaction(
      async (tx) => {
        // A. Clean up in reverse dependency order using the transaction client
        await (tx as any).auditCorrectiveAction?.deleteMany({}).catch(() => {});
        await (tx as any).auditDiscrepancy?.deleteMany({}).catch(() => {});
        await (tx as any).inventoryAuditScan?.deleteMany({}).catch(() => {});
        await (tx as any).inventoryAuditSession?.deleteMany({}).catch(() => {});
        await (tx as any).libraryAudit?.deleteMany({}).catch(() => {});
        await tx.auditLog.deleteMany({});
        await tx.notification.deleteMany({});
        await tx.examPaper.deleteMany({});
        await tx.bookRequest.deleteMany({});
        await tx.lending.deleteMany({});
        await tx.bookCopy.deleteMany({});
        await tx.bookProgram.deleteMany({});
        await tx.bookCover.deleteMany({});
        await tx.book.deleteMany({});
        await tx.user.deleteMany({});

        // B. Repopulate in forward dependency order using the transaction client
        // 1. Users
        if (data.users && data.users.length > 0) {
          await tx.user.createMany({
            data: data.users.map((u) => ({
              ...u,
              lockedUntil: u.lockedUntil ? new Date(u.lockedUntil) : null,
              createdAt: new Date(u.createdAt),
              updatedAt: new Date(u.updatedAt),
            })),
          });
        }

        // 2. Books
        if (data.books && data.books.length > 0) {
          await tx.book.createMany({
            data: data.books.map((b) => ({
              ...b,
              createdAt: new Date(b.createdAt),
              updatedAt: new Date(b.updatedAt),
            })),
          });
        }

        // 3. Book Covers (convert base64 back to Buffer)
        if (data.bookCovers && data.bookCovers.length > 0) {
          for (const cover of data.bookCovers) {
            await tx.bookCover.create({
              data: {
                id: cover.id,
                bookId: cover.bookId,
                data: Buffer.from(cover.data, 'base64'),
                mimeType: cover.mimeType,
                sizeBytes: cover.sizeBytes,
                createdAt: new Date(cover.createdAt),
                updatedAt: new Date(cover.updatedAt),
              },
            });
          }
        }

        // 4. Book Programs
        if (data.bookPrograms && data.bookPrograms.length > 0) {
          await tx.bookProgram.createMany({
            data: data.bookPrograms,
          });
        }

        // 5. Book Copies
        if (data.bookCopies && data.bookCopies.length > 0) {
          await tx.bookCopy.createMany({
            data: data.bookCopies,
          });
        }

        // 6. Lendings
        if (data.lendings && data.lendings.length > 0) {
          await tx.lending.createMany({
            data: data.lendings.map((l) => ({
              ...l,
              issuedDate: new Date(l.issuedDate),
              dueDate: new Date(l.dueDate),
              returnedDate: l.returnedDate ? new Date(l.returnedDate) : null,
              createdAt: new Date(l.createdAt),
            })),
          });
        }

        // 7. Book Requests
        if (data.bookRequests && data.bookRequests.length > 0) {
          await tx.bookRequest.createMany({
            data: data.bookRequests.map((r) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });
        }

        // 8. Exam Papers
        if (data.examPapers && data.examPapers.length > 0) {
          await tx.examPaper.createMany({
            data: data.examPapers.map((e) => ({
              ...e,
              createdAt: new Date(e.createdAt),
              updatedAt: new Date(e.updatedAt),
            })),
          });
        }

        // 9. Notifications
        if (data.notifications && data.notifications.length > 0) {
          await tx.notification.createMany({
            data: data.notifications.map((n) => ({
              ...n,
              dismissedAt: n.dismissedAt ? new Date(n.dismissedAt) : null,
              createdAt: new Date(n.createdAt),
            })),
          });
        }

        // 10. Audit Logs
        if (data.auditLogs && data.auditLogs.length > 0) {
          await tx.auditLog.createMany({
            data: data.auditLogs.map((a) => ({
              ...a,
              timestamp: new Date(a.timestamp),
            })),
          });
        }

        // C. Post-Restoration Sanity Check inside the transaction before committing
        const userCount = await tx.user.count();
        const bookCount = await tx.book.count();
        const coverCount = await tx.bookCover.count();

        if (userCount !== metadata.recordCounts.User) {
          throw new Error(
            `POST_RESTORE_MISMATCH: Restored user count (${userCount}) does not match expected (${metadata.recordCounts.User}).`
          );
        }
        if (bookCount !== metadata.recordCounts.Book) {
          throw new Error(
            `POST_RESTORE_MISMATCH: Restored book count (${bookCount}) does not match expected (${metadata.recordCounts.Book}).`
          );
        }
        if (coverCount !== metadata.recordCounts.BookCover) {
          throw new Error(
            `POST_RESTORE_MISMATCH: Restored cover count (${coverCount}) does not match expected (${metadata.recordCounts.BookCover}).`
          );
        }
      },
      {
        timeout: 60000, // 60s transaction timeout for full relational repopulation
        maxWait: 10000, // 10s wait for connection slot
      }
    );

    return {
      success: true,
      restoredCounts: metadata.recordCounts,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err.message || String(err));
    throw new Error(`RESTORE_EXECUTION_FAILED: ${safeMsg}`);
  }
}
