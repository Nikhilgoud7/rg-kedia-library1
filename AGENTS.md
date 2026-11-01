# RG-Kedia Library Management System - AGENTS.md

## Project Overview
A full-stack library management system for R.G. Kedia College of Commerce with student, teacher, and librarian roles.

## Tech Stack
- **Frontend**: React 19 + Vite (client/)
- **Backend**: Express.js + TypeScript (server/)
- **Database**: Prisma ORM with PostgreSQL (Neon Serverless)
- **Object Storage**: Cloudflare R2 / S3-compatible storage for exam papers; PostgreSQL bytea for book covers
- **Auth**: JWT + bcryptjs with tokenVersion session revocation & mandatory first-login password change
- **Styling**: Tailwind CSS utility classes
- **UI**: Custom components (Modal, StatCard, BookCard, Navbar, NotificationBell, AuditManagement)

## Directory Structure
```
rg-kedia-library/
  client/         # React 19 Vite frontend
  server/         # Express API server (TypeScript)
  prisma/         # Database schema & migrations
  scripts/        # Administrative CLI utilities (bootstrap, roster, storage migration)
  tests/          # Automated regression test suites (47 suites)
  uploads/        # Local disk fallback directory (dev/test only)
  package.json    # Root dependencies and scripts
  AGENTS.md       # This file
```

## Key Commands
- `npm run dev` - Start both server (port 5000) and client (port 5173)
- `npm run dev:server` - Start Express server only
- `npm run dev:client` - Start Vite client only
- `npm run prisma:generate` - Generate Prisma client
- `npx prisma migrate deploy` - Deploy migrations safely using direct unpooled connection
- `npm run admin:bootstrap` - Non-destructive first-time Chief Librarian account creation
- `npm run roster:import` - Ingest student master roster CSV with dry-run and validation
- `npm run storage:migrate` - Migrate exam papers between local and cloud object storage
- `npm test` - Run automated regression suite against isolated test database

## Authentication & Session Security
- Login: `POST /api/auth/login` with `{email, rollNumber, password}`
- Register: `POST /api/auth/register` (LIBRARIAN only)
- Session: HttpOnly `rg_kedia_session` cookie and `Authorization: Bearer <token>`
- Token invalidation via `tokenVersion` counter on password change / logout
- Mandatory first-login password change (`mustChangePassword: true`) blocks library operations until password updated
- No default credentials in production: Chief Librarian created via `npm run admin:bootstrap`

## Role-Based Access Control
- Roles: `STUDENT` | `TEACHER` | `LIBRARIAN`
- Middleware: `authorize('LIBRARIAN')` / `authorize('TEACHER', 'LIBRARIAN')`
- Route protection: all API routes use `authenticate` middleware first

## API Route Patterns
- `GET/POST /api/auth*` - Authentication, session state, password change
- `GET/POST /api/books*` - Book catalog & physical copies (librarian CRUD, student/teacher browse, cover images)
- `GET/POST /api/lending*` - Lending/issue/return/my-books/my-requests (role-filtered)
- `GET/POST /api/admin*` - Admin dashboard, user management, audit trails (LIBRARIAN only)
- `GET/POST /api/exam*` - Exam papers & study guides (role-filtered, presigned cloud downloads)
- `GET /api/user/data-export` - Personal data export under DPDP compliance
- `GET/POST /api/audits*` - Institutional audit lifecycle & physical inventory scans

## Database & Migrations
- Schema: `prisma/schema.prisma` - PostgreSQL dialect with advisory transactions
- Schema updates applied via versioned Prisma migrations (`npx prisma migrate deploy` using `DATABASE_URL_UNPOOLED`)
- `prisma/seed.ts` is strictly for dev/test environments with synthetic personas (`@demo.rgkedia.local`); blocked in production unless `FORCE_SEED=true` with `SEED_PASSWORD >= 12` chars
- Production initial access configured via `npm run admin:bootstrap`

## User Roles & Permissions
- **LIBRARIAN**: Full access - catalog CRUD, physical copy barcodes, user management, lending queue approval/returns, institutional audits, analytics
- **TEACHER**: Browse catalog, view student checkouts by copy, request student returns, upload unpublished exam papers
- **STUDENT**: Browse catalog, submit borrow requests, view active loans and return countdowns, download published exam papers

## Governance & Policy
- **Zero-monetary-fine policy**: No monetary fines are assessed for overdue books; academic notifications and reminders are used instead
- **Cloud storage integrity**: Exam papers stored in Cloudflare R2 / S3-compatible private bucket; served via 60-second presigned URLs
- **Physical copy tracking**: Individual copies tracked with status (`AVAILABLE`, `ISSUED`, `RESERVED`, `LOST`, `DAMAGED`) and unique barcodes
