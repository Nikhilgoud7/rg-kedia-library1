# Phase 12C-1 — Cloud Exam Paper Storage Architecture Audit Report

**Project:** RG-Kedia Library Management System
**Institution:** R.G. Kedia College of Commerce
**Repository:** `Nikhilgoud7/rg-kedia-library`
**Branch:** `main`
**Committed Baseline Commit:** `cb96698a681b84cb4125841564c590357e3c60b5`
**Audit Mode:** READ-ONLY Architectural Investigation & Migration Planning
**Date:** October 27, 2026

---

## 1. Executive Summary

This architecture audit assesses the current file storage implementation for examination question papers and academic materials (`uploads/exam-papers/`). The RG-Kedia Library Management System currently persists uploaded examination papers to the local server filesystem using Multer disk storage and serves them directly via an unauthenticated Express static directory route (`/uploads`).

While this approach functions in single-node local development environments, it presents four critical architectural and operational bottlenecks for an institutional production deployment:
1. **Container Ephemerality & Platform Incompatibility:** In modern cloud container platforms (such as Render, Railway, AWS ECS, Fly.io, or Heroku), container filesystems are ephemeral. Any dyno restart, container recreation, or git redeployment irrevocably destroys all files stored in `uploads/exam-papers/`.
2. **Horizontal Scaling Failure:** Local disk storage prevents multi-replica horizontal scaling. If multiple API instances run behind a load balancer, an upload processed on Node A will return HTTP 404 when requested by a student routed to Node B.
3. **Security Vulnerability (Unauthenticated Static Exposure):** Files in `uploads/` are exposed through `app.use('/uploads', express.static(uploadsDir))` in `server/index.ts`. Anyone with a file URL can download examination papers directly without passing through authentication or role verification middleware.
4. **Backup & Disaster Recovery Decoupling:** Database backups (`server/lib/backup/backupEngine.ts`) snapshot database rows including the `ExamPaper` table, but the physical PDF assets on disk are entirely excluded from the automated DR snapshot pipeline.

This audit formulates a provider-independent, S3-compatible cloud storage architecture that extends the existing `StorageAdapter` pattern created in Phase 8B (`server/lib/storage/`), ensuring seamless migration, zero downtime, backward compatibility, signed URL private downloads, and complete disaster recovery resilience.

---

## 2. Current Storage Architecture

### 2.1 Backend File Storage Subsystem
* **Storage Root Directory:** Resolved at runtime via `findProjectRoot(__dirname)` in `server/routes/exam.routes.ts` to `<projectRoot>/uploads/exam-papers/`.
* **Upload Engine:** `multer.diskStorage` configured as:
  ```typescript
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });
  ```
* **Multer Restrictions:**
  * `limits.fileSize`: 10 * 1024 * 1024 bytes (10 MB ceiling).
  * `fileFilter`: Extension-based filter accepting `.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png`.
  * **Gap:** Content inspection / MIME magic byte detection is not performed; validation relies solely on `path.extname(file.originalname)`.
* **Static Serving Subsystem:**
  In `server/index.ts` (lines 54–61):
  ```typescript
  const uploadsDir = path.join(rootDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
  app.use('/uploads', (_req, res) => {
    res.status(404).json({ error: 'File not found' });
  });
  ```
* **Database Representation:**
  Stored relative path: `/uploads/exam-papers/${req.file.filename}` persisted in the `fileUrl` field of the `ExamPaper` Prisma model.

---

## 3. Complete File Lifecycle

