// server/lib/storage/examMigrationEngine.ts — Exam Paper Cloud Storage Migration & Verification Engine
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../../middleware/auth.js';
import { getDocumentStorageAdapter, StorageAdapter } from './index.js';

export interface MigrationScanItem {
  id: string;
  title: string;
  fileUrl: string;
  localPath: string | null;
  physicalFileExists: boolean;
  fileSizeBytes: number | null;
  checksum: string | null;
  storageProvider: string;
  storageKey: string | null;
  status: 'READY' | 'MISSING_PHYSICAL_FILE' | 'ALREADY_MIGRATED' | 'CORRUPTED';
  error?: string;
}

export interface MigrationScanReport {
  timestamp: string;
  totalDbRecords: number;
  physicalFilesOnDisk: number;
  readyForMigration: number;
  missingPhysicalFiles: number;
  alreadyMigrated: number;
  unindexedFilesOnDisk: string[];
  items: MigrationScanItem[];
}

export interface MigrationExecutionResult {
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  totalCandidates: number;
  migratedSuccessfully: number;
  simulatedCandidates?: number;
  skipped: number;
  failed: number;
  targetProvider: string;
  details: Array<{
    paperId: string;
    title: string;
    storageKey: string;
    checksum: string;
    status: 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'SIMULATED';
    error?: string;
  }>;
}

/**
 * Scans database and local filesystem to inventory exam papers and detect discrepancies.
 */
export async function scanExamStorageInventory(
  customUploadDir?: string
): Promise<MigrationScanReport> {
  const uploadDir =
    customUploadDir || path.resolve(process.cwd(), 'uploads', 'exam-papers');

  const diskFiles: string[] = [];
  if (fs.existsSync(uploadDir)) {
    const entries = fs.readdirSync(uploadDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        diskFiles.push(entry.name);
      }
    }
  }

  const dbPapers = await prisma.examPaper.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const matchedDiskFiles = new Set<string>();
  const items: MigrationScanItem[] = [];

  let readyCount = 0;
  let missingCount = 0;
  let alreadyMigratedCount = 0;

  for (const paper of dbPapers) {
    const filename = path.basename(paper.fileUrl || '');
    const localPath = path.join(uploadDir, filename);
    const fileExists = fs.existsSync(localPath);

    let status: MigrationScanItem['status'] = 'READY';
    let fileSizeBytes: number | null = paper.fileSizeBytes || null;
    let checksum: string | null = paper.checksum || null;

    if (paper.storageProvider === 'r2' || paper.storageProvider === 's3') {
      status = 'ALREADY_MIGRATED';
      alreadyMigratedCount++;
    } else if (!fileExists) {
      status = 'MISSING_PHYSICAL_FILE';
      missingCount++;
    } else {
      matchedDiskFiles.add(filename);
      try {
        const data = fs.readFileSync(localPath);
        fileSizeBytes = data.length;
        checksum = crypto.createHash('sha256').update(data).digest('hex');
        status = 'READY';
        readyCount++;
      } catch (err: any) {
        status = 'CORRUPTED';
        missingCount++;
      }
    }

    items.push({
      id: paper.id,
      title: paper.title,
      fileUrl: paper.fileUrl,
      localPath: fileExists ? localPath : null,
      physicalFileExists: fileExists,
      fileSizeBytes,
      checksum,
      storageProvider: paper.storageProvider,
      storageKey: paper.storageKey,
      status,
    });
  }

  const unindexedFilesOnDisk = diskFiles.filter((f) => !matchedDiskFiles.has(f));

  return {
    timestamp: new Date().toISOString(),
    totalDbRecords: dbPapers.length,
    physicalFilesOnDisk: diskFiles.length,
    readyForMigration: readyCount,
    missingPhysicalFiles: missingCount,
    alreadyMigrated: alreadyMigratedCount,
    unindexedFilesOnDisk,
    items,
  };
}

/**
 * Executes migration from local filesystem to Cloudflare R2 / S3 object storage.
 * Enforces dry-run safety by default.
 */
