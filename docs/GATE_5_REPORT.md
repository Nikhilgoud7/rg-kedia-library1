# RG-Kedia Library Management System — Milestone Gate 5 Report
## Stage 5: Reports & Analytics, Inventory Condition & Delinquency Governance

---

### Executive Summary

Milestone **Gate 5** marks the formal architectural closure and operational verification of **Stage 5 (Reports & Analytics)** for the RG-Kedia Library Management System. Across six sub-phases (**Phases 10A through 10F**), the system has established:
1. **Circulation & Trend Analytics Engine**: Grouped circulation aggregation across daily, weekly, and monthly intervals with net circulation metrics and deterministic tie-breaking top-borrowed rankings.
2. **Delinquency Aging & Fine Reconciliation**: 4 non-overlapping calendar-day overdue tiers calculated at UTC midnight, deduplicated borrower tracking, zero-fine institutional policy compliance, and catalog loss/damage metrics.
3. **Inventory Condition & Reconciliation Analytics**: Strict active copy denominators excluding withdrawn materials, complete condition grade distribution, catalog shelf location coverage metrics, and audit-log drift tracking.
4. **Librarian Analytics Dashboard**: A responsive, 4-tab React dashboard with zero external chart library dependencies, built with accessible Tailwind CSS and Lucide icons, featuring date/program filtering and stale request protection.
5. **Spreadsheet Formula Injection Defense**: Comprehensive RFC 4180 CSV export sanitization neutralizing formula execution triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) with UTF-8 BOM prepending for cross-platform spreadsheet software.
6. **Performance Index Optimization & Deployment Readiness**: Four composite database indexes prepared in standard PostgreSQL Prisma DDL without production schema disruption.

All implementations strictly adhere to the project's foundational governance rules: zero production data mutation, zero PII exposure, fail-closed RBAC access control, strict separation of verified facts from unverified capabilities, and complete regression test coverage.

---

### Stage 5 Sub-Phase Deliverables Matrix

| Sub-Phase | Focus Area | Key Architectural Deliverables | Permanent Suite | Assertions | Status |
|:---|:---|:---|:---|:---:|:---:|
| **Phase 10A** | Foundation & Circulation Analytics | Reporting service architecture (`server/services/reportingService.ts`), `GET /api/reports/circulation-summary`, `GET /api/reports/top-borrowed`, RFC 4180 CSV engine (`server/lib/reports/csvExport.ts`), formula injection neutralization, query validation (`server/lib/reports/validation.ts`). | `reportingFoundation.test.js` | 61 | Implemented & Verified |
| **Phase 10B** | Overdue, Aging & Fine Reconciliation | `GET /api/reports/overdue-loss`, 4-tier delinquency aging (1–7d, 8–14d, 15–30d, 31+d), UTC calendar day calculations, zero-monetary fines reconciliation disclosure, catalog loss/damage statistics, borrower PII masking. | `reportingOverdueLoss.test.js` | 72 | Implemented & Verified |
| **Phase 10C** | Inventory Condition & Shelf-Audit | `GET /api/reports/inventory-analytics`, active vs total copy denominators, condition grade distribution (Good, Fair, Poor, Damaged), catalog shelf location coverage, reconciliation drift analysis (`AuditLog`), physical shelf-audit limitation disclosure. | `reportingInventoryAnalytics.test.js` | 95 | Implemented & Verified |
| **Phase 10D** | Librarian Analytics Dashboard | React analytics dashboard (`client/src/pages/librarian/AnalyticsDashboard.tsx`), 4 tabs (`CirculationSummaryTab`, `TopBorrowedTitlesTab`, `OverdueAgingTab`, `InventoryConditionTab`), date/program filters, stale request protection, responsive layout. | `librarianAnalyticsUIWorkflow.test.js` | 95 | Implemented & Verified |
| **Phase 10E** | Final Quality Gate & Schema Alignment | Read-only audit, neutralized ambiguous UI labels (`Category Sum Reconciled`, `Delinquency exceeding 30 days`), added `BookCopy(bookId, status, condition)` index to `schema.prisma`, generated PostgreSQL migration DDL, verified 37 suites / 2009 assertions. | Full regression runner | 2,009 | Audited & Validated |
| **Phase 10F** | Documentation & Milestone Closure | Milestone Gate 5 report (`docs/GATE_5_REPORT.md`), updated build state (`docs/BUILD_STATE.md`), backup/restore readiness audit, deployment checklist, full verification of all 37 test suites. | All 37 regression suites | 2,009 | Ready for Approval |
| **TOTALS** | **Stage 5 Cumulative** | **4 Reporting APIs + 4 Dashboard Views + 4 Composite Indexes** | **4 New Suites** | **323 New (2009 Total)** | **GATE 5 PASSED** |

