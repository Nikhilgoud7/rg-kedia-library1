// server/lib/migration/rollbackEngine.ts — Transactional Batch Rollback Engine

import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../backup/restoreEngine.js';
import { RollbackOptions, RollbackResult } from './types.js';

/**
 * Rolls back an executed migration batch transactionally, safely restoring the previous state.
 *
 * SAFETY & TRANSACTION GUARANTEES:
 * 1. Strictly guards target database against unapproved endpoints.
 * 2. Pre-flight dependency check: blocks deletion if any user has active book loans.
 * 3. Atomic transaction (prisma.$transaction) ensures all-or-nothing rollback.
 * 4. Verifies mathematical reconciliation between pre- and post-rollback counts.
 * 5. Logs an immutable administrative audit log entry for the rollback event.
 */
export async function rollbackMigrationBatch(
  prisma: PrismaClient,
  options: RollbackOptions
): Promise<RollbackResult> {
  const startTime = Date.now();

  // 1. Target Database Safety Guard
  const targetDbUrl = options.targetDbUrl || process.env.DATABASE_URL || '';
  validateRestoreDatabaseTarget(targetDbUrl);

  // 2. Identify Target User IDs for Rollback
  let userIds: string[] = options.userIds || [];

  if (userIds.length === 0) {
    // Locate the batch in AuditLog to retrieve createdUserIds
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'MIGRATION_SIMULATION_EXECUTED',
        targetId: options.batchId,
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!auditRecord || !auditRecord.details) {
      throw new Error(
        `BATCH_NOT_FOUND: No migration simulation audit record found for batch "${options.batchId}". Specify userIds explicitly.`
      );
    }

    try {
      const details = JSON.parse(auditRecord.details);
      if (Array.isArray(details.createdUserIds)) {
        userIds = details.createdUserIds;
      }
    } catch {
      throw new Error(`BATCH_METADATA_CORRUPT: Audit details for batch "${options.batchId}" could not be parsed.`);
    }
  }

  if (userIds.length === 0) {
    return {
      status: 'SUCCESS',
      batchId: options.batchId,
      deletedCount: 0,
      preRollbackCount: await prisma.user.count(),
      postRollbackCount: await prisma.user.count(),
      isReconciled: true,
      auditLogCreated: false,
      durationMs: Date.now() - startTime,
    };
  }

  // 3. Dependency Safety Check — Verify No Active Lendings
  const activeLendingsCount = await prisma.lending.count({
    where: {
      userId: { in: userIds },
      status: 'ISSUED',
    },
  });

  if (activeLendingsCount > 0) {
    throw new Error(
      `DEPENDENCY_CONFLICT: Cannot rollback batch "${options.batchId}". ${activeLendingsCount} active book loan(s) exist for users in this batch. Books must be returned before rollback.`
    );
  }

  // 4. Measure Pre-Rollback Count
  const preRollbackCount = await prisma.user.count();

  // 5. Transactional Rollback
  let deletedCount = 0;

  await prisma.$transaction(
    async (tx) => {
      // Delete child dependencies in referential order
      await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
      await tx.bookRequest.deleteMany({ where: { userId: { in: userIds } } });
      await tx.lending.deleteMany({ where: { userId: { in: userIds } } });
      await tx.examPaper.deleteMany({ where: { uploadedById: { in: userIds } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });

      // Delete the users
      const deleteResult = await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
      deletedCount = deleteResult.count;

      // Record Rollback Audit Log
      await tx.auditLog.create({
        data: {
          actorId: options.actorId,
          action: 'MIGRATION_ROLLBACK_EXECUTED',
          targetId: options.batchId,
          details: JSON.stringify({
            batchId: options.batchId,
            deletedCount,
            preRollbackCount,
            postRollbackCount: preRollbackCount - deletedCount,
            durationMs: Date.now() - startTime,
          }),
        },
      });
    },
    { timeout: 60000 }
  );

  // 6. Post-Rollback Count & Reconciliation
  const postRollbackCount = await prisma.user.count();
  const isReconciled = postRollbackCount === preRollbackCount - deletedCount;

  if (!isReconciled) {
    throw new Error(
      `ROLLBACK_RECONCILIATION_FAILURE: Expected post-rollback count ${preRollbackCount - deletedCount}, but actual database count is ${postRollbackCount}.`
    );
  }

  return {
    status: 'SUCCESS',
    batchId: options.batchId,
    deletedCount,
    preRollbackCount,
    postRollbackCount,
    isReconciled,
    auditLogCreated: true,
    durationMs: Date.now() - startTime,
  };
}
