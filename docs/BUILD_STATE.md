# RG-Kedia Library Management System — Build State

## Baseline Commit
- **Baseline Commit**: `d707c00` (Phase 3G-4B verified baseline)

## Completed Sub-Phases
- **Phase 1**: Foundations & Database Setup
- **Phase 2**: Authentication & Role-Based Access Control
- **Phase 3A-3F**: Student Catalog, Borrowing, Requests, Notifications, and Settings
- **Phase 4A-4F**: Teacher Module (Catalog, Borrowing, Return Requests, Profile, Settings, Notifications, Regression Hardening)
- **Phase 3G-1**: Dependency Security Updates (`165bd42`) & Production Safety Hardening (`89d7eb0`)
- **Phase 3G-1 Correction**: Strict TRUST_PROXY Non-Negative Integer Enforcement (`457bcd6`)
- **Phase 3G-2**: PostgreSQL Migration on Neon (`provider = "postgresql"`, directUrl, baseline migration, advisory locks, case-insensitive search, concurrency & consistency verified, `68c7537`)
- **Phase 3G-3**: Committed Automated Regression Suite (`c1d116f`) — 5 permanent suites under `tests/`, 124 verified assertions, test safety guards (`ALLOW_TESTS=true`, `NODE_ENV=production` blocker), synthetic isolation & cascade cleanup, PostgreSQL concurrency & advisory lock tests, independent read-only audit approved (VERDICT: APPROVED).
- **Phase 3G-4A**: Read-Only Demo Deployment Readiness Audit (Verdict: READY WITH IDENTIFIED PREREQUISITES).
- **Phase 3G-4B**: Unified Render Demo Deployment Configuration (`9b2cc29` / `d707c00`) — unified single-origin build (`prisma:generate`, `build:client`, `build:server`, `start`), Express static serving & SPA fallback, API 404 guard, Render Blueprint (`render.yaml`), 124/124 regression assertions passed, 8/8 production smoke checks passed.
- **Phase 3G-4C**: Demo Safeguards, 3-Year Free-Tier Optimization & Gate 1 — synthetic demo personas (`@demo.rgkedia.local`), production seed blocker (`FORCE_SEED=true`, $\ge 12$ char seed password), `DEMO_MODE` flag & safe exposure via `GET /api/config`, sticky `DemoBanner` prototype disclaimer, demo account modification/deletion 403 blockers, 8-character password length validation, CLI-only `demo:reset` utility, 60s visibility-aware notification unread-count polling, 90-day retention cleanup engine (`server/jobs/retention.ts`, `npm run notifications:retention`), complete `DEPLOY.md` with 3-year operations runbook, and 6th regression suite (`tests/suites/demoAndRetention.test.js`) bringing total verified assertions to 141/141 passing.

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 1 — Complete (Reached Gate 1)
- **Current Sub-Phase**: Phase 3G-4C (Gate 1 Passed)
- **Gate 1 Status**: APPROVED / PASSED
- **Branch Status**: `main` and `release` synchronized
- **Working Tree**: Clean
- **Verification Status**: 141/141 regression test assertions passing; backend TypeScript check clean (0 errors); frontend client build clean (0 errors).

## Gate 1 Metrics Summary
- **Total Test Suites**: 6
- **Total Test Assertions**: 141 (141 Passed, 0 Failed, 0 Skipped)
- **Database Engine**: Neon PostgreSQL (Serverless, branch: `production`)
- **Concurrency & Advisory Locks**: Verified (Advisory transaction locks serialize borrow/approve/renew/return)
- **Data Safety**: Protected (`FORCE_SEED=true` required in prod, synthetic test isolation with cascade cleanup)
- **Demo Mode**: Guarded (`DEMO_MODE=true` blocks tampering with `@demo.rgkedia.local` personas)
- **Free Tier Feasibility**: 3-Year zero-cost operations verified (Storage growth < 15 MB/yr, 90-day notification retention, Render 720h/mo free compute)

## Active Test Commands
- **Full Automated Regression Suite**: `npm test`
- **Authentication Suite**: `npm run test:auth`
- **Role Authorization Suite**: `npm run test:authorization`
- **Lending Policy Suite**: `npm run test:lending`
- **PostgreSQL Concurrency Suite**: `npm run test:concurrency`
- **Notification Suite**: `npm run test:notification`
- **Demo Safeguards & Retention Suite**: `npm run test:demo`

## Known Issues
- None

## BLOCKED
- STOPPED AT GATE 1 (Awaiting user review before initiating Stage 2 / Phase 5).
