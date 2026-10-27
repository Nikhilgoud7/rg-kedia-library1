// server/lib/storage/LocalStorageDriver.ts — Local Filesystem Storage Driver
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageAdapter, StorageMetadata, StorageResult, StoredObject } from './types.js';

function isPathInside(childPath: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, childPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export class LocalStorageDriver implements StorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    if (baseDir) {
      this.baseDir = path.resolve(baseDir);
    } else {
      // Default to uploads/ inside project root
      this.baseDir = path.resolve(process.cwd(), 'uploads');
    }

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('INVALID_STORAGE_KEY: Storage key must be a non-empty string.');
    }

    // Strip leading slash or uploads prefix if passed as absolute URL
    let cleanKey = key.trim();
    if (cleanKey.startsWith('/uploads/')) {
      cleanKey = cleanKey.replace('/uploads/', '');
    } else if (cleanKey.startsWith('uploads/')) {
      cleanKey = cleanKey.replace('uploads/', '');
    } else if (cleanKey.startsWith('/')) {
      cleanKey = cleanKey.slice(1);
    }

    const fullPath = path.resolve(this.baseDir, cleanKey);
    if (!isPathInside(fullPath, this.baseDir)) {
      throw new Error(`PATH_TRAVERSAL_DETECTED: Key '${key}' resolves outside designated storage root.`);
    }

    return fullPath;
  }

  async put(
    key: string,
    buffer: Buffer,
    metadata: StorageMetadata
  ): Promise<StorageResult> {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('INVALID_PAYLOAD: Binary buffer is required.');
    }

    const targetPath = this.resolvePath(key);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, buffer);

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      key,
      sizeBytes: buffer.length,
      mimeType: metadata.mimeType || 'application/octet-stream',
      checksum,
    };
  }

  async get(key: string): Promise<StoredObject | null> {
    const targetPath = this.resolvePath(key);
    if (!fs.existsSync(targetPath)) {
      return null;
    }

    const stat = fs.statSync(targetPath);
    const data = fs.readFileSync(targetPath);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');

    // Simple extension mapping fallback
    const ext = path.extname(targetPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return {
      key,
      data,
      sizeBytes: stat.size,
      mimeType: mimeMap[ext] || 'application/octet-stream',
      checksum,
      updatedAt: stat.mtime,
    };
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.resolvePath(key);
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const targetPath = this.resolvePath(key);
    return fs.existsSync(targetPath);
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    const targetPath = this.resolvePath(key);
    if (!fs.existsSync(targetPath)) {
      return null;
    }

    const stat = fs.statSync(targetPath);
    const data = fs.readFileSync(targetPath);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');

    const ext = path.extname(targetPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return {
      sizeBytes: stat.size,
      mimeType: mimeMap[ext] || 'application/octet-stream',
      checksum,
      updatedAt: stat.mtime,
    };
  }
}
