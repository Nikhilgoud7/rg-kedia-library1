# RG-Kedia Library Management System — Automated Regression Suite

Permanent automated regression test suite designed to verify authentication, role-based authorization, lending lifecycle policies, PostgreSQL advisory lock concurrency, and notification workflows.

---

## 1. Safety Guarantees & Non-Destructive Operation

The test suite includes strict safety controls to prevent accidental damage to data or leakage of credentials:

1. **Explicit Permission Guard**: Tests will **refuse to run** unless invoked with `--allow-tests` or with `ALLOW_TESTS=true` set in the environment.
2. **Production Blocker**: Running with `NODE_ENV=production` immediately halts execution and aborts all tests.
3. **Synthetic Persona Isolation**: All test users, books, copies, lendings, requests, and notifications are generated with unique random prefixes (`reg_<hex>`) and synthetic email domains (`*.example.test`). Real or seeded user accounts are **never** modified or deleted.
4. **Guaranteed Cleanup**: Every test suite runs inside a `try ... finally` block managed by `TestDataManager`, which cleans up all generated synthetic records even if an assertion fails.
5. **Zero Secret Exposure**: Passwords, hashes, JWT tokens, session cookies, `tokenVersion`, and account security fields are strictly redacted and never logged. The API client includes automated recursive secret scanners (`findLeakedSecrets`) that assert responses do not expose sensitive internal attributes.

---

## 2. Test Commands

### Run Full Regression Suite
```bash
npm test
```
*(Runs all 5 test suites sequentially against the server and prints a formatted summary table).*

### Run Individual Test Suites
```bash
# Authentication & Session Revocation (Step 3)
npm run test:auth

# Role Authorization Matrix (Step 4)
npm run test:authorization

# Lending Lifecycle & Policies (Step 5)
npm run test:lending

# PostgreSQL Concurrency & Advisory Locks (Step 6)
npm run test:concurrency

# Notification & Alert Workflows (Step 7)
npm run test:notification
```

### Custom Options
```bash
# Target custom port
node tests/runner.js --allow-tests --port=5001

# Run specific suite directly
node tests/runner.js --allow-tests --suite=lending
```

---

## 3. Test Suites Overview

### `tests/suites/auth.test.js`
- Valid credential authentication (email & roll number).
- Invalid password rejection (`HTTP 401`).
- Inactive user rejection (`HTTP 401`).
- Protected endpoint rejection without authentication (`HTTP 401`).
- Invalid/forged JWT signature rejection (`HTTP 401`).
- Session revocation on logout (`POST /api/auth/logout`).
- Session revocation on password change (`POST /api/auth/change-password`).
- `tokenVersion` counter invalidation.
- Sensitive credential exposure checks (zero leaked secrets).

### `tests/suites/authorization.test.js`
- Role authorization matrix across `STUDENT`, `TEACHER`, and `LIBRARIAN`.
- Students forbidden from librarian-only endpoints (`/api/admin/users`, `/api/admin/dashboard`, `/api/books` create, `/api/auth/register`, `/api/lending/requests`).
- Students forbidden from teacher-only endpoints (`/api/lending/request-return`).
- Teachers forbidden from librarian-only endpoints (`/api/admin/users`, `/api/admin/dashboard`).
- Librarians retain full administrative capabilities.
- Prevention of privilege escalation via profile updates (e.g. attempting to change `role`, `id`, `active`, or `tokenVersion`).
- Cross-user data isolation (users cannot view another user's borrowings, requests, or profile).
- Borrower identity masking in public book details (`/api/books/:id` masks borrower names for student users).

### `tests/suites/lending.test.js`
- Borrow request creation (`POST /api/lending/request-borrow`).
- Prevention of duplicate pending borrow requests for the same book (`HTTP 400`).
- Ten-book student limit enforcement (active loans + pending requests capped at 10; 11th request rejected with `HTTP 400`).
- 30-day loan duration verification (`dueDate = issuedDate + 30 days`).
- Zero monetary fine policy verification (`fine === 0`).
- Single-renewal policy restriction (first renewal succeeds, second renewal rejected with `HTTP 400`).
- Overdue book renewal restriction (`HTTP 400`).
- Renewal blocked when pending return request exists (`HTTP 400`).
- Self-cancellation of pending borrow requests by borrower (`HTTP 200`).
- Unauthorized request cancellation prevention (`HTTP 404/403`).
- Teacher return-request workflow (`POST /api/lending/request-return/:id`).
- Librarian approval and rejection workflows.
- Return processing and physical copy status restoration.

### `tests/suites/concurrency.test.js`
- 10 parallel borrow requests for same book by one user (PostgreSQL advisory lock ensures exactly 1 succeeds, 9 return `HTTP 400`).
- 2 parallel approvals for one request (conditional update and transaction ensure exactly 1 succeeds, 1 returns conflict).
- 2 students requesting the last available copy approved in parallel (exactly 1 succeeds, 1 rejected with `HTTP 400`, `availableCopies` stays 0 and never becomes negative).
- 2 parallel renewals on same loan (exactly 1 succeeds, `renewalCount` stays 1).
- 2 parallel returns on same loan (exactly 1 succeeds, 1 returns conflict).
- Database-wide read-only consistency checks:
  1. 0 active lendings with un-issued copies.
  2. 0 issued copies without active lendings.
  3. 0 users with duplicate active lendings for the same book.
  4. 0 duplicate pending requests per user and book.

### `tests/suites/notification.test.js`
- Lazy alert generation for due-soon loans (`<= 3` days remaining, type `WARNING`).
- Lazy alert generation for overdue loans (type `OVERDUE`).
- Deep-link formatting verification (`?dueSoon=...`, `?overdue=...`).
- Duplicate notification prevention on repeated fetches.
- Notification read status update (`PUT /api/lending/notifications/:id/read`).
- Mark-all-read operation (`PUT /api/lending/notifications/read-all`).
- Soft-dismissal behavior (deleting `OVERDUE` or `WARNING` alerts sets `dismissedAt` for audit trail rather than hard deletion).
- Hard deletion of generic `INFO` notifications.

---

## 4. Architecture & Helpers

- **`tests/runner.js`**: Central orchestration script that manages environment checks, server lifecycle, suite execution, timing, and formatted results reporting.
- **`tests/helpers/envGuard.js`**: Environment verification ensuring safe execution parameters and live database connectivity.
- **`tests/helpers/apiClient.js`**: Stateful HTTP client with automatic cookie handling (`rg_kedia_token`) and recursive leaked secret auditing.
- **`tests/helpers/testData.js`**: Factory class for creating synthetic accounts, books, copies, lendings, requests, and notifications with guaranteed cascade cleanup.
