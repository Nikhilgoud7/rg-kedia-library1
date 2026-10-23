// tests/helpers/envGuard.js — Mandatory Test Environment Safety Guards
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Positive Allowlist of Approved Test Database Endpoints.
 * Only explicitly authorized compute endpoints belonging to verified isolated test branches may execute tests.
 * All unknown, production, or unapproved endpoints are rejected by default.
 */
export const APPROVED_TEST_ENDPOINT_PATTERNS = [
  // Verified isolated Neon test branch compute endpoint for project shy-haze-95283527 (branch: test, id: br-plain-salad-b3qylt8r)
  'ep-autumn-sky-b3vpykh4',
  // Local isolated development test databases (if used offline in containerized/local workflows)
  'localhost',
  '127.0.0.1',
];

/**
 * Pure, non-database-mutating validation function that checks candidate database URLs
 * against strict fail-closed positive allowlist rules.
 * Throws a descriptive Error (with zero credential leakage) if the connection is not permitted.
 */
export function validateTestDatabaseTarget(candidateUrl, options = {}) {
  const { mainEnvPath = '.env', explicitTestConfig = false } = options;

  if (!candidateUrl || typeof candidateUrl !== 'string' || !candidateUrl.trim()) {
    throw new Error('NO_TEST_DATABASE_CONFIGURED: Missing test database URL. Define TEST_DATABASE_URL.');
  }

  // Parse connection hostname safely without exposing credentials
  let testHost = '';
  try {
    const parsedUri = new URL(candidateUrl.replace('prisma://', 'postgres://'));
    testHost = (parsedUri.host || '').toLowerCase();
  } catch {
    throw new Error('MALFORMED_URL: Test database URL is malformed and could not be parsed.');
  }

  if (!testHost) {
    throw new Error('MALFORMED_URL: Test database URL does not specify a valid host.');
  }

  // Check against ambient/root .env production configuration fallback
  if (fs.existsSync(mainEnvPath)) {
    try {
      const mainEnvContent = fs.readFileSync(mainEnvPath, 'utf8');
      const match = mainEnvContent.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
      if (match && match[1]) {
        const mainUri = new URL(match[1].replace('prisma://', 'postgres://'));
        const mainHost = (mainUri.host || '').toLowerCase();

        // If candidateUrl matches root .env DATABASE_URL and is not explicitly configured as separate test config
        if (mainHost && testHost === mainHost && !explicitTestConfig) {
          throw new Error('AMBIGUOUS_DATABASE_FALLBACK: Test runner attempted to reuse ambient .env production database connection.');
        }

        // Even with explicit config, if testHost matches the main production host, reject
        if (mainHost && testHost === mainHost) {
          const isMainHostApprovedTest = APPROVED_TEST_ENDPOINT_PATTERNS.some((pattern) => mainHost.includes(pattern));
          if (!isMainHostApprovedTest) {
            throw new Error('PRODUCTION_DATABASE_MATCH: Target database matches the primary production database host.');
          }
        }
      }
    } catch (envErr) {
      if (
        envErr.message?.startsWith('AMBIGUOUS_DATABASE_FALLBACK') ||
        envErr.message?.startsWith('PRODUCTION_DATABASE_MATCH')
      ) {
        throw envErr;
      }
    }
  }

  // POSITIVE ALLOWLIST: Reject every unknown or unapproved endpoint by default.
  const isApproved = APPROVED_TEST_ENDPOINT_PATTERNS.some((pattern) => testHost.includes(pattern));
  if (!isApproved) {
    throw new Error(`UNAPPROVED_ENDPOINT_REJECTED: Database host "${testHost}" is not in the approved test database allowlist.`);
  }

  return {
    valid: true,
    host: testHost,
  };
}

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
  let hasEnvTest = false;
  if (fs.existsSync('.env.test')) {
    dotenv.config({ path: '.env.test', override: true });
    hasEnvTest = true;
  }

  // Enforce NODE_ENV=test for all test operations
  process.env.NODE_ENV = 'test';

  // 4. Dedicated Test Database Positive Allowlist Guard
  const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  const isExplicit = Boolean(process.env.TEST_DATABASE_URL) || hasEnvTest;

  try {
    validateTestDatabaseTarget(testDbUrl, { explicitTestConfig: isExplicit });
  } catch (err) {
    console.error('\n=============================================================');
    console.error('❌ FATAL: TEST EXECUTION ABORTED — DATABASE SECURITY GUARD');
    console.error('=============================================================');
    console.error(err.message);
    console.error('Automated tests require an explicitly approved test database endpoint.');
    console.error('Please configure an approved isolated test branch in .env.test.');
    console.error('=============================================================\n');
    process.exit(1);
  }

  // Set DATABASE_URL, DIRECT_URL, and DATABASE_URL_UNPOOLED to test database for all subsequent Prisma connections
  process.env.DATABASE_URL = testDbUrl;
  const unpooledTestUrl = process.env.TEST_DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || testDbUrl;
  try {
    validateTestDatabaseTarget(unpooledTestUrl, { explicitTestConfig: isExplicit });
  } catch (unpooledErr) {
    console.error('\n=============================================================');
    console.error('❌ FATAL: TEST EXECUTION ABORTED — UNPOOLED DATABASE SECURITY GUARD');
    console.error('=============================================================');
    console.error(unpooledErr.message);
    console.error('Automated tests require unpooled database URL to match approved test endpoints.');
    console.error('=============================================================\n');
    process.exit(1);
  }
  process.env.DIRECT_URL = unpooledTestUrl;
  process.env.DATABASE_URL_UNPOOLED = unpooledTestUrl;

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
