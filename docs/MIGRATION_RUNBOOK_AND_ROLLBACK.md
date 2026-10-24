# RG-Kedia Library Management System — Production Migration Runbook & Rollback Protocol
**Document Code:** `DOC-P9E-MIGRATION-RUNBOOK`
**Phase:** Phase 9E — Staging Dry-Run, Migration Simulation & Rollback Readiness
**Target Architecture:** PostgreSQL (Neon Serverless) + Prisma ORM + Express.js
**Compliance Standard:** India Digital Personal Data Protection Act, 2023 (DPDP Act) & CERT-In Framework
**Classification:** Operational Security & Disaster Recovery Protocol

---

## 1. Executive Summary & Operational Boundaries

This operational runbook establishes the formal protocols, technical mechanics, safety boundaries, and disaster recovery procedures for migrating institutional student, faculty, and administrative user cohorts into the RG-Kedia Library Management System.

### Strict Operational Boundaries

> [!CAUTION]
> **STRICT REPOSITORY SAFETY MANDATE**:
> 1. **No Real Data Ingestion**: No actual student, teacher, or administrative records may be ingested, processed, or loaded until the user explicitly delivers the authorized command `"APPROVE PHASE 9"` accompanied by the designated external filesystem directory path.
> 2. **Production Database Prohibition**: The application production database (`ep-aged-sunset-b3548him-pooler`) must NEVER be connected to, migrated, altered, or restored during Phase 9 development or verification.
> 3. **Isolated Test Database Only**: All dry-runs, simulations, and rollback drills must execute strictly against the approved isolated Neon test compute endpoint:
>    `ep-autumn-sky-b3vpykh4.c-4.ap-southeast-1.aws.neon.tech`
> 4. **Fail-Closed Allowlist Guard**: The positive target allowlist (`validateRestoreDatabaseTarget`) is active across all migration engines, preventing accidental connection to unknown or production endpoints.

---

## 2. Environment Taxonomy & Execution Modes

The migration subsystem operates across three strictly distinguished execution levels:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: Pure Staging Dry-Run (Offline / Non-Mutating DB Inspection)   │
│ - Zero database mutations (0 inserts, 0 updates, 0 deletes)            │
│ - Full structural syntax & cohort validation                           │
│ - In-database duplicate & conflict detection (email & roll number)     │
│ - Pre- and post-analysis record count parity verified                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: Production Migration Simulation (Isolated Neon Test Branch)   │
│ - Mandatory pre-migration encrypted backup verification                │
│ - Atomic transaction isolation (prisma.$transaction, 60s timeout)      │
│ - Strict idempotency (skips pre-existing identical records)            │
│ - Automatic password hashing & mustChangePassword=true enforcement     │
│ - Mathematical reconciliation (preCount + inserted === postCount)      │
│ - Append-only administrative audit log (MIGRATION_SIMULATION_EXECUTED) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: Future Separately Authorized Production Migration             │
│ - REQUIRES: Explicit user authorization ("APPROVE PHASE 9")            │
│ - REQUIRES: Valid external real data source folder                     │
│ - REQUIRES: Pre-migration production snapshot / branch backup          │
│ - Out of scope for Phase 9E                                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Staging Dry-Run Protocol (`executeStagingDryRun`)

The Staging Dry-Run Engine provides non-mutating validation of incoming cohorts before any persistence occurs.

### Technical Guarantees
1. **Mathematical Zero-Mutation Guarantee**: Pre-analysis user counts and post-analysis user counts are compared. If `totalBefore !== totalAfter`, a fatal `FATAL_DRY_RUN_MUTATION` error is immediately thrown.
2. **Conflict Matrix Analysis**:
   - `INSERT`: Neither email nor roll number exists in the database. Planned for creation.
   - `SKIP`: Both email and roll number match an existing database record identically. Planned for idempotent skip.
   - `CONFLICT`:
     - `EMAIL_ALREADY_EXISTS_WITH_DIFFERENT_ROLL`: Email exists in database, but with a different roll number.
     - `ROLL_ALREADY_EXISTS_WITH_DIFFERENT_EMAIL`: Roll number exists in database under a different email.
     - `DATABASE_FIELD_MISMATCH`: Email matches but existing role differs.
