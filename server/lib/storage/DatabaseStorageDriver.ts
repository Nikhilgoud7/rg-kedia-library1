// server/lib/storage/DatabaseStorageDriver.ts — PostgreSQL Database Storage Driver for Book Covers
import { PrismaClient } from '@prisma/client';
import { StorageAdapter, StorageMetadata, StorageResult, StoredObject } from './types.js';

export const MAX_DRIVER_STORAGE_BYTES = 50 * 1024; // 51,200 bytes

/**
 * Extracts a clean bookId from standard storage keys or metadata.
 * Supported patterns:
 * - "covers/books/{bookId}.webp"
 * - "books/{bookId}/cover.webp"
 * - "book-covers/{bookId}"
 * - "{bookId}"
 */
export function extractBookIdFromKey(key: string, metadataBookId?: string): string {
  if (metadataBookId && typeof metadataBookId === 'string' && metadataBookId.trim()) {
    return metadataBookId.trim();
  }

  if (!key || typeof key !== 'string' || !key.trim()) {
    throw new Error('INVALID_STORAGE_KEY: Storage key must be a non-empty string.');
  }

  const clean = key.trim();
  // Match UUID or alphanumeric ID before extension or after last slash
  const match = clean.match(/(?:^|\/)([a-f0-9-]{36}|[a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?$/i);
  if (match && match[1]) {
    return match[1];
  }

  return clean;
}

/**
 * PostgreSQL Database Storage Driver
 * Persists WebP book cover images in the dedicated `BookCover` table.
 *
 * Guarantees:
 * - Zero local disk writes in production
 * - Dedicated binary table keeps standard Book catalog queries lean
 * - Enforces strict <= 50 KB ceiling before database write
 * - Cascade deletion handled at database level
 */
export class DatabaseStorageDriver implements StorageAdapter {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    } else {
      // Lazy import or fallback to default prisma client
      const defaultPrisma = (global as any).prisma || new PrismaClient();
      this.prisma = defaultPrisma;
    }
  }

  /**
   * Persists an image buffer under a deterministic storage key in PostgreSQL.
   */
  async put(
    key: string,
    buffer: Buffer,
    metadata: StorageMetadata
  ): Promise<StorageResult> {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('INVALID_PAYLOAD: Image buffer is required and must be a valid Buffer.');
    }

    if (buffer.length === 0) {
      throw new Error('EMPTY_PAYLOAD: Cannot store an empty image buffer.');
    }

    if (buffer.length > MAX_DRIVER_STORAGE_BYTES) {
      throw new Error(
        `PAYLOAD_TOO_LARGE: Buffer size (${buffer.length} bytes) exceeds maximum database cover storage limit of ${MAX_DRIVER_STORAGE_BYTES} bytes (50 KB).`
      );
    }

    if (!metadata || typeof metadata !== 'object') {
      throw new Error('INVALID_METADATA: Storage metadata must be provided.');
    }

    const bookId = extractBookIdFromKey(key, metadata.bookId);
    if (!bookId) {
      throw new Error('INVALID_STORAGE_KEY: Could not resolve a valid bookId from key or metadata.');
    }

    const mimeType = metadata.mimeType || 'image/webp';

    const byteData = new Uint8Array(buffer);

    const record = await this.prisma.bookCover.upsert({
      where: { bookId },
      create: {
        bookId,
        data: byteData,
        mimeType,
        sizeBytes: buffer.length,
      },
      update: {
        data: byteData,
        mimeType,
        sizeBytes: buffer.length,
      },
    });

    const etag = `W/"${record.sizeBytes}-${record.updatedAt.getTime()}"`;

    return {
      key: `covers/books/${bookId}.webp`,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
      etag,
    };
  }

  /**
   * Retrieves a stored cover image by key, or returns null if not found.
   */
  async get(key: string): Promise<StoredObject | null> {
    const bookId = extractBookIdFromKey(key);
    if (!bookId) {
      return null;
    }

    const record = await this.prisma.bookCover.findUnique({
      where: { bookId },
    });

    if (!record) {
      return null;
    }

    const etag = `W/"${record.sizeBytes}-${record.updatedAt.getTime()}"`;

    return {
      key: `covers/books/${bookId}.webp`,
      data: Buffer.from(record.data),
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      updatedAt: record.updatedAt,
      etag,
    };
  }

  /**
   * Deletes a stored cover image by key. Safe no-op if record does not exist.
   */
  async delete(key: string): Promise<void> {
    const bookId = extractBookIdFromKey(key);
    if (!bookId) {
      return;
    }

    await this.prisma.bookCover.deleteMany({
      where: { bookId },
    });
  }
}
