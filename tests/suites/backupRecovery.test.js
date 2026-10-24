// tests/suites/backupRecovery.test.js — Automated Backup & Disaster Recovery Test Suite
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  deriveKeyBuffer,
  calculateChecksum,
  encryptPayload,
  decryptPayload,
  redactSecrets,
  getSafeHostString,
} from '../../dist/server/lib/backup/cryptoUtils.js';
import {
  createDatabaseBackup,
  BackupLockError,
} from '../../dist/server/lib/backup/backupEngine.js';
import { verifyBackupFile } from '../../dist/server/lib/backup/verifyEngine.js';
import {
  restoreDatabaseBackup,
  validateRestoreDatabaseTarget,
} from '../../dist/server/lib/backup/restoreEngine.js';

export async function runBackupRecoveryTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const testDir = path.resolve(process.cwd(), 'tests', 'fixtures', 'backup_temp');
  fs.mkdirSync(testDir, { recursive: true });

  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const wrongKeyHex = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const testPassphrase = 'SampleSecurePassphrase!2026';

  let createdFiles = [];

  try {
    // =========================================================================
    // 1. Cryptographic Key Derivation & Validation (SEC-9C-01)
    // =========================================================================
    // 1.1 Valid 64-hex character key derivation
    const keyBufHex = deriveKeyBuffer(testKeyHex);
    assert(
      Buffer.isBuffer(keyBufHex) && keyBufHex.length === 32,
      'deriveKeyBuffer parses 64-character hex string into 32-byte Buffer'
    );

    // 1.2 Strict rejection of arbitrary passphrases (SEC-9C-01)
    let passphraseCaught = false;
    try {
      deriveKeyBuffer(testPassphrase);
    } catch (err) {
      if (err.message.includes('INVALID_KEY_LENGTH') && err.message.includes('Passphrases are rejected')) {
        passphraseCaught = true;
      }
    }
    assert(passphraseCaught, 'deriveKeyBuffer strictly rejects arbitrary text passphrases (SEC-9C-01)');

    // 1.3 Strict rejection of short keys
    let shortKeyCaught = false;
    try {
      deriveKeyBuffer('0123456789abcdef');
    } catch (err) {
      if (err.message.includes('INVALID_KEY_LENGTH')) shortKeyCaught = true;
    }
    assert(shortKeyCaught, 'deriveKeyBuffer rejects keys with length < 64');

    // 1.4 Strict rejection of long keys
    let longKeyCaught = false;
    try {
      deriveKeyBuffer(testKeyHex + 'ab');
    } catch (err) {
      if (err.message.includes('INVALID_KEY_LENGTH')) longKeyCaught = true;
    }
    assert(longKeyCaught, 'deriveKeyBuffer rejects keys with length > 64');

    // 1.5 Strict rejection of non-hex characters
    let nonHexCaught = false;
    try {
      deriveKeyBuffer('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg');
    } catch (err) {
      if (err.message.includes('INVALID_KEY_FORMAT')) nonHexCaught = true;
    }
    assert(nonHexCaught, 'deriveKeyBuffer rejects keys containing non-hex characters');

    // 1.6 Strict rejection of empty key
    let emptyKeyCaught = false;
    try {
      deriveKeyBuffer('');
    } catch (err) {
      if (err.message.includes('INVALID_KEY')) emptyKeyCaught = true;
    }
    assert(emptyKeyCaught, 'deriveKeyBuffer rejects empty or whitespace keys');

    // 1.7 Checksum consistency
    const cs1 = calculateChecksum('Hello RG-Kedia Backup System');
    const cs2 = calculateChecksum('Hello RG-Kedia Backup System');
    const cs3 = calculateChecksum('Different String');
    assert(cs1 === cs2 && cs1 !== cs3, 'calculateChecksum computes deterministic SHA-256 digest');

    // 1.8 Secret redaction
    const rawUrl = 'postgresql://admin_user:superSecretPassword123@ep-autumn-sky-b3vpykh4.aws.neon.tech/neondb';
    const redactedUrl = redactSecrets(rawUrl);
    assert(
      !redactedUrl.includes('superSecretPassword123') && redactedUrl.includes('***'),
      'redactSecrets replaces database password with ***'
    );

    const safeHost = getSafeHostString(rawUrl);
    assert(
      safeHost === 'ep-autumn-sky-b3vpykh4.aws.neon.tech' && !safeHost.includes('superSecretPassword123'),
      'getSafeHostString extracts hostname without leaking credentials'
    );

    // 1.9 AES-256-GCM Encryption & Decryption Round-Trip
    const testPlaintext = JSON.stringify({ message: 'Confidential student and library data', timestamp: 123456 });
    const envelope = encryptPayload(testPlaintext, testKeyHex, 'test-host');
    assert(
      envelope.format === 'RG_KEDIA_ENCRYPTED_BACKUP_V1',
      'encryptPayload produces envelope with RG_KEDIA_ENCRYPTED_BACKUP_V1 format'
    );
    assert(
      envelope.algorithm === 'aes-256-gcm' && Boolean(envelope.iv) && Boolean(envelope.authTag) && Boolean(envelope.ciphertext),
      'encryptPayload includes aes-256-gcm algorithm, initialization vector, authentication tag, and ciphertext'
    );

    const decrypted = decryptPayload(envelope, testKeyHex);
    assert(decrypted === testPlaintext, 'decryptPayload successfully restores original plaintext');

    // 1.10 Decryption rejection on wrong key (valid 64-hex key that does not match)
    let wrongKeyFailed = false;
    try {
      decryptPayload(envelope, wrongKeyHex);
    } catch (err) {
      if (err.message.includes('DECRYPTION_FAILED')) {
        wrongKeyFailed = true;
      }
    }
    assert(wrongKeyFailed, 'decryptPayload throws DECRYPTION_FAILED when supplied with wrong 256-bit key');

    // 1.11 Decryption rejection on tampered ciphertext
    let tamperedFailed = false;
    try {
      const tamperedEnvelope = { ...envelope, ciphertext: 'dGFtcGVyZWQ=' };
      decryptPayload(tamperedEnvelope, testKeyHex);
    } catch {
      tamperedFailed = true;
    }
    assert(tamperedFailed, 'decryptPayload rejects tampered ciphertext via authTag mismatch');

    // =========================================================================
    // 2. Concurrency Lock Protection
    // =========================================================================
    const lockPath = path.join(testDir, '.backup.lock');
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), 'utf8');
    let lockBlocked = false;
    try {
      await createDatabaseBackup(prisma, { outDir: testDir });
    } catch (err) {
      if (err instanceof BackupLockError || err.message?.includes('CONCURRENT_BACKUP_BLOCKED')) {
        lockBlocked = true;
      }
    }
    assert(lockBlocked, 'createDatabaseBackup detects active lock and throws CONCURRENT_BACKUP_BLOCKED');
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

    // =========================================================================
    // 3. Backup Generation & Atomic File Writes (DR-9C-03)
    // =========================================================================
    // 3.1 Plaintext backup creation
    const plainBackupResult = await createDatabaseBackup(prisma, {
      outDir: testDir,
      filenamePrefix: 'test-plain',
      skipLock: true,
    });
    createdFiles.push(plainBackupResult.filePath, plainBackupResult.checksumPath);

    assert(fs.existsSync(plainBackupResult.filePath), 'Plaintext backup file is created on disk');
    assert(fs.existsSync(plainBackupResult.checksumPath), 'Companion .sha256 file is created on disk');
    assert(plainBackupResult.isEncrypted === false, 'Plaintext backup reports isEncrypted: false');
    assert(plainBackupResult.sizeBytes > 0, 'Plaintext backup file has non-zero size');
    assert(plainBackupResult.metadata.tables.length === 10, 'Backup metadata includes all 10 core tables');
    assert(typeof plainBackupResult.metadata.recordCounts.User === 'number', 'Metadata includes User record count');
    assert(typeof plainBackupResult.metadata.recordCounts.Book === 'number', 'Metadata includes Book record count');

    // Atomic landing: verify no .tmp files linger in output directory (DR-9C-03)
    const lingeringTmp = fs.readdirSync(testDir).filter((f) => f.endsWith('.tmp'));
    assert(lingeringTmp.length === 0, 'Atomic file landing cleans up all temporary .tmp files (DR-9C-03)');

    // Companion checksum verification
    const shaContent = fs.readFileSync(plainBackupResult.checksumPath, 'utf8').trim();
    assert(
      shaContent.startsWith(plainBackupResult.checksum),
      'Companion .sha256 file contains matching SHA-256 digest'
    );

    // 3.2 Encrypted backup creation
    const encBackupResult = await createDatabaseBackup(prisma, {
      outDir: testDir,
      filenamePrefix: 'test-enc',
      encryptionKey: testKeyHex,
      skipLock: true,
    });
    createdFiles.push(encBackupResult.filePath, encBackupResult.checksumPath);

    assert(fs.existsSync(encBackupResult.filePath), 'Encrypted backup file is created on disk');
    assert(encBackupResult.isEncrypted === true, 'Encrypted backup reports isEncrypted: true');
    assert(encBackupResult.filename.endsWith('.enc.json'), 'Encrypted backup file uses .enc.json suffix');

    const encFileRaw = JSON.parse(fs.readFileSync(encBackupResult.filePath, 'utf8'));
    assert(
      encFileRaw.format === 'RG_KEDIA_ENCRYPTED_BACKUP_V1',
      'Encrypted backup artifact uses RG_KEDIA_ENCRYPTED_BACKUP_V1 format'
    );

    // =========================================================================
    // 4. Integrity Verification Engine
    // =========================================================================
    // 4.1 Plaintext verification
    const verifyPlainResult = await verifyBackupFile(plainBackupResult.filePath);
    assert(verifyPlainResult.valid === true, 'verifyBackupFile validates intact plaintext backup');
    assert(verifyPlainResult.isEncrypted === false, 'verifyBackupFile confirms unencrypted status');
    assert(
      verifyPlainResult.checksum === plainBackupResult.metadata.checksum,
      'verifyBackupFile validates data payload checksum'
    );

    // 4.2 Encrypted verification with key
    const verifyEncResultWithKey = await verifyBackupFile(encBackupResult.filePath, {
      encryptionKey: testKeyHex,
    });
    assert(verifyEncResultWithKey.valid === true, 'verifyBackupFile validates encrypted backup with valid key');
    assert(verifyEncResultWithKey.isEncrypted === true, 'verifyBackupFile confirms encrypted status');

    // 4.3 Encrypted verification without key (envelope check)
    const verifyEncNoKey = await verifyBackupFile(encBackupResult.filePath);
    assert(
      verifyEncNoKey.valid === true && verifyEncNoKey.isEncrypted === true,
      'verifyBackupFile validates encrypted envelope without key'
    );

    // 4.4 Missing file detection
    let missingFileCaught = false;
    try {
      await verifyBackupFile(path.join(testDir, 'non_existent_file.json'));
    } catch (err) {
      if (err.message.includes('VERIFICATION_FAILED: Backup file does not exist')) {
        missingFileCaught = true;
      }
    }
    assert(missingFileCaught, 'verifyBackupFile detects and rejects non-existent file path');

    // 4.5 Empty file detection
    const emptyFile = path.join(testDir, 'empty.json');
    fs.writeFileSync(emptyFile, '', 'utf8');
    createdFiles.push(emptyFile);
    let emptyCaught = false;
    try {
      await verifyBackupFile(emptyFile);
    } catch (err) {
      if (err.message.includes('is empty (0 bytes)')) {
        emptyCaught = true;
      }
    }
    assert(emptyCaught, 'verifyBackupFile detects and rejects 0-byte file');

    // 4.6 Corrupted JSON detection
    const corruptFile = path.join(testDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ "invalid json payload ...', 'utf8');
    createdFiles.push(corruptFile);
    let corruptCaught = false;
    try {
      await verifyBackupFile(corruptFile);
    } catch (err) {
      if (err.message.includes('contains invalid JSON or is corrupted')) {
        corruptCaught = true;
      }
    }
    assert(corruptCaught, 'verifyBackupFile detects and rejects corrupted JSON');

    // 4.7 Tampered checksum detection
    const tamperedFile = path.join(testDir, 'tampered_checksum.json');
    const validArchive = JSON.parse(fs.readFileSync(plainBackupResult.filePath, 'utf8'));
    validArchive.metadata.checksum = '0000000000000000000000000000000000000000000000000000000000000000';
    fs.writeFileSync(tamperedFile, JSON.stringify(validArchive), 'utf8');
    createdFiles.push(tamperedFile);
    let tamperedCsCaught = false;
    try {
      await verifyBackupFile(tamperedFile);
    } catch (err) {
      if (err.message.includes('DATA_CHECKSUM_MISMATCH')) {
        tamperedCsCaught = true;
      }
    }
    assert(tamperedCsCaught, 'verifyBackupFile detects tampered checksum against computed payload');

    // 4.8 Record count mismatch detection
    const countMismatchFile = path.join(testDir, 'count_mismatch.json');
    const mismatchArchive = JSON.parse(fs.readFileSync(plainBackupResult.filePath, 'utf8'));
    mismatchArchive.metadata.recordCounts.User += 999;
    mismatchArchive.metadata.checksum = calculateChecksum(JSON.stringify(mismatchArchive.data));
    fs.writeFileSync(countMismatchFile, JSON.stringify(mismatchArchive), 'utf8');
    createdFiles.push(countMismatchFile);
    let countMismatchCaught = false;
    try {
      await verifyBackupFile(countMismatchFile);
    } catch (err) {
      if (err.message.includes('COUNT_MISMATCH')) {
        countMismatchCaught = true;
      }
    }
    assert(countMismatchCaught, 'verifyBackupFile detects record count mismatch against metadata');

    // =========================================================================
    // 5. Target Database Safety Guard & Isolation
    // =========================================================================
    // 5.1 Rejects empty or missing target URL
    let emptyTargetCaught = false;
    try {
      validateRestoreDatabaseTarget('');
    } catch (err) {
      if (err.message.includes('NO_DATABASE_CONFIGURED')) emptyTargetCaught = true;
    }
    assert(emptyTargetCaught, 'validateRestoreDatabaseTarget rejects empty database URL');

    // 5.2 Rejects unapproved production host
    let prodTargetCaught = false;
    try {
      validateRestoreDatabaseTarget('postgresql://user:pass@ep-production-main-12345.aws.neon.tech/neondb');
    } catch (err) {
      if (err.message.includes('RESTORE_TARGET_BLOCKED')) prodTargetCaught = true;
    }
    assert(prodTargetCaught, 'validateRestoreDatabaseTarget strictly blocks unapproved production database host');

    // 5.3 Permits approved test database host
    const testHostCheck = validateRestoreDatabaseTarget('postgresql://user:pass@ep-autumn-sky-b3vpykh4.aws.neon.tech/neondb');
    assert(
      testHostCheck.host.includes('ep-autumn-sky-b3vpykh4'),
      'validateRestoreDatabaseTarget permits approved test database endpoint (ep-autumn-sky-b3vpykh4)'
    );

    // =========================================================================
    // 6. Synthetic Restore Drill & Atomic Rollback Verification (DR-9C-02)
    // =========================================================================
    // 6.1 Create synthetic test user fixture
    const testTag = `drill_${Date.now()}`;
    const syntheticUser = await prisma.user.create({
      data: {
        name: `Drill Test User ${testTag}`,
        email: `drill_user_${testTag}@example.com`,
        password: 'hashedPassword123!',
        role: 'STUDENT',
      },
    });

    const syntheticBook = await prisma.book.create({
      data: {
        title: `Drill Book ${testTag}`,
        author: 'Drill Author',
        segment: 'Accounting',
        category: 'TEXTBOOK',
      },
    });

    // 6.2 Generate backup containing the synthetic fixture
    const drillBackup = await createDatabaseBackup(prisma, {
      outDir: testDir,
      filenamePrefix: `drill-${testTag}`,
      skipLock: true,
    });
    createdFiles.push(drillBackup.filePath, drillBackup.checksumPath);

    assert(drillBackup.metadata.recordCounts.User >= 1, 'Drill backup includes synthetic user');
    assert(drillBackup.metadata.recordCounts.Book >= 1, 'Drill backup includes synthetic book');

    // 6.3 Test Restore Dry Run
    const dryRunResult = await restoreDatabaseBackup(prisma, drillBackup.filePath, {
      dryRun: true,
      skipSafetyCheck: true,
    });
    assert(dryRunResult.success === true && dryRunResult.dryRun === true, 'restoreDatabaseBackup executes dry run without mutation');

    // 6.4 Mutate synthetic book in database
    await prisma.book.update({
      where: { id: syntheticBook.id },
      data: { title: `MUTATED_TITLE_${testTag}` },
    });
    const mutatedCheck = await prisma.book.findUnique({ where: { id: syntheticBook.id } });
    assert(mutatedCheck.title === `MUTATED_TITLE_${testTag}`, 'Database record was mutated prior to restore drill');

    // 6.5 Execute Active Restore of the drill backup
    const activeRestoreResult = await restoreDatabaseBackup(prisma, drillBackup.filePath, {
      dryRun: false,
      skipSafetyCheck: true,
    });
    assert(activeRestoreResult.success === true, 'restoreDatabaseBackup completes active restoration successfully');

    // 6.6 Verify that mutated record was restored to original backup state
    const restoredBook = await prisma.book.findUnique({ where: { id: syntheticBook.id } });
    assert(
      restoredBook && restoredBook.title === `Drill Book ${testTag}`,
      'Active restore accurately reverted mutated record to backed-up state'
    );

    // 6.7 Verify synthetic user exists and has accurate properties
    const restoredUser = await prisma.user.findUnique({ where: { id: syntheticUser.id } });
    assert(
      restoredUser && restoredUser.email === `drill_user_${testTag}@example.com`,
      'Active restore accurately preserved synthetic user fixture'
    );

    // 6.8 ATOMIC TRANSACTION ROLLBACK TEST (DR-9C-02):
    // Create a pre-existing canary record in the database.
    const canaryUser = await prisma.user.create({
      data: {
        name: `Canary Record ${testTag}`,
        email: `canary_${testTag}@example.com`,
        password: 'canaryPassword123!',
        role: 'STUDENT',
      },
    });

    // Construct a failing backup payload where insertion fails inside the transaction (DR-9C-02)
    const failingBackupFile = path.join(testDir, `failing_tx_${testTag}.json`);
    const failingArchive = JSON.parse(fs.readFileSync(drillBackup.filePath, 'utf8'));
    // Induce a primary key/unique constraint violation during tx.user.createMany
    const duplicateUser = { ...failingArchive.data.users[0] };
    failingArchive.data.users.push(duplicateUser);
    failingArchive.metadata.recordCounts.User = failingArchive.data.users.length;
    failingArchive.metadata.checksum = calculateChecksum(JSON.stringify(failingArchive.data));
    fs.writeFileSync(failingBackupFile, JSON.stringify(failingArchive), 'utf8');
    createdFiles.push(failingBackupFile);

    let rollbackCaught = false;
    try {
      await restoreDatabaseBackup(prisma, failingBackupFile, {
        dryRun: false,
        skipSafetyCheck: true,
      });
    } catch (err) {
      if (err.message.includes('RESTORE_EXECUTION_FAILED')) {
        rollbackCaught = true;
      }
    }
    assert(rollbackCaught, 'restoreDatabaseBackup throws when transaction sanity check fails (DR-9C-02)');

    // Verify that the canary user STILL exists in the database!
    // If the restore was non-transactional, deleteMany would have wiped canaryUser.
    const canaryAfterRollback = await prisma.user.findUnique({ where: { id: canaryUser.id } });
    assert(
      canaryAfterRollback !== null && canaryAfterRollback.email === `canary_${testTag}@example.com`,
      'Transaction rollback successfully preserved pre-existing database records on failure (DR-9C-02)'
    );

    // 6.9 Clean up synthetic records created during drill
    await prisma.user.delete({ where: { id: canaryUser.id } });
    await prisma.book.delete({ where: { id: syntheticBook.id } });
    await prisma.user.delete({ where: { id: syntheticUser.id } });

    const postCleanupUser = await prisma.user.findUnique({ where: { id: syntheticUser.id } });
    assert(postCleanupUser === null, 'Synthetic drill fixtures cleanly removed post-test');
  } finally {
    // Clean up temporary test files
    for (const f of createdFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // Ignore file cleanup error
      }
    }
    try {
      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore dir cleanup error
    }
    await prisma.$disconnect();
  }
}
