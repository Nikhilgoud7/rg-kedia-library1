# RG-Kedia Library Management System — Backup & Disaster Recovery Architecture

---

## 1. Executive Summary & Zero-Rupee Budget Framework

This document codifies the automated backup and disaster recovery (DR) architecture for the RG-Kedia College of Commerce Library Management System. Operating under a strict **zero-rupee infrastructure budget**, the architecture leverages a defense-in-depth hybrid model combining:
1. **Cloud-Native Short-Term Recovery**: Neon's Point-in-Time Recovery (PITR) and branching engine.
2. **Client-Side Encrypted Logical Archiving**: Automated scheduled logical backups encrypted with AES-256-GCM, validated with SHA-256 integrity digests, and archived via GitHub Actions artifacts with strict 7-day retention.

This runbook defines operational responsibilities, recovery objectives, verification procedures, and step-by-step restoration protocols.

---

## 2. Infrastructure Capability Audit (Verified Provider Constraints)

### A. Neon Database (`free_v3` Plan)
An inspection of the project configuration (isolated cloud environment) confirmed the following capabilities:
- **Subscription Tier**: `free_v3` (Free Tier).
- **History Retention (`history_retention_seconds`)**: `21,600 seconds` (**strictly 6 hours**).
- **Point-in-Time Recovery (PITR)**: Instant restore is supported only within the 6-hour history window for root branches (such as `production`).
- **Branching Quota**: Up to 10 total branches; 1 GiB logical storage limit per branch.
- **Snapshots**:
  - Manual snapshots: Limited to **1 manual snapshot** on the Free plan.
  - Automated snapshot schedules: **Unavailable on Free Tier** (requires paid plan).
- **Compute Auto-Suspend**: Compute endpoints scale down to 0 CUs after 5 minutes of inactivity.

### B. GitHub Actions & Artifact Storage
- **Free-Tier Allotment**: 2,000 runner minutes per month for private repositories (unlimited for public).
- **Concurrency Controls**: Enforced via `concurrency: { group: 'database-backup', cancel-in-progress: false }` to prevent race conditions or overlapping backup executions.
- **Artifact Retention**: Configurable up to 90 days (set to **7 days** to avoid storage exhaustion).
- **Confidentiality Constraint**: GitHub Artifact storage is public to repository collaborators and is **not** treated as end-to-end encrypted. Therefore, **all database dumps uploaded to GitHub Actions artifacts MUST be client-side encrypted with AES-256-GCM prior to upload**. Plaintext dumps are strictly prohibited from artifact storage.

---

## 3. Selected Hybrid Recovery Strategy

| Layer | Mechanism | Scope | Recovery Window | Target RPO | Target RTO | Cost |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Layer 1: Operational Recovery** | Neon Instant Restore / PITR | Accidental data corruption, bad migrations, erroneous queries | Last 6 hours | < 1 hour | < 5 minutes | ₹0 |
| **Layer 2: Disaster Recovery** | Encrypted Logical Backup (`RG_KEDIA_ENCRYPTED_BACKUP_V1`) | Catastrophic database loss, provider outage, regional disaster | Last 7 days | 24 hours | < 30 minutes | ₹0 |

### Recovery Objectives
- **Recovery Point Objective (RPO)**:
  - **Operational Accidents (< 6 hours)**: RPO of minutes (up to exact transaction timestamp) via Neon PITR.
  - **Disaster Recovery (> 6 hours)**: RPO of **24 hours** via daily automated GitHub Actions backup.
- **Recovery Time Objective (RTO)**:
  - **Operational Accidents**: **< 5 minutes** (instant root branch time-travel restore or branch compute endpoint switch).
  - **Full Logical Restoration**: **< 30 minutes** (integrity verification, sequential table restoration, referential checks).

---

## 4. Backup Security, Confidentiality & Integrity

### A. Confidentiality & Secret Protection
1. **Zero Credential Leakage**: Database URLs, tokens, and encryption keys are never logged. The utility engine uses `redactSecrets()` to sanitize error strings and console output.
2. **AES-256-GCM Authenticated Encryption (SEC-9C-01 Compliant)**:
   - Uses Node.js `crypto` with `aes-256-gcm`.
   - Generates a unique cryptographically random 12-byte initialization vector (`iv`) per backup.
   - Computes a 16-byte authentication tag (`authTag`) ensuring ciphertext authenticity and detecting tampering.
   - Envelopes are formatted as `RG_KEDIA_ENCRYPTED_BACKUP_V1`.