export async function executeExamStorageMigration(options: {
  dryRun?: boolean;
  targetProvider?: string;
  storageAdapter?: StorageAdapter;
  customUploadDir?: string;
}): Promise<MigrationExecutionResult> {
  const dryRun = options.dryRun ?? true;
  const targetProvider = options.targetProvider || 'r2';
  const startedAt = new Date().toISOString();

  const scanReport = await scanExamStorageInventory(options.customUploadDir);
  const candidates = scanReport.items.filter((item) => item.status === 'READY');

  let adapter: StorageAdapter | null = null;
  if (options.storageAdapter) {
    adapter = options.storageAdapter;
  } else {
    try {
      adapter = getDocumentStorageAdapter(targetProvider);
    } catch (adapterErr) {
      if (dryRun) {
        // In dry-run mode, allow simulation without throwing if remote credentials are not yet in local env
        adapter = null;
      } else {
        throw adapterErr;
      }
    }
  }
  const details: MigrationExecutionResult['details'] = [];

  let migratedCount = 0;
  let simulatedCount = 0;
  let skippedCount = scanReport.alreadyMigrated + scanReport.missingPhysicalFiles;
  let failedCount = 0;

  for (const candidate of candidates) {
    if (!candidate.localPath || !candidate.checksum) {
      skippedCount++;
      continue;
    }

    const sanitizedBase = path.basename(candidate.localPath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `exam-papers/${candidate.id}/${sanitizedBase}`;

    if (dryRun) {
      details.push({
        paperId: candidate.id,
        title: candidate.title,
        storageKey,
        checksum: candidate.checksum,
        status: 'SIMULATED',
      });
      simulatedCount++;
      continue;
    }

    try {
      if (!adapter) {
        throw new Error('STORAGE_ADAPTER_REQUIRED: Cloud storage adapter is required to execute migration.');
      }
      const buffer = fs.readFileSync(candidate.localPath);
      const computedChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

      // 1. Upload to cloud object storage
      const uploadResult = await adapter.put(storageKey, buffer, {
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        originalName: path.basename(candidate.localPath),
        checksum: computedChecksum,
      });

      // 2. Verify existence and remote integrity against source
      const exists = await adapter.exists(storageKey);
      if (!exists) {
        throw new Error(`INTEGRITY_CHECK_FAILED: Cloud object '${storageKey}' does not exist after upload.`);
      }

      if (adapter.getMetadata) {
        const remoteMeta = await adapter.getMetadata(storageKey);
        if (!remoteMeta) {
          throw new Error(`INTEGRITY_CHECK_FAILED: Could not retrieve metadata for cloud object '${storageKey}'.`);
        }
        if (remoteMeta.sizeBytes !== buffer.length) {
          throw new Error(
            `INTEGRITY_CHECK_FAILED: Size mismatch for '${storageKey}'. Local: ${buffer.length} bytes, Remote: ${remoteMeta.sizeBytes} bytes.`
          );
        }
        if (remoteMeta.checksum && remoteMeta.checksum.toLowerCase() !== computedChecksum.toLowerCase()) {
          throw new Error(
            `INTEGRITY_CHECK_FAILED: Checksum mismatch for '${storageKey}'. Local: ${computedChecksum}, Remote: ${remoteMeta.checksum}.`
          );
        }
      }

      // 3. Atomically update database metadata
      await prisma.examPaper.update({
        where: { id: candidate.id },
        data: {
          storageProvider: targetProvider,
          storageKey,
          checksum: computedChecksum,
          fileSizeBytes: buffer.length,
        },
      });

      details.push({
        paperId: candidate.id,
        title: candidate.title,
        storageKey,
        checksum: computedChecksum,
        status: 'SUCCESS',
      });
      migratedCount++;
    } catch (err: any) {
      failedCount++;
      details.push({
        paperId: candidate.id,
        title: candidate.title,
        storageKey,
        checksum: candidate.checksum || '',
        status: 'FAILED',
        error: err.message || 'Unknown migration error',
      });
    }
  }

  return {
    dryRun,
    startedAt,
    completedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    migratedSuccessfully: migratedCount,
    simulatedCandidates: dryRun ? simulatedCount : 0,
    skipped: skippedCount,
    failed: failedCount,
    targetProvider,
    details,
  };
}

/**
 * Rolls back migrated database records back to local storage provider safely.
 */
export async function rollbackExamStorageMigration(options: {
  dryRun?: boolean;
}): Promise<{ rolledBackCount: number; dryRun: boolean }> {
  const dryRun = options.dryRun ?? true;

  const migratedPapers = await prisma.examPaper.findMany({
    where: { storageProvider: { in: ['r2', 's3'] } },
  });

  if (!dryRun && migratedPapers.length > 0) {
    await prisma.examPaper.updateMany({
      where: { storageProvider: { in: ['r2', 's3'] } },
      data: {
        storageProvider: 'local',
      },
    });
  }

  return {
    rolledBackCount: migratedPapers.length,
    dryRun,
  };
}
