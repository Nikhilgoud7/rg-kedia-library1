// server/lib/migration/simulationEngine.ts — Transactional Production Migration Simulation Engine

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../backup/restoreEngine.js';
import { createDatabaseBackup } from '../backup/backupEngine.js';
import { verifyBackupFile } from '../backup/verifyEngine.js';
import { executeStagingDryRun } from './dryRunEngine.js';
import { SyntheticUserRecord } from '../cohort/types.js';
import {
  MigrationSimulationOptions,
  MigrationSimulationResult,
} from './types.js';

export class DryRunRollbackError extends Error {
  constructor(public resultData: any) {
    super('DRY_RUN_ROLLBACK: Transaction intentionally rolled back for non-mutating dry-run verification.');
    this.name = 'DryRunRollbackError';
  }
}

/**
 * Simulates executing a production user migration against the isolated test database.
 *
 * SAFETY & TRANSACTION GUARANTEES:
 * 1. Validates that the target database is in the approved test database allowlist.
 * 2. Mandates pre-migration encrypted backup verification before making any database mutations.
 * 3. Runs all database operations inside an atomic transaction (prisma.$transaction).
 * 4. Ensures strict idempotency: identical runs safely skip already-imported records.
 * 5. Reconciles pre- and post-operation counts to guarantee mathematical data consistency.
 * 6. Records an immutable administrative audit log with batch details (zero PII).
 */
