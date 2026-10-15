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
- **Phase 3G-2**: PostgreSQL Migration on Neon (`provider = "postgresql"`, directUrl, baseline migration, advisory locks, case-insensitive search, concurrency & consistency verified)

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 1 — finish Phase 3G (Demo Deployment)
- **Current Sub-Phase**: 1c ("Phase 3G-3: committed regression suite")
- **Current Loop Step**: A (Audit)

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

## Active Test Commands
- **Stage 1b PostgreSQL Concurrency & Consistency**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-stage1b-postgres.js"`
- **Phase 3G-1 Safety**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-3g1-safety.js"`
- **Phase 3E Runtime**: `npx tsx "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-phase3e.ts"`
- **Phase 3E Corrective**: `npx tsx "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-3e-corrective.ts"`
- **Phase 3F Notifications**: `npx tsx "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-phase3f.ts"`
- **Phase 4D Teacher Profile & Settings**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-phase4d.js"`
- **Phase 4F Teacher Full Regression**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-phase4f-full.js"`
- **Step 2 Server Auth Sweep**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-step2-sweep.js"`
- **Step 5 Data Integrity Lifecycle**: `node "C:\Users\Nikhil\.gemini\antigravity\brain\292276b2-7a12-403f-93af-145c2c21918c\scratch\verify-step5-integrity.js"`

## Known Issues
- None

## BLOCKED
- None
