// tests/helpers/envGuard.js — Mandatory Test Environment Safety Guards
import { PrismaClient } from '@prisma/client';

export async function verifyTestEnvironment() {
  // 1. Process flags & authorization
  if (process.argv.includes('--allow-tests')) {
    process.env.ALLOW_TESTS = 'true';
  }

  if (process.env.ALLOW_TESTS !== 'true') {
    console.error('\n=============================================================');
    console.error('❌ FATAL: TEST EXECUTION ABORTED — SAFETY GUARD TRIGGERED');
    console.error('=============================================================');
    console.error('Tests require explicit authorization via ALLOW_TESTS=true.');
    console.error('Set ALLOW_TESTS=true in your environment or pass --allow-tests.');
    console.error('Example (PowerShell):  $env:ALLOW_TESTS="true"; npm test');
    console.error('Example (Bash/macOS):   ALLOW_TESTS=true npm test');
    console.error('=============================================================\n');
    process.exit(1);
  }

  // 2. Strict Production Guard
  if (process.env.NODE_ENV === 'production') {
    console.error('\n=============================================================');
    console.error('❌ FATAL: TESTS FORBIDDEN IN PRODUCTION (NODE_ENV=production)');
    console.error('=============================================================');
    console.error('Automated tests are strictly prevented from running against');
    console.error('production environments and databases to prevent data loss.');
    console.error('=============================================================\n');
    process.exit(1);
  }

  // 3. Database safety probe
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (err) {
    console.error('\n❌ FATAL: Failed to connect to database for test verification:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  return true;
}