```
[ Teacher / Librarian ]
         │
         │  1. Multipart Form Upload (POST /api/exam/papers)
         ▼
[ Express Router (exam.routes.ts) ]
         │
         ├─► [ Authenticate & Authorize Middleware ('TEACHER', 'LIBRARIAN') ]
         │
         ├─► [ handleUpload (Multer Disk Storage) ]
         │         │
         │         ├─► Writes file to uploads/exam-papers/{timestamp}-{random}.ext
         │         └─► Enforces 10MB ceiling & file extension filter
         │
         ├─► [ Form Validation (program, branch, year, semester, type) ]
         │         │
         │         └─► On failure: fs.unlinkSync(req.file.path) cleanup
         │
         ├─► [ Prisma Transaction ($transaction) ]
         │         │
         │         ├─► prisma.examPaper.create({ data: { ..., fileUrl: '/uploads/exam-papers/...' } })
         │         └─► logAdminAction(AUDIT_ACTIONS.EXAM_PAPER_UPLOADED)
         │
         ▼
[ File Stored on Local Disk + Record in Database ]
         │
         ├──────────────────────────────────────────────────────┐
         │                                                      │
         │  2. Browse / Query                                   │  3. Direct Download
         ▼                                                      ▼
[ GET /api/exam/papers ]                              [ GET /uploads/exam-papers/... ]
  - Authenticated                                       - Handled by express.static
  - Role-agnostic (Student/Teacher/Librarian)           - NO AUTHENTICATION REQUIRED
  - Returns metadata + fileUrl                          - Serves raw binary from disk
         │
         ▼
[ 4. Deletion (DELETE /api/exam/papers/:id) ]
  - Authenticated & Authorized ('TEACHER', 'LIBRARIAN')
  - Teacher ownership check (paper.uploadedById === req.user.id)
  - Path traversal check: isPathInside(filePath, uploadDir)
  - fs.unlinkSync(filePath)
  - Transactional prisma.examPaper.delete + AUDIT_ACTIONS.EXAM_PAPER_DELETED
```

---

## 4. Database Schema Findings

### 4.1 Prisma Model Inspection: `ExamPaper`
Extracted from `prisma/schema.prisma` (lines 160–176):
```prisma
model ExamPaper {
  id           String   @id @default(uuid())
  title        String
  subject      String
  program      String   // BCOM | BBA | BSC
  branch       String   // specific branch
  year         Int      // academic year (e.g., 2024)
  semester     Int      // 1-6
  type         String   // PREVIOUS_YEAR | IMPORTANT_QUESTIONS | STUDY_GUIDE
  fileUrl      String   // path to uploaded file
  description  String?
  uploadedById String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  uploadedBy User @relation(fields: [uploadedById], references: [id])
}
```

### 4.2 Schema Gap Analysis for Cloud Migration
| Schema Element | Current Implementation | Cloud Storage Requirement | Assessment / Remediation |
|---|---|---|---|
| **File Identifier / Key** | `fileUrl: String` (stores `/uploads/exam-papers/filename.pdf`) | Needs to support either local path (`/uploads/...`) or cloud object key (`exam-papers/uuid.pdf`) or full URL | Can work with existing `fileUrl` string column during transitional dual-read, or optionally add `storageKey: String?` and `storageDriver: String?` in a future migration. |
| **Original Filename** | Only stored in `AuditLog.details` JSON string at upload; NOT in `ExamPaper` | Helpful for Content-Disposition header when users download files | Currently missing in schema. In cloud migration, `originalFileName` can be stored as metadata or added as an optional field. |
| **MIME Type** | NOT stored in `ExamPaper` (derived from extension) | Essential for `Content-Type` header when streaming from S3 / presigned URLs | Currently missing in schema. Can be stored in S3 object metadata. |
| **File Size (Bytes)** | Only stored in `AuditLog.details` JSON string; NOT in `ExamPaper` | Helpful for UI display (e.g. "2.4 MB") and quota management | Currently missing in schema. Can be queried from S3 `HeadObject` or stored in metadata. |
| **Checksum / Hash** | NOT stored | Critical for data integrity verification between local disk and S3 | Can be computed (SHA-256) during migration. |
| **Soft Delete** | Hard delete only (`tx.examPaper.delete`) | Cloud architectures often retain soft-delete (`deletedAt`) to protect against accidental deletion | Existing system uses hard delete with transactional audit logging. |
| **Relation Deletion Policy** | Implicit `onDelete: Restrict` on `uploadedBy User` | Prevents hard-deleting a faculty user while their exam papers exist in the catalog | Matches institutional governance standards. |

*Schema Migration Verdict:* **Zero immediate schema migration is mandatory.** The existing `fileUrl` field can store either local URLs (`/uploads/...`) or cloud object URLs/keys (`s3://...` or `https://...`). However, adding optional columns (`originalFileName`, `mimeType`, `fileSizeBytes`, `storageKey`) in a non-breaking manner will significantly improve institutional data integrity.

---

