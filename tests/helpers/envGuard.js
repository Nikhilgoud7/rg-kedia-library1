// tests/helpers/envGuard.js — Mandatory Test Environment Safety Guards
import fs from 'fs';
import dotenv from 'dotenv';
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

  // 3. Load isolated test environment if .env.test exists (without overriding explicitly set environment variables)
  if (fs.existsSync('.env.test')) {
    dotenv.config({ path: '.env.test', override: false });
  }

  // Enforce NODE_ENV=test for all test operations
  process.env.NODE_ENV = 'test';

  // 4. Dedicated Test Database Isolation Guard
  const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!testDbUrl) {
    console.error('\n=============================================================');
    console.error('❌ FATAL: TEST EXECUTION ABORTED — NO TEST DATABASE CONFIGURED');
    console.error('=============================================================');
    console.error('Automated tests require a dedicated isolated test database.');
    console.error('Configure TEST_DATABASE_URL in .env.test or your environment.');
    console.error('=============================================================\n');
    process.exit(1);
  }

  // Parse connection hostname safely without exposing credentials
  let testHost = '';
  try {
    const parsedUri = new URL(testDbUrl.replace('prisma://', 'postgres://'));
    testHost = (parsedUri.host || '').toLowerCase();
  } catch {
    console.error('\n❌ FATAL: Test database URL is malformed. Connection rejected.');
    process.exit(1);
  }

  // Fail-closed against known production endpoints or branches
  const KNOWN_PRODUCTION_ENDPOINTS = [
    'ep-aged-sunset-b3548him',
    'br-mute-term-b3q54934',
  ];

  for (const prodPattern of KNOWN_PRODUCTION_ENDPOINTS) {
    if (testHost.includes(prodPattern)) {
      console.error('\n=============================================================');
      console.error('❌ FATAL: TEST EXECUTION ABORTED — PRODUCTION DATABASE DETECTED');
      console.error('=============================================================');
      console.error('The configured test database points to a known production Neon branch/endpoint.');
      console.error('Tests are strictly forbidden from executing against production.');
      console.error('Please configure a dedicated isolated test branch in .env.test.');
      console.error('=============================================================\n');
      process.exit(1);
    }
  }

  // Check if .env has a production DATABASE_URL that matches TEST_DATABASE_URL
  if (fs.existsSync('.env')) {
    try {
      const mainEnvContent = fs.readFileSync('.env', 'utf8');
      const match = mainEnvContent.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
      if (match && match[1]) {
        const mainUri = new URL(match[1].replace('prisma://', 'postgres://'));
        const mainHost = (mainUri.host || '').toLowerCase();

        if (
          mainHost &&
          testHost === mainHost &&
          KNOWN_PRODUCTION_ENDPOINTS.some((p) => mainHost.includes(p))
        ) {
          console.error('\n=============================================================');
          console.error('❌ FATAL: TEST EXECUTION ABORTED — AMBIGUOUS DATABASE DETECTED');
          console.error('=============================================================');
          console.error('Tests cannot reuse the ambient production database connection.');
          console.error('Define an explicit isolated TEST_DATABASE_URL in .env.test.');
          console.error('=============================================================\n');
          process.exit(1);
        }
      }
    } catch {}
  }

  // Set DATABASE_URL and DIRECT_URL to test database for all subsequent Prisma connections
  process.env.DATABASE_URL = testDbUrl;
  if (process.env.TEST_DIRECT_URL) {
    process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
  }

  // 5. Database safety probe against the verified test database
  const prisma = new PrismaClient({
    datasources: {
      db: { url: testDbUrl },
    },
  });
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (err) {
    console.error('\n❌ FATAL: Failed to connect to verified test database:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  return true;
}
