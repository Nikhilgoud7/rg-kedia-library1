// server/lib/storage/types.ts — Storage Adapter Abstraction Contract

export interface StorageMetadata {
  mimeType: string;
  sizeBytes: number;
  bookId?: string;
  originalName?: string;
  checksum?: string;
  updatedAt?: Date;
  [key: string]: unknown;
}

export interface StorageResult {
  key: string;
  sizeBytes: number;
  mimeType: string;
  checksum?: string;
  etag?: string;
}

export interface StoredObject {
  key: string;
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  updatedAt: Date;
  etag?: string;
}

export interface S3DriverConfig {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/**
 * Pluggable Storage Adapter Interface
 * Decouples application business logic from underlying persistence engines
 * (e.g. PostgreSQL Database Driver, Cloudflare R2 / S3 Buckets, Local Filesystem).
 *
 * Strict Architectural Contract:
 * - Driver-independent
 * - Zero database ORM/Prisma dependencies in interface
 * - Zero Express HTTP dependencies in interface
 */
export interface StorageAdapter {
  /**
   * Persists a binary buffer under a deterministic storage key.
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

  /**
   * Checks whether a stored object exists.
   */
  exists(
    key: string
  ): Promise<boolean>;

  /**
   * Retrieves object metadata without downloading full binary content.
   */
  getMetadata?(
    key: string
  ): Promise<StorageMetadata | null>;

  /**
   * Generates a short-lived authenticated download URL (for S3/R2 private objects).
   */
  getSignedDownloadUrl?(
    key: string,
    expiresInSeconds?: number
  ): Promise<string>;
}
