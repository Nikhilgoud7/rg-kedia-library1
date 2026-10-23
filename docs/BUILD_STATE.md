# RG-Kedia Library Management System — Build State

## Baseline Commit
- **Committed Baseline (Phase 8C)**: `d9b9e96228aa2917c7e890d00f68cb79c453e310`
- **Current Head**: Phase 8D Completed (Frontend Cover Image Integration Implemented, 58 UI Workflow Assertions, 1,279 Total Regression Assertions)

## Completed Sub-Phases
- **Phase 1**: Foundations & Database Setup
- **Phase 2**: Authentication & Role-Based Access Control
- **Phase 3A-3F**: Student Catalog, Borrowing, Requests, Notifications, and Settings
- **Phase 4A-4F**: Teacher Module (Catalog, Borrowing, Return Requests, Profile, Settings, Notifications, Regression Hardening)
- **Phase 3G-1**: Dependency Security Updates (`165bd42`) & Production Safety Hardening (`89d7eb0`)
- **Phase 3G-1 Correction**: Strict TRUST_PROXY Non-Negative Integer Enforcement (`457bcd6`)
- **Phase 3G-2**: PostgreSQL Migration on Neon (`provider = "postgresql"`, directUrl, baseline migration, advisory locks, case-insensitive search, concurrency & consistency verified, `68c7537`)
- **Phase 3G-3**: Committed Automated Regression Suite (`c1d116f`) — 5 permanent suites under `tests/`, 124 verified assertions.
- **Phase 3G-4A/B/C**: Demo Deployment Readiness, Render Deployment, Demo Safeguards & Gate 1 (`d707c00`) — 141 verified assertions.
- **Phase 5A-5E**: Administrative Infrastructure & Librarian Governance (`1c71f92`, `7b539c3`, `fce07fa`, `1bcbb36`)
  - Audit logging infrastructure (`auditLog.test.js` — 58 assertions)
  - User management hardening (`userHardening.test.js` — 28 assertions)
  - Lending requests & issued queue operationalization (`lendingQueue.test.js` — 40 assertions)
  - Academic exam paper repository (`examGuide.test.js` — 54 assertions)
  - Librarian UX polish & governance (`librarianPolish.test.js` — 35 assertions)
  - Gate 2 Passed (356 assertions).
- **Phase 6A**: Physical Copy Management APIs (`copyManagement.test.js` — 39 assertions).
- **Phase 6B**: Inventory Reconciliation Engine & Self-Healing (`inventoryReconciliation.test.js` — 47 assertions).
- **Phase 6C**: Zero-Fine Policy & Lost/Damaged Copy Workflows (`lostDamaged.test.js` — 59 assertions).
- **Phase 6D**: Comprehensive Quality Gate & Stage 3 Midpoint Audit (Total: 501 assertions).
- **Phase 6E**: Librarian Physical Inventory UI & Copy Management Experience (`inventoryExperience.test.js` — 48 assertions, commit `0c5ec93`).
- **Phase 6F**: Real Inventory Circulation Integration, Barcode Operations & Teacher Catalog (`inventoryCirculation.test.js` — 55 assertions, commit `0319715`).
- **Phase 6G**: Cross-Persona Physical Inventory & Student/Faculty Visibility Hardening (`crossPersonaInventory.test.js` — 44 assertions).
- **Phase 6H**: Physical Inventory Final Quality Gate & End-to-End Lifecycle Suite (`inventoryFinalGate.test.js` — 49 assertions, commit `1ffcbb5`).
- **Phase 7A**: Bulk Book Import Foundation & Validation (`bulkImportFoundation.test.js` — 59 assertions).
  - Designed RFC 4180 zero-dependency CSV format and serializer with formula injection sanitization (`=`, `+`, `-`, `@`, `\t`, `\r` escaped with `'`).
  - Added downloadable template endpoint `GET /api/books/import/template` (Librarian only, UTF-8 BOM, attachment headers, example rows).
  - Implemented reusable validation engine (`server/lib/bulkImportValidation.ts`) checking title, author, segment, ISBN-10/13 normalization, in-sheet duplicate ISBNs, duplicate barcodes, condition/program mappings, copy count bounds, and file limits.
  - Added read-only duplicate detector (`checkDatabaseDuplicates`) and validation endpoint `POST /api/books/import/validate`.
