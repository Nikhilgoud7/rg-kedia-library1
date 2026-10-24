import fs from 'fs';
// scripts/backup.ts — Automated Backup CLI Generator
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createDatabaseBackup } from '../server/lib/backup/backupEngine.js';
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
  console.log('║       RG-Kedia LMS — Database Backup Generator       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const outDirArg = args.find((a) => a.startsWith('--outDir='));
  const outDir = outDirArg ? outDirArg.split('=')[1] : undefined;
  const isEncryptRequested = args.includes('--encrypt') || Boolean(process.env.BACKUP_ENCRYPTION_KEY);
  const shouldValidate = args.includes('--validate') || true;

  const encryptionKey = isEncryptRequested ? process.env.BACKUP_ENCRYPTION_KEY : undefined;

  if (isEncryptRequested && !encryptionKey) {
    console.warn('\n⚠️ WARNING: Encryption requested but BACKUP_ENCRYPTION_KEY is empty. Generating plaintext backup.');
  }

  const prisma = new PrismaClient();

  try {
    console.log('\n⏳ Initiating database backup...');
    const result = await createDatabaseBackup(prisma, {
      outDir,
      encryptionKey,
    });

    console.log('\n✅ Backup created successfully:');
    console.log(`   File:       ${result.filePath}`);
    console.log(`   Size:       ${(result.sizeBytes / 1024).toFixed(2)} KB`);
    console.log(`   Encrypted:  ${result.isEncrypted ? 'YES (AES-256-GCM)' : 'NO (Plaintext)'}`);
    console.log(`   Checksum:   ${result.checksum}`);
    console.log(`   Duration:   ${result.durationMs}ms`);

    console.log('\n📊 Record Summary:');
    for (const [table, count] of Object.entries(result.metadata.recordCounts)) {
      console.log(`   - ${table.padEnd(16)}: ${count} records`);
    }

    if (shouldValidate) {
      console.log('\n🔍 Verifying backup integrity...');
      const verification = await verifyBackupFile(result.filePath, { encryptionKey });
      if (verification.valid) {
        console.log('✅ Integrity verified: Checksum and schema structure validated.');
      }
    }

    console.log('\n🎉 Backup process completed without errors.\n');
  } catch (err: any) {
    console.error('\n❌ Backup generation failed:');
    console.error(redactSecrets(err.message || String(err)));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
