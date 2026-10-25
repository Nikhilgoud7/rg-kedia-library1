// scripts/purgeDemoAccounts.ts — CLI Demo Account Inventory & Safe Purge Utility
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../server/lib/migration/../backup/restoreEngine.js';
import {
  executeDemoAccountInventory,
  planDemoAccountPurge,
  executeDemoAccountPurge,
  resolveSafeAdminActor,
} from '../server/lib/migration/index.js';

// Safe environment loading: prioritize .env.test for safety
if (fs.existsSync('.env.test')) {
  dotenv.config({ path: '.env.test', override: true });
} else {
  dotenv.config();
}

async function main() {
  const args = process.argv.slice(2);

  const hasDryRun = args.includes('--dry-run');
  const hasExecute = args.includes('--execute');
  const hasConfirm = args.includes('--confirm');
  const hasJson = args.includes('--json');
  const hasInventory = args.includes('--inventory');
  const skipBackup = args.includes('--skip-backup');

  // 1. Mutually Exclusive Argument Validation
  if (hasDryRun && hasExecute) {
    console.error('\n❌ ERROR: Contradictory arguments. --dry-run and --execute cannot be used together.');
    console.error('Usage (Dry Run):  npm run demo:purge');
    console.error('Usage (Execute):  npm run demo:purge -- --execute --confirm');
    process.exit(1);
  }

  // 2. Execution Confirmation Safeguard
  if (hasExecute && !hasConfirm) {
    console.error('\n❌ ERROR: Confirmation required for execution.');
    console.error('To execute the purge, you must supply both --execute and --confirm:');
    console.error('  npm run demo:purge -- --execute --confirm');
    process.exit(1);
  }

  // 3. Security Rejection of CLI Backup Key (SEC-9F-02)
  if (args.some((a) => a.startsWith('--backup-key'))) {
    console.error('\n❌ ERROR: Passing backup encryption keys via command-line arguments is insecure.');
    console.error('Command-line arguments can be exposed in system process listings (ps / Task Manager).');
    console.error('Provide the 256-bit encryption key via the BACKUP_ENCRYPTION_KEY environment variable instead:');
    console.error('  BACKUP_ENCRYPTION_KEY="<64-hex-key>" npm run demo:purge -- --execute --confirm');
    process.exit(1);
  }

  const backupKey = process.env.BACKUP_ENCRYPTION_KEY;

  const actorArg = args.find((a) => a.startsWith('--actor-id='));
  const actorIdArg = actorArg ? actorArg.split('=')[1] : undefined;

  // 3. Strict Target Database Allowlist Check
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
    // 4. Inventory-Only Mode
    if (hasInventory) {
      const inventory = await executeDemoAccountInventory(prisma);
      if (hasJson) {
        console.log(JSON.stringify(inventory, null, 2));
      } else {
        console.log('\n=============================================================');
        console.log('       RG-KEDIA LMS — DEMO ACCOUNT PROVENANCE INVENTORY       ');
        console.log('=============================================================');
        console.log(`Total Users Scanned:     ${inventory.totalUsersScanned}`);
        console.log(`Verified Demo Accounts:  ${inventory.verifiedDemoCount}`);
        console.log(`Ambiguous Accounts:      ${inventory.ambiguousCount}`);
        console.log(`Non-Demo Accounts:       ${inventory.nonDemoCount}`);
        console.log('\nVerified Demo by Role:');
        console.log(`  STUDENT:               ${inventory.byRole.STUDENT || 0}`);
        console.log(`  TEACHER:               ${inventory.byRole.TEACHER || 0}`);
        console.log(`  LIBRARIAN:             ${inventory.byRole.LIBRARIAN || 0}`);
        if (inventory.ambiguousCount > 0) {
          console.log('\n⚠️ AMBIGUOUS ACCOUNTS (BLOCKED FROM PURGE):');
          inventory.details
            .filter((d) => d.classification === 'AMBIGUOUS')
            .forEach((d) => {
              console.log(`  - User ID ${d.userId} (${d.role}): ${d.reasons.join('; ')}`);
            });
        }
        console.log('=============================================================\n');
      }
      process.exit(0);
    }

    // 5. Dry-Run Planning Mode (Default)
    if (!hasExecute) {
      console.log('\n=============================================================');
      console.log('     RG-KEDIA LMS — DEMO ACCOUNT PURGE DRY-RUN (NON-MUTATING) ');
      console.log('=============================================================');

      const plan = await planDemoAccountPurge(prisma);

      if (hasJson) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log(`Status:                  ${plan.status === 'READY' ? '✅ READY' : '❌ BLOCKED'}`);
        console.log(`Zero Mutation:           ${plan.zeroMutationVerified ? 'VERIFIED (0 DB writes)' : 'FAILED'}`);
        console.log(`Total Users in DB:       ${plan.totalUsersBefore}`);
        console.log(`Eligible for Purge:      ${plan.eligibleForPurgeCount}`);
        console.log(`Blocked by Dependencies: ${plan.blockedByDependenciesCount}`);
        console.log(`Ambiguous Accounts:      ${plan.ambiguousDetectedCount}`);
        console.log(`Projected Post-Purge DB: ${plan.projectedTotalUsersAfter}`);

        if (plan.blockingReasons.length > 0) {
          console.log('\n❌ BLOCKING REASONS:');
          plan.blockingReasons.forEach((r) => console.log(`  - ${r}`));
        }
        console.log('=============================================================\n');
      }

      process.exit(plan.status === 'READY' ? 0 : 1);
    }

    // 6. Execute Purge Mode
    let actorId: string;
    try {
      actorId = await resolveSafeAdminActor(prisma, actorIdArg);
    } catch (err: any) {
      console.error('\n❌ ERROR: ADMINISTRATIVE ACTOR RESOLUTION FAILED (SEC-9F-01)');
      console.error(err.message);
      process.exit(1);
    }

    if (!skipBackup && !backupKey) {
      console.error('\n❌ ERROR: MISSING_BACKUP_KEY: Mandatory pre-purge backup requires BACKUP_ENCRYPTION_KEY environment variable.');
      console.error('Set BACKUP_ENCRYPTION_KEY in your environment or .env, or use --skip-backup for authorized staging drills.');
      process.exit(1);
    }

    console.log('\n=============================================================');
    console.log('      RG-KEDIA LMS — EXECUTING DEMO ACCOUNT PURGE            ');
    console.log('=============================================================');

    const result = await executeDemoAccountPurge(prisma, {
      actorId,
      requireBackup: !skipBackup,
      backupEncryptionKey: backupKey,
      skipBackup,
      targetDbUrl,
    });

    if (hasJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Status:                  ${result.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ' + result.status}`);
      console.log(`Accounts Purged:         ${result.purgedCount}`);
      console.log(`Pre-Purge Total:         ${result.prePurgeCount}`);
      console.log(`Post-Purge Total:        ${result.postPurgeCount}`);
      console.log(`Count Reconciliation:    ${result.isReconciled ? 'VERIFIED' : 'FAILED'}`);
      console.log(`Pre-Backup Verified:     ${result.preBackupVerified ? 'YES' : 'NO'}`);
      console.log(`Audit Log Created:       ${result.auditLogCreated ? 'YES' : 'NO'}`);
      console.log(`Duration:                ${result.durationMs}ms`);
      if (result.error) {
        console.log(`Error Details:           ${result.error}`);
      }
      console.log('=============================================================\n');
    }

    process.exit(result.status === 'SUCCESS' ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err.message);
  process.exit(1);
});
