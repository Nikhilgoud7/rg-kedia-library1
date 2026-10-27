// server/lib/storage/S3StorageDriver.ts — S3-Compatible Cloud Object Storage Driver (Cloudflare R2, AWS S3)
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { StorageAdapter, StorageMetadata, StorageResult, StoredObject, S3DriverConfig } from './types.js';

export class S3StorageDriver implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3DriverConfig, customClient?: S3Client) {
    if (!config || typeof config !== 'object') {
      throw new Error('S3_CONFIG_REQUIRED: Storage configuration object is required.');
    }

    if (!config.bucket || typeof config.bucket !== 'string' || !config.bucket.trim()) {
      throw new Error('STORAGE_CONFIG_INVALID: Missing bucket configuration (R2_BUCKET_NAME).');
    }

    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('STORAGE_CONFIG_INVALID: Missing access credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).');
    }

    this.bucket = config.bucket.trim();

    if (customClient) {
      this.client = customClient;
    } else {
      this.client = new S3Client({
        region: config.region || 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId.trim(),
          secretAccessKey: config.secretAccessKey.trim(),
        },
        forcePathStyle: config.forcePathStyle ?? true,
        tls: true,
      });
    }
  }

  async put(
    key: string,
    buffer: Buffer,
    metadata: StorageMetadata
  ): Promise<StorageResult> {
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new Error('INVALID_STORAGE_KEY: Storage key must be a non-empty string.');
    }

    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('INVALID_PAYLOAD: Binary buffer is required.');
    }

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const cleanKey = key.trim().replace(/^\/+/, '');

    const customMetadata: Record<string, string> = {
      'sha256-checksum': checksum,
      'mime-type': metadata.mimeType || 'application/octet-stream',
    };

    if (metadata.originalName) {
      customMetadata['original-name'] = encodeURIComponent(String(metadata.originalName).slice(0, 200));
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: buffer,
      ContentType: metadata.mimeType || 'application/octet-stream',
      ContentLength: buffer.length,
      Metadata: customMetadata,
    });

    const response = await this.client.send(command);

    return {
      key: cleanKey,
      sizeBytes: buffer.length,
      mimeType: metadata.mimeType || 'application/octet-stream',
      checksum,
      etag: response.ETag?.replace(/"/g, ''),
    };
  }

  async get(key: string): Promise<StoredObject | null> {
    const cleanKey = (key || '').trim().replace(/^\/+/, '');
    if (!cleanKey) return null;

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to Buffer
      const streamToBuffer = async (stream: any): Promise<Buffer> => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      };

      const data = await streamToBuffer(response.Body);
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      return {
        key: cleanKey,
        data,
        mimeType: response.ContentType || 'application/octet-stream',
        sizeBytes: response.ContentLength || data.length,
        checksum,
        updatedAt: response.LastModified || new Date(),
        etag: response.ETag?.replace(/"/g, ''),
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const cleanKey = (key || '').trim().replace(/^\/+/, '');
    if (!cleanKey) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      await this.client.send(command);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return; // Safe no-op
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const cleanKey = (key || '').trim().replace(/^\/+/, '');
    if (!cleanKey) return false;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    const cleanKey = (key || '').trim().replace(/^\/+/, '');
    if (!cleanKey) return null;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      const response = await this.client.send(command);

      return {
        mimeType: response.ContentType || 'application/octet-stream',
        sizeBytes: response.ContentLength || 0,
        checksum: response.Metadata?.['sha256-checksum'],
        originalName: response.Metadata?.['original-name']
          ? decodeURIComponent(response.Metadata['original-name'])
          : undefined,
        updatedAt: response.LastModified,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 60): Promise<string> {
    const cleanKey = (key || '').trim().replace(/^\/+/, '');
    if (!cleanKey) {
      throw new Error('INVALID_STORAGE_KEY: Storage key cannot be empty for presigned URL generation.');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: Math.max(10, Math.min(3600, expiresInSeconds)),
    });

    return signedUrl;
  }
}