3. **Strict 256-Bit Hexadecimal Key Enforcement (SEC-9C-01)**:
   - `BACKUP_ENCRYPTION_KEY` MUST be a cryptographically random 256-bit key represented as exactly **64 hexadecimal characters**.
   - **Prohibition of Passphrases**: Arbitrary text passphrases are strictly rejected by `deriveKeyBuffer` to eliminate offline dictionary and GPU-accelerated brute-force vulnerabilities.
   - **Administrator Key Generation Instructions**:
     - Linux / macOS:  `openssl rand -hex 32`
     - Node.js CLI:    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
     - PowerShell:     `[Convert]::ToHexString((New-Object byte[] 32 | ForEach-Object { [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($_); $_ }))`
   - **Secure Offline Key Preservation**: Keys must be stored in the institution's secure password manager / hardware security vault, configured as a GitHub Actions secret (`BACKUP_ENCRYPTION_KEY`), and never committed to source control.
4. **Artifact Upload Security Guard**:
   - The CI workflow verifies that zero unencrypted `.json` dumps exist in `backups/` before invoking `actions/upload-artifact`. If an unencrypted file is found, the workflow fails closed immediately.

### B. Integrity Verification Protocol
Every backup generated by `npm run backup:create` undergoes a multi-layer verification check (`npm run backup:verify`):
1. **File Existence & Non-Zero Size**: File must exist and exceed 0 bytes.
2. **Companion Checksum Match**: Verifies file against companion `.sha256` digest.
3. **Cryptographic Tag Verification**: For encrypted envelopes, validates AES-256-GCM authentication tag.
4. **Structural Schema Check**: Verifies `RG_KEDIA_BACKUP_V1` header, version `1.0.0`, and presence of all 10 core tables (`User`, `Book`, `BookCover`, `BookProgram`, `BookCopy`, `Lending`, `BookRequest`, `ExamPaper`, `Notification`, `AuditLog`).
5. **Data Payload Checksum**: Recomputes SHA-256 of the data payload and verifies match with `metadata.checksum`.
6. **Record Count Reconciliation**: Verifies that array length of each table matches `metadata.recordCounts`.

### C. Concurrency Guard & Atomic File Writes (DR-9C-03)
1. **Concurrency Lock**: The backup engine implements a filesystem lock (`backups/.backup.lock`). If another process is currently executing a backup, subsequent invocations fail with `CONCURRENT_BACKUP_BLOCKED`. Stale locks older than 30 minutes are automatically cleared.
2. **Atomic File Writing (DR-9C-03)**: To eliminate partial or corrupted file artifacts, backup files are written to a unique collision-resistant temporary file (`<filename>.<pid>.<timestamp>.tmp`) on the target filesystem and flushed before being atomically renamed (`fs.renameSync`) to the final destination. Failed writes automatically purge temporary files.

### D. Atomic Transactional Restoration (DR-9C-02)
Restoration operations are 100% transactional. All table cleanups (`deleteMany`) and subsequent repopulations (`createMany` / `create`) are executed inside a single atomic `prisma.$transaction` block with a 60-second execution window. If a network interruption, constraint violation, or count reconciliation mismatch occurs during restoration, the entire transaction rolls back automatically, guaranteeing that pre-existing database records remain completely intact.

---

## 5. Retention & Rotation Policy

1. **Local Backups (`backups/`)**:
   - The directory is ignored by Git (`backups/*` in `.gitignore`).
   - Retains the most recent 7 daily backups.
   - Deletion rules strictly forbid deleting the last known valid backup.
2. **Remote CI Artifacts**:
   - Artifacts expire automatically after **7 days** (`retention-days: 7` in `backup.yml`).
3. **Neon Snapshots**:
   - The single available free manual snapshot should be created before major schema upgrades and overwritten only after verifying the new schema.

---

## 6. Disaster Recovery Runbook (Step-by-Step Execution)

> [!CAUTION]
> **Production Restoration Warning**: Production database restoration must **never** be automated. It must always remain an explicitly authorized manual operation executed by the primary administrator.

### Scenario A: Short-Term Incident (< 6 Hours Ago)
*Use Case: Accidental mass record deletion, bad migration script, or data corruption occurred within the last 6 hours.*

