# RG-Kedia Library Management System - AGENTS.md

## Project Overview
A full-stack library management system for R.G. Kedia College of Commerce with student, teacher, and librarian roles.

## Tech Stack
- **Frontend**: React 18 + Vite (client/)
- **Backend**: Express.js + TypeScript (server/)
- **Database**: Prisma ORM with SQLite
- **Auth**: JWT + bcryptjs
- **Styling**: Tailwind CSS utility classes
- **UI**: Custom components (Modal, StatCard, BookCard, Navbar, NotificationBell)

## Directory Structure
```
rg-kedia-library/
  client/         # React Vite frontend
  server/         # Express API server
  prisma/         # Database schema & seeding
  uploads/        # File uploads directory
  package.json    # Root dependencies (tsx, concurrently, prisma)
  AGENTS.md       # This file
```

## Key Commands
- `npm run dev` - Start both server (port 5000) and client (port 5173)
- `npm run dev:server` - Start Express server only
- `npm run dev:client` - Start Vite client only
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:push` - Push schema to database
- `npm run prisma:seed` - Seed database with sample data

## Authentication
- Login: `POST /api/auth/login` with `{email, rollNumber, password}`
- Register: `POST /api/auth/register` (LIBRARIAN only)
- Token stored in `localStorage rg_kedia_token`
- Axios interceptor auto-attaches `Authorization: Bearer <token>`
- 401s clear token and redirect to `/login`
- JWT expires in 7 days (`JWT_EXPIRES_IN` env var)

## Role-Based Access Control
- Roles: `STUDENT` | `TEACHER` | `LIBRARIAN`
- Middleware: `authorize('LIBRARIAN')` / `authorize('TEACHER', 'LIBRARIAN')`
- Route protection: all API routes use `authenticate` middleware first

## API Route Patterns
- `GET/POST /api/auth*` - Authentication
- `GET/POST /api/books*` - Book catalog (librarian CRUD, student/teacher browse)
- `GET/POST /api/lending*` - Lending/issue/return/my-books/my-requests (role-filtered)
- `GET/POST /api/admin*` - Dashboard/users (LIBRARIAN only)
- `GET/POST /api/exam*` - Exam papers

## Database/Prisma
- Schema: `prisma/schema.prisma` - SQLite dialect
- Run `npm run prisma:generate` + `npm run prisma:push` after schema changes
- Seed data: `npm run prisma:seed` (creates default librarian/teachers/students/books)
- Default logins from seed: librarian@rgkedia.edu.in / admin123, students with password123

## User Roles & Permissions
- **LIBRARIAN**: Full access - books CRUD, users CRUD, lending approval/returns, dashboard
- **TEACHER**: Borrow requests, return requests to students, browse books, upload exam papers, view student checkouts
- **STUDENT**: Borrow requests, view own borrowings, browse catalog, exam papers by program/semester

## Frontend Notes
- Auth context: `client/src/context/AuthContext.tsx` - manages user/token state
- API: `client/src/lib/api.ts` - Axios with JWT token auto-attachment
- Role badges in Navbar map role → display text/colors
- NotificationBell polls `/lending/notifications` every 30s
- Three page groups: `student/`, `teacher/`, `librarian/`
- Modals use `client/src/components/common/Modal.tsx`

## Known States (from inspection)
- System is functional with core lending/return flow working
- Role gates implemented via `authorize()` middleware
- Overdue fines calculated at ₹2/day
- Book copies tracked with status (AVAILABLE/ISSUED/RESERVED/LOST/DAMAGED)
- Program/branch mapping via `BookProgram` relation
- Exam papers downloadable but upload UI limited