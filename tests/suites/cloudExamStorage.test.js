// tests/suites/cloudExamStorage.test.js — Phase 12C Cloud Exam Storage Driver & Security Suite
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  validateExamPaperFile,
  MAX_EXAM_PAPER_BYTES,
} from '../../dist/server/lib/storage/fileSignatureValidator.js';
import { LocalStorageDriver } from '../../dist/server/lib/storage/LocalStorageDriver.js';
import { S3StorageDriver } from '../../dist/server/lib/storage/S3StorageDriver.js';
import {
  getDocumentStorageAdapter,
  resetDocumentStorageAdapter,
  normalizeDocumentStorageProvider,
} from '../../dist/server/lib/storage/index.js';
import { validateStorageEnvironment, resolveR2ConfigFromEnv } from '../../dist/server/lib/storage/storageEnvValidator.js';
import {
  scanExamStorageInventory,
  executeExamStorageMigration,
} from '../../dist/server/lib/storage/examMigrationEngine.js';
import { TestDataManager } from '../helpers/testData.js';
import examRouter from '../../dist/server/routes/exam.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempTestDir = path.resolve(__dirname, '..', '..', 'scratch', 'test-storage');

export async function runCloudExamStorageTests(_baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // -------------------------------------------------------------------------
    // 1. File Signature Validation & Magic Byte Defense
    // -------------------------------------------------------------------------

    // A. Valid PDF (%PDF-)
    const validPdfBuffer = Buffer.from('%PDF-1.7\nSynthetic Osmania University Question Paper\n%%EOF');
    const pdfDetection = validateExamPaperFile(validPdfBuffer, 'paper.pdf');
    assert(pdfDetection.valid === true, 'Valid PDF is marked valid by signature validator');
    assert(pdfDetection.detectedMime === 'application/pdf', 'Valid PDF detected with application/pdf mime type');
    assert(pdfDetection.detectedExt === '.pdf', 'Valid PDF detected with .pdf extension');

    // B. Valid PNG
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const validPngBuffer = Buffer.concat([pngHeader, Buffer.alloc(100)]);
    const pngDetection = validateExamPaperFile(validPngBuffer, 'diagram.png');
    assert(pngDetection.valid === true, 'Valid PNG is marked valid');
    assert(pngDetection.detectedMime === 'image/png', 'Valid PNG detected with image/png mime type');

    // C. Valid JPEG
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const validJpegBuffer = Buffer.concat([jpegHeader, Buffer.alloc(100)]);
    const jpegDetection = validateExamPaperFile(validJpegBuffer, 'scan.jpg');
    assert(jpegDetection.valid === true, 'Valid JPEG is marked valid');
    assert(jpegDetection.detectedMime === 'image/jpeg', 'Valid JPEG detected with image/jpeg mime type');

    // D. Valid MS Word DOC (CFBF)
    const docHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const validDocBuffer = Buffer.concat([docHeader, Buffer.alloc(100)]);
    const docDetection = validateExamPaperFile(validDocBuffer, 'syllabus.doc');
    assert(docDetection.valid === true, 'Valid DOC is marked valid');
    assert(docDetection.detectedMime === 'application/msword', 'Valid DOC detected with application/msword mime type');

    // E. Valid MS Word DOCX (PK ZIP)
    const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const validDocxBuffer = Buffer.concat([docxHeader, Buffer.alloc(100)]);
    const docxDetection = validateExamPaperFile(validDocxBuffer, 'notes.docx');
    assert(docxDetection.valid === true, 'Valid DOCX is marked valid');
    assert(docxDetection.detectedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Valid DOCX detected with office docx mime type');

    // F. Disguised Executable (MZ header renamed to .pdf) -> Strictly Rejected
    const mzHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const disguisedExeBuffer = Buffer.concat([mzHeader, Buffer.alloc(200)]);
    const exeDetection = validateExamPaperFile(disguisedExeBuffer, 'exam.pdf');
    assert(exeDetection.valid === false, 'Disguised executable (.pdf with MZ header) is strictly rejected');
    assert(exeDetection.error && exeDetection.error.includes('Executable'), 'Rejection error explicitly mentions executable file');

    // G. Plain Text disguised as PDF -> Strictly Rejected
    const plainTextBuffer = Buffer.from('Hello world, this is a plain text file not a PDF');
    const textDetection = validateExamPaperFile(plainTextBuffer, 'fake.pdf');
    assert(textDetection.valid === false, 'Plain text file disguised as .pdf is strictly rejected by signature check');

    // H. File exceeding 10MB limit -> Rejected
    const oversizedBuffer = Buffer.alloc(MAX_EXAM_PAPER_BYTES + 1024);
    oversizedBuffer.write('%PDF-1.4', 0);
    const sizeDetection = validateExamPaperFile(oversizedBuffer, 'huge.pdf');
    assert(sizeDetection.valid === false, 'Oversized file exceeding 10MB boundary is rejected');
    assert(sizeDetection.error && sizeDetection.error.includes('exceeds'), 'Rejection error explicitly mentions size boundary');

    // -------------------------------------------------------------------------
    // 2. LocalStorageDriver CRUD & Security
    // -------------------------------------------------------------------------
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }

    const localDriver = new LocalStorageDriver(tempTestDir);

    // A. Put object
    const testContent = Buffer.from('%PDF-1.4\nTest storage content\n%%EOF');
    const expectedChecksum = crypto.createHash('sha256').update(testContent).digest('hex');
    const testKey = 'test-papers/unit-test-paper.pdf';

    const putResult = await localDriver.put(testKey, testContent, {
      contentType: 'application/pdf',
      originalFileName: 'unit-test-paper.pdf',
    });

    assert(putResult.key === testKey, 'LocalStorageDriver put returns correct storage key');
    assert(putResult.sizeBytes === testContent.length, 'LocalStorageDriver put reports accurate size in bytes');
    assert(putResult.checksum === expectedChecksum, 'LocalStorageDriver put computes SHA-256 checksum');

    // B. Exists check
    const existsBefore = await localDriver.exists(testKey);
    assert(existsBefore === true, 'LocalStorageDriver exists returns true for stored object');

    // C. Get metadata
    const meta = await localDriver.getMetadata(testKey);
    assert(meta !== null, 'LocalStorageDriver getMetadata returns non-null metadata');
    assert(meta?.sizeBytes === testContent.length, 'LocalStorageDriver getMetadata matches original byte length');
    assert(meta?.checksum === expectedChecksum, 'LocalStorageDriver getMetadata matches SHA-256 checksum');

    // D. Get object
    const retrieved = await localDriver.get(testKey);
    assert(retrieved !== null, 'LocalStorageDriver get returns stored object');
    assert(retrieved?.data.equals(testContent), 'Retrieved binary buffer exactly matches uploaded bytes');
    assert(retrieved?.mimeType === 'application/pdf', 'Retrieved object mimeType matches application/pdf');

    // E. Path traversal prevention
    let traversalPrevented = false;
    try {
      await localDriver.get('../../outside-secret.txt');
    } catch (err) {
      traversalPrevented = err.message.includes('PATH_TRAVERSAL');
    }
    assert(traversalPrevented, 'LocalStorageDriver blocks directory traversal (../..) attacks');

    // F. Delete object
    const deleted = await localDriver.delete(testKey);
    assert(deleted === undefined || deleted === true, 'LocalStorageDriver delete completes successfully without throwing');
    const existsAfter = await localDriver.exists(testKey);
    assert(existsAfter === false, 'LocalStorageDriver exists returns false after deletion');

    // -------------------------------------------------------------------------
    // 3. S3 / Cloudflare R2 Storage Driver Interface & Configuration
    // -------------------------------------------------------------------------

    // A. Construction requires configuration
    let missingConfigThrew = false;
    try {
      new S3StorageDriver({
        bucket: '',
        endpoint: '',
        accessKeyId: '',
        secretAccessKey: '',
      });
    } catch (err) {
      missingConfigThrew = true;
    }
    assert(missingConfigThrew, 'S3StorageDriver validates configuration and throws on missing bucket name');

    // B. Secret safety: driver toString / inspection does NOT leak secret key
    const mockDriver = new S3StorageDriver({
      bucket: 'rg-kedia-test-bucket',
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
      accessKeyId: 'AKIA_MOCK_TEST_KEY_12345',
      secretAccessKey: 'MOCK_SUPER_SECRET_KEY_NEVER_LEAK_67890',
      region: 'auto',
    });

    // S3StorageDriver does not retain secret key on public instance properties
    const driverKeys = Object.keys(mockDriver);
    assert(!driverKeys.includes('secretAccessKey'), 'S3StorageDriver does not expose secretAccessKey on instance keys');
    assert(typeof mockDriver.getSignedDownloadUrl === 'function', 'S3StorageDriver implements getSignedDownloadUrl');

    // -------------------------------------------------------------------------
    // 4. Storage Adapter Factory & Driver Switching
    // -------------------------------------------------------------------------
    resetDocumentStorageAdapter();

    // Default or 'local' returns LocalStorageDriver
    const defaultAdapter = getDocumentStorageAdapter('local');
    assert(defaultAdapter instanceof LocalStorageDriver, 'getDocumentStorageAdapter(local) returns LocalStorageDriver instance');

    // Reset adapter cache
    resetDocumentStorageAdapter();

    // -------------------------------------------------------------------------
    // 5. Exam Storage Inventory Scanner (Migration Engine)
    // -------------------------------------------------------------------------
    const scanResult = await scanExamStorageInventory();
    assert(typeof scanResult.totalDbRecords === 'number', 'scanExamStorageInventory reports total database records');
    assert(typeof scanResult.alreadyMigrated === 'number', 'scanExamStorageInventory reports alreadyMigrated count');
    assert(typeof scanResult.readyForMigration === 'number', 'scanExamStorageInventory reports readyForMigration count');
    assert(Array.isArray(scanResult.items), 'scanExamStorageInventory returns scan items array');

    // -------------------------------------------------------------------------
    // 6. Production Storage Fail-Fast Guard & Canonical R2 Configuration
    // -------------------------------------------------------------------------

    // A. Production with missing STORAGE_DRIVER -> Fails fast
    const prodMissingDriver = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: '',
    });
    assert(prodMissingDriver.valid === false, 'Production requires an explicitly configured STORAGE_DRIVER');
    assert(
      prodMissingDriver.error && prodMissingDriver.error.includes('STORAGE_DRIVER environment variable is required in production'),
      'Error message clarifies STORAGE_DRIVER requirement in production'
    );

    // B. Production with STORAGE_DRIVER=local -> Strictly forbidden
    const prodLocalDriver = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'local',
    });
    assert(prodLocalDriver.valid === false, 'Production strictly forbids local filesystem storage');
    assert(
      prodLocalDriver.error && prodLocalDriver.error.includes('forbidden in production'),
      'Error clarifies that local disk is forbidden in production container environments'
    );

    // C. Production with STORAGE_DRIVER=disk -> Strictly forbidden
    const prodDiskDriver = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'disk',
    });
    assert(prodDiskDriver.valid === false, 'Production strictly forbids disk storage alias');

    // D. Production with STORAGE_DRIVER=r2 and missing credentials -> Identifies missing variables
    const prodMissingR2 = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'r2',
    });
    assert(prodMissingR2.valid === false, 'Production with STORAGE_DRIVER=r2 fails if credentials are missing');
    assert(
      prodMissingR2.error &&
      prodMissingR2.error.includes('R2_BUCKET_NAME') &&
      prodMissingR2.error.includes('R2_ACCESS_KEY_ID') &&
      prodMissingR2.error.includes('R2_SECRET_ACCESS_KEY') &&
      prodMissingR2.error.includes('R2_ACCOUNT_ID or R2_ENDPOINT'),
      'Error identifies all missing R2 variables'
    );

    // E. Production with valid R2 configuration -> Passes cleanly
    const prodValidR2 = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'r2',
      R2_BUCKET_NAME: 'rg-kedia-prod-bucket',
      R2_ACCOUNT_ID: 'cf1234567890abcdef1234567890abcd',
      R2_ACCESS_KEY_ID: 'R2_ACCESS_KEY_SAMPLE_123',
      R2_SECRET_ACCESS_KEY: 'R2_SECRET_KEY_SAMPLE_456',
    });
    assert(prodValidR2.valid === true, 'Production with complete R2 configuration is valid');
    assert(prodValidR2.driver === 'r2', 'Driver is correctly identified as r2');
    assert(prodValidR2.config?.bucket === 'rg-kedia-prod-bucket', 'Resolved config contains correct bucket');
    assert(
      prodValidR2.config?.endpoint === 'https://cf1234567890abcdef1234567890abcd.r2.cloudflarestorage.com',
      'R2 endpoint is accurately derived from R2_ACCOUNT_ID'
    );

    // F. Development using local storage -> Allowed by default
    const devDefaultStorage = validateStorageEnvironment({
      NODE_ENV: 'development',
    });
    assert(devDefaultStorage.valid === true, 'Development environment allows unset STORAGE_DRIVER');
    assert(devDefaultStorage.driver === 'local', 'Development defaults to local storage');

    const devExplicitLocal = validateStorageEnvironment({
      NODE_ENV: 'development',
      STORAGE_DRIVER: 'local',
    });
    assert(devExplicitLocal.valid === true, 'Development environment allows explicit STORAGE_DRIVER=local');

    const testLocal = validateStorageEnvironment({
      NODE_ENV: 'test',
      STORAGE_DRIVER: 'local',
    });
    assert(testLocal.valid === true, 'Test environment allows local storage');

    // G. Zero secret leakage from configuration errors
    const secretLeakedEnv = validateStorageEnvironment({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'r2',
      R2_SECRET_ACCESS_KEY: 'SuperSecretLeakedPasswordNeverExpose',
    });
    assert(secretLeakedEnv.valid === false, 'Incomplete R2 configuration is rejected');
    assert(
      !secretLeakedEnv.error?.includes('SuperSecretLeakedPasswordNeverExpose'),
      'Zero secret credentials or passwords are leaked in error messages'
    );

    // H. Document storage adapter factory enforces production fail-fast rules
    const originalNodeEnv = process.env.NODE_ENV;
    const originalStorageDriver = process.env.STORAGE_DRIVER;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.STORAGE_DRIVER;
      resetDocumentStorageAdapter();

      let factoryMissingThrew = false;
      try {
        getDocumentStorageAdapter();
      } catch (err) {
        factoryMissingThrew = err.message.includes('STORAGE_DRIVER environment variable is required in production');
      }
      assert(factoryMissingThrew, 'getDocumentStorageAdapter() throws fail-fast in production when STORAGE_DRIVER is unset');

      process.env.STORAGE_DRIVER = 'local';
      resetDocumentStorageAdapter();

      let factoryLocalThrew = false;
      try {
        getDocumentStorageAdapter();
      } catch (err) {
        factoryLocalThrew = err.message.includes('forbidden in production');
      }
      assert(factoryLocalThrew, 'getDocumentStorageAdapter() throws fail-fast in production when STORAGE_DRIVER=local');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalStorageDriver !== undefined) {
        process.env.STORAGE_DRIVER = originalStorageDriver;
      } else {
        delete process.env.STORAGE_DRIVER;
      }
      resetDocumentStorageAdapter();
    }

    // -------------------------------------------------------------------------
    // 7. Phase 13 Storage Audit Corrections: Safety, Normalization & Integrity
    // -------------------------------------------------------------------------

    // A. Document Storage Safety: Reject 'database' in both dev and production
    let devDbThrew = false;
    try {
      getDocumentStorageAdapter('database');
    } catch (err) {
      devDbThrew = err.message.includes("Document storage does not support 'database'");
    }
    assert(devDbThrew, "getDocumentStorageAdapter('database') throws explicit rejection");

    // Production prohibition on local document storage cannot be bypassed
    const prevEnv = process.env.NODE_ENV;
    const prevDriver = process.env.STORAGE_DRIVER;
    try {
      process.env.NODE_ENV = 'production';
      process.env.STORAGE_DRIVER = 'r2';
      resetDocumentStorageAdapter();

      // Attempting to pass explicit driver='local' in production must throw
      let explicitLocalThrew = false;
      try {
        getDocumentStorageAdapter('local');
      } catch (err) {
        explicitLocalThrew = err.message.includes('strictly forbidden in production');
      }
      assert(explicitLocalThrew, "Explicit argument 'local' cannot bypass production document storage prohibition");

      // Attempting to pass explicit driver='disk' in production must throw
      let explicitDiskThrew = false;
      try {
        getDocumentStorageAdapter('disk');
      } catch (err) {
        explicitDiskThrew = err.message.includes('strictly forbidden in production');
      }
      assert(explicitDiskThrew, "Explicit argument 'disk' cannot bypass production document storage prohibition");

      // Attempting to pass explicit driver='database' in production must throw
      let explicitDbThrew = false;
      try {
        getDocumentStorageAdapter('database');
      } catch (err) {
        explicitDbThrew = err.message.includes('strictly forbidden in production');
      }
      assert(explicitDbThrew, "Explicit argument 'database' cannot bypass production document storage prohibition");
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevDriver !== undefined) {
        process.env.STORAGE_DRIVER = prevDriver;
      } else {
        delete process.env.STORAGE_DRIVER;
      }
      resetDocumentStorageAdapter();
    }

    // B. Storage Provider Normalization
    assert(normalizeDocumentStorageProvider('r2') === 'r2', "normalizeDocumentStorageProvider('r2') returns 'r2'");
    assert(normalizeDocumentStorageProvider('s3') === 'r2', "normalizeDocumentStorageProvider('s3') normalizes to 'r2'");
    assert(normalizeDocumentStorageProvider('cloudflare') === 'r2', "normalizeDocumentStorageProvider('cloudflare') normalizes to 'r2'");
    assert(normalizeDocumentStorageProvider('CLOUDFLARE ') === 'r2', "normalizeDocumentStorageProvider trims and lowercases");
    assert(normalizeDocumentStorageProvider('local') === 'local', "normalizeDocumentStorageProvider('local') returns 'local'");
    assert(normalizeDocumentStorageProvider('disk') === 'local', "normalizeDocumentStorageProvider('disk') normalizes to 'local'");

    let invalidAliasThrew = false;
    try {
      normalizeDocumentStorageProvider('database');
    } catch (err) {
      invalidAliasThrew = err.message.includes('INVALID_STORAGE_PROVIDER');
    }
    assert(invalidAliasThrew, "normalizeDocumentStorageProvider rejects 'database'");

    let unknownAliasThrew = false;
    try {
      normalizeDocumentStorageProvider('azure');
    } catch (err) {
      unknownAliasThrew = err.message.includes('INVALID_STORAGE_PROVIDER');
    }
    assert(unknownAliasThrew, "normalizeDocumentStorageProvider rejects unknown provider 'azure'");

    // C. Migration Dry-Run Accuracy: Zero persistent changes & simulated status
    const librarianUser = await dataManager.createUser({ role: 'LIBRARIAN', tag: 'mig_dry' });
    const dummyPaperContent = Buffer.from('%PDF-1.4 Synthetic exam paper for migration test %%EOF');
    const dummyChecksum = crypto.createHash('sha256').update(dummyPaperContent).digest('hex');
    const dummyFileName = `test-paper-${Date.now()}.pdf`;
    const dummyDiskPath = path.join(tempTestDir, dummyFileName);
    fs.writeFileSync(dummyDiskPath, dummyPaperContent);

    const dryTestPaper = await prisma.examPaper.create({
      data: {
        title: 'Dry Run Test Paper',
        subject: 'Accounting',
        program: 'BCOM',
        branch: 'General',
        year: 2024,
        semester: 1,
        type: 'PREVIOUS_YEAR',
        fileUrl: `/uploads/exam-papers/${dummyFileName}`,
        uploadedById: librarianUser.id,
        storageProvider: 'local',
        checksum: dummyChecksum,
        fileSizeBytes: dummyPaperContent.length,
        originalFileName: dummyFileName,
        mimeType: 'application/pdf',
        publishedAt: new Date(),
      },
    });

    const dryRunResult = await executeExamStorageMigration({
      dryRun: true,
      customUploadDir: tempTestDir,
    });
    assert(dryRunResult.dryRun === true, 'Migration execution result indicates dryRun: true');
    assert(dryRunResult.migratedSuccessfully === 0, 'Dry run reports 0 files actually migrated (migratedSuccessfully: 0)');
    assert(
      (dryRunResult.simulatedCandidates ?? 0) >= 1,
      'Dry run distinguishes simulated candidates from actual migrations'
    );
    const dryRunCandidate = dryRunResult.details.find((d) => d.paperId === dryTestPaper.id);
    assert(dryRunCandidate !== undefined, 'Test paper was evaluated as candidate in dry run');
    assert(dryRunCandidate?.status === 'SIMULATED', "Dry run candidate status is marked 'SIMULATED' (not SUCCESS)");

    // Verify DB record remained untouched
    const paperAfterDryRun = await prisma.examPaper.findUnique({ where: { id: dryTestPaper.id } });
    assert(paperAfterDryRun?.storageProvider === 'local', 'Database record storageProvider remains unchanged after dry-run');

    // D. Migration Remote Integrity Verification: Checksum/size verification prevents corruption
    const mockCorruptAdapter = {
      async put(key, buffer, metadata) {
        return { key, sizeBytes: buffer.length, mimeType: metadata.mimeType };
      },
      async exists(key) {
        return true;
      },
      async getMetadata(key) {
        return {
          mimeType: 'application/pdf',
          sizeBytes: dummyPaperContent.length,
          checksum: 'corrupted_remote_checksum_mismatch',
        };
      },
      async get(key) { return null; },
      async delete(key) {},
    };

    const corruptMigrationResult = await executeExamStorageMigration({
      dryRun: false,
      storageAdapter: mockCorruptAdapter,
      customUploadDir: tempTestDir,
    });
    const corruptDetail = corruptMigrationResult.details.find((d) => d.paperId === dryTestPaper.id);
    assert(corruptDetail?.status === 'FAILED', 'Migration marked FAILED when remote checksum verification fails');
    assert(
      corruptDetail?.error?.includes('INTEGRITY_CHECK_FAILED'),
      'Failure error message explicitly identifies INTEGRITY_CHECK_FAILED'
    );
    assert(fs.existsSync(dummyDiskPath), 'Local source file is preserved intact even when migration fails');

    const paperAfterFailedVerification = await prisma.examPaper.findUnique({ where: { id: dryTestPaper.id } });
    assert(
      paperAfterFailedVerification?.storageProvider === 'local',
      'Database record storageProvider was NOT updated on failed remote integrity check'
    );

    // E. Legacy Paper Download Guard & Publication Gates in Production
    const downloadRouteLayer = examRouter.stack.find((s) => s.route && s.route.path === '/papers/:id/download');
    const downloadHandler = downloadRouteLayer.route.stack[1].handle;

    const prevNodeEnvForDownload = process.env.NODE_ENV;
    const prevAllowLegacy = process.env.ALLOW_LEGACY_LOCAL_SERVE;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_LEGACY_LOCAL_SERVE;
      delete process.env.ALLOW_LEGACY_LOCAL_STORAGE;

      let statusCode = 200;
      let jsonPayload = null;
      const mockRes = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          jsonPayload = body;
          return this;
        },
        setHeader() {},
        send() {},
        sendFile() {},
        redirect() {},
      };

      const mockReq = {
        params: { id: dryTestPaper.id },
        user: { id: librarianUser.id, role: 'LIBRARIAN' },
        query: {},
        headers: {},
      };

      await downloadHandler(mockReq, mockRes);
      assert(
        statusCode === 409,
        `Production download of legacy local paper without override returns HTTP 409 (received: ${statusCode})`
      );
      assert(
        jsonPayload?.error === 'LEGACY_STORAGE_UNMIGRATED',
        "Production download error explicitly identifies 'LEGACY_STORAGE_UNMIGRATED'"
      );

      // When ALLOW_LEGACY_LOCAL_SERVE=true, production allows serving legacy papers
      process.env.ALLOW_LEGACY_LOCAL_SERVE = 'true';
      let allowedStatusCode = 200;
      const mockAllowedRes = {
        status(code) {
          allowedStatusCode = code;
          return this;
        },
        json() { return this; },
        setHeader() {},
        send() {},
        sendFile() {},
        redirect() {},
      };

      await downloadHandler(mockReq, mockAllowedRes);
      assert(
        allowedStatusCode !== 409,
        'With ALLOW_LEGACY_LOCAL_SERVE=true, the legacy production 409 guard is bypassed'
      );

      // Student publication gate enforcement (never bypassed)
      const studentUser = await dataManager.createUser({ role: 'STUDENT', tag: 'gate_std' });
      const unpublishedPaper = await prisma.examPaper.create({
        data: {
          title: 'Unpublished Exam Paper',
          subject: 'Economics',
          program: 'BCOM',
          branch: 'General',
          year: 2024,
          semester: 1,
          type: 'PREVIOUS_YEAR',
          fileUrl: `/uploads/exam-papers/unpub.pdf`,
          uploadedById: librarianUser.id,
          storageProvider: 'r2',
          storageKey: 'exam-papers/unpub/dummy.pdf',
          publishedAt: null, // UNPUBLISHED
        },
      });

      let studentGateStatus = 200;
      let studentGateJson = null;
      const studentGateRes = {
        status(code) {
          studentGateStatus = code;
          return this;
        },
        json(body) {
          studentGateJson = body;
          return this;
        },
      };
      const studentReq = {
        params: { id: unpublishedPaper.id },
        user: { id: studentUser.id, role: 'STUDENT' },
        query: {},
        headers: {},
      };

      await downloadHandler(studentReq, studentGateRes);
      assert(
        studentGateStatus === 403,
        `Student requesting unpublished paper is rejected with HTTP 403 (received: ${studentGateStatus})`
      );
      assert(
        studentGateJson?.error?.includes('Forbidden'),
        'Student rejection error explicitly mentions Forbidden'
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnvForDownload;
      if (prevAllowLegacy !== undefined) {
        process.env.ALLOW_LEGACY_LOCAL_SERVE = prevAllowLegacy;
      } else {
        delete process.env.ALLOW_LEGACY_LOCAL_SERVE;
      }
      delete process.env.ALLOW_LEGACY_LOCAL_STORAGE;
    }

  } finally {
    // Guaranteed data manager and temporary directory cleanup
    try {
      await dataManager.cleanup();
    } catch {}
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
