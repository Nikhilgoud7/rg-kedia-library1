// server/lib/backup/verifyEngine.ts — Backup Integrity Verification Engine
import fs from 'fs';
import {
  CompleteBackupArchive,
  EncryptedBackupEnvelope,
  VerifyBackupOptions,
  VerifyBackupResult,
} from './types.js';
import {
  calculateChecksum,
  decryptPayload,
  redactSecrets,
} from './cryptoUtils.js';

const REQUIRED_TABLES = [
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

/**
 * Validates the physical and structural integrity of a backup file.
 */
export async function verifyBackupFile(
  filePath: string,
  options: VerifyBackupOptions = {}
): Promise<VerifyBackupResult> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('VERIFICATION_FAILED: Missing backup file path.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`VERIFICATION_FAILED: Backup file does not exist at "${filePath}".`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error('VERIFICATION_FAILED: Backup file is empty (0 bytes).');
  }

  // 1. Verify companion .sha256 file if present
  const checksumFilePath = `${filePath}.sha256`;
  if (fs.existsSync(checksumFilePath)) {
    try {
      const checksumContent = fs.readFileSync(checksumFilePath, 'utf8').trim();
      const expectedChecksum = checksumContent.split(/\s+/)[0];
      const actualFileChecksum = calculateChecksum(fs.readFileSync(filePath));
      if (expectedChecksum && actualFileChecksum !== expectedChecksum) {
        throw new Error(
          `FILE_CHECKSUM_MISMATCH: File checksum (${actualFileChecksum}) does not match companion .sha256 file (${expectedChecksum}).`
        );
      }
    } catch (err: any) {
      if (err.message?.startsWith('FILE_CHECKSUM_MISMATCH')) {
        throw err;
      }
    }
  }

  // 2. Read raw content
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (err: any) {
    throw new Error(`VERIFICATION_FAILED: Could not read backup file: ${redactSecrets(err.message)}`);
  }

  // 3. Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err: any) {
    throw new Error('VERIFICATION_FAILED: Backup file contains invalid JSON or is corrupted.');
  }

  let isEncrypted = false;
  let archive: CompleteBackupArchive;

  // 4. Handle encrypted envelope
  if (parsed?.format === 'RG_KEDIA_ENCRYPTED_BACKUP_V1') {
    isEncrypted = true;
    const envelope = parsed as EncryptedBackupEnvelope;

    if (!envelope.iv || !envelope.authTag || !envelope.ciphertext || !envelope.checksum) {
      throw new Error('VERIFICATION_FAILED: Corrupted encrypted envelope — missing IV, auth tag, or ciphertext.');
    }

    if (!options.encryptionKey) {
      // Valid envelope, but cannot decrypt data payload without key
      return {
        valid: true,
        isEncrypted: true,
        metadata: {
          format: 'RG_KEDIA_BACKUP_V1',
          version: '1.0.0',
          createdAt: envelope.createdAt,
          sourceHost: envelope.sourceHost,
          tables: REQUIRED_TABLES,
          recordCounts: {} as any,
          checksum: envelope.checksum,
        },
        recordCounts: {} as any,
        checksum: envelope.checksum,
      };
    }

    // Decrypt and verify
    const decryptedJson = decryptPayload(envelope, options.encryptionKey);
    try {
      archive = JSON.parse(decryptedJson);
    } catch {
      throw new Error('VERIFICATION_FAILED: Decrypted payload contains invalid JSON.');
    }
  } else if (parsed?.metadata?.format === 'RG_KEDIA_BACKUP_V1') {
    archive = parsed as CompleteBackupArchive;
  } else {
    throw new Error('VERIFICATION_FAILED: Unrecognized backup format header.');
  }

  // 5. Validate archive structure
  const { metadata, data } = archive;
  if (!metadata || !data) {
    throw new Error('VERIFICATION_FAILED: Missing metadata or data section in backup archive.');
  }

  if (metadata.version !== '1.0.0') {
    throw new Error(`VERIFICATION_FAILED: Unsupported backup version "${metadata.version}".`);
  }

  if (!Array.isArray(metadata.tables) || metadata.tables.length === 0) {
    throw new Error('VERIFICATION_FAILED: Missing or invalid tables list in metadata.');
  }

  for (const table of REQUIRED_TABLES) {
    if (!metadata.tables.includes(table)) {
      throw new Error(`VERIFICATION_FAILED: Missing required table "${table}" in metadata tables list.`);
    }
  }

  if (!metadata.recordCounts || typeof metadata.recordCounts !== 'object') {
    throw new Error('VERIFICATION_FAILED: Missing or invalid recordCounts dictionary.');
  }

  // 6. Verify checksum of data payload
  const computedDataChecksum = calculateChecksum(JSON.stringify(data));
  if (computedDataChecksum !== metadata.checksum) {
    throw new Error(
      `DATA_CHECKSUM_MISMATCH: Computed data payload checksum (${computedDataChecksum}) does not match metadata checksum (${metadata.checksum}).`
    );
  }

  // 7. Verify table array lengths match recordCounts
  const keyMap: Record<string, string> = {
    User: 'users',
    Book: 'books',
    BookCover: 'bookCovers',
    BookProgram: 'bookPrograms',
    BookCopy: 'bookCopies',
    Lending: 'lendings',
    BookRequest: 'bookRequests',
    ExamPaper: 'examPapers',
    Notification: 'notifications',
    AuditLog: 'auditLogs',
  };

  for (const table of REQUIRED_TABLES) {
    const dataKey = keyMap[table] || table.toLowerCase();
    const records = data[dataKey];
    if (!Array.isArray(records)) {
      throw new Error(`VERIFICATION_FAILED: Table "${table}" data is missing or not an array.`);
    }

    const expectedCount = metadata.recordCounts[table] ?? 0;
    if (records.length !== expectedCount) {
      throw new Error(
        `COUNT_MISMATCH: Table "${table}" has ${records.length} records, but metadata reports ${expectedCount}.`
      );
    }
  }

  return {
    valid: true,
    isEncrypted,
    metadata,
    recordCounts: metadata.recordCounts,
    checksum: metadata.checksum,
  };
}
