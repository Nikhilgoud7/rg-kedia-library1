# Project Transfer & Operations Guide: RG Kedia Library Management System

## Project Name
R.G. Kedia College of Commerce — Library Management System & Degree Exam Guide

## Technology Stack
*   **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide Icons, React Router v7, React Hot Toast, Axios, TypeScript
*   **Backend:** Node.js, Express.js (ESM), TypeScript, Multer, Sharp
*   **Database & ORM:** PostgreSQL (Neon Serverless), Prisma ORM with advisory transactions
*   **Object Storage:** Cloudflare R2 / Backblaze B2 S3-compatible cloud object storage (past exam papers), PostgreSQL bytea storage adapter (book covers)
*   **Authentication:** JWT (JSON Web Tokens) with `tokenVersion` session invalidation, bcryptjs password hashing, mandatory first-login password change

## Project Structure
*   **Frontend (`client/`):** React 19 single-page application (`src/`), Vite configuration (`vite.config.ts`), and client `package.json`.
*   **Backend (`server/`):** Express application entry (`index.ts`), API routes (`routes/`), middlewares (`middleware/`), and storage adapters (`lib/storage/`).
*   **Database & Migrations (`prisma/`):** Database schema (`schema.prisma`), migrations history (`migrations/`), and dev/test seed script (`seed.ts`).
*   **Administrative CLI Scripts (`scripts/`):** Chief Librarian bootstrap (`bootstrapAdmin.ts`), student roster importer (`importStudentRoster.ts`), exam storage migration (`migrateExamStorage.ts`), and backup/restore utilities.
*   **Automated Regression Suite (`tests/`):** Comprehensive test runner and 47 test suites verifying application invariants.

## Database & Cloud Infrastructure
*   **Database Engine:** PostgreSQL (Neon Serverless)
*   **Connection Architecture:**
    *   `DATABASE_URL`: Pooled connection (via PgBouncer) for application HTTP runtime traffic.
    *   `DATABASE_URL_UNPOOLED`: Direct connection for Prisma DDL migrations (`npx prisma migrate deploy`).
    *   `TEST_DATABASE_URL`: Dedicated isolated Neon test branch endpoint, strictly separated from production.
*   **Cloud Object Storage:**
    *   Cloudflare R2 or Backblaze B2 (S3-compatible bucket) for past examination papers and study guides.
    *   Served via authenticated 60-second presigned URLs (`GET /api/exam/papers/:id/download`).
    *   Fail-fast guard in `server/config.ts` prevents production startup if cloud storage is unconfigured.
*   **Compute Hosting:** Render Web Service (Free Tier) with Node.js 22 LTS runtime.

## User Roles & Access Boundaries
1.  **Librarian Admin:** Full catalog management, physical copy barcode tracking, borrow request approvals and returns, institutional audits, and student/faculty management.
2.  **Faculty Member:** View department resources, lookup student copies, request early returns, and upload curriculum exam papers.
3.  **Student:** Browse catalog with real-time physical copy availability, request book loans, access exam guides, and view dashboard return countdowns.

## Setup Instructions (Development & Local Run)
1.  **Clone repository & install dependencies:**
    ```bash
    git clone https://github.com/Nikhilgoud7/rg-kedia-library.git
    cd rg-kedia-library
    npm install
    npm --prefix client install
    ```
2.  **Environment Variables:** Create a `.env` file in the root directory based on `.env.example`.
3.  **Generate Prisma Client & Apply Migrations:**
    ```bash
    npm run prisma:generate
    npm run prisma:deploy
    ```
4.  **Bootstrap Initial Chief Librarian (Production / Clean DB):**
    ```bash
    INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" \
    INITIAL_LIBRARIAN_PASSWORD="YourSecurePassword12+" \
    INITIAL_LIBRARIAN_NAME="Chief Librarian" \
    npm run admin:bootstrap -- --confirm
    ```
5.  **Start Application:** Run `npm run dev` to concurrently start backend (port 5000) and frontend (port 5173).

## Available Scripts (`package.json`)
*   `npm run dev`: Starts both backend and frontend development servers concurrently.
*   `npm run dev:server`: Starts only the Express backend development server (`tsx watch`).
*   `npm run dev:client`: Starts only the Vite client development server.
*   `npm run build`: Generates Prisma client, compiles client SPA, and compiles TypeScript backend.
*   `npm run build:client`: Builds the client application (`vite build`).
*   `npm run build:server`: Compiles the server TypeScript code (`tsc`).
*   `npm start`: Runs the compiled production server (`node dist/server/index.js`).
*   `npm run prisma:generate`: Generates the Prisma client.
*   `npm run prisma:migrate`: Runs Prisma development migrations (`prisma migrate dev`).
*   `npm run prisma:deploy`: Applies pending schema migrations (`prisma migrate deploy`).
*   `npm run prisma:seed`: Runs dev/test synthetic data seeding (`tsx prisma/seed.ts`). Blocked in production without `FORCE_SEED=true`.
*   `npm run prisma:studio`: Opens visual Prisma database browser.
*   `npm run admin:bootstrap`: Safely provisions the initial Chief Librarian account without seeding dummy accounts.
*   `npm run roster:import`: Ingests and validates student master roster CSV.
*   `npm run storage:migrate`: Migrates exam papers between local filesystem and cloud object storage.
*   `npm run notifications:retention`: Purges read notifications older than 90 days.
*   `npm run backup:create`: Generates AES-256-GCM encrypted logical backup of all application tables.
*   `npm run backup:verify`: Verifies integrity of backup archives and SHA-256 checksums.
*   `npm run backup:restore`: Restores database tables from encrypted backup (strictly blocked against production).
*   `npm run test`: Runs the automated regression suite against the isolated test database.

## Production Deployment (Render + Neon + Cloud Object Storage)
For full production deployment instructions, environment variable declarations, and operational runbooks, refer directly to `DEPLOY.md`.