3. **Status Determination**:
   - `READY`: 0 conflicts and 0 syntax/academic validation errors. Cohort is clear for simulation.
   - `BLOCKED`: >= 1 conflict or >= 1 validation error exists. Migration execution is unconditionally refused.

### CLI Usage (Dry-Run Mode)
```bash
# Analyze a synthetic cohort file
npm run migration:simulate -- --input=./cohort.csv

# Generate a temporary synthetic cohort and run dry-run analysis
npm run migration:simulate -- --generate-synthetic=50

# Output machine-readable JSON summary (Zero-PII)
npm run migration:simulate -- --generate-synthetic=50 --json
```

---

## 4. Production Migration Simulation Protocol (`executeMigrationSimulation`)

The Migration Simulation Engine validates the end-to-end operational path using synthetic fixtures against the isolated Neon test branch.

### Execution Lifecycle
1. **Target Allowlist Gate**: Rejects any target URL not matching `ep-autumn-sky-b3vpykh4`, `localhost`, or `127.0.0.1`.
2. **Staging Dry-Run Pre-Flight**: Runs `executeStagingDryRun`. If status is `BLOCKED`, aborts immediately without attempting database writes.
3. **Pre-Migration Encrypted Backup**:
   - Mandated unless explicitly skipped (`skipPreBackup: true`).
   - Generates client-side AES-256-GCM encrypted backup (`RG_KEDIA_ENCRYPTED_BACKUP_V1`) using 64-character hex key.
   - Verifies companion SHA-256 digest and payload integrity via `verifyBackupFile`.
4. **Atomic Transaction Isolation**:
   - All batch insertions occur inside `prisma.$transaction(..., { timeout: 60000 })`.
   - If any insert fails, the entire batch rolls back automatically.
5. **Credential & Policy Enforcement**:
   - Generates cryptographically strong temporary password hash if plain password provided or generates fresh high-entropy random password.
   - Enforces `mustChangePassword = true` and `active = true` on every created account.
   - Preserves academic mapping (`program`, `branch`, `year`, `semester`, `secondLanguage`).
6. **Mathematical Reconciliation Verification**:
   - Queries `prisma.user.count()` immediately following transaction commit.
   - Verifies: `totalInDbAfter === totalInDbBefore + insertedCount`.
   - Throws `RECONCILIATION_FAILURE` if parity is violated.
7. **Audit Logging**:
   - Writes `MIGRATION_SIMULATION_EXECUTED` to `AuditLog`.
   - Target ID: `batchId` (e.g., `SIM-MIG-1729800000000-A1B2C3D4`).
   - Details: JSON payload containing batch metrics, durations, and zero plaintext credentials or personal data.

### CLI Usage (Execution Mode)
```bash
# Execute simulation against isolated test database with pre-migration backup
npm run migration:simulate -- --execute --input=./synthetic-cohort.json --backup-key=<64-hex-key>

# Execute simulation with automatic synthetic cohort generation (50 users)
npm run migration:simulate -- --execute --generate-synthetic=50 --backup-key=<64-hex-key>
```

---

## 5. Defense-in-Depth Rollback & Disaster Recovery Protocols

