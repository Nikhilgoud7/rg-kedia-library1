// server/lib/storage/index.ts — Storage Adapter Factory & Driver Configuration
import { StorageAdapter, S3DriverConfig } from './types.js';
import { DatabaseStorageDriver } from './DatabaseStorageDriver.js';
import { LocalStorageDriver } from './LocalStorageDriver.js';
import { S3StorageDriver } from './S3StorageDriver.js';
import {
  validateStorageEnvironment,
  resolveR2ConfigFromEnv,
  resolveS3ConfigFromEnv,
} from './storageEnvValidator.js';
import prisma from '../../middleware/auth.js';

export * from './types.js';
export * from './DatabaseStorageDriver.js';
export * from './LocalStorageDriver.js';
export * from './S3StorageDriver.js';
export * from './storageEnvValidator.js';
export * from './imageProcessor.js';
export * from './fileSignatureValidator.js';

let activeStorageAdapter: StorageAdapter | null = null;
let activeDocumentStorageAdapter: StorageAdapter | null = null;

/**
 * Storage Driver Factory (Primarily for Book Covers / Default storage)
 * Configurable via process.env.STORAGE_DRIVER
 */
export function getStorageAdapter(driverName?: string): StorageAdapter {
  if (activeStorageAdapter && !driverName) {
    return activeStorageAdapter;
  }

  const selectedDriver = (driverName || process.env.STORAGE_DRIVER || 'database').toLowerCase().trim();

  switch (selectedDriver) {
    case 'database':
    case 'postgres':
    case 'postgresql':
      activeStorageAdapter = new DatabaseStorageDriver(prisma);
      return activeStorageAdapter;

    case 'local':
    case 'disk':
      activeStorageAdapter = new LocalStorageDriver();
      return activeStorageAdapter;

    case 'r2':
    case 's3':
    case 'cloudflare': {
      const config = resolveR2ConfigFromEnv();
      activeStorageAdapter = new S3StorageDriver(config);
      return activeStorageAdapter;
    }

    default:
      throw new Error(
        `INVALID_STORAGE_DRIVER: Unknown storage driver '${selectedDriver}'. Valid drivers are: 'database', 'local', 'r2', 's3'.`
      );
  }
}

/**
 * Document Storage Adapter Factory (For Exam Papers & Academic Documents)
 * Defaults to 'local' for local dev/testing unless process.env.STORAGE_DRIVER is set to 'r2' | 's3'.
 * Enforces production fail-fast rules:
 * - Production requires an explicit cloud storage driver ('r2' or 's3').
 * - Production strictly forbids local filesystem storage ('local' or 'disk').
 */
/**
 * Normalizes document storage provider aliases to canonical identifiers ('r2' or 'local').
 * Rejects unsupported aliases. Preserves compatibility with existing 'r2' records.
 */
export function normalizeDocumentStorageProvider(provider?: string): 'r2' | 'local' {
  const p = (provider || '').toLowerCase().trim();
  if (p === 'r2' || p === 's3' || p === 'cloudflare') {
    return 'r2';
  }
  if (p === 'local' || p === 'disk') {
    return 'local';
  }
  throw new Error(
    `INVALID_STORAGE_PROVIDER: Unsupported storage provider '${provider}'. Valid providers are 'r2', 's3', 'cloudflare', 'local'.`
  );
}

export function getDocumentStorageAdapter(driverName?: string): StorageAdapter {
  const isProduction = process.env.NODE_ENV === 'production';
  const rawDriver = driverName || process.env.STORAGE_DRIVER;
  const selectedDriver = (rawDriver || (isProduction ? 'r2' : 'local')).toLowerCase().trim();

  // Production document safety enforcement:
  // 1. Production strictly requires cloud object storage (r2, s3, cloudflare).
  // 2. Production strictly forbids local filesystem storage (local, disk).
  // 3. Database is never allowed for document storage.
  // 4. No explicit driver argument can bypass this prohibition in production.
  if (isProduction) {
    if (!rawDriver || rawDriver.trim() === '') {
      throw new Error(
        'STORAGE_CONFIGURATION_ERROR: STORAGE_DRIVER environment variable is required in production. Must specify a valid cloud object storage provider (e.g. STORAGE_DRIVER=r2).'
      );
    }
    if (selectedDriver === 'local' || selectedDriver === 'disk' || selectedDriver === 'database') {
      throw new Error(
        `STORAGE_CONFIGURATION_ERROR: Local or database storage (driver='${selectedDriver}') is strictly forbidden in production. Container restarts on platforms like Render will destroy examination papers. Configure STORAGE_DRIVER=r2 with Cloudflare R2 credentials.`
      );
    }
  }

  if (activeDocumentStorageAdapter && !driverName) {
    if (isProduction && activeDocumentStorageAdapter instanceof LocalStorageDriver) {
      throw new Error(
        'STORAGE_CONFIGURATION_ERROR: Local filesystem storage is strictly forbidden in production.'
      );
    }
    return activeDocumentStorageAdapter;
  }

  switch (selectedDriver) {
    case 'local':
    case 'disk':
      activeDocumentStorageAdapter = new LocalStorageDriver();
      return activeDocumentStorageAdapter;

    case 'database':
      throw new Error(
        "INVALID_STORAGE_DRIVER: Document storage does not support 'database'. Valid drivers are: 'local', 'r2', 's3'."
      );

    case 'r2':
    case 's3':
    case 'cloudflare': {
      const config = resolveR2ConfigFromEnv();
      activeDocumentStorageAdapter = new S3StorageDriver(config);
      return activeDocumentStorageAdapter;
    }

    default:
      throw new Error(
        `INVALID_STORAGE_DRIVER: Unknown document storage driver '${selectedDriver}'. Valid drivers are: 'local', 'r2', 's3'.`
      );
  }
}

/**
 * Helper to reset singleton instances (used in unit/integration testing).
 */
export const resetDocumentStorageAdapter = (): void => resetStorageAdapter();
export function resetStorageAdapter(): void {
  activeStorageAdapter = null;
  activeDocumentStorageAdapter = null;
}
