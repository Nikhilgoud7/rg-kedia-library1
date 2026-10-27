// server/lib/storage/storageEnvValidator.ts — Fail-Fast Production Storage Environment Guard & R2 Config Resolver
import { S3DriverConfig } from './types.js';

export interface StorageEnvValidationResult {
  valid: boolean;
  error?: string;
  driver?: string;
  config?: S3DriverConfig;
}

/**
 * Validates storage environment configuration according to production safety rules.
 * Enforces:
 * 1. Production requires an explicitly configured STORAGE_DRIVER (cannot be empty).
 * 2. Production cannot silently use local filesystem storage (STORAGE_DRIVER cannot be 'local' or 'disk').
 * 3. If STORAGE_DRIVER is 'r2' (or 's3'), all required R2 configuration (bucket, access keys, account ID / endpoint) must be present.
 * 4. Development and test environments can continue using local storage without external credentials.
 * 5. Credentials never appear in error messages or logs.
 */
export function validateStorageEnvironment(
  env: NodeJS.ProcessEnv = process.env
): StorageEnvValidationResult {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const rawDriver = env.STORAGE_DRIVER;
  const driver = (rawDriver || '').toLowerCase().trim();

  // Rule 1 & 2: Production safety gates
  if (isProduction) {
    if (!rawDriver || driver === '') {
      return {
        valid: false,
        error:
          'STORAGE_CONFIGURATION_ERROR: STORAGE_DRIVER environment variable is required in production. Must specify a valid cloud object storage provider (e.g. STORAGE_DRIVER=r2).',
      };
    }

    if (driver === 'local' || driver === 'disk') {
      return {
        valid: false,
        error:
          'STORAGE_CONFIGURATION_ERROR: Local filesystem storage (STORAGE_DRIVER=local) is strictly forbidden in production. Container restarts on platforms like Render will destroy examination papers. Configure STORAGE_DRIVER=r2 with Cloudflare R2 credentials.',
      };
    }
  }

  // Rule 3: Cloudflare R2 / S3 Configuration Validation
  if (driver === 'r2' || driver === 's3' || driver === 'cloudflare') {
    const bucket = (env.R2_BUCKET_NAME || env.S3_BUCKET || '').trim();
    const accessKeyId = (env.R2_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || '').trim();
    const accountId = (env.R2_ACCOUNT_ID || '').trim();
    const endpoint = (
      env.R2_ENDPOINT ||
      env.S3_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
    ).trim();
    const region = (env.R2_REGION || env.S3_REGION || 'auto').trim();

    const missing: string[] = [];
    if (!bucket) missing.push('R2_BUCKET_NAME');
    if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
    if (!endpoint) missing.push('R2_ACCOUNT_ID or R2_ENDPOINT');

    if (missing.length > 0) {
      return {
        valid: false,
        error: `STORAGE_CONFIGURATION_ERROR: Incomplete Cloudflare R2 storage configuration. Missing required variable(s): ${missing.join(', ')}.`,
      };
    }

    return {
      valid: true,
      driver: 'r2',
      config: {
        bucket,
        accessKeyId,
        secretAccessKey,
        endpoint,
        region,
        forcePathStyle: true,
      },
    };
  }

  // Database driver (Book Covers)
  if (driver === 'database' || driver === 'postgres' || driver === 'postgresql') {
    return { valid: true, driver: 'database' };
  }

  // Local / disk driver (Allowed in development and testing)
  if (driver === 'local' || driver === 'disk' || (!rawDriver && !isProduction)) {
    return { valid: true, driver: 'local' };
  }

  // Unknown storage driver
  return {
    valid: false,
    error: `STORAGE_CONFIGURATION_ERROR: Unknown STORAGE_DRIVER '${rawDriver}'. Valid options are: 'r2', 'database', 'local'.`,
  };
}

/**
 * Resolves Cloudflare R2 S3DriverConfig from environment variables using canonical R2 convention.
 * Throws STORAGE_DRIVER_NOT_CONFIGURED with missing variable names if incomplete.
 * Never outputs credential secrets in error messages.
 */
export function resolveR2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): S3DriverConfig {
  const result = validateStorageEnvironment({
    ...env,
    STORAGE_DRIVER: 'r2',
  });

  if (!result.valid || !result.config) {
    throw new Error(
      `STORAGE_DRIVER_NOT_CONFIGURED: ${result.error || 'Invalid Cloudflare R2 storage configuration.'}`
    );
  }

  return result.config;
}

export const resolveS3ConfigFromEnv = resolveR2ConfigFromEnv;