## 5. Security Assessment

| Security Criterion | Current Implementation | Risk Level | Finding & Recommendation |
|---|---|:---:|---|
| **Upload Authorization** | Enforced by `authorize('TEACHER', 'LIBRARIAN')` on `POST /api/exam/papers`. Students and unauthenticated requests rejected with HTTP 403 / 401. | **LOW** | Verified passing across all regression suites (`tests/suites/examGuide.test.js`). |
| **Download Authorization** | Direct file download occurs via `GET /uploads/exam-papers/...` served by `express.static`. | **CRITICAL** | **Unauthenticated Direct Access:** Any student or external actor with the URL can bypass authentication entirely. Cloud migration must switch to authenticated download endpoints generating short-lived presigned URLs (e.g., 60-second validity). |
| **Deletion Authorization & Ownership** | Enforced by `authorize('TEACHER', 'LIBRARIAN')`. Teachers strictly forbidden from deleting other teachers' uploads (`paper.uploadedById !== req.user.id`). Librarians can delete any paper. | **LOW** | Verified passing with audit log generation (`EXAM_PAPER_DELETED`). |
| **MIME Type Verification** | Extension check only (`.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png`). | **MEDIUM** | Magic-byte validation (`file-type` or buffer header inspection) is missing. An attacker could rename malicious HTML/SVG/executable payloads to `.pdf`. |
| **File Size Restriction** | Multer 10MB limit strictly enforced with HTTP 400 rejection. | **LOW** | Verified in regression suite. |
| **Filename Sanitization & Path Traversal** | Stored filename generated via `Date.now() + '-' + Math.round(Math.random() * 1e9) + ext`. Delete uses `isPathInside(filePath, uploadDir)`. | **LOW** | Prevents arbitrary path overwrites. However, `Math.random()` provides only ~30 bits of pseudo-entropy; cryptographically secure UUID (`crypto.randomUUID()`) is recommended for object keys. |
| **Exam Release / Embargo Workflow** | No draft, scheduled release, or hidden state exists. | **MEDIUM** | As soon as an exam paper is uploaded, it is instantly visible to all students via `GET /api/exam/papers`. If future requirements include pre-exam uploads for upcoming tests, a `publishedAt` / `isPublished` gate will be required. |

---

## 6. Existing File Inventory

An inspection of the local workspace and remote test database was conducted:

### 6.1 Filesystem Inventory (`uploads/exam-papers/`)
* **Total Physical Files on Disk:** `0` files.
* **Total Storage Consumption:** `0` bytes.
* **Directory State:** The directory exists on disk (`uploads/exam-papers/`), containing `.gitkeep` at `uploads/`. Test suites upload synthetic files and clean them up during execution lifecycle.

### 6.2 Database Inventory (`ExamPaper` Table in Neon PostgreSQL)
* **Total Database Records:** `10` seeded records.
* **All 10 Records Reference Virtual Seed Paths:**
  1. `/uploads/sample_financial_accounting_2023.pdf` (B.Com Sem 2, Financial Accounting)
  2. `/uploads/sample_stats_imp_questions.pdf` (B.Com Sem 3, Business Statistics)
  3. `/uploads/sample_corp_accounting.pdf` (B.Com Sem 4, Corporate Accounting)
  4. `/uploads/sample_mgmt_2023.pdf` (BBA Sem 1, Principles of Management)
  5. `/uploads/sample_bba_econ_guide.pdf` (BBA Sem 2, Business Economics)
  6. `/uploads/sample_dbms_2024.pdf` (B.Sc Sem 4, DBMS)
  7. `/uploads/sample_python_imp_q.pdf` (B.Sc Sem 5, Python & Data Science)
  8. `/uploads/sample_maths_2023.pdf` (B.Sc Sem 2, Mathematics)
  9. `/uploads/sample_telugu_2023.pdf` (General Degree Sem 1, Second Language Telugu)
  10. `/uploads/sample_sanskrit_imp.pdf` (General Degree Sem 2, Second Language Sanskrit)
* **Physical File Availability:** None of the 10 seeded dummy PDF files exist on disk in the repository. Currently, clicking "Download / View" on these seeded papers triggers Express 404 `{ error: 'File not found' }`.
* **Migration Impact:** Because there are currently zero production physical files in the test database, migrating to cloud object storage is entirely free of legacy file corruption risks and can be established cleanly.