The RG-Kedia LMS architecture implements a 4-layer defense-in-depth rollback model:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: Atomic Transaction Abort (< 1 second RTO)                     │
│ Trigger: Mid-batch exception, unique constraint collision, or timeout. │
│ Action:  Automatic rollback by PostgreSQL transaction coordinator.     │
│ Result:  Zero orphaned records persisted. Database state unmodified.   │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: Targeted Batch Rollback Engine (< 30 seconds RTO)             │
│ Trigger: Operator rollback of a specific completed migration batch.   │
│ Engine:  rollbackMigrationBatch(prisma, { batchId, actorId })          │
│ Action:  Dependency-checked reverse-deletion inside prisma.$transaction│
│ Safety:  Blocks deletion if any user has active book loans.            │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: Client-Side Encrypted Backup Restore (< 5 minutes RTO)        │
│ Trigger: Unrecoverable database corruption or widespread data drift.   │
│ Engine:  restoreDatabaseBackup(prisma, backupPath, { encryptionKey })  │
│ Action:  Transactional table purge and restoration from pre-migration  │
│          verified encrypted backup archive (RG_KEDIA_ENCRYPTED_BACKUP) │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: Neon Instant PITR / Time Travel (< 5 minutes RTO)             │
│ Trigger: Critical catastrophic failure or disaster recovery.           │
│ Engine:  Neon Console Point-in-Time Recovery to pre-migration LSN.     │
│ Action:  Reset branch HEAD or branch from parent snapshot at pre-drift │
│          timestamp (supported within Neon 6-hour history window).      │
└────────────────────────────────────────────────────────────────────────┘
```

### Layer 2: Targeted Batch Rollback Mechanics (`rollbackMigrationBatch`)
1. **Batch Identification**: Locates the batch in `AuditLog` where `targetId = batchId` and extracts `createdUserIds`.
2. **Active Lending Dependency Guard**:
   - Queries `prisma.lending.count({ where: { userId: { in: userIds }, status: 'ISSUED' } })`.
   - If active loans exist, throws `DEPENDENCY_CONFLICT`. Books must be returned or reconciled before rollback is permitted.
3. **Atomic Referential Reverse Deletion**:
   - Deletes notifications, requests, completed lendings, exam papers, and audit logs belonging to batch users.
   - Deletes batch users.
   - Logs `MIGRATION_ROLLBACK_EXECUTED` in `AuditLog`.
4. **Post-Rollback Reconciliation**:
   - Verifies `postRollbackCount === preRollbackCount - deletedCount`.

### CLI Usage (Rollback Mode)
```bash
# Roll back a specific migration batch
npm run migration:simulate -- --rollback --batch-id=SIM-MIG-1729800000000-A1B2C3D4
```

---

## 6. Zero-PII Compliance & Audit Logging Standards

In strict accordance with the Digital Personal Data Protection Act, 2023 (DPDP Act) and institutional governance rules:

1. **Zero Secret Leakage**:
   - Plaintext passwords, temporary credentials, and secret keys are NEVER logged to terminal output, standard streams, error logs, or audit records.
   - Password hashes in logs are stripped via `sanitizeDetails`.
2. **Summary Metrics Only**:
   - Dry-run and simulation reports display aggregate counts:
     - `totalSourceRecords`
     - `validRecordsCount` / `invalidRecordsCount`
     - `toInsertCount` / `toSkipCount` / `conflictCount`
     - Role distribution (`STUDENT`, `TEACHER`, `LIBRARIAN`)
     - Program distribution (`BCOM`, `BBA`, `BSC`)
3. **Credential Storage Outside Repository**:
   - When generating temporary user credentials (`npm run credentials:generate`), output files must be written strictly outside the repository root directory (enforced by `validateCredentialOutputPath`).

---

## 7. Pre-Migration Operator Checklist (Gate 4 Readiness)

Before executing any production migration (Phase 9F):

- [ ] Written approval received from institutional authority (`"APPROVE PHASE 9"`).
- [ ] Source files staged in secure directory outside repository.
- [ ] Source files validated with `validateSyntheticCohort` / `npm run cohort:validate`.
- [ ] Staging dry-run executed against test database with 0 conflicts and 0 errors (`status: READY`).
- [ ] Pre-migration encrypted backup created and verified (`npm run backup:create`).
- [ ] Backup encryption key securely stored in password manager / environment secret.
- [ ] Pre-migration database user counts documented.
- [ ] First-login password change policy communicated to users.
- [ ] Operator verified target database URL matches intended endpoint.
- [ ] Post-migration reconciliation count matches: `initialCount + insertedCount`.
- [ ] AuditLog entry confirmed with `MIGRATION_SIMULATION_EXECUTED` or `MIGRATION_BATCH_IMPORTED`.