---

### Detailed Reporting API Specifications

All reporting endpoints require authentication and are strictly gated to users with the `LIBRARIAN` role. Requests from unauthenticated clients return `HTTP 401 Unauthorized`; requests from `STUDENT` or `TEACHER` accounts return `HTTP 403 Forbidden`.

#### 1. Circulation Summary API
- **Endpoint**: `GET /api/reports/circulation-summary`
- **Query Parameters**:
  - `startDate` (ISO-8601 string, required): Inclusive start date for loan issues and returns.
  - `endDate` (ISO-8601 string, required): Inclusive end date for loan issues and returns.
  - `period` (`DAILY` | `WEEKLY` | `MONTHLY`, optional, default: `DAILY`): Aggregation bucket interval.
  - `format` (`json` | `csv`, optional, default: `json`): Response serialization format.
- **Key Response Metrics**:
  - `totalIssued` (integer): Total number of loans created during the interval.
  - `totalReturned` (integer): Total number of loans returned during the interval.
  - `totalRenewals` (integer): Total number of loan renewal requests processed.
  - `netCirculation` (integer): Net volume difference (`totalIssued - totalReturned`).
  - `breakdown` (array): Bucket intervals containing `period`, `issuedCount`, `returnedCount`, `renewalCount`, and `netCirculation`.

#### 2. Top Borrowed Titles API
- **Endpoint**: `GET /api/reports/top-borrowed`
- **Query Parameters**:
  - `startDate` (ISO-8601 string, optional): Date window filter for loan creation.
  - `endDate` (ISO-8601 string, optional): Date window filter for loan creation.
  - `programId` (`BCOM` | `BBA` | `BSC`, optional): Filter titles mapped to specific academic program.
  - `limit` (integer, optional, range: 1–50, default: 10): Maximum titles returned.
  - `format` (`json` | `csv`, optional, default: `json`): Response serialization format.
- **Key Response Metrics**:
  - `titles` (array): Ordered list of books with `rank`, `id`, `title`, `author`, `isbn`, `programs`, `borrowCount`, and `currentlyIssuedCopies`.
  - Ties in `borrowCount` are deterministically broken by alphabetical order of book titles.

#### 3. Overdue & Loss Analytics API
- **Endpoint**: `GET /api/reports/overdue-loss`
- **Query Parameters**:
  - `asOfDate` (ISO-8601 string, optional, default: current UTC timestamp): Point-in-time reference.
  - `startDate` / `endDate` (ISO-8601 strings, optional): Historical filtering window.
  - `programId` (`BCOM` | `BBA` | `BSC`, optional): Academic program filter.
  - `format` (`json` | `csv`, optional, default: `json`): Response serialization format.
- **Key Response Metrics**:
  - `overdueSummary`: `totalOverdueLoans`, `affectedBorrowersCount` (deduplicated), `outstandingOverdueCopiesCount`.
  - `agingDistribution`: 4 strict non-overlapping day buckets:
    - Tier 1: `1–7 Days` (`tier1To7Days`)
    - Tier 2: `8–14 Days` (`tier8To14Days`)
    - Tier 3: `15–30 Days` (`tier15To30Days`)
    - Tier 4: `31+ Days` (`tier31PlusDays`)
  - `fineReconciliation`:
    - `finePolicy`: `ZERO_MONETARY_FINES` (RG-Kedia College policy).
    - `policyCompliant`: `null` (Truthful disclosure: unverified due to lack of authoritative database config table).
    - `authoritativeConfigFound`: `false`.
    - `totalFinesAssessed`: `₹0`.
    - `totalFinesCollected`: `₹0`.
    - `totalFinesOutstanding`: `₹0`.
  - `lossAndDamageSummary`: Tracks current `totalLostCopies` and `totalDamagedCopies` as well as historical audit events. Explicitly documents `replacementHistoryStatus.supportedBySchema: false`.

