# Synthetic User Cohort Validation & Secure Credential Generator

**Phase 9D Runbook & Architectural Specification**
*RG-Kedia College of Commerce — Library Management System*

---

## 1. Executive Summary

Phase 9D delivers an enterprise-grade synthetic user cohort validation engine and secure credential generator. The module allows staging environments, load drills, and integration tests to safely create and validate large batches of synthetic users while enforcing strict security and privacy standards:
1. **Repository Boundary Enforcement**: Generated test credentials can **never** be saved inside the repository root. Any attempt to write within `process.cwd()` or subdirectories fails closed immediately with `CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN`.
2. **DPDP Compliance & Zero PII Leakage**: Summary reports, audit records, and console outputs contain aggregated statistics only. Plaintext passwords, hashes, and personal identifiers are strictly omitted from logs.
3. **High-Entropy Password Generation**: 16-character cryptographically uniform random passwords with character diversity (uppercase, lowercase, numbers, symbols) complying strictly with bcrypt's 72-byte truncation limit.
4. **Mandatory First-Login Password Change**: All generated synthetic credentials enforce `mustChangePassword: true`, requiring accounts to establish a new password before accessing library resources.
5. **Academic Consistency Matrix**: Rigorous cross-field validation rules (Year 1: Sem 1–2, Year 2: Sem 3–4, Year 3: Sem 5–6) with roll number format verification and intra-cohort duplicate checking.

---

## 2. Architecture & Directory Layout

```
server/lib/cohort/
├── types.ts                # TypeScript types, role definitions, academic maps, interfaces
├── credentialGenerator.ts  # Boundary validator, password generator, envelope serializer
├── cohortValidator.ts      # Multi-format parser, academic rules engine, DB conflict checker
├── syntheticGenerator.ts   # Synthetic cohort generator & test database seed/cleanup helpers
└── index.ts                # Module export barrier

scripts/
├── validateCohort.ts       # CLI utility for synthetic cohort validation
└── generateCredentials.ts  # CLI utility for generating credentials outside the repository

tests/suites/
└── syntheticCohort.test.js # 74-assertion automated regression test suite
```

---

## 3. Security Invariants & Safeguards

### 3.1 Repository Boundary Enforcement (`SEC-9D-01`)
The function `validateCredentialOutputPath(targetPath, repoRoot)` computes:
```ts
const relative = path.relative(resolvedRepo, resolvedTarget);
const isInsideOrEqual = !relative.startsWith('..') && !path.isAbsolute(relative);
if (isInsideOrEqual) {
  throw new Error('CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN: Credential output path must be outside the repository root.');
}
```
- Fails closed on relative paths inside repo (e.g. `./credentials.json`, `dist/credentials.json`).
- Fails closed if pointing to repo root itself.
- Only permits paths resolving strictly outside the repository (e.g. in `os.tmpdir()` or parent directories).

### 3.2 Overwrite Protection & File Permissions (`SEC-9D-02`)
- If the target file already exists, credential generation fails closed with `CREDENTIAL_OUTPUT_EXISTS` unless explicit `--overwrite` or `{ overwrite: true }` is provided.
- Output file mode is set to `0o600` (read/write only by file owner).

### 3.3 Zero Secret Exposure (`SEC-9D-03`)
- CLI execution outputs file size, destination path, and record counts only.
- Passwords, hashes, and secret tokens are never written to `stdout`, `stderr`, or server log streams.
- Return envelopes on programmatic APIs contain metadata only.

---

## 4. Academic Consistency Matrix

| Degree Program | Academic Year | Valid Semesters | Allowed Roles | Roll Number Pattern |
|---|---|---|---|---|
| `BCOM` | Year 1 | Semester 1, 2 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BCOM` | Year 2 | Semester 3, 4 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BCOM` | Year 3 | Semester 5, 6 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BBA`  | Year 1 | Semester 1, 2 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BBA`  | Year 2 | Semester 3, 4 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BBA`  | Year 3 | Semester 5, 6 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BSC`  | Year 1 | Semester 1, 2 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BSC`  | Year 2 | Semester 3, 4 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| `BSC`  | Year 3 | Semester 5, 6 | `STUDENT` | `^\d{10,12}$` or `^RGK\d{4,8}$` |
| N/A    | N/A    | N/A           | `TEACHER`, `LIBRARIAN` | Forbidden (must be null/empty) |

---

## 5. CLI Usage & Commands

### 5.1 Validate Synthetic Cohort
```bash
# Basic validation of CSV or JSON cohort file
npm run cohort:validate -- --file=/path/to/cohort.csv

# Validation with live database conflict checking
npm run cohort:validate -- --file=/path/to/cohort.json --check-db

# Output machine-readable JSON summary report
npm run cohort:validate -- --file=/path/to/cohort.json --json
```

### 5.2 Generate Synthetic Test Credentials
```bash
# Dry run to verify parameters and output boundary
npm run credentials:generate -- --dry-run

# Generate credentials to secure external location
npm run credentials:generate -- --out="../external-credentials/cohort.json" --students=20 --teachers=3 --librarians=1

# Generate CSV format with overwrite enabled
npm run credentials:generate -- --out="../external-credentials/cohort.csv" --format=csv --overwrite
```

### 5.3 Automated Regression Tests
```bash
# Execute Phase 9D dedicated test suite (74 assertions)
npm run test:cohort

# Execute full regression test suite (1,547 assertions across 31 suites)
npm test
```
