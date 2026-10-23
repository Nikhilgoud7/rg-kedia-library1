// tests/suites/envGuardValidation.test.js — Pure Non-Mutating Unit Tests for Test Database Environment Guard
import {
  validateTestDatabaseTarget,
  APPROVED_TEST_ENDPOINT_PATTERNS,
} from '../helpers/envGuard.js';

export async function runEnvGuardValidationTests(_baseUrl, assert) {
  // 1. Approved test endpoint is accepted
  const approvedUrl = 'postgresql://user:pass@ep-autumn-sky-b3vpykh4-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  const approvedRes = validateTestDatabaseTarget(approvedUrl, { explicitTestConfig: true });
  assert(approvedRes.valid === true, 'Approved test endpoint is accepted by positive allowlist');
  assert(approvedRes.host.includes('ep-autumn-sky-b3vpykh4'), 'Host matches approved endpoint');

  // 1.1 Localhost/offline test endpoints are accepted
  const localUrl = 'postgresql://user:pass@localhost:5432/testdb';
  const localRes = validateTestDatabaseTarget(localUrl, { explicitTestConfig: true });
  assert(localRes.valid === true, 'Localhost test database is accepted by allowlist');

  // 2. Known production endpoint is rejected by default
  const prodUrl = 'postgresql://user:pass@ep-aged-sunset-b3548him-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  let prodError = null;
  try {
    validateTestDatabaseTarget(prodUrl, { explicitTestConfig: true });
  } catch (err) {
    prodError = err;
  }
  assert(prodError !== null, 'Known production endpoint is rejected');
  assert(
    prodError?.message?.includes('PRODUCTION_DATABASE_MATCH') ||
    prodError?.message?.includes('UNAPPROVED_ENDPOINT_REJECTED'),
    'Rejection identifies production or unapproved endpoint'
  );

  // 3. Unknown / unexpected endpoint is rejected by default (Fail-Closed)
  const unknownUrl = 'postgresql://user:pass@ep-random-unknown-endpoint-9999.aws.neon.tech/neondb?sslmode=require';
  let unknownError = null;
  try {
    validateTestDatabaseTarget(unknownUrl, { explicitTestConfig: true });
  } catch (err) {
    unknownError = err;
  }
  assert(unknownError !== null, 'Unknown database endpoint is rejected by default');
  assert(unknownError?.message?.includes('UNAPPROVED_ENDPOINT_REJECTED'), 'Rejection identifies unapproved endpoint');

  // 4. Missing URL is rejected
  let missingError = null;
  try {
    validateTestDatabaseTarget('', { explicitTestConfig: true });
  } catch (err) {
    missingError = err;
  }
  assert(missingError !== null, 'Missing database URL is rejected');
  assert(missingError?.message?.includes('NO_TEST_DATABASE_CONFIGURED'), 'Error message clarifies missing URL');

  // 5. Malformed URL is rejected
  let malformedError = null;
  try {
    validateTestDatabaseTarget('not_a_valid_connection_url', { explicitTestConfig: true });
  } catch (err) {
    malformedError = err;
  }
  assert(malformedError !== null, 'Malformed database URL is rejected');
  assert(malformedError?.message?.includes('MALFORMED_URL'), 'Error message clarifies malformed URL');

  // 6. Attempted fallback to ambient .env without explicit test config is rejected
  // Even if an ambient .env has a DATABASE_URL, if it is reused without explicit test config, it must be rejected
  let fallbackError = null;
  try {
    // If candidate matches what's in .env without explicitTestConfig
    validateTestDatabaseTarget(prodUrl, { explicitTestConfig: false });
  } catch (err) {
    fallbackError = err;
  }
  assert(fallbackError !== null, 'Attempted fallback to ambient production database is rejected');
  assert(
    fallbackError?.message?.includes('AMBIGUOUS_DATABASE_FALLBACK') ||
    fallbackError?.message?.includes('UNAPPROVED_ENDPOINT_REJECTED'),
    'Error message flags ambient fallback / unapproved target'
  );

  // 7. Zero credentials or secrets leaked in error messages
  const errorStrings = [
    prodError?.message || '',
    unknownError?.message || '',
    missingError?.message || '',
    malformedError?.message || '',
    fallbackError?.message || '',
  ].join(' ');
  assert(!errorStrings.includes('pass'), 'Zero passwords leaked in guard validation errors');
  assert(!errorStrings.includes('postgresql://'), 'Zero full connection strings leaked in guard validation errors');
}