#### 4. Inventory Condition & Shelf Analytics API
- **Endpoint**: `GET /api/reports/inventory-analytics`
- **Query Parameters**:
  - `startDate` / `endDate` (ISO-8601 strings, optional): Historical audit interval.
  - `programId` (`BCOM` | `BBA` | `BSC`, optional): Academic program filter.
  - `format` (`json` | `csv`, optional, default: `json`): Response serialization format.
- **Key Response Metrics**:
  - `inventoryCondition`:
    - `eligibleActiveCopiesCount`: Copies currently part of the active inventory (excludes `WITHDRAWN`).
    - `withdrawnCopiesCount`: Physical copies formally withdrawn from catalog stock.
    - `totalAllCopiesCount`: Sum of eligible active copies and withdrawn copies.
    - `conditionDistribution`: Breakdown across `Good`, `Fair`, `Poor`, and `Damaged`.
    - `reconciliationSummary.isFullyReconciled`: `true` (confirms category counts mathematically sum to eligible active copy count).
  - `shelfAudit`:
    - `physicalObservationsRecorded`: `false` (Truthful disclosure: database tracks static catalog shelf location, not live physical audit scans).
    - `catalogLocationSummary`: `shelfLocationCoveragePercentage`, `copiesWithShelfLocationCount`, `copiesWithoutShelfLocationCount`, `distinctShelfLocationsCount`.
  - `reconciliationDrift`:
    - `reconciliationEventsCount`, `reconciledBooksCount`, `netTotalCopiesDrift`, `netAvailableCopiesDrift`, `zeroDriftAuditsCount`, `unparseableAuditLogsCount`.

---

### Librarian Dashboard UI Architecture

Mounted at `/librarian/analytics`, the dashboard provides an interface for institutional librarians:

1. **Circulation Summary Tab**:
   - Interval controls: `DAILY`, `WEEKLY`, `MONTHLY`.
   - StatCards: Total Issued Loans, Total Returned Loans, Processed Renewals, Net Circulation Indicator.
   - Stacked visual bar chart showing issue/return balance.
   - Comprehensive breakdown table with CSV export.
2. **Top Borrowed Titles Tab**:
   - Ranking limit selector: Top 5, 10, 20, or 50 books.
   - Academic program badges (`BCOM`, `BBA`, `BSC`).
   - Visual relative borrow frequency bars.
   - Direct CSV download for curriculum planning.
3. **Overdue & Aging Analytics Tab**:
   - Primary metrics: Active Overdue Loans, Affected Borrowers, Overdue Physical Copies, Severe Overdue (31+ Days).
   - 4-Tier Delinquency Cards with percentage of overdue volume.
   - Zero-fine institutional policy card with unverified compliance disclosure note.
   - Detailed overdue loans table (displaying borrower name and roll number; omitting private email, phone, and password).
4. **Inventory & Shelf Analytics Tab**:
   - StatCards: Eligible Active Inventory, Total Catalog Stock, Shelf Location Coverage.
   - Condition Grade Distribution (`Good`, `Fair`, `Poor`, `Damaged`) with `Category Sum Reconciled` badge.
   - Shelf location coverage overview with clear limitation disclosure explaining that live physical shelf scans require future hardware/table support.
   - Administrative stock reconciliation drift card derived from `AuditLog`.

---

### CSV Export Security & Formula Injection Protections

All four reporting endpoints support CSV export via `?format=csv` or the dedicated dashboard CSV download button.
- **Formula Injection Neutralization**:
  Any field beginning with dynamic formula triggers (`=`, `+`, `-`, `@`, `\t`, or `\r`), including values where triggers are preceded by whitespace, is prepended with an apostrophe `'` prior to serialization.
