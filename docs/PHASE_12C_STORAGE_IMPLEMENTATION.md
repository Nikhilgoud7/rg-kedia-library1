# Phase 12C — Cloud Examination Paper Storage Architecture & Implementation

## 1. Executive Summary

Phase 12C upgrades the examination paper and academic resource storage architecture of the **RG-Kedia Library Management System** from a vulnerable, local filesystem-bound pattern (`uploads/exam-papers/`) to an institutional-grade, S3-compatible cloud object storage architecture using **Cloudflare R2**, with seamless backward-compatible local filesystem and database fallbacks for offline testing and local development.

### Core Architectural Decisions Implemented

1. **Storage Provider**: Cloudflare R2 (S3-compatible via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`). Zero egress fees and global low-latency CDN delivery.
2. **Database Metadata**: Enriched `ExamPaper` Prisma model with dedicated storage metadata (`storageProvider`, `storageKey`, `originalFileName`, `mimeType`, `fileSizeBytes`, `checksum`, `publishedAt`) and composite performance indexes.
3. **Student Publication Policy**: Strict librarian-controlled publication workflow (`publishedAt: null` by default for teacher uploads). Students cannot view or download unpublished papers.
4. **Bucket Visibility**: 100% private bucket. Direct static route access (`/uploads/exam-papers`) is deprecated and intercepted with HTTP 403 Forbidden.
5. **Authenticated Downloads**: Secure download endpoint (`GET /api/exam/papers/:id/download`) issuing short-lived (60-second) presigned URLs for Cloudflare R2/S3, or streaming directly for local storage driver.
6. **Binary Magic-Byte Inspection**: Header inspection before storage writes rejecting disguised executables (`MZ` header), scripts, and non-academic binaries, with a 10MB file size ceiling.
7. **Migration Engine**: Zero-data-loss migration CLI (`scripts/migrateExamStorage.ts`) with inventory scanning, SHA-256 checksum verification, safe dry-run mode, and rollback protection.

---

## 2. Security & Threat Mitigation Matrix

| Vulnerability Identified in Audit (12C-1) | Phase 12C Remediation | Security Guarantee |
| :--- | :--- | :--- |
| **Direct Unauthenticated Static Access** (`/uploads/exam-papers/` exposed without auth) | `server/index.ts` intercepts `/uploads/exam-papers` with `res.status(403).json(...)`. Downloads routed to `GET /api/exam/papers/:id/download`. | No unauthenticated user can access or scrape examination materials. |
| **Path Traversal Vulnerability** (`../` traversal during read/delete) | `LocalStorageDriver.resolvePath` uses `isPathInside` validation strictly bounded within designated storage root. | Arbitrary directory traversal and file overwrite attacks are mathematically blocked. |
| **File Masquerading / Extension Spoofing** (`.exe` renamed to `.pdf`) | `fileSignatureValidator.ts` inspects binary magic bytes (`%PDF-`, `PK\x03\x04`, `\x89PNG`, `\xFF\xD8\xFF`, `\xD0\xCF\x11\xE0`) and explicitly rejects `MZ` headers. | Executable files disguised with `.pdf` extension are rejected with HTTP 400. |
| **Container Ephemerality & Data Loss** (Local filesystem wiped on cloud container restarts) | Cloudflare R2 in-memory buffer streaming (`multer.memoryStorage()`). No production writes to container ephemeral disk. | Zero data loss on server restart, horizontal scaling, or container redeployment. |
| **Unpublished Paper Leakage** (Draft materials immediately visible to students) | Database query gates (`where.publishedAt = { not: null }`) in list, single, and download endpoints for student role. | Students cannot see or download materials until approved and published by a Librarian. |
| **Credential / Presigned URL Leakage** (Long-lived tokens exposed in logs or storage) | Presigned URLs have a strict 60-second TTL. S3 storage driver sanitizes credentials from JSON serialization and logs. | Expired links cannot be reused or shared across unauthorized parties. |

---

## 3. Database Schema Changes

### Prisma Model: `ExamPaper` (`prisma/schema.prisma`)

```prisma
model ExamPaper {
  id               String    @id @default(uuid())
  title            String
  subject          String
  program          String
  branch           String
  year             Int
  semester         Int
  type             String    @default("PREVIOUS_YEAR")
  fileUrl          String
  description      String?
  uploadedById     String
  uploadedBy       User      @relation(fields: [uploadedById], references: [id], onDelete: Restrict)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  // Phase 12C Cloud Storage Metadata
  storageProvider  String    @default("local") // "local" | "r2" | "s3" | "database"
  storageKey       String?   // Object key in cloud bucket: exam-papers/{year}/{program}/{uuid}.pdf
  originalFileName String?   // Preserved user filename at upload time
  mimeType         String?   // Detected MIME type via magic bytes
  fileSizeBytes    Int?      // Exact byte size
  checksum         String?   // SHA-256 hex digest
  publishedAt      DateTime? // Publication timestamp (null = pending librarian review)

  @@index([program, branch, semester])
  @@index([uploadedById])
  @@index([publishedAt])
  @@index([storageProvider])
}
```

### Migration SQL (`prisma/migrations/20261027120000_add_exam_paper_storage_metadata/migration.sql`)

```sql
-- AlterTable
ALTER TABLE "ExamPaper" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "originalFileName" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "fileSizeBytes" INTEGER,
ADD COLUMN "checksum" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExamPaper_publishedAt_idx" ON "ExamPaper"("publishedAt");

-- CreateIndex
CREATE INDEX "ExamPaper_storageProvider_idx" ON "ExamPaper"("storageProvider");
```

---

## 4. Storage Drivers & Architecture

### Storage Adapter Interface (`server/lib/storage/types.ts`)

```typescript
export interface StorageAdapter {
  put(key: string, data: Buffer, metadata: StorageMetadata): Promise<StorageResult>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<boolean | void>;
  exists(key: string): Promise<boolean>;
  getMetadata?(key: string): Promise<StorageMetadata | null>;
  getSignedDownloadUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
```

### Drivers Implemented

1. **`S3StorageDriver` (`server/lib/storage/S3StorageDriver.ts`)**:
   - Integrates with Cloudflare R2 and AWS S3 using `@aws-sdk/client-s3`.
   - Supports `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `HeadObjectCommand`.
   - Generates 60-second presigned URLs via `@aws-sdk/s3-request-presigner`.
   - Protects credentials from object serialization and accidental log leakage.
2. **`LocalStorageDriver` (`server/lib/storage/LocalStorageDriver.ts`)**:
   - Stores files in `uploads/exam-papers/` for local development and offline testing.
   - Enforces path traversal checks (`isPathInside`).
   - Computes SHA-256 checksums automatically.
3. **`DatabaseStorageDriver` (`server/lib/storage/DatabaseStorageDriver.ts`)**:
   - Retained for book cover storage and database fallback.
   - Implements `exists` and `getMetadata` for complete interface contract parity.
4. **Storage Adapter Factory (`server/lib/storage/index.ts`)**:
   - `getDocumentStorageAdapter(driverName?)`: selects between `local`, `r2`, and `s3` based on configuration.

---

## 5. API Endpoints & Role-Based Access Control

### 1. Upload Question Paper (`POST /api/exam/papers`)
- **Roles**: `TEACHER`, `LIBRARIAN`
- **Payload**: `multipart/form-data` with `file`, `title`, `subject`, `program`, `branch`, `year`, `semester`, `type`, `description`.
- **Validation**:
  - Binary signature inspection via `validateExamPaperFile`.
  - Allowed extensions: `.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png`.
  - Maximum size: 10 MB.
  - Rejection of `MZ` executable headers and scripts.
- **Publication Policy**:
  - `TEACHER`: Uploads default to `publishedAt: null` (pending review).
  - `LIBRARIAN`: Published immediately (`publishedAt: new Date()`) unless explicit `publish=false` is passed.
- **Audit Logging**: Emits `EXAM_PAPER_UPLOADED` with file size, checksum, and storage key.

### 2. Approve & Publish (`PUT /api/exam/papers/:id/publish`)
- **Roles**: `LIBRARIAN` only.
- Sets `publishedAt: new Date()`.
- Emits `EXAM_PAPER_PUBLISHED` audit log with actor ID.

### 3. Unpublish (`PUT /api/exam/papers/:id/unpublish`)
- **Roles**: `LIBRARIAN` only.
- Sets `publishedAt: null`.
- Emits `EXAM_PAPER_UNPUBLISHED` audit log.

### 4. Authenticated Download (`GET /api/exam/papers/:id/download`)
- **Roles**: `STUDENT`, `TEACHER`, `LIBRARIAN`
- **Access Gates**:
  - `STUDENT`: Forbidden (HTTP 403) if `publishedAt === null`.
  - `TEACHER`: Can download published papers and own unpublished uploads; forbidden on other teachers' unpublished papers.
  - `LIBRARIAN`: Can download any paper.
- **Serving Mechanism**:
  - **Cloudflare R2 / S3**: Generates a 60-second presigned URL and redirects (HTTP 302) or returns `{ downloadUrl, expiresInSeconds }` if `?json=true`.
  - **Local Driver**: Streams binary buffer with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="..."`.

### 5. List Papers (`GET /api/exam/papers`)
- Filtered by role:
  - `STUDENT`: `where.publishedAt = { not: null }`.
  - `TEACHER`: `where.OR = [{ publishedAt: { not: null } }, { uploadedById: req.user.id }]`.
  - `LIBRARIAN`: Can filter with `?status=pending` or `?status=published`.

### 6. Delete Paper (`DELETE /api/exam/papers/:id`)
- **Roles**: `LIBRARIAN` (any paper) or `TEACHER` (own uploads only).
- Deletes object from storage adapter and database record transactionally.
- Emits `EXAM_PAPER_DELETED` audit log.

---

## 6. Migration CLI Tooling

The migration utility (`scripts/migrateExamStorage.ts`) provides automated migration from local disk storage to Cloudflare R2:

```bash
# 1. Non-destructive inventory scan
npm run storage:migrate -- --scan

# 2. Simulated dry-run (zero database or cloud writes)
npm run storage:migrate -- --dry-run

# 3. Active migration execution
npm run storage:migrate -- --execute

# 4. Safe rollback to local storage
npm run storage:migrate -- --rollback
```

### Migration Guarantees
- SHA-256 checksum recomputed from physical file and verified after cloud upload.
- Cloud object verified via `HeadObject` before database record update.
- Transactional updates to `ExamPaper` record.
- Failed items logged to failure report without interrupting remaining candidates.

---

## 7. Canonical Cloudflare R2 Environment Variables & Fail-Fast Guard

### Canonical Environment Variables

```env
# Storage Driver Selection: 'local' (development/testing) | 'r2' (production mandatory)
STORAGE_DRIVER=local

# Cloudflare R2 Configuration (Mandatory in production when STORAGE_DRIVER=r2)
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=rg-kedia-library-exam-papers

# Optional overrides (auto-derived defaults: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com)
# R2_ENDPOINT=https://your_cloudflare_account_id.r2.cloudflarestorage.com
# R2_REGION=auto
```

### Production Fail-Fast Startup Behavior
- **Explicit Driver Required**: In production (`NODE_ENV=production`), `STORAGE_DRIVER` is strictly mandatory. If unset, the server exits immediately (`process.exit(1)`) with `STORAGE_CONFIGURATION_ERROR`.
- **Local Disk Forbidden in Production**: If `STORAGE_DRIVER=local` or `disk` in production, startup halts immediately to prevent data loss on container restarts (e.g., Render ephemeral disks).
- **R2 Credential Verification**: If `STORAGE_DRIVER=r2`, the server verifies `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_ACCOUNT_ID` / `R2_ENDPOINT` at startup.
- **Zero Credential Leakage**: Error messages and logs strictly report missing variable names without exposing passwords, secret keys, or connection URLs.
- **Development & Testing Safe**: Development and automated test runs default to `LocalStorageDriver` without requiring cloud credentials.

---

## 8. Publication Policy Status & Institutional Rationale

- **Teacher Submissions**: Default to `publishedAt: null` (`PENDING_REVIEW`). Students cannot view or download unpublished papers (HTTP 403 Forbidden).
- **Librarian Submissions**: Published immediately (`publishedAt: new Date()`) by default, with support for explicit drafting via `publish=false`.
- **Institutional Governance Rationale**: In the Osmania University institutional framework for R.G. Kedia College, the Chief Librarian is the final administrative authority. Requiring self-approval adds unnecessary administrative friction. However, if multi-librarian dual-control is mandated by college policy, a configuration flag can enforce secondary review by a distinct librarian.

---

## 9. Verification & Test Evidence

### Test Suites

1. **`npm run test:exam-guide`**:
   - Total assertions: **70 / 70 PASS** (0 failures).
   - Verifies: magic-byte validation, disguised executable rejection, teacher upload unpublished default, student 403 on unpublished download, teacher permissions, librarian publication approval, audit logging, student download of published papers, librarian unpublish, student re-blocking, and zero secret leakage.

2. **`npm run test:cloud-storage`**:
   - Total assertions: **56 / 56 PASS** (expanded from 37, 0 failures).
   - Verifies: file signature validator (PDF, PNG, JPEG, DOC, DOCX), MZ executable rejection, 10MB size ceiling, LocalStorageDriver CRUD, path traversal blocking (`../`), S3StorageDriver configuration validation and credential isolation, getSignedDownloadUrl contract, storage adapter factory switching, exam migration scanner, and all 19 production storage fail-fast guard rules (missing driver, forbidden local storage in production, R2 missing credentials, R2 valid configuration, development local storage, and zero secret leakage).

3. **Compiler & Build Checks**:
   - `prisma validate`: **PASS**
   - `npx tsc --noEmit` (backend): **PASS** (0 errors)
   - `npm run build` (client + server): **PASS** (0 errors, Vite production bundle generated)
