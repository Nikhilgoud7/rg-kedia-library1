// server/lib/migration/demoPurgeEngine.ts — Safe Demo Account Purge & Inventory Engine

import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../backup/restoreEngine.js';
import { createDatabaseBackup } from '../backup/backupEngine.js';
import { verifyBackupFile } from '../backup/verifyEngine.js';
import {
  executeDemoAccountInventory,
  classifyAccountProvenance,
} from './demoProvenance.js';
import {
  DemoPurgePlan,
  DemoPurgeDependencyReport,
  DemoPurgeOptions,
  DemoPurgeResult,
} from './types.js';

export class DemoPurgeRollbackError extends Error {
  constructor(public resultData: any) {
    super('DRY_RUN_ROLLBACK: Purge transaction intentionally rolled back for non-mutating verification.');
    this.name = 'DemoPurgeRollbackError';
  }
}

/**
 * Resolves a safe, non-demo administrative actor for executing the demo account purge.
 *
 * FAIL-CLOSED ACTOR RESOLUTION (SEC-9F-01):
 * 1. If an actorId is explicitly requested:
 *    - Validates that the user exists in the database (ACTOR_NOT_FOUND).
 *    - Validates that the user has the administrative role LIBRARIAN (ACTOR_NOT_ADMIN).
 *    - Validates that the user is active (ACTOR_DEACTIVATED).
 *    - Validates via multi-factor provenance that the user is strictly classified as NON_DEMO (ACTOR_IS_DEMO).
 * 2. If no actorId is requested:
 *    - Searches for an active LIBRARIAN whose provenance evaluates strictly to NON_DEMO.
 *    - If no non-demo librarian is found, fails closed (NO_ELIGIBLE_ADMIN_ACTOR).
 * 3. Never falls back to a demo persona or dummy system ID that could be deleted or unverified.
 */