---

## 7. Cloud Storage Provider Comparison

| Criterion | Cloudflare R2 | AWS S3 | Neon Branchable Object Storage | Local Filesystem (Current) |
|---|---|---|---|---|
| **Storage Pricing** | \$0.015 / GB-month (First 10 GB/month FREE) | \$0.023 / GB-month (5 GB free for 12 mos) | Included with Neon tier | Zero extra dollar cost |
| **Download Egress Bandwidth** | **\$0.00 / GB (ZERO egress fees)** | **\$0.09 / GB (Significant egress cost)** | Neon network transfer limits | High local server egress |
| **Free Tier Allowance** | 10 GB storage, 1M Class A ops, 10M Class B ops/mo | 5 GB storage, 20k GET, 2k PUT/mo (1st yr only) | Project-dependent | N/A |
| **S3 API Compatibility** | **100% S3-compatible** (works with `@aws-sdk/client-s3`) | Native S3 | S3-compatible (`force_path_style: true`) | Custom Node.js `fs` |
| **Private Buckets & Signed URLs** | Full support (`getSignedUrl` with custom expiration) | Full support | Presigned URL tools available | No native signed URLs |
| **Ephemeral Container Safety** | **100% persistent** across deploys/restarts | **100% persistent** across deploys/restarts | **100% persistent** across deploys/restarts | **FAILED (Wiped on redeploy)** |
| **Multi-Replica Scaling** | **100% supported** (all nodes access same R2 bucket) | **100% supported** | **100% supported** | **FAILED (Bound to single disk)** |
| **Disaster Recovery Integration** | Independent cloud storage with versioning & snapshots | S3 Cross-Region Replication & lifecycle | Tied to Neon branch lifecycle | Excluded from database backups |
| **Long-Term Operational Cost** | **Lowest (virtually \$0 for college workload)** | Moderate-to-high due to egress spikes during exam seasons | Low | High maintenance / fragility |