- **RFC 4180 Escaping**:
  Cells containing commas, quotation marks, or newlines are enclosed in double quotes with internal quotes doubled (`""`).
- **UTF-8 Byte Order Mark (BOM)**:
  Every generated CSV stream starts with `\uFEFF` (`0xEF 0xBB 0xBF`), ensuring seamless rendering in Microsoft Excel, LibreOffice, and Google Sheets without character encoding errors.
- **Data Minimization**:
  CSV exports strictly exclude credential hashes, session tokens, personal phone numbers, and private emails.

---

### Database Migration & Performance Index Architecture

To support reporting aggregations across expanding institutional catalogs, four composite indexes have been architected and scripted:

1. **`BookCopy(status)`**:
   - Index: `"BookCopy_status_idx"`
   - Purpose: Optimizes availability queries, inventory status grouping, and loan eligibility checks.
2. **`BookCopy(bookId, status, condition)`**:
   - Index: `"BookCopy_bookId_status_condition_idx"`
   - Purpose: Accelerates inventory condition breakdown and book copy condition joins.
3. **`Lending(issuedDate, status)`**:
   - Index: `"Lending_issuedDate_status_idx"`
   - Purpose: Eliminates sequential table scans during circulation date range aggregations.
4. **`Lending(dueDate, status)`**:
   - Index: `"Lending_dueDate_status_idx"`
   - Purpose: Optimizes overdue aging queries filtering by `dueDate < NOW()` and `status = 'ISSUED'`.

#### Migration Script
- File: `prisma/migrations/20261025120000_add_reporting_indexes/migration.sql`
- Compatibility: Compatible with PostgreSQL / Neon Serverless. Standard `CREATE INDEX` statements execute within Prisma's migration transaction block without conflicting with PostgreSQL transaction constraints.

---

### Known Limitations & Truth-in-Capability Disclosures

1. **Physical Shelf-Audit Observations**:
   - *Limitation*: The system records static `shelfLocation` on `BookCopy` (e.g., "Rack A-1"), but does not have tables or hardware integration for recording physical shelf audit scans or misplaced copy detection.
   - *Status*: Truthfully disclosed in UI and API (`physicalObservationsRecorded: false`, `misplacedCopiesDetectable: false`).
2. **Authoritative Fine Policy Configuration**:
   - *Limitation*: Software logic strictly enforces zero monetary fines. However, no database table (`SystemSettings` or `FinePolicy`) exists to dynamically configure or cryptographically verify policy rules.
   - *Status*: Truthfully disclosed as `policyCompliant: null` and `authoritativeConfigFound: false`.
3. **Replacement History Records**:
   - *Limitation*: When a physical copy is marked `LOST` or `DAMAGED`, newly procured replacements are added as distinct `BookCopy` entries. No dedicated `BookReplacement` link table tracks the procurement chain.
   - *Status*: Truthfully disclosed as `supportedBySchema: false`.
4. **Reconciliation Drift Scope**:
   - *Limitation*: Stock reconciliation drift is computed from administrative audit log adjustments (`action: 'INVENTORY_RECONCILED'`), capturing administrative count changes rather than physical shelf counts.
   - *Status*: Truthfully disclosed via descriptive limitation notes.

---

### Deployment Checklist for Staging & Production

Before applying the migration in production:
1. **Database Backup**: Execute verified pre-migration backup (`npm run backup:create -- --encrypt --validate`).
2. **Staging Migration**: Apply migration on an isolated staging or test branch using `npx prisma migrate deploy`.
3. **Index Verification**: Query `pg_indexes` to verify that all 4 indexes are registered and valid.
4. **Application Build**: Rebuild backend (`npm run build:server`) and frontend (`npm run build:client`).
5. **Smoke Testing**: Execute reporting smoke tests on staging endpoints.
6. **Rollback Plan**: Verify drop index script readiness (`DROP INDEX IF EXISTS ...`) if regression occurs.
7. **Production Execution**: Execute `npx prisma migrate deploy` on production Neon endpoint following authorized deployment window.