export async function resolveSafeAdminActor(
  prisma: PrismaClient,
  requestedActorId?: string
): Promise<string> {
  const normalizedId = requestedActorId?.trim();

  if (normalizedId) {
    const user = await prisma.user.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        rollNumber: true,
        phone: true,
        program: true,
        branch: true,
        active: true,
      },
    });

    if (!user) {
      throw new Error(`ACTOR_NOT_FOUND: Administrative actor with ID "${normalizedId}" was not found in the database.`);
    }

    if (user.role !== 'LIBRARIAN') {
      throw new Error(`ACTOR_NOT_ADMIN: Specified actor "${user.email}" does not have administrative role (found: ${user.role}).`);
    }

    if (!user.active) {
      throw new Error(`ACTOR_DEACTIVATED: Specified administrator "${user.email}" is deactivated.`);
    }

    const provenance = classifyAccountProvenance(user);
    if (provenance.classification !== 'NON_DEMO') {
      throw new Error(
        `ACTOR_IS_DEMO: Specified administrative actor "${user.email}" is classified as ${provenance.classification}. The executing actor must be a verified NON_DEMO institutional user.`
      );
    }

    return user.id;
  }

  // Auto-resolution: search all active librarians in the database
  const librarians = await prisma.user.findMany({
    where: { role: 'LIBRARIAN', active: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNumber: true,
      phone: true,
      program: true,
      branch: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const lib of librarians) {
    const prov = classifyAccountProvenance(lib);
    if (prov.classification === 'NON_DEMO') {
      return lib.id;
    }
  }

  throw new Error(
    'NO_ELIGIBLE_ADMIN_ACTOR: No verified non-demo administrator found in database. An explicit non-demo administrator ID must be provided via options.actorId or --actor-id.'
  );
}

/**
 * Plans a demo account purge operation by inventorying candidates, analyzing foreign-key dependencies,
 * detecting ambiguous accounts, and calculating projected post-purge state.
 *
 * PURE READ-ONLY: Never modifies any record in the target database. Positively verifies zero-mutation.
 */
export async function planDemoAccountPurge(prisma: PrismaClient): Promise<DemoPurgePlan> {
  const totalUsersBefore = await prisma.user.count();

  // 1. Run multi-factor provenance inventory
  const inventory = await executeDemoAccountInventory(prisma);

  const blockingReasons: string[] = [];
  const dependencyReports: DemoPurgeDependencyReport[] = [];
  const plannedUserIds: string[] = [];

  let blockedByDependenciesCount = 0;

  // 2. Ambiguous Accounts Guard: Ambiguous accounts strictly block execution
  if (inventory.ambiguousCount > 0) {
    blockingReasons.push(
      `AMBIGUOUS_RECORDS_DETECTED: ${inventory.ambiguousCount} account(s) have conflicting or partial demo markers. Ambiguous accounts must never be purged.`
    );
  }

  // 3. Inspect Dependencies for every Verified Demo Account
  for (const userId of inventory.verifiedDemoUserIds) {
    const userProv = inventory.details.find((d) => d.userId === userId);
    const email = userProv ? userProv.email : userId;

    const [
      activeLendingsCount,
      historicalLendingsCount,
      bookRequestsCount,
      notificationsCount,
      examPapersCount,
      auditLogsAsActorCount,
    ] = await Promise.all([
      prisma.lending.count({ where: { userId, status: 'ISSUED' } }),
      prisma.lending.count({ where: { userId, status: { not: 'ISSUED' } } }),
      prisma.bookRequest.count({ where: { userId } }),
      prisma.notification.count({ where: { userId } }),
      prisma.examPaper.count({ where: { uploadedById: userId } }),
      prisma.auditLog.count({ where: { actorId: userId } }),
    ]);

    const userBlockingReasons: string[] = [];
    if (activeLendingsCount > 0) {
      userBlockingReasons.push(
        `Active book loan exists (${activeLendingsCount} book copy currently marked ISSUED). Books must be returned before purge.`
      );
    }

    const hasBlocking = userBlockingReasons.length > 0;
    if (hasBlocking) {
      blockedByDependenciesCount++;
      for (const reason of userBlockingReasons) {
        blockingReasons.push(`User ${email}: ${reason}`);
      }
    } else {
      plannedUserIds.push(userId);
    }

    dependencyReports.push({
      userId,
      email,
      activeLendingsCount,
      historicalLendingsCount,
      bookRequestsCount,
      notificationsCount,
      examPapersCount,
      auditLogsAsActorCount,
      hasBlockingDependencies: hasBlocking,
      blockingReasons: userBlockingReasons,
    });
  }

  // 4. Verify Zero-Mutation Guarantee
  const totalUsersAfter = await prisma.user.count();
  const zeroMutationVerified = totalUsersBefore === totalUsersAfter;

  if (!zeroMutationVerified) {
    throw new Error(
      `FATAL_DRY_RUN_MUTATION: Database record count changed during purge planning! Pre: ${totalUsersBefore}, Post: ${totalUsersAfter}`
    );
  }

  const eligibleForPurgeCount = plannedUserIds.length;
  const isBlocked = blockingReasons.length > 0;
  const totalToPurge = isBlocked ? 0 : eligibleForPurgeCount;
  const projectedTotalUsersAfter = totalUsersBefore - totalToPurge;

  return {
    status: isBlocked ? 'BLOCKED' : 'READY',
    totalUsersBefore,
    eligibleForPurgeCount,
    blockedByDependenciesCount,
    ambiguousDetectedCount: inventory.ambiguousCount,
    totalToPurge,
    projectedTotalUsersAfter,
    zeroMutationVerified,
    blockingReasons,
    dependencyReports,
    plannedUserIds: isBlocked ? [] : plannedUserIds,
    plannedAt: new Date().toISOString(),
  };
}

/**
 * Safely and transactionally purges verified synthetic demo accounts and their child dependencies.
 *
 * SAFETY & TRANSACTION GUARANTEES:
 * 1. Target database is validated against the positive test allowlist (production rejected unconditionally).
 * 2. Mandates pre-purge encrypted backup verification before making any mutation.
 * 3. Enforces dry-run planning: blocks execution if active loans or ambiguous accounts exist.
 * 4. Runs deletion inside an atomic transaction (prisma.$transaction) in referential dependency order.
 * 5. Reconciles pre- and post-purge database record counts mathematically.
 * 6. Records an immutable administrative audit log with non-PII summary metrics.
 * 7. Strictly idempotent: re-executing against a purged database safely purges 0 records.
 */
export async function executeDemoAccountPurge(
  prisma: PrismaClient,
  options: DemoPurgeOptions
): Promise<DemoPurgeResult> {
  const startTime = Date.now();

  // 1. Strict Target Database Safety Guard
  const targetDbUrl = options.targetDbUrl !== undefined ? options.targetDbUrl : (process.env.DATABASE_URL || '');
  validateRestoreDatabaseTarget(targetDbUrl);

  // 2. Pre-Purge Backup Parameter Guard
  if (options.requireBackup !== false && !options.skipBackup && !options.dryRun) {
    if (!options.backupEncryptionKey) {
      throw new Error(
        'PRE_BACKUP_REQUIRED: Pre-purge backup is mandatory before executing demo account purge. Provide backupEncryptionKey or specify skipBackup=true.'
      );
    }
  }

  // 3. Pre-Purge Dry-Run Planning & Dependency Analysis
  const plan = await planDemoAccountPurge(prisma);

  if (plan.status === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      purgedCount: 0,
      prePurgeCount: plan.totalUsersBefore,
      postPurgeCount: plan.totalUsersBefore,
      isReconciled: true,
      preBackupVerified: false,
      auditLogCreated: false,
      durationMs: Date.now() - startTime,
      error: `PURGE_BLOCKED: ${plan.blockingReasons.join('; ')}`,
    };
  }

  // 3. Idempotency Check — If 0 verified demo accounts exist, succeed cleanly
  if (plan.plannedUserIds.length === 0) {
    return {
      status: 'SUCCESS',
      purgedCount: 0,
      prePurgeCount: plan.totalUsersBefore,
      postPurgeCount: plan.totalUsersBefore,
      isReconciled: true,
      preBackupVerified: false,
      auditLogCreated: false,
      durationMs: Date.now() - startTime,
    };
  }

  // 4. Resolve & Verify Safe Administrative Actor (SEC-9F-01)
  if (options.actorId && plan.plannedUserIds.includes(options.actorId)) {
    throw new Error(
      `ACTOR_ID_IN_PURGE_LIST: The requested administrative actor "${options.actorId}" is included in the cohort scheduled for deletion. Purge execution aborted before mutation.`
    );
  }

  const safeActorId = await resolveSafeAdminActor(prisma, options.actorId);
  if (plan.plannedUserIds.includes(safeActorId)) {
    throw new Error(
      `ACTOR_ID_IN_PURGE_LIST: The executing administrative actor "${safeActorId}" is included in the cohort scheduled for deletion. Purge execution aborted before mutation.`
    );
  }

  // 5. Pre-Purge Encrypted Backup Verification
  let preBackupVerified = false;
  let preBackupFile: string | undefined;

  if (options.requireBackup !== false && !options.skipBackup && !options.dryRun) {
    const backupResult = await createDatabaseBackup(prisma, {
      encryptionKey: options.backupEncryptionKey!,
    });
    await verifyBackupFile(backupResult.filePath, {
      encryptionKey: options.backupEncryptionKey!,
    });
    preBackupVerified = true;
    preBackupFile = backupResult.filePath;
  }

  const prePurgeCount = await prisma.user.count();
  const targetUserIds = plan.plannedUserIds;
  let purgedCount = 0;

  // 5. Atomic Transactional Deletion
  try {
    await prisma.$transaction(
      async (tx) => {
        // Step A: Prune child records in strict referential dependency order
        await tx.notification.deleteMany({ where: { userId: { in: targetUserIds } } });
        await tx.bookRequest.deleteMany({ where: { userId: { in: targetUserIds } } });
        await tx.lending.deleteMany({ where: { userId: { in: targetUserIds } } });
        await tx.examPaper.deleteMany({ where: { uploadedById: { in: targetUserIds } } });
        await tx.auditLog.deleteMany({ where: { actorId: { in: targetUserIds } } });

        // Step B: Delete the verified demo users
        const deleteResult = await tx.user.deleteMany({
          where: { id: { in: targetUserIds } },
        });
        purgedCount = deleteResult.count;

        // Step C: Record AuditLog entry within the same transaction
        await tx.auditLog.create({
          data: {
            actorId: safeActorId,
            action: 'DEMO_ACCOUNTS_PURGED',
            targetId: 'SYSTEM_DEMO_PURGE',
            details: JSON.stringify({
              purgedCount,
              prePurgeCount,
              postPurgeCount: prePurgeCount - purgedCount,
              durationMs: Date.now() - startTime,
            }),
          },
        });

        // If dryRun requested, roll back transaction intentionally
        if (options.dryRun) {
          throw new DemoPurgeRollbackError({
            purgedCount,
            prePurgeCount,
          });
        }
      },
      { timeout: 60000 }
    );
  } catch (err: any) {
    if (err instanceof DemoPurgeRollbackError) {
      const postRollbackCount = await prisma.user.count();
      return {
        status: 'ROLLED_BACK',
        purgedCount: 0,
        prePurgeCount,
        postPurgeCount: postRollbackCount,
        isReconciled: prePurgeCount === postRollbackCount,
        preBackupVerified,
        preBackupFile,
        auditLogCreated: false,
        durationMs: Date.now() - startTime,
      };
    }
    throw err;
  }

  // 6. Post-Purge Verification & Count Reconciliation
  const postPurgeCount = await prisma.user.count();
  const isReconciled = postPurgeCount === prePurgeCount - purgedCount;

  if (!isReconciled) {
    throw new Error(
      `PURGE_RECONCILIATION_FAILURE: Expected post-purge count ${prePurgeCount - purgedCount}, but actual database count is ${postPurgeCount}.`
    );
  }

  return {
    status: 'SUCCESS',
    purgedCount,
    prePurgeCount,
    postPurgeCount,
    isReconciled,
    preBackupVerified,
    preBackupFile,
    auditLogCreated: true,
    durationMs: Date.now() - startTime,
  };
}
