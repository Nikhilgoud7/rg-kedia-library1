# R.G. Kedia College of Commerce — Library Management System
## Data Protection & Privacy Framework (DPDP Act 2023 Compliance Blueprint)

> **Document Status**: Institutional Policy Blueprint & Technical Specification<br>
> **Applicable Legislation**: Digital Personal Data Protection Act (DPDP Act), 2023 (India)<br>
> **Data Fiduciary**: R.G. Kedia College of Commerce (Management / Governing Body)<br>
> **Data Processor**: RG-Kedia Library Management System Infrastructure & Technical Administrators<br>
> **Legal Notice**: *This document details implemented technical mechanisms and proposes institutional policies. The existence of this technical framework does not, on its own, constitute legal compliance. Formal adoption by the college's governing body, appointment of a Data Protection Officer (DPO), and publication of official consent forms are required.*

---

## 1. Executive Summary & Purpose

The R.G. Kedia Library Management System operates as an on-premise/hybrid web application providing catalog discovery, circulation tracking, and academic repository access for students, teachers, and library staff.

Under the Digital Personal Data Protection Act (DPDP Act) 2023:
1. **The College** acts as the **Data Fiduciary**, determining the purpose and means of processing digital personal data.
2. **Students, Faculty, and Staff** are **Data Principals**, endowed with statutory rights regarding notice, access, correction, and erasure.
3. **The System Architecture** enforces **Data Minimization by Default**, processing only the minimal attributes necessary for library operations and educational governance.

---

## 2. Personal Data Inventory & Lawful Purpose

The system strictly avoids collecting high-risk personal data (e.g., biometrics, Aadhaar numbers, financial account details, personal home addresses, or location telemetry). Only the following categories are processed:

### A. Data Element Classification

| Category | Specific Attributes | Lawful Processing Purpose | Storage Mechanism | Access Control (RBAC) |
| :--- | :--- | :--- | :--- | :--- |
| **Identity & Authentication** | Full Name, College Email (`@student.rgkedia.edu.in` / `@rgkedia.edu.in`), Password Hash (bcrypt, 10 rounds) | Account creation, authentication, role assignment, and session security. | PostgreSQL `User` table (password is hashed, never stored raw). | Self (view/edit name), Librarian (create/deactivate/reset). Password is never readable by any role. |
| **Academic Registry** | Student Roll Number (Osmania University format, e.g., `1052-24-401-001`), Program (`BCOM`, `BBA`, `BSC`), Branch/Specialization, Academic Year, Semester | Determining circulation limits, syllabus-specific book recommendations, course material distribution. | PostgreSQL `User` table. | Self (read-only), Teachers (view enrolled students on copy checkout), Librarian (full administrative access). |
| **Language Preference** | Second Language (`TELUGU`, `SANSKRIT`, `ARABIC`, `HINDI`) | Curating elective textbooks and curriculum exam papers. | PostgreSQL `User` table. | Self (read-only), Librarian. |
| **Contact Telemetry** | Phone Number (optional string, 6–20 digits) | Overdue notifications, urgent return alerts for reserved books. | PostgreSQL `User` table. | Self (read/update/remove), Librarian. **Strictly masked from Teacher and Student views.** |
| **Circulation History** | Book ID, Copy Barcode, Borrow Date, Due Date, Return Date, Renewal Count, Loan Status | Tracking possession of public college property, managing loan queues, inventory reconciliation. | PostgreSQL `Lending`, `BookRequest` tables. | Self (own loans only), Teachers (view current holder roll number only), Librarian (full history). |
| **Notifications** | Alert Title, Message Text, Severity (`INFO`, `WARNING`, `OVERDUE`), Read Flag, Dismissal Timestamp | Communicating loan status, due-date warnings, and academic announcements. | PostgreSQL `Notification` table. | Self (own notifications only). |
| **Security Telemetry** | Session `tokenVersion`, Failed Login Attempts, Lockout Expiry, User IP & Agent (Audit Logs only) | Brute-force protection, distributed denial-of-service defense, administrative accountability. | PostgreSQL `User`, `AuditLog` tables. | System automated guards; Librarian (Audit Logs). Zero password or token data stored in audit logs. |

---

## 3. Data Minimization & Privacy by Design Architecture

The application implements structural technical controls to enforce privacy by default:

1. **Token-Driven Identity Enforcement**:
   - Identity is determined strictly from cryptographically signed, server-validated JWT tokens (`req.user.id`).
   - Client-supplied `userId` query/body parameters are discarded, eliminating Insecure Direct Object References (IDOR).
2. **Borrower Anonymization & Cross-Persona Masking**:
   - **Student Persona**: When browsing the catalog, students see book availability (`availableCopies`) but have **zero visibility** into who holds checked-out copies.
   - **Teacher Persona**: When inspecting book physical copies, teachers can view the borrower's `name` and `rollNumber` to facilitate academic copy recovery, but personal contact information (`phone`, `email`) is strictly stripped at the database query level (`select: { name: true, rollNumber: true }`).
