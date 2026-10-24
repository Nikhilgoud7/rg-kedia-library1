// server/lib/backup/types.ts — Backup & Recovery Type Definitions

export interface BackupRecordCounts {
  User: number;
  Book: number;
  BookCover: number;
  BookProgram: number;
  BookCopy: number;
  Lending: number;
  BookRequest: number;
  ExamPaper: number;
  Notification: number;
  AuditLog: number;
  [key: string]: number;
}

export interface BackupDataPayload {
  users: any[];
  books: any[];
  bookCovers: any[];
  bookPrograms: any[];
  bookCopies: any[];
  lendings: any[];
  bookRequests: any[];
  examPapers: any[];
  notifications: any[];
  auditLogs: any[];
  [key: string]: any[];
}

export interface BackupMetadata {
  format: 'RG_KEDIA_BACKUP_V1';
  version: '1.0.0';
  createdAt: string;
  sourceHost: string;
  tables: string[];
  recordCounts: BackupRecordCounts;
  checksum: string; // SHA-256 of serialized data
}

export interface CompleteBackupArchive {
  metadata: BackupMetadata;
  data: BackupDataPayload;
}

export interface EncryptedBackupEnvelope {
  format: 'RG_KEDIA_ENCRYPTED_BACKUP_V1';
  version: '1.0.0';
  algorithm: 'aes-256-gcm';
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // base64
  checksum: string; // SHA-256 of original plaintext
  createdAt: string;
  sourceHost: string;
}

export interface CreateBackupOptions {
  outDir?: string;
  encryptionKey?: string;
  filenamePrefix?: string;
  skipLock?: boolean;
}

export interface CreateBackupResult {
  filePath: string;
  checksumPath: string;
  filename: string;
  isEncrypted: boolean;
  sizeBytes: number;
  checksum: string;
  metadata: BackupMetadata;
  durationMs: number;
}

export interface VerifyBackupOptions {
  encryptionKey?: string;
}

export interface VerifyBackupResult {
  valid: boolean;
  isEncrypted: boolean;
  metadata: BackupMetadata;
  recordCounts: BackupRecordCounts;
  checksum: string;
}

export interface RestoreOptions {
  encryptionKey?: string;
  dryRun?: boolean;
  skipSafetyCheck?: boolean;
}

export interface RestoreResult {
  success: boolean;
  dryRun?: boolean;
  restoredCounts: BackupRecordCounts;
  durationMs: number;
}
