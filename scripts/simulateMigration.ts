// scripts/simulateMigration.ts — CLI Production Migration Simulation & Rollback Utility
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../server/lib/backup/restoreEngine.js';
import { executeStagingDryRun } from '../server/lib/migration/dryRunEngine.js';
import { executeMigrationSimulation } from '../server/lib/migration/simulationEngine.js';
import { rollbackMigrationBatch } from '../server/lib/migration/rollbackEngine.js';
import { generateSyntheticCohort } from '../server/lib/cohort/syntheticGenerator.js';
import { SyntheticUserRecord } from '../server/lib/cohort/types.js';

// Safe environment loading: prioritize .env.test for safety
if (fs.existsSync('.env.test')) {
  dotenv.config({ path: '.env.test', override: true });
} else {
  dotenv.config();
}

async function main() {
  const args = process.argv.slice(2);

  const isExecute = args.includes('--execute');
  const isRollback = args.includes('--rollback');
  const isJson = args.includes('--json');
  const skipBackup = args.includes('--skip-backup');

  const fileArg = args.find((a) => a.startsWith('--input=') || a.startsWith('--file='));
  const filePath = fileArg ? fileArg.split('=')[1] : undefined;

  const countArg = args.find((a) => a.startsWith('--generate-synthetic='));
  const syntheticCount = countArg ? parseInt(countArg.split('=')[1], 10) : undefined;

  const batchArg = args.find((a) => a.startsWith('--batch-id='));
  const batchId = batchArg ? batchArg.split('=')[1] : undefined;

  const actorArg = args.find((a) => a.startsWith('--actor-id='));
  const actorIdArg = actorArg ? actorArg.split('=')[1] : undefined;

  const keyArg = args.find((a) => a.startsWith('--backup-key='));
  const backupKey = keyArg ? keyArg.split('=')[1] : process.env.BACKUP_ENCRYPTION_KEY;

  // Strict Target Database Allowlist Check
  const targetDbUrl = process.env.DATABASE_URL || '';
  try {
    validateRestoreDatabaseTarget(targetDbUrl);
  } catch (err: any) {
    console.error('\n❌ FATAL: TARGET DATABASE BLOCKED BY SAFETY GUARD');
    console.error(err.message);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // 1. Rollback Mode
    if (isRollback) {
      if (!batchId) {
        console.error('❌ Error: Missing --batch-id=<id> for rollback.');
        process.exit(1);
      }

      let actorId = actorIdArg;
      if (!actorId) {
        const admin = await prisma.user.findFirst({ where: { role: 'LIBRARIAN' } });
        actorId = admin?.id || 'system-migration-admin';
      }

      console.log(`\nInitiating Rollback for Migration Batch: ${batchId}`);
      const rollbackResult = await rollbackMigrationBatch(prisma, {
        batchId,
        actorId,
        targetDbUrl,
      });

      if (isJson) {
        console.log(JSON.stringify(rollbackResult, null, 2));
      } else {
        console.log('\n=============================================================');
        console.log('✅ MIGRATION BATCH ROLLBACK COMPLETED');
        console.log('=============================================================');
        console.log(`Status:               ${rollbackResult.status}`);
        console.log(`Batch ID:             ${rollbackResult.batchId}`);
        console.log(`Users Deleted:        ${rollbackResult.deletedCount}`);
        console.log(`Pre-Rollback Count:   ${rollbackResult.preRollbackCount}`);
        console.log(`Post-Rollback Count:  ${rollbackResult.postRollbackCount}`);
        console.log(`Reconciliation:       ${rollbackResult.isReconciled ? 'VERIFIED' : 'FAILED'}`);
        console.log(`Audit Log Created:    ${rollbackResult.auditLogCreated ? 'Yes' : 'No'}`);
        console.log(`Duration:             ${rollbackResult.durationMs}ms`);
        console.log('=============================================================\n');
      }
      process.exit(0);
    }

    // 2. Load or Generate Cohort Records
    let records: SyntheticUserRecord[] = [];
    if (syntheticCount) {
      console.log(`Generating synthetic test cohort of ${syntheticCount} users...`);
      records = generateSyntheticCohort({
        totalRecords: syntheticCount,
        studentRatio: 0.8,
        teacherRatio: 0.15,
        librarianRatio: 0.05,
      });
    } else if (filePath) {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        console.error(`❌ Error: Input file not found: ${resolved}`);
        process.exit(1);
      }
      const raw = fs.readFileSync(resolved, 'utf8');
      if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
        records = JSON.parse(raw);
      } else {
        // Plain text CSV
        records = raw as any;
      }
    } else {
      console.log('No input file provided. Generating default 25-user synthetic cohort...');
      records = generateSyntheticCohort({
        totalRecords: 25,
        studentRatio: 0.8,
        teacherRatio: 0.16,
        librarianRatio: 0.04,
      });
    }

    // 3. Dry-Run Mode (Default)
    if (!isExecute) {
      console.log('\n=============================================================');
      console.log('  RG-KEDIA LMS — MIGRATION STAGING DRY-RUN (NON-MUTATING)    ');
      console.log('=============================================================');

      const dryRun = await executeStagingDryRun({
        prisma,
        input: records,
      });

      if (isJson) {
        console.log(JSON.stringify(dryRun, null, 2));
      } else {
        console.log(`Status:               ${dryRun.status === 'READY' ? '✅ READY' : '❌ BLOCKED'}`);
        console.log(`Zero Mutation:        ${dryRun.zeroMutationVerified ? 'VERIFIED (0 DB writes)' : 'FAILED'}`);
        console.log(`Source Records:       ${dryRun.totalSourceRecords}`);
        console.log(`Valid Records:        ${dryRun.validRecordsCount}`);
        console.log(`Invalid Records:      ${dryRun.invalidRecordsCount}`);
        console.log(`Planned Inserts:      ${dryRun.toInsertCount}`);
        console.log(`Planned Skips:        ${dryRun.toSkipCount}`);
        console.log(`Conflicts Detected:   ${dryRun.conflictCount}`);
        console.log(`Pre-DB Total:         ${dryRun.reconciliation.totalInDbBefore}`);
        console.log(`Projected Post-DB:    ${dryRun.reconciliation.projectedTotalInDbAfter}`);
        console.log(`Reconciled:           ${dryRun.reconciliation.isReconciled ? 'YES' : 'NO'}`);
        console.log('\nRole Distribution (Valid Cohort):');
        console.log(`  STUDENT:            ${dryRun.byRole.STUDENT}`);
        console.log(`  TEACHER:            ${dryRun.byRole.TEACHER}`);
        console.log(`  LIBRARIAN:          ${dryRun.byRole.LIBRARIAN}`);

        if (dryRun.conflicts.length > 0) {
          console.log('\n❌ Database Conflicts:');
          dryRun.conflicts.slice(0, 5).forEach((c) => {
            console.log(`  - Row ${c.row} (${c.conflictType}): ${c.reason}`);
          });
          if (dryRun.conflicts.length > 5) {
            console.log(`  ... and ${dryRun.conflicts.length - 5} more conflict(s).`);
          }
        }
        console.log('=============================================================\n');
      }

      process.exit(dryRun.status === 'READY' ? 0 : 1);
    }

    // 4. Execute Simulation Mode
    let actorId = actorIdArg;
    if (!actorId) {
      const admin = await prisma.user.findFirst({ where: { role: 'LIBRARIAN' } });
      actorId = admin?.id || 'system-migration-admin';
    }

    console.log('\n=============================================================');
    console.log('  RG-KEDIA LMS — PRODUCTION MIGRATION SIMULATION (ISOLATED) ');
    console.log('=============================================================');

    const simResult = await executeMigrationSimulation(prisma, records, {
      batchId,
      actorId,
      requirePreBackup: !skipBackup,
      backupEncryptionKey: backupKey,
      skipPreBackup: skipBackup,
      targetDbUrl,
    });

    if (isJson) {
      console.log(JSON.stringify(simResult, null, 2));
    } else {
      console.log(`Status:               ${simResult.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Batch ID:             ${simResult.batchId}`);
      console.log(`Total Records:        ${simResult.totalRecords}`);
      console.log(`Inserted:             ${simResult.insertedCount}`);
      console.log(`Skipped (Idempotent): ${simResult.skippedCount}`);
      console.log(`Conflicts:            ${simResult.conflictCount}`);
      console.log(`Pre-DB Total:         ${simResult.reconciliation.totalInDbBefore}`);
      console.log(`Post-DB Total:        ${simResult.reconciliation.totalInDbAfter}`);
      console.log(`Reconciled:           ${simResult.reconciliation.isReconciled ? 'VERIFIED' : 'FAILED'}`);
      console.log(`Pre-Backup Verified:  ${simResult.preBackupVerified ? 'YES' : 'NO'}`);
      console.log(`Audit Log Created:    ${simResult.auditLogCreated ? 'YES' : 'NO'}`);
      console.log(`Duration:             ${simResult.durationMs}ms`);
      if (simResult.error) {
        console.log(`Error:                ${simResult.error}`);
      }
      console.log('=============================================================\n');
    }

    process.exit(simResult.status === 'SUCCESS' ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err.message);
  process.exit(1);
});