3. **Zero Secret Leakage**:
   - Password hashes, `failedLoginAttempts`, `lockedUntil`, and `tokenVersion` are explicitly excluded from all JSON serialization pipelines.
   - Global automated regression test suites recursively inspect every API endpoint response to assert zero leakage of sensitive keys.
4. **Formula & Injection Neutralization**:
   - Any CSV or spreadsheet export neutralizing formula injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote (`'`), preventing remote code execution when opened in Microsoft Excel.

---

## 4. Proposed Data Retention & Disposal Schedule

*(Requires formal adoption and sign-off by College Management)*

| Record Category | Retention Period | Disposal / Anonymization Mechanism | Institutional Rationale |
| :--- | :--- | :--- | :--- |
| **Active Students** | Duration of academic enrollment | Maintained active in database. | Facilitate ongoing circulation access. |
| **Graduated / Transferred Students** | 1 academic year post-graduation (or until final No-Dues clearance) | Deactivated via `active: false`; contact details (`phone`) expunged; circulation history anonymized. | Mandatory clearance auditing and university verification. |
| **Faculty & Staff** | Duration of employment + 6 months | Account deactivation; contact details cleared. | Transition of department responsibilities. |
| **Read Notifications** | 90 days from creation | Permanently deleted via automated retention job (`server/jobs/retention.ts`). | Minimizing database footprint and data clutter. |
| **Unread Notifications** | Retained until marked read or dismissed | Preserved up to 180 days. | Ensuring critical alerts (e.g. overdue notices) are seen. |
| **Audit Logs** | 3 years | Append-only PostgreSQL table; read-only; exported to offline archival. | Regulatory compliance, security forensic review. |

---

## 5. Data Principal Rights & Implementation

Under Sections 11–14 of the DPDP Act 2023, Data Principals enjoy explicit rights. The system operationalizes these rights as follows:

