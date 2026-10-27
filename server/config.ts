import dotenv from 'dotenv';
import { validateStorageEnvironment } from './lib/storage/storageEnvValidator.js';

// Load .env configuration
dotenv.config();

const rawJwtSecret = process.env.JWT_SECRET;
const weakSecrets = ['default-secret', 'secret', 'changeme'];

if (
  !rawJwtSecret ||
  rawJwtSecret.length < 32 ||
  weakSecrets.includes(rawJwtSecret.toLowerCase())
) {
  console.error(
    'FATAL: JWT_SECRET environment variable is missing, too short (< 32 characters), or using an insecure default value. Server cannot start safely.'
  );
  process.exit(1);
}

export const JWT_SECRET: string = rawJwtSecret;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';
export const PORT: number = parseInt(process.env.PORT || '5000', 10);
export const NODE_ENV: string = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION: boolean = NODE_ENV === 'production';

// Production Storage Fail-Fast Guard (Phase 12C)
// Automated tests (ALLOW_TESTS === 'true' or NODE_ENV === 'test') and development can use local storage.
const isTestRun = process.env.NODE_ENV === 'test' || process.env.ALLOW_TESTS === 'true';
const storageValidation = validateStorageEnvironment(process.env);
if (!storageValidation.valid && !isTestRun) {
  if (IS_PRODUCTION) {
    console.error(`FATAL: ${storageValidation.error}`);
    process.exit(1);
  } else if (
    process.env.STORAGE_DRIVER &&
    !['local', 'disk'].includes(process.env.STORAGE_DRIVER.toLowerCase().trim())
  ) {
    console.warn(`WARNING: ${storageValidation.error}`);
  }
}
export const CLIENT_URL: string = process.env.CLIENT_URL || 'http://localhost:5173';
export const UPLOAD_DIR: string = process.env.UPLOAD_DIR || './uploads';
export const MAX_FILE_SIZE: number = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
let parsedTrustProxy: number | undefined = undefined;
if (process.env.TRUST_PROXY !== undefined && process.env.TRUST_PROXY !== '') {
  const trimmed = process.env.TRUST_PROXY.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.error(
      'FATAL: TRUST_PROXY environment variable must be a non-negative integer (e.g. 1). Received invalid value. Server cannot start safely.'
    );
    process.exit(1);
  }
  parsedTrustProxy = parseInt(trimmed, 10);
}

export const TRUST_PROXY: number | undefined = parsedTrustProxy;
export const DEMO_MODE: boolean = process.env.DEMO_MODE === 'true';
