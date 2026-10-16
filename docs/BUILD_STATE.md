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
- **Phase 3G-4A**: Read-Only Demo Deployment Readiness Audit (Verdict: READY WITH IDENTIFIED PREREQUISITES)
- **Phase 3G-4B**: Unified Render Demo Deployment Configuration (`9b2cc29`) — unified single-origin build (`prisma:generate`, `build:client`, `build:server`, `start`), Express static serving & SPA fallback, API 404 guard, Render Blueprint (`render.yaml`), 124/124 regression assertions passed, 8/8 production smoke checks passed. Live deployment pending.

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 1 — finish Phase 3G (Demo Deployment)
- **Current Sub-Phase**: 1d ("Phase 3G-4: production packaging, demo safeguards, and 3-year free tier requirements")
- **Current Loop Step**: Audit & GitHub Sync Verified
- **Current Commit**: `311eb3e`
- **GitHub Synchronization Status**: FULLY SYNCHRONIZED with `origin/main` at `311eb3e`. Working tree clean. Zero uncommitted or untracked changes.
- **Deployment Status**: Production packaging & Render Blueprint (`render.yaml`) verified. Live cloud deployment to Render pending user provisioning.
- **Verification Status**: 124/124 regression test assertions passed; 8/8 compiled production bundle smoke checks passed; full dev stack verified locally.
- **Remaining Work in Stage 1**: Stage 1d safeguards (seed synthetic personas, DEMO_MODE banner/controls, lightweight notification bell polling & 90-day retention job, DEPLOY.md with 3-year runbook, and GATE 1 report).
- **Recommended Next Task**: Implement Stage 1d demo safeguards and 3-year free-tier requirements to finalize Phase 3G-4 and reach GATE 1.

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

## Phase 3G-4 Demo Deployment Configuration Summary
- **Unified Single-Origin Architecture**: Single Node.js service serving both Express REST APIs (`/api/*`) and Vite static frontend (`client/dist/*`). Eliminates cross-origin issues and protects strict cookie policies.
- **Production Build Pipeline**:
  - `npm run prisma:generate` (`prisma generate`)
  - `npm run build:client` (`npm --prefix client run build`)
  - `npm run build:server` (`tsc`)
  - `npm run build` (unified orchestration)
  - `npm start` (`node dist/server/index.js`)
- **Express Serving Enhancements**:
  - Dynamic `findProjectRoot` resolution supporting execution from both `server/` and compiled `dist/server/`.
  - Unmatched API 404 guard (`app.all('/api/*', ...)` returning JSON error `{ error: 'API endpoint not found' }`, strictly preventing SPA HTML redirection for API requests).
  - Client static asset mounting via `express.static(clientDist)`.
  - React Router HTML5 SPA fallback (`app.get('*', ...)` returning `client/dist/index.html`).
  - Upload file serving with JSON 404 fallback for missing assets.
- **Render Blueprint (`render.yaml`)**:
  - Free-tier Web Service configuration in `singapore` region.
  - Build command: `npm install --include=dev && npm --prefix client install --include=dev && npm run build && npx prisma migrate deploy`.
  - Start command: `npm start`.
  - Health check endpoint: `/api/health`.
  - Environment variable definitions with `sync: false` for all secrets (`JWT_SECRET`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CLIENT_URL`).
  - Safe database deployment: runs `npx prisma migrate deploy` in build without data loss or reset.
- **Verification Results**:
  - Backend TypeScript compilation: 0 errors (`npx tsc --noEmit`).
  - Frontend TypeScript compilation: 0 errors (`cd client && npx tsc --noEmit`).
  - Full production build: Clean build in 5.25s.
  - Regression testing: 124/124 assertions passing (`npm test`, 55.59s).
  - Production startup smoke test: 8/8 assertions passing on compiled bundle (`node dist/server/index.js` on port 5055):
    1. `GET /api/health` -> 200 OK (DB connected)
    2. `GET /` -> 200 OK (HTML document served)
    3. `GET /student/dashboard` -> 200 OK (SPA fallback HTML served)
    4. `GET /api/nonexistent-endpoint` -> 404 JSON (`{ error: 'API endpoint not found' }`)
    5. `GET /assets/index-CSVDc8fS.css` -> 200 OK (`text/css`)
    6. `GET /uploads/nonexistent.pdf` -> 404 JSON (`{ error: 'File not found' }`)
    7. `GET /api/books` -> 401 Unauthorized (Auth middleware active)
    8. `POST /api/auth/login` -> 400 Bad Request (Auth route active)
- **Deployment Status**: Local configuration verified. Live deployment pending user approval.

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