### A. Right to Access & Data Portability (Personal Data Export)
- **Technical Control**: Authenticated endpoint `GET /api/user/data-export`.
- **Capability**:
  - Any authenticated Student, Teacher, or Librarian can request a machine-readable JSON package of their complete personal file.
  - Export includes: Profile information, active loans, completed historical returns, pending borrow/return requests, notification log, and uploaded academic materials (faculty/librarian).
  - Export excludes: Password hashes, `tokenVersion`, security counters, and any other student's personal information.
  - Resource Protection: Dedicated per-user rate limiter (`dataExportLimiter`: maximum 5 export requests per 15-minute window per authenticated principal).
  - Accountability: Successful export events are automatically recorded in the immutable `AuditLog` table with event `DATA_EXPORT_GENERATED` (actor ID, timestamp, summary counts; zero export contents or credentials logged).
  - Headers enforced: `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, `Expires: 0`, and `Content-Disposition: attachment; filename="rg-kedia-personal-data-export-YYYY-MM-DD.json"`.

#### Policy Note on Self-Service vs. Proxy Requests (SEC-9A-05 Institutional Consideration)
- **Strict Self-Service Rule**: The `GET /api/user/data-export` endpoint derives identity exclusively from the authenticated session (`req.user.id`). It strictly prevents IDOR; students and teachers cannot export other individuals' files, and librarians accessing this endpoint export strictly their own administrative record.
- **Future Institutional Policy Consideration**: If an alumnus who has lost portal access or a student unable to authenticate requires an offline DSAR export, the college governing body must formally evaluate and adopt an administrative offline identity verification procedure before any librarian proxy export tooling is authorized.

### B. Right to Correction & Updating
- **Technical Control**: Profile management via `PUT /api/user/profile`.
- **Capability**:
  - Users can correct their display name and personal contact phone number.
  - Institutional identifiers (Roll Number, Registered Email, Program, Branch, Academic Year) are immutable by students to prevent fraudulent identity mutation; corrections require librarian verification.

### C. Right to Erasure / "No-Dues" De-Registration
- **Process**:
  - Once a student graduates and returns all college books (zero active loans, zero outstanding lost materials), the librarian marks the account inactive.
  - The college data administrator can invoke user anonymization tooling to scrub personal phone numbers and contact metadata while retaining anonymous transaction logs for audit integrity.

---

## 6. Security Safeguards & Breach Response Protocol

### A. Technical Safeguards Implemented
1. **Transport Encryption**: Enforced TLS 1.3 across all client-to-server and server-to-database connections (Neon SSL `require`).
2. **Session Security**: HttpOnly, SameSite=Strict cookies with `tokenVersion` invalidation on logout or password rotation.
3. **Database Guardrails**: Fail-closed positive allowlist in test runners (`envGuard.js`) ensuring automated tests never run against production data.
4. **Brute-Force Lockout**: 5 failed login attempts trigger an exponential lockout window.

### B. Security Incident & Breach Notification Dual-Track Protocol

The framework strictly distinguishes between statutory cybersecurity incident reporting under the Information Technology Act and personal data breach intimation under the DPDP Act 2023:

#### Track 1 — Statutory Cybersecurity Incident Reporting (CERT-In)
- **Governing Law**: Directions under Section 70B(6) of the Information Technology Act, 2000 (Directions No. 20(3)/2022-CERT-In, effective June 28, 2022).
- **Statutory Reporting Window**: **Mandatory within 6 hours** of noticing or being brought to notice of specified cybersecurity incidents.
- **Reportable Incidents**: Unauthorized access of IT systems/data, ransomware, compromise of critical systems, data breach, identity theft, or denial of service attacks.
- **Reporting Channel**: Indian Computer Emergency Response Team (CERT-In Helpdesk: `incident@cert-in.org.in` / https://www.cert-in.org.in).
- **Institutional Custodian**: Designated College IT Administrator / Chief Information Security Officer (CISO).

#### Track 2 — Statutory Personal Data Breach Intimation (DPDP Act 2023)
- **Governing Law**: Section 8(6) of the Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023).
- **Statutory Mandate**: *"In the event of a personal data breach, the Data Fiduciary shall give the Board and each affected Data Principal intimation of such personal data breach in such form and manner as may be prescribed."*
- **Regulatory Status**: *[Awaiting Official Notification of DPDP Rules by MeitY]* — The exact digital form, verification channel, itemized report contents, and statutory operational time window for intimating the Data Protection Board of India (DPBI) and affected Data Principals will take legal effect upon commencement of the notified DPDP Rules.
- **Statutory Note**: The 72-hour reporting period common under EU GDPR Article 33 is **not** a statutory timeline under the DPDP Act 2023 text. Compliance must adhere strictly to the timelines prescribed upon gazetted notification of the DPDP Rules.

#### Track 3 — Proposed Institutional Incident Response Procedures
*(Operational workflow proposal — Subject to College Governing Body ratification)*:
1. **Hour 0–4 (Triage & Containment)**:
   - Technical administrators rotate all JWT secrets and database connection credentials immediately.
   - Invalidate all active sessions globally by incrementing `tokenVersion` or terminating sessions.
   - Isolate affected server instances and initiate network forensics.
2. **Hour 4–6 (Mandatory CERT-In Notification)**:
   - If an IT compromise, security incident, or unauthorized data exposure is confirmed, transmit initial incident disclosure to CERT-In within the mandatory 6-hour window.
3. **Post-Containment (DPBI & Data Principal Intimation)**:
   - Audit PostgreSQL `AuditLog` records to determine affected Data Principals and exposed data categories.
   - Intimate the Data Protection Board of India and affected Data Principals (students and faculty) without delay in the manner prescribed under notified DPDP Rules, outlining the nature of the breach, affected data categories, and remedial guidance.

---

## 7. Institutional Grievance Redressal Mechanism

*(To be ratified by R.G. Kedia College Administration)*

Students and faculty who have questions or concerns regarding the handling of their digital personal data may escalate inquiries through the following tiered structure:

1. **Tier 1 — Chief Librarian**:
   - Email: `librarian@rgkedia.edu.in`
   - Scope: Routine profile corrections, borrowing record discrepancies, export assistance.
2. **Tier 2 — College Library Committee / Grievance Officer**:
   - Email: `grievance.library@rgkedia.edu.in`
   - Scope: Contested circulation disputes, identity updates, formal access or erasure requests.
3. **Tier 3 — Principal & Governing Body**:
   - Scope: Final institutional appeal, policy amendments, data protection escalations.
4. **Statutory Recourse**:
   - Data Principals reserve the statutory right to register a complaint with the **Data Protection Board of India** if grievances are unresolved within 30 days.

---

## 8. Division of Responsibilities

| Responsibility | Technical Implementation (Software) | Institutional Action (College Management) |
| :--- | :---: | :---: |
| **Data Export API (DSAR)** | ✅ Implemented | Disclose endpoint in student orientation |
| **Masked Identifiers in UI** | ✅ Implemented | Train faculty on privacy boundaries |
| **Password Hashing & Session Revocation**| ✅ Implemented | Enforce strong password policy standards |
| **Written Consent Notice at Enrollment** | ❌ Out of scope (Paper/Form) | **MANDATORY**: Include digital consent form in admissions |
| **Designation of Data Protection Officer (DPO)** | ❌ Administrative | **MANDATORY**: Officially notify DPO contact details |
| **Periodic Data Scrubbing of Graduated Batches** | ✅ Tooling provided in Phase 9E | **MANDATORY**: Run annual graduation cleanup schedule |
