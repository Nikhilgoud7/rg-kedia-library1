# RG-Kedia Library Management System — Build State

## Baseline Commit
- **Baseline Commit**: `89d7eb0` (Phase 3G-1: production safety (JWT secret, trust proxy, health check, upload 404))

## Completed Sub-Phases
- **Phase 1**: Foundations & Database Setup
- **Phase 2**: Authentication & Role-Based Access Control
- **Phase 3A-3F**: Student Catalog, Borrowing, Requests, Notifications, and Settings
- **Phase 4A-4F**: Teacher Module (Catalog, Borrowing, Return Requests, Profile, Settings, Notifications, Regression Hardening)
- **Phase 3G-1**: Dependency Security Updates (`165bd42`) & Production Safety Hardening (`89d7eb0`)
- **Phase 3G-1 Correction**: Strict TRUST_PROXY Non-Negative Integer Enforcement (`457bcd6`)
- **Phase 3G-2**: PostgreSQL Migration on Neon (`provider = "postgresql"`, directUrl, baseline migration, advisory locks, case-insensitive search, concurrency & consistency verified, `68c7537`)
- **Phase 3G-3**: Committed Automated Regression Suite (`c1d116f`) — 5 permanent suites under `tests/`, 124 verified assertions, test safety guards (`ALLOW_TESTS=true`, `NODE_ENV=production` blocker), synthetic isolation & cascade cleanup, PostgreSQL concurrency & advisory lock tests, independent read-only audit approved (VERDICT: APPROVED).

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 1 — finish Phase 3G (Demo Deployment)
- **Current Sub-Phase**: 1d ("Phase 3G-4: demo deployment")
- **Current Loop Step**: A (Audit / Plan)

## Stage 1b PostgreSQL Summary
- **Database Engine**: Neon PostgreSQL (project: `shy-haze-95283527`, branch: `production`, AWS ap-southeast-1)
- **Prisma**: Upgraded `prisma` and `@prisma/client` to latest stable 6.x release (`6.19.3`)
- **Package Scripts**: Added `prisma:migrate` (`prisma migrate dev`) and `prisma:deploy` (`prisma migrate deploy`); updated `setup`
- **Migrations**: Baseline migration `20261015101827_init` generated and applied
- **Database Backup**: SQLite `prisma/dev.db` preserved untouched as backup
- **Insensitive Queries**: `mode: 'insensitive'` added to `contains` search filters across `book`, `user`, `admin`, `exam`, `lending` routes; verified "MATH" vs "math" returns identical IDs
- **PostgreSQL Advisory Locks**: Integrated `SELECT pg_advisory_xact_lock(hashtext(...))` inside transactions for `request-borrow`, `approve`, `renew`, `return`
- **Concurrency & Consistency Tests**: 34/34 checks passed (`verify-stage1b-postgres.js`), covering:
  - 10 parallel borrow requests (1 succeeds, 9 return 400)
  - 2 parallel approves for one request (1 succeeds, 1 conflict)
  - 2 parallel approves for the last copy of a book (1 succeeds, 1 returns 400 "No copies available to issue.")
  - 2 parallel renews (1 succeeds, 1 returns 400)
  - 2 parallel returns (1 succeeds, 1 conflict)
  - Full consistency audit: 0 inconsistent ISSUED lendings, 0 orphan ISSUED copies, 0 duplicate active copies per user, 0 duplicate PENDING requests per user+book

## Phase 3G-3 Regression Framework Summary
- **Permanent Framework**: Built natively under `tests/` with zero heavyweight test runner dependencies.
- **Test Suites (124 Assertions Total)**:
  - `auth.test.js` (20 assertions): Login, password rejection, inactive accounts, JWT forgery, session revocation, tokenVersion.
  - `authorization.test.js` (26 assertions): Role matrix (STUDENT, TEACHER, LIBRARIAN), administrative protection, profile tampering, borrower identity masking.
  - `lending.test.js` (35 assertions): 10-book cap, 30-day loan period, 0 fine policy, 1 renewal, overdue/return request blocks, cancellation rules, return processing.
  - `concurrency.test.js` (22 assertions): PostgreSQL advisory locks, 10 parallel borrow requests, 2 parallel approvals, last-copy races, 2 parallel renews, 2 parallel returns, 4 database-wide consistency queries.
  - `notification.test.js` (21 assertions): Lazy due-soon/overdue alerts, read updates, mark-all-read, soft-dismissal audit preservation, hard delete of generic notices.
- **Safety Controls**:
  - Explicit authorization requirement (`ALLOW_TESTS=true` or `--allow-tests`).
  - Strict production blocker (`NODE_ENV=production` immediately aborts).
  - Synthetic data namespace (`reg_<hex4>_*@example.test`) with guaranteed cascade cleanup.
  - Recursive response secret auditing (`findLeakedSecrets`).
- **Audit Approval**: Phase 3G-3A independent read-only audit completed with verdict `APPROVED (PASS WITH MINOR OBSERVATIONS)`.

## Active Test Commands
- **Full Automated Regression Suite**: `npm test`
- **Authentication Suite**: `npm run test:auth`
- **Role Authorization Suite**: `npm run test:authorization`
- **Lending Policy Suite**: `npm run test:lending`
- **PostgreSQL Concurrency Suite**: `npm run test:concurrency`
- **Notification Suite**: `npm run test:notification`

## Known Issues
- None

## BLOCKED
- None