- **Phase 7B**: Streaming File Ingestion & Transactional Batch Import (`bulkImportExecution.test.js` — 51 assertions).
  - Implemented execution endpoint `POST /api/books/import/execute` (Librarian only) supporting in-memory Multer file streaming and JSON `{ csvContent }` payloads.
  - Enforced 5MB file-size limit, 1,000-row ceiling, and `.csv` extension checking; untrusted files never written to disk.
  - Re-validates CSV data on the server and checks DB for duplicate ISBNs or barcodes immediately before writing.
  - Implemented chunked transactional batch engine (`server/lib/bulkImportService.ts`, 50 books per batch) with PostgreSQL advisory transaction lock (`pg_advisory_xact_lock`).
  - Atomically creates `Book`, `BookCopy` (with copy numbers, barcodes, conditions, status `AVAILABLE`), and `BookProgram` (curriculum branch mappings).
  - Guarantees zero partial imports: any failed batch rolls back cleanly and cleans up prior batches from the run.
  - Emits administrative audit logs (`AUDIT_ACTIONS.BOOK_CREATED`) with `batchImport: true` and batch statistics.
  - Added full test suite `tests/suites/bulkImportExecution.test.js` with 51 verified assertions.
- **Phase 7C**: Librarian Import Modal, Preview Grid & Confirmation Workflow (`bulkImportUIWorkflow.test.js` — 79 assertions).
  - Created reusable `BulkImportModal` component in `client/src/components/librarian/BulkImportModal.tsx`.
  - Added prominent "Bulk Import CSV" action button in `ManageBooks.tsx` action bar next to "Add New Book Title".
  - Implemented drag-and-drop and file input upload zone enforcing `.csv` extension and 5MB client-side size boundaries.
  - Added in-memory RFC 4180 parser and client-side pre-validator (`client/src/lib/csvHelper.ts`) for zero-latency local preview.
  - Integrated server validation and database conflict detection via `POST /api/books/import/validate`.
  - Built high-density, horizontal-scrolling preview table with row numbering, status badges, inline error diagnostics, search/filtering, and pagination.
  - Added import summary metrics bar (total books, physical copies, unique ISBNs, barcodes, valid/error counts).
  - Designed explicit two-step confirmation dialog with database modification warnings, summary statistics, and authorization checkbox.
  - Integrated `POST /api/books/import/execute` via multipart `FormData`, duplicate submission prevention, loading indicators, and automatic catalog refresh.
  - Extended `Modal.tsx` to support wide modals (`maxWidth="4xl" | "5xl" | "6xl"`).
  - Added dedicated automated regression test suite `tests/suites/bulkImportUIWorkflow.test.js` with 79 verified assertions.

