# 📚 R.G. Kedia College of Commerce — Library Management System & Degree Exam Guide

An integrated, full-stack **Library Management System and Degree Exam Guide Portal** built for **Ramnath Guljarilal Kedia College of Commerce (R.G. Kedia College)** by **Marwadi Siksha Samithi, Sultan Bazar, Hyderabad** (Estd. 1924).

> *" सा विद्या या विमुक्तये "* — *Knowledge is that which liberates*

---

## 🏛️ Programs & Branches Supported

### 1. Bachelor of Commerce (B.Com)
- General
- Computer Applications
- Business Analytics
- Honors

### 2. Bachelor of Business Administration (BBA)
- General Business Administration

### 3. Bachelor of Science (B.Sc)
- Mathematics
- Statistics
- Computer Science & Data

### 4. Languages
- **First Language**: English (Communicative & Business English)
- **Second Languages**: Telugu (తెలుగు), Sanskrit (संस्कृतम्), Hindi (हिन्दी), Arabic (العربية)

---

## ✨ Key Features

### 👤 Role-Based Portals

#### 1. 🎓 Student Portal
- **Dashboard**: Track active loans, real-time return countdown, overdue warnings, and recommended branch textbooks.
- **Book Catalog**: Real-time search with live physical copy indicators (e.g., *"5 of 8 Copies Available"*), subject segments, and shelf locations.
- **One-Click Borrow Requests**: Submit book reservation and lending requests directly to the librarian.
- **Degree Exam Guide**: Browse past Osmania University exam papers and curated 10-mark/5-mark question banks organized by **Program → Branch → Semester (1-6) → Subject**.

#### 2. 👨‍🏫 Faculty Portal
- **Teacher Dashboard**: Monitor faculty-borrowed reference titles and department resources.
- **Student Copy Lookup**: View exactly which student (Name & Roll Number) is holding each copy of any book and their return due date.
- **Request Student Return**: Send instant return notifications to students for books needed in lectures or seminars.
- **Exam Guide Contributor**: Upload question papers, model question banks, and revision guides for students.

#### 3. 👤 Librarian Admin Console
- **Central Dashboard**: Real-time stats on total inventory, physical copies, active loans, and overdue counts.
- **Book Inventory Management**: Add/edit/delete book titles, manage individual physical copies with unique barcodes, assign shelf rack locations (e.g., `Rack A-1`), and map curriculum relevance.
- **Lending Requests Approval Queue**: Approve/reject student borrow requests with customizable loan durations.
- **Issued Books & Returns**: Active loan tracker with zero-monetary-fine academic governance, automated return alerts, and one-click return processing.
- **Bulk Book CSV Import Engine**: High-throughput spreadsheet ingestion supporting up to 1,000 titles per file, RFC 4180 parsing, client-side preview, server validation, duplicate collision attribution, and transactional chunking with PostgreSQL advisory locking and zero partial imports.
- **Physical Copy Reconciliation**: Self-healing inventory engine resolving anomalies between book-level totals and physical copy allocations.
- **Student & Faculty Directory**: Register new members, manage branch specializations, track second language selections, and reset passwords.
- **Exam Guide Repository Manager**: Upload and organize past university papers and solution guides.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, React Router v7, React Hot Toast, Axios
- **Backend**: Node.js, Express.js (ESM), TypeScript, Multer
- **Database & ORM**: PostgreSQL (Neon Serverless), Prisma ORM with advisory transactions
- **Storage Subsystem**: Cloudflare R2 object storage for past exam papers (AWS S3-compatible SDK, 60s presigned URLs) with local fallback; PostgreSQL bytea storage adapter for book covers
- **Governance & Policy**: Strict zero-monetary-fine architecture with academic notifications and administrative audit logging
- **Authentication**: JWT (JSON Web Tokens) with tokenVersion session revocation, bcryptjs password hashing

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Nikhilgoud7/rg-kedia-library.git
   cd rg-kedia-library
   ```

2. **Install dependencies**:
   ```bash
   # Install server dependencies
   npm install

   # Install client dependencies
   cd client && npm install && cd ..
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and configure your settings:
   - Development uses `STORAGE_DRIVER=local` by default.
   - Production requires `STORAGE_DRIVER=r2` with Cloudflare R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`). Startup fails fast if production cloud storage is unconfigured or set to local disk.

4. **Set up the Database Schema & Provision Initial Access**:
   ```bash
   # Generate Prisma client and deploy versioned migrations safely
   npx prisma generate
   npx prisma migrate deploy
   ```

   **Production Access Provisioning (Recommended)**:
   Do NOT run `prisma/seed.ts` in production. Instead, run the secure non-destructive initial librarian bootstrap CLI:
   ```bash
   INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" \
   INITIAL_LIBRARIAN_PASSWORD="YourSecurePassword12+" \
   INITIAL_LIBRARIAN_NAME="Chief Librarian" \
   npm run admin:bootstrap -- --confirm
   ```

   **Student Master Roster Import**:
   To ingest real student enrollment rosters safely into the database:
   ```bash
   # Dry-run validation first:
   npm run roster:import -- --file=path/to/roster.csv --dry-run
   # Execute ingestion with confirmation:
   npm run roster:import -- --file=path/to/roster.csv --execute --confirm
   ```

   **Exam Paper Storage Migration**:
   To migrate exam papers between local storage and cloud object storage (Cloudflare R2 / Backblaze B2):
   ```bash
   npm run storage:migrate -- --dry-run
   npm run storage:migrate -- --execute --confirm
   ```

   **Local Development / Synthetic Demo Seeding (Dev/Test Only)**:
   > ⚠️ **Warning**: `prisma/seed.ts` is strictly for development and testing. It populates synthetic demo personas (`@demo.rgkedia.local`) and sample catalog titles. It is blocked by an automated fail-fast guard in production (`NODE_ENV=production`) unless `FORCE_SEED=true` and `SEED_PASSWORD >= 12` characters are explicitly set.
   ```bash
   npx tsx prisma/seed.ts
   ```

5. **Start the Application**:
   ```bash
   npm run dev
   ```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🔑 Default Demo Accounts (Development / Demo Mode Only)

*(Synthetic accounts generated only in development and testing when seeded via `prisma/seed.ts` with `DEMO_MODE=true`. Production starts with zero demo accounts; initial administrative access is created via `npm run admin:bootstrap`.)*

The login page features 1-click test fill buttons in demo environments:

| Role | Username / Identifier | Password | Program / Branch |
|---|---|---|---|
| **👤 Librarian Admin** | `demo.librarian@demo.rgkedia.local` | `DemoPass@1234` | Library Administration |
| **👨‍🏫 Faculty Member** | `demo.teacher1@demo.rgkedia.local` | `DemoPass@1234` | B.Com Faculty (General) |
| **🎓 Student (B.Com)** | `1052-24-401-001` (`demo.student1@demo.rgkedia.local`) | `DemoPass@1234` | B.Com Computer Applications (Sem 3) |
| **🎓 Student (B.Sc)** | `1052-24-403-008` (`demo.student4@demo.rgkedia.local`) | `DemoPass@1234` | B.Sc Computer Science & Data (Sem 4) |
| **🎓 Student (BBA)** | `1052-24-402-012` (`demo.student3@demo.rgkedia.local`) | `DemoPass@1234` | BBA Business Administration (Sem 1) |

---

## 📄 License

Developed for **Ramnath Guljarilal Kedia College of Commerce**, Marwadi Siksha Samithi, Hyderabad.
