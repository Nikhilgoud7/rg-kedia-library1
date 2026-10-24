// server/lib/backup/backupEngine.ts — Database Backup Generator Engine
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  BackupMetadata,
  BackupRecordCounts,
  BackupDataPayload,
  CompleteBackupArchive,
  CreateBackupOptions,
  CreateBackupResult,
} from './types.js';
import {
  calculateChecksum,
  encryptPayload,
  getSafeHostString,
  redactSecrets,
} from './cryptoUtils.js';

const TABLE_NAMES = [
  'User',
  'Book',
  'BookCover',
  'BookProgram',
  'BookCopy',
  'Lending',
  'BookRequest',
  'ExamPaper',
  'Notification',
  'AuditLog',
];

export class BackupLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupLockError';
  }
}

/**
 * Acquires a non-blocking filesystem lock for backup operations.
 */
function acquireLock(lockPath: string): () => void {
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    // 'wx' flag fails if file already exists
    const fd = fs.openSync(lockPath, 'wx');
    const lockInfo = JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(fd, lockInfo, 'utf8');
    fs.closeSync(fd);
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      // Check if stale lock (> 30 minutes old)
      try {
        const stats = fs.statSync(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > 30 * 60 * 1000) {
          // Stale lock — remove and retry once
          fs.unlinkSync(lockPath);
          return acquireLock(lockPath);
        }
      } catch {
        // Fall through to throw
      }
      throw new BackupLockError('CONCURRENT_BACKUP_BLOCKED: Another backup process is currently running.');
    }
    throw err;
  }

  return () => {
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Ignore release error
    }
  };
}

/**
 * Executes a full logical database backup.
 *
 * ATOMIC FILE WRITING (DR-9C-03):
 * All backup artifacts are written to a unique collision-resistant .tmp file first
 * and then atomically renamed into their final destination via fs.renameSync.
 * If writing or renaming fails, temporary files are cleanly purged.
 */
export async function createDatabaseBackup(
  prisma: PrismaClient,
  options: CreateBackupOptions = {}
): Promise<CreateBackupResult> {
  const startTime = Date.now();
  const outDir = options.outDir || path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(outDir, { recursive: true });

  const lockPath = path.join(outDir, '.backup.lock');
  let releaseLock: (() => void) | null = null;

  if (!options.skipLock) {
    releaseLock = acquireLock(lockPath);
  }

  try {
    const rawDbUrl = process.env.DATABASE_URL || '';
    const safeHost = getSafeHostString(rawDbUrl);

    // 1. Fetch records table by table in dependency order
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const books = await prisma.book.findMany({ orderBy: { createdAt: 'asc' } });

    // Binary cover images: serialize Buffer to base64 string
    const rawCovers = await prisma.bookCover.findMany({ orderBy: { createdAt: 'asc' } });
    const bookCovers = rawCovers.map((cover) => ({
      ...cover,
      data: Buffer.isBuffer(cover.data)
        ? cover.data.toString('base64')
        : Buffer.from(cover.data as any).toString('base64'),
    }));

    const bookPrograms = await prisma.bookProgram.findMany({ orderBy: { id: 'asc' } });
    const bookCopies = await prisma.bookCopy.findMany({ orderBy: { id: 'asc' } });
    const lendings = await prisma.lending.findMany({ orderBy: { createdAt: 'asc' } });
    const bookRequests = await prisma.bookRequest.findMany({ orderBy: { createdAt: 'asc' } });
    const examPapers = await prisma.examPaper.findMany({ orderBy: { createdAt: 'asc' } });
    const notifications = await prisma.notification.findMany({ orderBy: { createdAt: 'asc' } });
    const auditLogs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } });

    const recordCounts: BackupRecordCounts = {
      User: users.length,
      Book: books.length,
      BookCover: bookCovers.length,
      BookProgram: bookPrograms.length,
      BookCopy: bookCopies.length,
      Lending: lendings.length,
      BookRequest: bookRequests.length,
      ExamPaper: examPapers.length,
      Notification: notifications.length,
      AuditLog: auditLogs.length,
    };

    const dataPayload: BackupDataPayload = {
      users,
      books,
      bookCovers,
      bookPrograms,
      bookCopies,
      lendings,
      bookRequests,
      examPapers,
      notifications,
      auditLogs,
    };

    const dataJson = JSON.stringify(dataPayload);
    const dataChecksum = calculateChecksum(dataJson);

    const metadata: BackupMetadata = {
      format: 'RG_KEDIA_BACKUP_V1',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      sourceHost: safeHost,
      tables: TABLE_NAMES,
      recordCounts,
      checksum: dataChecksum,
    };

    const archive: CompleteBackupArchive = {
      metadata,
      data: dataPayload,
    };

    const plaintextArchiveJson = JSON.stringify(archive, null, 2);

    // 2. Encryption (optional)
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = options.filenamePrefix ? `${options.filenamePrefix}-` : '';
    let finalContent: string;
    let filename: string;
    let isEncrypted = false;

    if (options.encryptionKey) {
      const envelope = encryptPayload(plaintextArchiveJson, options.encryptionKey, safeHost);
      finalContent = JSON.stringify(envelope, null, 2);
      filename = `${prefix}backup-${timestampStr}.enc.json`;
      isEncrypted = true;
    } else {
      finalContent = plaintextArchiveJson;
      filename = `${prefix}backup-${timestampStr}.json`;
    }

    const filePath = path.join(outDir, filename);
    const checksumPath = `${filePath}.sha256`;
    const tempSuffix = `.${process.pid}.${Date.now()}.tmp`;
    const tempFilePath = `${filePath}${tempSuffix}`;
    const tempChecksumPath = `${checksumPath}${tempSuffix}`;

    const fileChecksum = calculateChecksum(finalContent);
    const checksumContent = `${fileChecksum}  ${filename}\n`;

    // 3. Write backup artifact and checksum atomically via temp files
    try {
      fs.writeFileSync(tempFilePath, finalContent, 'utf8');
      fs.writeFileSync(tempChecksumPath, checksumContent, 'utf8');

      // Atomic rename into final destination
      fs.renameSync(tempFilePath, filePath);
      fs.renameSync(tempChecksumPath, checksumPath);
    } catch (writeErr: any) {
      // Safe cleanup of temporary files if write or rename fails
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup error
      }
      try {
        if (fs.existsSync(tempChecksumPath)) fs.unlinkSync(tempChecksumPath);
      } catch {
        // ignore cleanup error
      }
      throw writeErr;
    }

    const sizeBytes = Buffer.byteLength(finalContent, 'utf8');
    const durationMs = Date.now() - startTime;

    return {
      filePath,
      checksumPath,
      filename,
      isEncrypted,
      sizeBytes,
      checksum: fileChecksum,
      metadata,
      durationMs,
    };
  } catch (err: any) {
    const safeMessage = redactSecrets(err.message || String(err));
    throw new Error(`BACKUP_FAILED: ${safeMessage}`);
  } finally {
    if (releaseLock) {
      releaseLock();
    }
  }
}
