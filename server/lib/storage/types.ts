// server/lib/storage/types.ts — Storage Adapter Abstraction Contract

export interface StorageMetadata {
  mimeType: string;
  sizeBytes: number;
  bookId?: string;
  originalName?: string;
  updatedAt?: Date;
  [key: string]: unknown;
}

export interface StorageResult {
  key: string;
  sizeBytes: number;
  mimeType: string;
  etag?: string;
}

export interface StoredObject {
  key: string;
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
  updatedAt: Date;
  etag?: string;
}

/**
 * Pluggable Storage Adapter Interface
 * Decouples application business logic from underlying persistence engines
 * (e.g. PostgreSQL Database Driver, Supabase Storage, S3-Compatible Buckets).
 *
 * Strict Architectural Contract:
 * - Driver-independent
 * - Zero database ORM/Prisma dependencies in interface
 * - Zero Express HTTP dependencies in interface
 * - Zero local filesystem dependencies in interface
 */
export interface StorageAdapter {
  /**
   * Persists an image buffer under a deterministic storage key.
   */
  put(
    key: string,
    buffer: Buffer,
    metadata: StorageMetadata
  ): Promise<StorageResult>;

  /**
   * Retrieves a stored object by key, or returns null if not found.
   */
  get(
    key: string
  ): Promise<StoredObject | null>;

  /**
   * Deletes a stored object by key. Safe no-op if key does not exist.
   */
  delete(
    key: string
  ): Promise<void>;
}
