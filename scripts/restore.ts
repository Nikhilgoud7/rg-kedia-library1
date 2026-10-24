// scripts/restore.ts — Disaster Recovery Restore CLI Utility
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { restoreDatabaseBackup } from '../server/lib/backup/restoreEngine.js';
import { redactSecrets } from '../server/lib/backup/cryptoUtils.js';

// Safe environment resolution: prefer explicit --env, then .env.test if in non-production, fallback to .env
const envArg = process.argv.slice(2).find((a) => a.startsWith('--env='));
const explicitEnv = envArg ? envArg.split('=')[1] : process.env.ENV_FILE;
const targetEnv = explicitEnv || (process.env.NODE_ENV === 'production' ? '.env' : (fs.existsSync('.env.test') ? '.env.test' : '.env'));
if (fs.existsSync(targetEnv)) {
  dotenv.config({ path: targetEnv, override: true });
} else {
  dotenv.config();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     RG-Kedia LMS — Disaster Recovery Restore CLI     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  let filePath = fileArg ? fileArg.split('=')[1] : '';

  const hasConfirm = args.includes('--confirm');
  const isDryRun = args.includes('--dry-run');

  const backupsDir = path.resolve(process.cwd(), 'backups');

  if (!filePath && fs.existsSync(backupsDir)) {
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => (f.endsWith('.json') && !f.endsWith('.sha256')) || f.endsWith('.enc.json'))
      .sort((a, b) => {
        return fs.statSync(path.join(backupsDir, b)).mtimeMs - fs.statSync(path.join(backupsDir, a)).mtimeMs;
      });

    if (files.length > 0) {
      filePath = path.join(backupsDir, files[0]);
      console.log(`\n📂 Auto-selected latest backup: ${path.basename(filePath)}`);
    }
  }

  if (!filePath) {
    console.error('\n❌ ERROR: No backup file specified and none found in backups/ directory.');
    console.error('Usage: npm run backup:restore -- --file=backups/backup-example.json --confirm');
    process.exit(1);
  }

  if (!hasConfirm && !isDryRun) {
    console.error('\n❌ ERROR: Confirmation flag --confirm is required to execute a database restoration.');
    console.error('This operation replaces existing table records with backup data.');
    console.error('Use --dry-run to validate integrity without modifying the database.');
    console.error(`Usage: npm run backup:restore -- --file="${filePath}" --confirm`);
    process.exit(1);
  }

  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  const prisma = new PrismaClient();

  try {
    console.log(`\n⏳ Initiating restoration (${isDryRun ? 'DRY RUN' : 'ACTIVE RESTORE'})...`);
    const result = await restoreDatabaseBackup(prisma, filePath, {
      encryptionKey,
      dryRun: isDryRun,
    });

    console.log('\n✅ RESTORATION COMPLETED SUCCESSFULLY');
    console.log(`   Mode:       ${result.dryRun ? 'Dry Run (Validation Only)' : 'Active Database Repopulation'}`);
    console.log(`   Duration:   ${result.durationMs}ms`);

    console.log('\n📊 Restored Record Summary:');
    for (const [table, count] of Object.entries(result.restoredCounts)) {
      console.log(`   - ${table.padEnd(16)}: ${count} records`);
    }

    console.log('\n🎉 Restoration runbook completed without errors.\n');
  } catch (err: any) {
    console.error('\n❌ RESTORATION FAILED:');
    console.error(redactSecrets(err.message || String(err)));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