- **Phase 7D**: Bulk Import Final Quality Gate & Database Security Hardening (`bulkImportFinalGate.test.js` — 69 assertions, `envGuardValidation.test.js` — 15 assertions).
  - Hardened database conflict row attribution in `checkDatabaseDuplicates` (`server/lib/bulkImportValidation.ts`), returning `row: r.rowNumber`, conflicting identifiers, and existing database titles/IDs.
  - Updated `BulkImportModal.tsx` preview grid to highlight database-conflicting rows with badges and specific field collision callouts alongside file-level errors.
  - Achieved client/server validation parity in `client/src/lib/csvHelper.ts` for trailing blank rows, 4-digit publication years (`1000 <= year <= currentYear + 1`), integer `TotalCopies`, comma and semicolon copy delimiter support, and case-insensitive condition matching.
  - Fortified multi-batch compensating rollback in `server/lib/bulkImportService.ts` with atomic batch processing, cleanup tracking, and administrative audit logging (`AUDIT_ACTIONS.BOOK_DELETED` with `{ batchImport: true, rollback: true, cleanupSuccess: true, booksRemovedCount }`).
  - Restricted failure injection header `x-test-simulate-failure-batch` strictly to genuine automated test environments (`NODE_ENV === 'test' && !IS_PRODUCTION`). Completely ignored in production and standard runtime environments.
  - Established a dedicated, isolated Neon PostgreSQL test branch (`test` branch, id: `br-plain-salad-b3qylt8r`, compute endpoint `ep-autumn-sky-b3vpykh4`), separated from the production branch (`ep-aged-sunset-b3548him`).
  - Implemented fail-closed positive allowlist guard (`tests/helpers/envGuard.js` via `APPROVED_TEST_ENDPOINT_PATTERNS`), strictly rejecting all unapproved, production, unknown, missing, malformed, or ambient `.env` fallback databases.
  - Added pure, non-database-mutating guard validation test suite (`tests/suites/envGuardValidation.test.js` — 15 assertions) verifying allowlist enforcement and zero secret leakage.
  - Standardized direct compute routing and unpooled connection support (`DATABASE_URL_UNPOOLED`), ensuring reliable Prisma transactions, concurrency, and PostgreSQL advisory locking (`pg_advisory_xact_lock`).
  - Built resilient transient retry handling in `tests/helpers/testData.js` for serverless compute wake-up latency.
  - Added full end-to-end bulk import quality gate suite (`tests/suites/bulkImportFinalGate.test.js` — 69 assertions) covering 16 scenarios (database conflict row attribution, trailing blank rows, year boundaries, integer TotalCopies, delimiter parity, 1,000 vs 1,001 rows, multilingual Unicode [Devanagari/Telugu/Sanskrit diacritics], mid-batch compensating rollback, rollback audit events, failure injection security, 5MB upload boundary, and recursive zero-secrets leakage scan).
  - Registered suites in `tests/runner.js` and added `"test:bulk-import-final-gate"` and `"test:env-guard"` scripts in `package.json`.
- **Phase 7E**: Bulk Book Export Engine & Export Formats (`bulkExport.test.js` — 91 assertions).
  - Implemented librarian-only export endpoint `GET /api/books/export` with role authorization gate (`authorize('LIBRARIAN')`).
  - Delivered exact 14-column format parity with Phase 7A `BULK_IMPORT_COLUMNS` (`Title`, `Author`, `ISBN`, `Publisher`, `Edition`, `PublicationYear`, `Category`, `Segment`, `Description`, `TotalCopies`, `ShelfLocation`, `Barcodes`, `CopyConditions`, `Programs`), ensuring 100% round-trip re-importability.
  - Formatted multiple physical copies into comma-delimited barcodes (`BC-1, BC-2`), copy conditions (`Good, Fair`), and semicolon-delimited curriculum program mappings (`BCOM:General; BBA`).
  - Hardened formula injection protection (`sanitizeCsvField`) to neutralize spreadsheet macro execution for all formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`), prefixing with single quotes (`'`).
  - Integrated UTF-8 Byte Order Mark (`\uFEFF`) and CRLF line endings for native Microsoft Excel and Google Sheets parity with 100% Unicode byte fidelity (Devanagari, Telugu, Sanskrit diacritics).
  - Supported selective filtering consistent with catalog browsing (`search`, `category`, `segment`, `program`).
  - Recorded administrative audit logging via `logAdminAction` (`AUDIT_ACTIONS.BOOK_EXPORTED`) capturing actor ID, timestamp, exported count, and filter parameters.
  - Integrated "Export CSV" action button with download state and loading indicator into `ManageBooks.tsx` top action bar.
  - Added dedicated automated regression test suite `tests/suites/bulkExport.test.js` with 91 verified assertions and registered `"test:bulk-export"` in `package.json`.