export async function executeMigrationSimulation(
  prisma: PrismaClient,
  input: SyntheticUserRecord[] | string,
  options: MigrationSimulationOptions
): Promise<MigrationSimulationResult> {
  const startTime = Date.now();

  // 1. Strict Target Database Safety Guard
  const targetDbUrl = options.targetDbUrl || process.env.DATABASE_URL || '';
  validateRestoreDatabaseTarget(targetDbUrl);

  // 2. Pre-Migration Staging Dry-Run & Conflict Assessment
  const dryRun = await executeStagingDryRun({
    prisma,
    input,
  });

  if (dryRun.status === 'BLOCKED') {
    return {
      status: 'FAILED',
      batchId: options.batchId || 'UNASSIGNED',
      totalRecords: dryRun.totalSourceRecords,
      insertedCount: 0,
      skippedCount: 0,
      conflictCount: dryRun.conflictCount,
      createdUserIds: [],
      reconciliation: {
        totalInDbBefore: dryRun.reconciliation.totalInDbBefore,
        insertedCount: 0,
        skippedCount: 0,
        totalInDbAfter: dryRun.reconciliation.totalInDbBefore,
        isReconciled: true,
      },
      preBackupVerified: false,
      auditLogCreated: false,
      durationMs: Date.now() - startTime,
      error: `MIGRATION_BLOCKED: Dry-run detected ${dryRun.conflictCount} database conflict(s) and ${dryRun.invalidRecordsCount} invalid record(s). Resolve all errors prior to simulation.`,
    };
  }

  // 3. Pre-Migration Backup Verification & Creation (Safety Defense-in-Depth)
  let preBackupVerified = false;
  let preBackupFile: string | undefined;

  if (options.requirePreBackup !== false && !options.skipPreBackup && !options.dryRun) {
    if (!options.backupEncryptionKey) {
      throw new Error(
        'PRE_BACKUP_REQUIRED: Pre-migration backup is mandatory before running migration simulation. Provide backupEncryptionKey or specify skipPreBackup=true.'
      );
    }
    const backupResult = await createDatabaseBackup(prisma, {
      encryptionKey: options.backupEncryptionKey,
    });
    await verifyBackupFile(backupResult.filePath, {
      encryptionKey: options.backupEncryptionKey,
    });
    preBackupVerified = true;
    preBackupFile = backupResult.filePath;
  }

  // 4. Measure Database Baseline
  const totalInDbBefore = await prisma.user.count();

  // 5. Generate Batch Identifier
  const batchId =
    options.batchId ||
    `SIM-MIG-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const createdUserIds: string[] = [];
  let insertedCount = 0;
  let skippedCount = 0;

  // 6. Transactional Execution
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const action of dryRun.plannedActions) {
          if (action.operation === 'SKIP') {
            skippedCount++;
            continue;
          }

          if (action.operation === 'INSERT') {
            // Find corresponding record from valid cohort
            const sourceRecord = (dryRun as any).plannedActions ? action : null;
            // Generate temporary password hash with mustChangePassword: true
            const tempPassword = crypto.randomBytes(16).toString('hex');
            const passwordHash = await bcrypt.hash(tempPassword, 10);

            // Fetch extra attributes from dryRun source records
            const matchingRecord = typeof input === 'object' && Array.isArray(input)
              ? input.find((r) => r.email?.toLowerCase().trim() === action.email.toLowerCase())
              : undefined;

            const created = await tx.user.create({
              data: {
                name: matchingRecord?.name || `Synthetic ${action.role} ${action.row}`,
                email: action.email.toLowerCase().trim(),
                password: passwordHash,
                role: action.role,
                rollNumber: action.rollNumber?.trim() || null,
                program: matchingRecord?.program || null,
                branch: matchingRecord?.branch || null,
                year: matchingRecord?.year || null,
                semester: matchingRecord?.semester || null,
                secondLanguage: matchingRecord?.secondLanguage || null,
                phone: matchingRecord?.phone || null,
                mustChangePassword: true,
                active: true,
              },
            });

            createdUserIds.push(created.id);
            insertedCount++;
          }
        }

        // Record AuditLog inside same transaction
        await tx.auditLog.create({
          data: {
            actorId: options.actorId,
            action: 'MIGRATION_SIMULATION_EXECUTED',
            targetId: batchId,
            details: JSON.stringify({
              batchId,
              totalRecords: dryRun.totalSourceRecords,
              insertedCount,
              skippedCount,
              conflictCount: 0,
              createdUserIds,
              durationMs: Date.now() - startTime,
            }),
          },
        });

        // If options.dryRun is active, rollback transaction intentionally
        if (options.dryRun) {
          throw new DryRunRollbackError({
            batchId,
            insertedCount,
            skippedCount,
            createdUserIds,
          });
        }
      },
      { timeout: 60000 }
    );
  } catch (err: any) {
    if (err instanceof DryRunRollbackError) {
      const totalInDbAfter = await prisma.user.count();
      return {
        status: 'ROLLED_BACK',
        batchId,
        totalRecords: dryRun.totalSourceRecords,
        insertedCount: 0,
        skippedCount: err.resultData.skippedCount,
        conflictCount: 0,
        createdUserIds: [],
        reconciliation: {
          totalInDbBefore,
          insertedCount: 0,
          skippedCount: err.resultData.skippedCount,
          totalInDbAfter,
          isReconciled: totalInDbBefore === totalInDbAfter,
        },
        preBackupVerified,
        preBackupFile,
        auditLogCreated: false,
        durationMs: Date.now() - startTime,
      };
    }
    throw err;
  }

  // 7. Post-Migration Verification & Reconciliation
  const totalInDbAfter = await prisma.user.count();
  const isReconciled = totalInDbAfter === totalInDbBefore + insertedCount;

  if (!isReconciled) {
    throw new Error(
      `RECONCILIATION_FAILURE: Expected total ${totalInDbBefore + insertedCount} (${totalInDbBefore} before + ${insertedCount} inserted), but actual database count is ${totalInDbAfter}.`
    );
  }

  return {
    status: 'SUCCESS',
    batchId,
    totalRecords: dryRun.totalSourceRecords,
    insertedCount,
    skippedCount,
    conflictCount: 0,
    createdUserIds,
    reconciliation: {
      totalInDbBefore,
      insertedCount,
      skippedCount,
      totalInDbAfter,
      isReconciled,
    },
    preBackupVerified,
    preBackupFile,
    auditLogCreated: true,
    durationMs: Date.now() - startTime,
  };
}
