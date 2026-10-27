# R.G. Kedia College of Commerce — Student Roster Import Guide

This guide provides operational runbooks and specifications for importing official college student rosters into the RG-Kedia Library Management System.

---

## 1. Overview & Capabilities

The Student Roster Import facility enables library administrators to onboard entire cohorts of students from an Excel-exported CSV spreadsheet.

### Key Capabilities & Guarantees
- **RFC 4180 Compliant Parsing**: Full support for quoted values, embedded commas, newlines, and UTF-8 Byte Order Marks (BOM).
- **Academic Consistency Enforcement**: Automatically validates Osmania University / college degree programs (`BCOM`, `BBA`, `BSC`), academic year-to-semester mappings (Year 1: Sem 1–2, Year 2: Sem 3–4, Year 3: Sem 5–6), and approved second languages (`TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI`).
- **High-Entropy Password Generation**: Generates cryptographically secure, unique 16-character temporary passwords per student. Passwords are immediately hashed with `bcryptjs` (salt factor 10). Plaintext passwords are never stored in the database.
- **Mandatory Password Change**: Sets `mustChangePassword: true` on all newly imported accounts, prompting students to set a private password on their first login.
- **Dry-Run Preview**: Non-destructive preview mode (`--dry-run`) validates file structure, academic rules, and database conflicts without making any database changes.
- **PostgreSQL Advisory Locking**: Uses `pg_advisory_xact_lock(hashtext('import:student_roster'))` to serialize concurrent imports and prevent race conditions.
- **Atomic Transactions & Guaranteed Rollback**: All student account insertions and the corresponding audit log entry execute within a single database transaction. If any record fails, the entire batch rolls back completely.
- **Pre-Transaction Credential Staging**: Credential export files are validated, exclusively created (`wx` flag), and staged *before* student accounts are committed to ensure recoverable credentials survive application crashes. If database writes fail, the staging file is cleaned up automatically.
- **Overwrite Protection**: The importer strictly refuses to overwrite existing credential export files to prevent catastrophic loss of previous cohort passwords.
- **Production Guardrails**: In production (`NODE_ENV=production`), live imports require the explicit `--confirm` flag to prevent accidental execution.

---

## 2. CSV Specification & Header Mapping

### Column Definitions

| Column Name | Required | Accepted Header Variants | Allowed Values / Format | Example |
| :--- | :---: | :--- | :--- | :--- |
| **Name** | **YES** | `Name`, `StudentName`, `Full_Name`, `FullName` | Minimum 2 characters | `Ananya Reddy` |
| **RollNumber** | **YES** | `RollNumber`, `Roll_Number`, `RollNo`, `Roll_No`, `HallTicketNo`, `Roll` | OU format (`1052-YY-PPP-NNN`), 10-12 digits, `RGK` prefix, or alphanumeric | `1052-24-401-001` |
| **Email** | **YES** | `Email`, `EmailID`, `Email_Id`, `StudentEmail` | Standard RFC email format | `ananya.reddy@rgkedia.edu.in` |
| **Program** | **YES** | `Program`, `Course`, `Degree` | `BCOM`, `BBA`, `BSC` | `BCOM` |
| **Branch** | NO | `Branch`, `Stream`, `Specialization` | Alphanumeric string | `Computer Applications` |
| **Year** | NO | `Year`, `ClassYear`, `AcademicYear` | Integer: `1`, `2`, or `3` | `1` |
| **Semester** | NO | `Semester`, `Sem` | Integer: `1`, `2`, `3`, `4`, `5`, or `6` | `1` |
| **SecondLanguage** | NO | `SecondLanguage`, `Second_Language`, `Language`, `SecLang` | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` | `TELUGU` |
| **Phone** | NO | `Phone`, `PhoneNumber`, `Mobile`, `MobileNo`, `Contact` | 10-digit Indian mobile starting with 6–9 | `9849012345` |

### Academic Consistency Matrix

| Program | Year | Valid Semesters | Allowed Second Languages |
| :--- | :---: | :---: | :--- |
| **BCOM** | 1 | 1, 2 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BCOM** | 2 | 3, 4 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BCOM** | 3 | 5, 6 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BBA** | 1 | 1, 2 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BBA** | 2 | 3, 4 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BBA** | 3 | 5, 6 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BSC** | 1 | 1, 2 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BSC** | 2 | 3, 4 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |
| **BSC** | 3 | 5, 6 | `TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI` |

---

## 3. Microsoft Excel Export Instructions

1. Open the student master list in **Microsoft Excel**.
2. Verify that column headers match the accepted names listed in Section 2 (e.g. `Name`, `RollNumber`, `Email`, `Program`, `Branch`, `Year`, `Semester`, `SecondLanguage`, `Phone`).
3. Click **File** > **Save As**.
4. In the "Save as type" dropdown, select:
   **CSV UTF-8 (Comma delimited) (*.csv)**
5. Save the file in a secure local folder (outside the git repository).

---

## 4. Operational Runbook

### Step 1: Pre-Flight Dry-Run Preview
Always run a dry run first to validate the spreadsheet without creating accounts or modifying the database:

```bash
npm run roster:import -- --file="C:/secure_imports/roster_bcom_2026.csv" --dry-run
```

The tool will output:
- Total rows parsed
- Valid records detected
- Duplicates within the file (if any)
- Records already registered in the library database
- Projected accounts to create

### Step 2: Live Production Import
Once the dry-run passes cleanly, execute the import with the `--execute` flag. In production, also provide `--confirm`:

```bash
npm run roster:import -- \
  --file="C:/secure_imports/roster_bcom_2026.csv" \
  --execute \
  --confirm \
  --credentials-out="C:/secure_credentials/roster_credentials_2026.json"