### Evaluation & Recommendation
* **Primary Recommendation: Cloudflare R2 (or any S3-Compatible Provider via AWS SDK v3)**
  * **Why R2?** R2 has **zero egress bandwidth fees**. In an educational institution with 500+ students downloading 5MB–10MB question papers repeatedly during mid-term and semester examinations, AWS S3 egress charges (\$0.09/GB) create an unpredictable, recurring cost. R2's generous permanent free tier (10 GB storage, 10 million reads/month) will effectively make library exam paper hosting **\$0.00/month indefinitely**.
  * **Architecture Independence:** By implementing the storage driver using the standard AWS SDK v3 (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`), the application remains **100% cloud-agnostic**. The exact same code runs against Cloudflare R2, AWS S3, Backblaze B2, MinIO, or Neon Object Storage simply by switching environment variables (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).

---

## 8. Proposed Storage Architecture

### 8.1 Architectural Topology

```text
       HTTP Requests
            │
            ▼
┌────────────────────────────────────────────────────────┐
│               Express Router Layer                     │
│           (server/routes/exam.routes.ts)               │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│           Exam Paper Controller / Service              │
│       - Validates metadata, permissions & magic bytes  │
│       - Manages database transaction & audit logging   │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│                StorageAdapter Factory                  │
│             (server/lib/storage/index.ts)              │
│  Resolves active driver via process.env.STORAGE_DRIVER  │
└────────────────────────────────────────────────────────┘
            │
     ┌──────┴─────────────────────────────────┐
     ▼                                        ▼
┌───────────────────────────┐    ┌───────────────────────────┐
│    LocalStorageDriver     │    │      S3StorageDriver      │
│  - Fallback / Dev mode    │    │  - S3 / Cloudflare R2     │
│  - Reads/writes uploads/  │    │  - Stream buffer to bucket│
│  - Serves via stream      │    │  - Generates presigned URL│
│  - No cloud creds needed  │    │  - Zero local disk writes │
└───────────────────────────┘    └───────────────────────────┘
```

### 8.2 Extended Storage Adapter Contract
The existing `StorageAdapter` interface in [server/lib/storage/types.ts](file:///c:/Users/Nikhil/OneDrive/Documents/Default%20Project/rg-kedia-library/server/lib/storage/types.ts) should be enhanced with document capabilities:

```typescript
export interface StorageAdapter {
  // Existing methods (used by BookCover)
  put(key: string, buffer: Buffer, metadata: StorageMetadata): Promise<StorageResult>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;

  // Phase 12C extensions for secure document hosting
  getSignedDownloadUrl?(key: string, expiresInSeconds: number): Promise<string>;
  exists?(key: string): Promise<boolean>;
}
```

### 8.3 Download Flow: Authenticated Presigned URL vs Proxy Stream
1. **Student clicks "Download / View" in UI:**
   Instead of opening raw static URL `/uploads/exam-papers/123.pdf`, client calls:
   `GET /api/exam/papers/:id/download`
2. **Server validates session:**
   `authenticate` verifies student JWT; verifies that the paper exists.
3. **Driver resolution:**
   * **If S3/R2:** Server generates a presigned GET URL valid for 60 seconds (`getSignedUrl(s3Client, getObjectCommand, { expiresIn: 60 })`) and issues an HTTP 302 Redirect to the secure cloud URL.
   * **If Local Disk:** Server sets `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."`, and streams the file using `fs.createReadStream`.
4. **Security Benefit:** Examination assets remain 100% private. Direct unauthorized downloads are completely blocked.

---

## 9. Migration Strategy

To guarantee zero downtime and avoid breaking existing functionality, migration must proceed in four structured stages:

```
Stage 1: Storage Driver Implementation
  - Implement S3StorageDriver in server/lib/storage/
  - Implement LocalStorageDriver fallback in server/lib/storage/
  - Add @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
  - Zero modifications to existing routes or database

Stage 2: Dual-Read & Authenticated Download Route
  - Implement GET /api/exam/papers/:id/download route
  - Supports both legacy local paths (/uploads/...) and cloud object keys (exam-papers/...)
  - Update frontend components (ExamGuide.tsx, ManageExamGuide.tsx) to target the API download endpoint

Stage 3: Cloud Upload Enablement
  - Switch POST /api/exam/papers from multer.diskStorage to multer.memoryStorage()
  - Upload stream directly to S3 via S3StorageDriver.put()
  - Zero disk writes on production servers

Stage 4: Asset Verification & Legacy Cleanup
  - Migration script to copy any existing physical files to the cloud bucket
  - Checksum validation (SHA-256)
  - Verify that all regression suites pass 100%
  - Decommission unauthenticated app.use('/uploads', express.static(...))
```

---

## 10. Rollback Strategy

1. **Environment Flag Controlled:**
   Storage driver selection is governed by `process.env.STORAGE_DRIVER`:
   * `STORAGE_DRIVER=s3`: Uses cloud bucket.
   * `STORAGE_DRIVER=local`: Falls back instantly to local filesystem storage.
2. **Graceful Outage Fallback:**
   If S3 credentials fail or are unset, `getStorageAdapter()` fails cleanly with a descriptive startup error rather than crashing silently at runtime.
3. **Data Preservation:**
   Local files are never automatically deleted upon cloud upload during the migration window. They remain archived until institutional sign-off.

---

## 11. Comprehensive Testing Plan

The following test suites must be developed and executed during Phase 12C implementation:

1. **Storage Driver Unit Tests (`test:storage-driver`):**
   * S3 driver initializes correctly with valid configuration.
   * S3 driver rejects missing credentials with descriptive error.
   * Put, Get, Delete, Exists, and Presigned URL generation contract validation.
   * Local driver fallback contract validation.
2. **Exam Paper Upload Integration Tests (`test:exam-guide`):**
   * Authorized teacher uploads exam paper -> stored in cloud bucket -> HTTP 201.
   * Authorized librarian uploads study guide -> stored in cloud bucket -> HTTP 201.
   * Unauthorized student upload rejected with HTTP 403.
   * Unauthenticated upload rejected with HTTP 401.
   * File > 10MB rejected with HTTP 400.
   * Disallowed file extension rejected with HTTP 400.
   * Transactional AuditLog recorded (`EXAM_PAPER_UPLOADED`).
3. **Secure Download Verification:**
   * Student requesting `GET /api/exam/papers/:id/download` receives HTTP 302 to valid presigned URL or binary stream.
   * Unauthenticated request to download endpoint rejected with HTTP 401.
   * Expired presigned URL cannot be used to download.
   * Non-existent paper ID returns HTTP 404.
4. **Paper Deletion & Cloud Cleanup:**
   * Teacher deletes own paper -> paper deleted from cloud bucket + database -> HTTP 200.
   * Teacher attempting to delete another teacher's paper -> rejected with HTTP 403 -> cloud object preserved.
   * Librarian deletes any paper -> cloud object deleted -> HTTP 200.
   * Transactional AuditLog recorded (`EXAM_PAPER_DELETED`).
5. **Regression Verification:**
   * All 44 existing test suites (including `examGuide.test.js`, `backupRecovery.test.js`, `dataExport.test.js`, and `auditRouteIntegration.test.js`) must pass 100%.

---

## 12. Estimated Implementation Tasks

| Task ID | Component | Estimated Scope | Description |
|---|---|---|---|
| **12C-T1** | Dependencies | Add packages | Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in `server/`. |
| **12C-T2** | Storage Driver | `server/lib/storage/` | Implement `S3StorageDriver.ts` and `LocalStorageDriver.ts` implementing `StorageAdapter`. |
| **12C-T3** | Factory Config | `server/lib/storage/index.ts` | Wire `STORAGE_DRIVER=s3` into factory with configuration validation. |
| **12C-T4** | Upload Route | `server/routes/exam.routes.ts` | Refactor Multer to `memoryStorage()`; stream buffer directly to `storageAdapter.put()`. |
| **12C-T5** | Download Route | `server/routes/exam.routes.ts` | Add `GET /api/exam/papers/:id/download` with signed URL generation / streaming. |
| **12C-T6** | Delete Route | `server/routes/exam.routes.ts` | Update delete handler to invoke `storageAdapter.delete()`. |
| **12C-T7** | Frontend Update | `client/src/` | Update download links in `ExamGuide.tsx`, `ManageExamGuide.tsx`, and dashboards to use the authenticated download route. |
| **12C-T8** | Regression Suite | `tests/suites/` | Update `tests/suites/examGuide.test.js` to verify cloud and local driver modes. |

---

## 13. Risks and Dependencies

1. **External Credentials Dependency:** Cloud storage requires valid cloud credentials (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). The system must gracefully support local disk driver in local development when credentials are absent.
2. **Client Memory Usage on Upload:** Using `multer.memoryStorage()` buffers the file in Node.js RAM during upload. With a 10MB ceiling per request, concurrent uploads of 10 papers would consume ~100MB of RAM. This is well within server limits (512MB–1GB RAM), but strict rate limiting and concurrency limits should be maintained.
3. **Database URL Compatibility:** The 10 seeded records currently point to `/uploads/sample_...pdf`. The new download route must gracefully handle legacy `/uploads/...` paths without crashing if the sample file does not exist.

---

## 14. Outstanding Decisions

1. **Storage Provider Decision:** Confirm selection of Cloudflare R2 (recommended due to \$0 egress) vs AWS S3 vs Neon Object Storage.
2. **Schema Enhancement:** Decide whether to add optional metadata fields (`originalFileName`, `fileSizeBytes`, `mimeType`) to `ExamPaper` in Phase 12C or keep the schema strictly untouched and store metadata in S3 object tags/headers.
3. **Embargo / Scheduled Release Workflow:** Clarify whether RG-Kedia College requires an examination paper release date/time (e.g. unreleased until exam completion), or if all uploaded materials should remain immediately visible as study materials.

---

## 15. Final Recommendation

1. **Adopt S3-Compatible Driver with Cloudflare R2:**
   Implement `S3StorageDriver` using official AWS SDK v3. This provides complete cloud provider independence, allows seamless local testing via MinIO/local driver, and completely eliminates bandwidth egress charges for the college via Cloudflare R2.
2. **Deprecate Unauthenticated `/uploads` Static Serving:**
   Route all paper access through authenticated API endpoints (`/api/exam/papers/:id/download`), securing institutional academic assets.
3. **Proceed to Phase 12C-2 (Implementation):**
   The architecture is fully analyzed, risk-mitigated, and ready for implementation upon user approval.
