// scripts/verifyBackup.ts — Backup Integrity Verification CLI Utility
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { verifyBackupFile } from '../server/lib/backup/verifyEngine.js';
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
  console.log('║     RG-Kedia LMS — Backup Integrity Verification     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  let filePath = fileArg ? fileArg.split('=')[1] : '';

  const backupsDir = path.resolve(process.cwd(), 'backups');

  if (!filePath) {
    // Locate most recent backup in backups/
    if (fs.existsSync(backupsDir)) {
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
  }

  if (!filePath) {
    console.error('\n❌ ERROR: No backup file specified and none found in backups/ directory.');
    console.error('Usage: npm run backup:verify -- --file=backups/backup-example.json');
    process.exit(1);
  }

  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

  try {
    console.log(`\n⏳ Validating: ${filePath}...`);
    const result = await verifyBackupFile(filePath, { encryptionKey });

    console.log('\n✅ VERIFICATION RESULT: VALID & READABLE');
    console.log(`   Encrypted:  ${result.isEncrypted ? 'YES' : 'NO'}`);
    console.log(`   Checksum:   ${result.checksum}`);
    if (result.metadata?.createdAt) {
      console.log(`   Created At: ${result.metadata.createdAt}`);
      console.log(`   SourceHost: ${result.metadata.sourceHost}`);
    }

    if (result.recordCounts && Object.keys(result.recordCounts).length > 0) {
      console.log('\n📊 Validated Record Counts:');
      for (const [table, count] of Object.entries(result.recordCounts)) {
        console.log(`   - ${table.padEnd(16)}: ${count} records`);
      }
    } else if (result.isEncrypted && !encryptionKey) {
      console.log('\nℹ️ Note: File structure and ciphertext valid. Decryption skipped (no key provided).');
    }

    console.log('\n🎉 Verification completed successfully.\n');
  } catch (err: any) {
    console.error('\n❌ VERIFICATION FAILED:');
    console.error(redactSecrets(err.message || String(err)));
    process.exit(1);
  }
}

main();
