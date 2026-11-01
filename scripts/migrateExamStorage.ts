// scripts/migrateExamStorage.ts — CLI Utility for Exam Paper Cloud Storage Migration
import {
  scanExamStorageInventory,
  executeExamStorageMigration,
  rollbackExamStorageMigration,
} from '../server/lib/storage/examMigrationEngine.js';
import prisma from '../server/middleware/auth.js';

async function main() {
  const args = process.argv.slice(2);
  const isScanOnly = args.includes('--scan');
  const isExecute = args.includes('--execute');
  const isRollback = args.includes('--rollback');
  const isDryRun = !isExecute && !isRollback;

  console.log('================================================================');
  console.log('   RG-Kedia LMS — Exam Paper Cloud Storage Migration Utility   ');
  console.log('================================================================');

  try {
    if (isScanOnly || isDryRun) {
      console.log('\n[1/2] Scanning examination paper inventory...');
      const report = await scanExamStorageInventory();
      console.log(`- Total database records:     ${report.totalDbRecords}`);
      console.log(`- Physical files on disk:       ${report.physicalFilesOnDisk}`);
      console.log(`- Ready for cloud migration:    ${report.readyForMigration}`);
      console.log(`- Missing physical files:       ${report.missingPhysicalFiles}`);
      console.log(`- Already migrated to cloud:    ${report.alreadyMigrated}`);

      if (report.unindexedFilesOnDisk.length > 0) {
        console.warn(`- Unindexed files on disk:      ${report.unindexedFilesOnDisk.length}`);
      }

      if (isScanOnly) {
        console.log('\nScan complete. Pass --execute to migrate ready candidates to cloud storage.');
        return;
      }

      console.log('\n[2/2] Simulating cloud migration (DRY-RUN mode)...');
      const dryResult = await executeExamStorageMigration({ dryRun: true });
      console.log(`- Candidates evaluated:         ${dryResult.totalCandidates}`);
      console.log(`- Simulated candidates:         ${dryResult.simulatedCandidates ?? 0}`);
      console.log(`- Files actually migrated:      ${dryResult.migratedSuccessfully}`);
      console.log(`- Skipped records:              ${dryResult.skipped}`);
      console.log(`- Simulated failures:           ${dryResult.failed}`);
      console.log('\nDry-run completed successfully with ZERO persistent changes.');
      console.log('To execute real migration, run with explicit flag: --execute');
      return;
    }

    if (isRollback) {
      console.log('\nRolling back cloud-migrated records to local storage...');
      const rollbackResult = await rollbackExamStorageMigration({ dryRun: false });
      console.log(`- Successfully reverted ${rollbackResult.rolledBackCount} records to local storage.`);
      return;
    }

    if (isExecute) {
      console.log('\nExecuting active cloud migration...');
      const result = await executeExamStorageMigration({ dryRun: false });
      console.log(`- Migrated successfully:        ${result.migratedSuccessfully}`);
      console.log(`- Skipped records:              ${result.skipped}`);
      console.log(`- Failed migrations:            ${result.failed}`);
      if (result.failed > 0) {
        console.error('Some records failed migration:', result.details.filter((d) => d.status === 'FAILED'));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