```

> [!IMPORTANT]
> The `--credentials-out` path **MUST** reside outside the repository directory. The importer strictly blocks and rejects any output path pointing inside the Git workspace to prevent credential leaks.

---

## 5. Security & Plaintext Credential Handling

### Plaintext at Rest Disclosure
- The exported credential file (`.json` or `.csv`) contains **plaintext temporary passwords** generated for each newly enrolled student.
- While the file is written with restrictive POSIX permissions (`0o600` — readable and writable only by the executing OS account), **this permission does NOT encrypt the file contents**.
- Anyone with administrative access to the physical machine, unencrypted storage drive, or OS user session can read the plaintext passwords.

### Mandatory Operational Protocols
1. **Encrypted Storage Destination**:
   - The `--credentials-out` path must always point to an encrypted filesystem (e.g. BitLocker on Windows, FileVault on macOS, or LUKS on Linux) on an access-controlled operator workstation.
   - Never export credentials to shared network drives, public desktop folders, or unencrypted USB drives.
2. **Access Restriction**:
   - Access to the credentials file must be restricted strictly to the designated Chief Librarian or authorized admissions officer.
3. **Secure Distribution**:
   - Distribute temporary passwords to students individually during in-person orientation or via authenticated college communication channels.
   - Advise students that the temporary password will trigger a mandatory password reset prompt on first login.
4. **Secure Disposal After Onboarding**:
   - Once all temporary credentials have been distributed to the cohort, securely delete or shred the credential export file (`srm`, `shred`, or secure delete). Do not archive plaintext credential files permanently.

### Crash-Window Analysis & Orphan Staging File Handling
To guarantee that no student account is ever committed without a recoverable record of their temporary password:
1. The engine writes temporary credentials to a staging file (`<path>.stage.<pid>.<timestamp>.<nonce>`) using the exclusive `wx` filesystem flag *before* the database transaction commits.
2. If the database transaction fails or is aborted, the staging file is deleted automatically.
3. If the application process terminates unexpectedly (e.g., `SIGKILL`, Node.js unhandled exception, OOM killer, or process interruption) immediately after the database commit but before promotion:
   - The student accounts exist in PostgreSQL.
   - The temporary credentials remain preserved by the operating system in the `<path>.stage.*` file.
   - The operator can inspect the staging file, verify the student records, distribute the credentials, and rename or remove the file.
4. **Durability Scope & Power-Loss Disclosure**:
   - Pre-transaction staging is designed to preserve recoverable credentials following application-process termination, process crashes, and ordinary process interruptions, provided the operating system kernel and underlying storage system remain operational.
   - The current implementation relies on standard Node.js filesystem write buffers (`fs.writeFileSync`) and does **not** invoke synchronous disk flushes (`fsync` / `fdatasync`). Consequently, persistence is **not** guaranteed through sudden physical host power loss, bare-metal hardware failure, kernel panics, or storage-device failure occurring before the operating system flushes its dirty page cache to physical media.
   - If stronger physical power-loss durability is required by institutional compliance policies, explicit file and directory synchronization (`fsyncSync` on the file descriptor and enclosing directory) must be implemented and validated for the deployment filesystem.
5. If a database transaction aborts and the automated cleanup fails (e.g., due to an OS-level file lock), the importer prints a clear warning identifying the exact orphan staging path:
   ```text
   CLEANUP_FAILED: Database transaction rolled back, but could not delete staged credential file at "<path>". Please remove this orphan staging file manually: <reason>
   ```
   In this scenario, the operator must manually delete the orphan file.

---

## 6. Troubleshooting & Error Codes

| Error Code | Cause | Resolution |
| :--- | :--- | :--- |
| `CREDENTIAL_DESTINATION_EXISTS` | The target file specified in `--credentials-out` already exists. | Choose a new, non-existent destination file path to prevent overwriting previous credentials. |
| `CREDENTIAL_STAGE_FAILED` | Target directory is unwritable, disk is full, or permissions denied during staging. | Check folder permissions and disk space on the target drive. Zero database writes were performed. |
| `MISSING_REQUIRED_HEADERS` | CSV header row is missing one or more required columns (`Name`, `RollNumber`, `Email`, `Program`). | Add or rename header columns according to Section 2. |
| `DUPLICATE_ROLL_NUMBER_IN_FILE` | The same roll number appears on two or more rows in the CSV. | Remove duplicate student entries from the CSV. |
| `DUPLICATE_EMAIL_IN_FILE` | The same email address appears on two or more rows in the CSV. | Ensure each student has a unique email. |
| `ACADEMIC_YEAR_SEMESTER_MISMATCH` | Year and semester do not align (e.g. Year 1 with Semester 4). | Correct either the year or semester column for the flagged row. |
| `INVALID_PROGRAM` | Program is not `BCOM`, `BBA`, or `BSC`. | Update degree program to one of the approved college codes. |
| `ROSTER_IMPORT_CONFIRMATION_REQUIRED` | Live execution attempted in production without `--confirm`. | Add `--confirm` flag to acknowledge intentional execution. |
| `CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN` | `--credentials-out` specifies a path inside the git repository. | Choose a secure external path (e.g. `C:/secure_credentials/`). |
| `NO_ACTIVE_LIBRARIAN` | No active librarian account exists to attribute the audit log event. | Run the initial librarian bootstrap CLI first. |
