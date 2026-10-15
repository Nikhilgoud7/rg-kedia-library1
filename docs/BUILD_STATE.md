# RG-Kedia Library Management System — Build State

## Baseline Commit
- **Baseline Commit**: `89d7eb0` (Phase 3G-1: production safety (JWT secret, trust proxy, health check, upload 404))

## Completed Sub-Phases
- **Phase 1**: Foundations & Database Setup
- **Phase 2**: Authentication & Role-Based Access Control
- **Phase 3A-3F**: Student Catalog, Borrowing, Requests, Notifications, and Settings
- **Phase 4A-4F**: Teacher Module (Catalog, Borrowing, Return Requests, Profile, Settings, Notifications, Regression Hardening)
- **Phase 3G-1**: Dependency Security Updates (`165bd42`) & Production Safety Hardening (`89d7eb0`)
- **Phase 3G-1 Correction**: Strict TRUST_PROXY Non-Negative Integer Enforcement & Rate Limiter / Cookie Hardening (Stage 1a)

## Current Stage & Sub-Phase
- **Current Stage**: STAGE 1 — finish Phase 3G (Demo Deployment)
- **Current Sub-Phase**: 1b ("Phase 3G-2: PostgreSQL")
- **Current Loop Step**: A (Audit)

## Stage 1a Plan & Audit
### Audit Findings
- `TRUST_PROXY` in `server/config.ts` was not validated and accepted non-integer values (true, false, strings, subnets) in `server/index.ts`.
- Sub-phase 1a requires strict validation: `TRUST_PROXY` must be a non-negative integer (`/^\d+$/`), rejecting any other value (`true`, `false`, `*`, `loopback`, `192.168.1.1`, `-1`, `abc`) with a clear startup error and `process.exit(1)`.
- No database migration needed.

### Exact Change List
1. `server/config.ts`:
   - Validate `process.env.TRUST_PROXY`: if set and non-empty, test against `/^\d+$/`.
   - If invalid: `console.error('FATAL: TRUST_PROXY environment variable must be a non-negative integer (e.g. 1). Received invalid value. Server cannot start safely.')` and `process.exit(1)`.
   - Export `TRUST_PROXY: number | undefined`.
2. `server/index.ts`:
   - Simplify trust proxy configuration: if `TRUST_PROXY !== undefined`, `app.set('trust proxy', TRUST_PROXY)`.
3. Tests (`verify-3g1-safety.js` updated):
   - Reject invalid `TRUST_PROXY` values on startup: `true`, `false`, `*`, `subnet`, `-1`.
   - Confirm secret never appears in stderr/stdout on any startup failure.
   - Test rate limiter bucket behavior with `TRUST_PROXY` unset vs `TRUST_PROXY=1`.
   - Test `Set-Cookie` with `NODE_ENV=production` has `HttpOnly`, `Secure`, and `SameSite=Strict`.
4. Run full regression suite (all 7 suites).

## Active Test Commands
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
- **Stage 1b (Phase 3G-2: PostgreSQL) Prerequisite**:
  - `DATABASE_URL` in the local `.env` file does not start with `postgresql://` (evaluated boolean `isPostgres: false`).
  - Per `docs/AUTOPILOT.md` Section 1b: User action required. Please add your Neon PostgreSQL direct connection string to your local `.env` file:
    ```env
    DATABASE_URL="postgresql://<user>:<password>@<neon-host>/<dbname>?sslmode=require"
    ```
  - Execution is stopped awaiting user update of `.env`. Once updated, Phase 3G-2 (PostgreSQL migration, case-insensitive queries, concurrency tests, and advisory locks) will proceed immediately.