1. **Identify Timestamp**:
   Determine the exact UTC timestamp immediately before the incident occurred (e.g., `2026-10-24T14:30:00Z`).
2. **Execute Neon Time-Travel Restore**:
   - In Neon Console (or via Neon CLI / MCP):
     - Navigate to Project -> **Branches** -> `production`.
     - Select **Restore from history** -> **Time Travel**.
     - Specify the target timestamp or LSN.
     - Complete restore. Both the restored branch and backup branch become separate root branches.
   - Alternatively, create a recovery branch from the timestamp:
     ```bash
     neon branch create --project-id <project-id> --name recovery-branch --parent production --timestamp "2026-10-24T14:30:00Z"
     ```
3. **Verify Database Sanity**:
   Run smoke checks against the recovered branch.
4. **Switch Compute / Connection String**:
   Update application deployment environment variable `DATABASE_URL` to point to the recovered branch endpoint.

---

### Scenario B: Catastrophic Loss / Point-in-Time Window Expired (> 6 Hours Ago)
*Use Case: Database was destroyed, corrupted beyond 6 hours, or project was recreated.*

#### Step 1: Declare Incident & Lock System
- Place application in maintenance mode (`DEMO_MODE=false`, suspend client traffic) to prevent concurrent writes.

#### Step 2: Retrieve Latest Valid Backup Artifact
- Download the latest encrypted backup artifact from GitHub Actions (`rg-kedia-db-backup-<run_id>.zip`) or local `backups/` archive.
- Extract the archive to locate:
  - `backup-YYYY-MM-DDTHH-MM-SS.enc.json`
  - `backup-YYYY-MM-DDTHH-MM-SS.enc.json.sha256`

#### Step 3: Verify Backup Integrity
Run the verification CLI utility with the encryption key:
```bash
BACKUP_ENCRYPTION_KEY="<your-secure-key>" npm run backup:verify -- --file=backups/backup-YYYY-MM-DDTHH-MM-SS.enc.json
```
Ensure output states:
`✅ VERIFICATION RESULT: VALID & READABLE`

#### Step 4: Prepare Isolated Recovery Database
- Create a clean PostgreSQL database (or Neon branch).
- Apply migrations:
  ```bash
  DATABASE_URL="<recovery_db_url>" npx prisma migrate deploy
  ```

#### Step 5: Execute Controlled Restoration
1. First, run a **Dry Run** to validate without mutating data:
   ```bash
   DATABASE_URL="<recovery_db_url>" BACKUP_ENCRYPTION_KEY="<your-secure-key>" npm run backup:restore -- --file=backups/backup-YYYY-MM-DDTHH-MM-SS.enc.json --dry-run
   ```
2. Execute the actual restoration with `--confirm`:
   ```bash
   DATABASE_URL="<recovery_db_url>" BACKUP_ENCRYPTION_KEY="<your-secure-key>" npm run backup:restore -- --file=backups/backup-YYYY-MM-DDTHH-MM-SS.enc.json --confirm
   ```

#### Step 6: Post-Restoration Sanity & Smoke Testing
- Verify row counts match metadata:
  ```bash
  DATABASE_URL="<recovery_db_url>" node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); Promise.all([p.user.count(), p.book.count()]).then(([u,b]) => { console.log('Users:', u, 'Books:', b); p.\$disconnect(); });"
  ```
- Run integration smoke tests against the restored database:
  ```bash
  TEST_DATABASE_URL="<recovery_db_url>" ALLOW_TESTS=true npm run test:auth
  ```

#### Step 7: Application Switchover
- Update the production hosting provider's `DATABASE_URL` environment secret to point to the restored database endpoint.
- Restart application web services.
- Verify health check endpoint: `curl -f https://<app-domain>/api/health`.
- Resume normal library operations.

---

## 7. Automated CLI Commands Reference

| Command | Description | Flags |
| :--- | :--- | :--- |
| `npm run backup:create` | Creates a full database backup archive | `--encrypt`, `--outDir=<path>`, `--validate` |
| `npm run backup:verify` | Validates file integrity, checksum, and structure | `--file=<path>` |
| `npm run backup:restore` | Restores backup into target database | `--file=<path>`, `--confirm`, `--dry-run` |
| `npm run test:backup` | Runs automated backup & recovery regression suite | `--allow-tests` |