- **Phase 8B**: Storage Adapter & Database-Backed Image Storage (`storageAdapter.test.js` — 59 assertions).
  - Implemented pure, driver-independent storage abstraction contract `StorageAdapter` in `server/lib/storage/types.ts` (`put`, `get`, `delete`).
  - Added additive `BookCover` model in `prisma/schema.prisma` (`id`, `bookId`, `data Bytes`, `mimeType`, `sizeBytes`) with 1-to-1 cascade relation on `Book`.
  - Created and applied additive PostgreSQL migration `20261023144637_add_book_cover` to the verified Neon test branch.
  - Implemented `DatabaseStorageDriver` in `server/lib/storage/DatabaseStorageDriver.ts` storing optimized WebP thumbnails in PostgreSQL bytea storage; prevents egress bloat by keeping binary payloads separate from standard catalog queries.
  - Implemented in-memory image processing engine `server/lib/storage/imageProcessor.ts` using `sharp@0.35.5`:
    - Strict magic-byte validation accepting only genuine JPEG, PNG, and WebP.
    - Rejects SVG, PDF, EXE, HTML, GIF, text spoofing, and corrupted streams before decoding.
    - Enforces 5 MB raw upload ceiling and decompression bomb defense (8,000px dimension and 25 megapixel thresholds).
    - Normalizes EXIF orientation and resizes (`fit: inside`, max 400x600px).
    - 5-step adaptive compression ladder guaranteeing WebP output <= 50 KB (51,200 bytes).
    - Zero temporary files written to local disk; zero remote URL fetching (complete SSRF elimination).
  - Implemented storage driver factory in `server/lib/storage/index.ts` defaulting to `STORAGE_DRIVER=database` with fail-closed extension points for future S3/Supabase integration.
  - Cleaned up devDependencies by removing redundant `@types/sharp` package (utilizing Sharp's bundled native TypeScript declarations).
  - Added dedicated automated regression test suite `tests/suites/storageAdapter.test.js` with 59 verified assertions covering all image-processing, storage, security, and cascade deletion invariants. Registered `"test:storage"` script in `package.json`.
- **Phase 8C**: Cover Image API Implementation & Security Hardening (`bookCoverApi.test.js` — 101 assertions).
  - Implemented upload endpoint `POST /api/books/:id/cover` (Librarian only) with in-memory Multer streaming (`MAX_RAW_UPLOAD_SIZE = 5MB`), supporting `'cover'`, `'file'`, and `'image'` multipart form fields.
  - Hardened magic-byte sniffing and decompression bomb protection via `processBookCoverImage`, strictly rejecting PDF, EXE, animated GIF, HTML/SVG, and text spoofing with HTTP 400.
  - Automatically downscales maintaining aspect ratio and compresses to optimized WebP format with strict <= 50 KB (51,200 bytes) output boundary.
  - Persists cover in PostgreSQL `BookCover` table via `DatabaseStorageDriver` and updates `book.coverImage` with timestamped URL (`/api/books/:id/cover?v=...`) for instant client-side cache busting.
  - Implemented authenticated campus-only retrieval endpoint `GET /api/books/:id/cover` returning WebP binary stream with `Content-Type: image/webp`, `Content-Length`, `ETag`, and secured cache headers: `Cache-Control: private, max-age=86400, must-revalidate` and `Vary: Cookie, Authorization` to strictly prevent shared proxy/CDN cross-user caching of authenticated assets.
  - Added conditional HTTP caching: returns `304 Not Modified` with zero body when `If-None-Match` matches the cover's ETag.
  - Implemented librarian-only deletion endpoint `DELETE /api/books/:id/cover` with failure-safe ordering: updates catalog `book.coverImage` to null in the database first, then deletes storage payload. In the event of a storage driver failure, logs non-fatal error and records `storageCleanupFailed: true` in audit log while keeping public catalog free of broken URLs.
  - Integrated storage cleanup in parent book deletion (`DELETE /api/books/:id`).
  - Added administrative audit logging via `logAdminAction` (`AUDIT_ACTIONS.BOOK_COVER_UPDATED` and `AUDIT_ACTIONS.BOOK_COVER_DELETED`).
  - Implemented user-scoped rate limiting (`coverUploadLimiter`: 30 uploads / 15 min per librarian user, placed strictly downstream of authentication/authorization, skipped in test environments).
  - Verified zero raw binary image leaks in standard book catalog (`GET /api/books`) and book detail (`GET /api/books/:id`) responses, protecting database network egress.
  - Verified zero temporary files written to local disk and zero remote image URL fetching (SSRF immunity).
  - Added dedicated automated regression test suite `tests/suites/bookCoverApi.test.js` expanded from 89 to 101 verified assertions (including private cache control, Vary headers, and simulated DB/storage failure orderings) and registered `"test:cover-api"` in `package.json`.

- **Phase 8D**: Frontend Cover Image Integration (`bookCoverUIWorkflow.test.js` — 58 assertions).
  - Created reusable `BookCoverImage` component in `client/src/components/common/BookCoverImage.tsx`:
    - Renders WebP cover image using authenticated `/api/books/:id/cover?v=...` URLs with timestamped cache-busting.
    - Graceful fallback: switches immediately to elegant college placeholder on HTTP 404 or image load error (zero broken-image icons).
    - Supports multiple size configurations: `sm` (table rows), `md` (cards and modals), `lg` (management workspace), and `full`.
    - Screen-reader accessible with informative alt text, decorative book spine texture, and loading skeleton indicator.
  - Created `BookCoverModal` component in `client/src/components/librarian/BookCoverModal.tsx`:
    - Dedicated librarian modal for viewing current cover, uploading, replacing, and removing book cover artwork.
    - Client-side usability checks: validates JPEG, PNG, and WebP formats and enforces 5 MB upload ceiling before network transmission.
    - Zero-latency local preview via `URL.createObjectURL` displaying file name, size, and dimensions, with reliable resource cleanup via `URL.revokeObjectURL`.
    - Upload / replacement via `POST /api/books/:id/cover` using multipart `FormData`.
    - Destructive removal via `DELETE /api/books/:id/cover` with explicit confirmation dialog and warning indicators.
    - Duplicate submission prevention, loading indicators, and informative inline error banners.
  - Integrated `BookCoverImage` into `BookCard.tsx` for Student catalog browsing, search results, and library cards.
  - Integrated `BookCoverImage` and `BookCoverModal` into `ManageBooks.tsx` (Librarian table view with interactive thumbnail and action button).
  - Integrated `BookCoverImage` into `TeacherBrowseBooks.tsx` (table view and copy tracking detail modal).
  - Integrated `BookCoverImage` into Student `BrowseBooks.tsx` borrow request confirmation modal.
  - Added dedicated automated regression test suite `tests/suites/bookCoverUIWorkflow.test.js` with 58 verified assertions and registered `"test:cover-ui"` in `package.json`.

### Dependency Security Status & Advisory Disclosures
- **Audit Command**: `npm audit --omit=dev --json` (Exit code: 1).
- **Patch Applied**:
  - `ip-address` (moderate, GHSA-rxp7-6hxx-x8q5): Patched from `10.7.2` to `10.7.4` within the allowed semver range of `express-rate-limit@8.7.0` (`^10.2.0`), completely resolving the moderate vulnerability.
- **Unresolved Pre-Existing Tooling Advisories**:
  - `deepmerge-ts` / `@prisma/config` / `prisma` (high, GHSA-ggr8-5vv4-36mx): Affects `deepmerge-ts < 8.0.0` used internally by `@prisma/config@6.19.3` within the `prisma@6.19.3` CLI package.
  - **Baseline Lineage**: Existed at baseline commit `4fd979a` (inherited with Prisma 6.19.3). Not introduced by Phase 8B.
  - **Why Visible in `--omit=dev`**: `@prisma/client` (production dependency) declares `peerOptional prisma@"*"`. npm's audit traversal treats `prisma` CLI as linked to the production dependency graph via this optional peer link.
  - **Runtime Reachability**: Development/build tooling only (`prisma migrate`, `prisma generate`). Not imported, invoked, or reachable in production HTTP API routes (`dist/server/index.js`).
  - **Remediation Constraint**: Upstream fix requires `prisma@7.10.1`, which is a breaking major-version upgrade strictly prohibited by project Rule 18 ("No major-version bumps"). Preserved without modification.
- **Phase 8B Package Addition**:
  - `sharp@0.35.5`: Confirmed to introduce **zero** vulnerabilities across both production and development audits. Redundant `@types/sharp` removed.

### Neon Test Branch Privacy & PII Realities (Mandatory Precondition)
> [!IMPORTANT]
> - **Branch Lineage**: The dedicated Neon test branch (`br-plain-salad-b3qylt8r`, compute endpoint `ep-autumn-sky-b3vpykh4`) was created via Neon console branching from `production` (`br-mute-term-b3q54934`) with `init_source: parent-data` at LSN `0/4CBEE10`.
> - **Current Data State**: The test branch currently contains an exact cloned snapshot of the parent branch state at that moment, including seeded baseline accounts and records.
> - **Sanitization Status**: The test branch has **NOT** been independently sanitized or anonymized with synthetic data masking.
> - **Mandatory Precondition Before Production Onboarding**: Before any real student, teacher, or staff Personally Identifiable Information (PII) is onboarded into the production branch, the engineering team must satisfy either of the following requirements:
>   1. Provision a schema-only branch (`init_source: parent-schema`) for all automated testing and external development; OR
>   2. Implement an automated data masking and anonymization migration script that executes upon branch creation to sanitize all user tables (`email`, `name`, `rollNumber`, `phone`, password hashes) before running tests or granting developer access.

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 3 — In Progress (Cover Images & Storage Adapter Interface)
- **Current Sub-Phase**: Phase 8B Complete (Storage Adapter & Database Storage Driver Delivered)
- **Gate 3 Status**: Stage 3 Midpoint Cleared; Gate 3 will follow Phase 8
- **Branch Status**: `main`
- **Working Tree**: Preserved uncommitted changes per autonomous review workflow
- **Verification Status**: 1120/1120 regression test assertions passing across 25 suites on dedicated Neon test branch; backend TypeScript clean (0 errors); client TypeScript clean (0 errors); frontend client build clean (0 errors).

## Metrics Summary
- **Total Test Suites**: 25
- **Total Test Assertions**: 1120 (1120 Passed, 0 Failed, 0 Skipped, Duration: ~304s)
- **Database Engine**: Neon PostgreSQL (Serverless, Production: `production` branch; Test: `test` branch `ep-autumn-sky-b3vpykh4`)
- **Test Database Isolation**: Verified fail-closed positive allowlist guard preventing tests from running against unapproved or production endpoints
- **Concurrency & Advisory Locks**: Verified (`pg_advisory_xact_lock`)
- **Data Safety & Privacy**: Masked student identities, safe borrower projections, strict RBAC, formula injection neutralization, test branch PII policy documented
- **Physical Inventory**: Fully operational barcode assignment, batch copy creation, safe withdrawal, and self-healing reconciliation
- **Zero-Fine Policy**: Strict zero-fine enforcement across all borrowing, overdue, lost, and damaged materials per RG-Kedia College policy
- **Storage Subsystem**: Zero-cost PostgreSQL-backed storage adapter (`BookCover`), in-memory Sharp WebP processing <= 50 KB, zero production disk writes, complete SSRF protection

## Active Test Commands
- **Full Automated Regression Suite**: `npm test`
- **Authentication Suite**: `npm run test:auth`
- **Role Authorization Suite**: `npm run test:authorization`
- **Lending Policy Suite**: `npm run test:lending`
- **PostgreSQL Concurrency Suite**: `npm run test:concurrency`
- **Notification Suite**: `npm run test:notification`
- **Demo Safeguards & Retention Suite**: `npm run test:demo`
- **AuditLog Infrastructure Suite**: `npm run test:audit`
- **User Hardening Suite**: `npm run test:user-hardening`
- **Lending Queue Suite**: `npm run test:lending-queue`
- **Exam Guide Suite**: `npm run test:exam-guide`
- **Librarian Polish Suite**: `npm run test:librarian-polish`
- **Copy Management Suite**: `npm run test:copy-management`
- **Inventory Reconciliation Suite**: `npm run test:reconciliation`
- **Lost & Damaged Workflows Suite**: `npm run test:lost-damaged`
- **Inventory Experience Suite**: `npm run test:inventory-experience`
- **Inventory Circulation Suite**: `npm run test:inventory-circulation`
- **Cross-Persona Inventory Suite**: `npm run test:cross-persona-inventory`
- **Inventory Final Gate Suite**: `npm run test:inventory-final-gate`
- **Bulk Import Foundation Suite**: `npm run test:bulk-import-foundation`
- **Bulk Import Execution Suite**: `npm run test:bulk-import-execution`
- **Bulk Import UI & Workflow Suite**: `npm run test:bulk-import-ui`
- **Bulk Import Final Quality Gate Suite**: `npm run test:bulk-import-final-gate`
- **Bulk Book Export Engine Suite**: `npm run test:bulk-export`
- **Test Database Environment Guard Suite**: `npm run test:env-guard`
- **Storage Adapter & Driver Suite**: `npm run test:storage`
- **Book Cover API Suite**: `npm run test:cover-api`
- **Book Cover UI Workflow Suite**: `npm run test:cover-ui`

## Next Up
- Phase 8E: Production Deployment & Verification.
