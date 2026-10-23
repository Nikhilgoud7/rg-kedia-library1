// server/lib/storage/index.ts — Storage Adapter Factory & Driver Configuration
import { StorageAdapter } from './types.js';
import { DatabaseStorageDriver } from './DatabaseStorageDriver.js';
import prisma from '../../middleware/auth.js';

export * from './types.js';
export * from './DatabaseStorageDriver.js';
export * from './imageProcessor.js';

let activeStorageAdapter: StorageAdapter | null = null;

/**
 * Storage Driver Factory
 *
 * Configurable via process.env.STORAGE_DRIVER:
 * - 'database' (Default): Zero-cost PostgreSQL-backed driver (`BookCover` table).
 * - 's3' | 'supabase': Reserved for future cloud object storage integration.
 *
 * Guarantees:
 * - Default 'database' driver requires zero external accounts or cloud subscriptions.
 * - Unknown driver fails closed with a clear error.
 * - No silent fallback to local disk in production.
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

    case 's3':
    case 'supabase':
      // FUTURE EXTENSION POINT:
      // When external credentials (AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
      // or SUPABASE_URL, SUPABASE_SERVICE_KEY) are supplied, an S3StorageDriver implementing
      // StorageAdapter can be returned here without modifying application business logic.
      throw new Error(
        `STORAGE_DRIVER_NOT_CONFIGURED: '${selectedDriver}' storage driver requested, but external credentials are not configured.`
      );

    default:
      throw new Error(
        `INVALID_STORAGE_DRIVER: Unknown storage driver '${selectedDriver}'. Valid drivers are: 'database', 's3', 'supabase'.`
      );
  }
}

/**
 * Helper to reset singleton instance (used in unit/integration testing).
 */
export function resetStorageAdapter(): void {
  activeStorageAdapter = null;
}
