# Project Transfer Guide: RG Kedia Library Management System

## Project Name
R.G. Kedia College of Commerce — Library Management System & Degree Exam Guide

## Technology Stack
*   **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide Icons, React Router v7, React Hot Toast, Axios, TypeScript
*   **Backend:** Node.js, Express.js (ESM), TypeScript, Multer
*   **Database & ORM:** SQLite, Prisma ORM
*   **Authentication:** JWT (JSON Web Tokens), bcryptjs

## Project Structure
*   **Frontend Structure (`client/`):** Contains React source code (`src/`), Vite configuration (`vite.config.ts`), and its own `package.json`.
*   **Backend Structure (`server/`):** Contains Express application entry (`index.ts`), API routing (`routes/`), and middlewares (`middleware/`).
*   **Database Structure (`prisma/`):** Contains the database schema (`schema.prisma`) and seed data script (`seed.ts`).
*   **Uploads (`uploads/`):** Directory for locally uploaded files.

## Database Details
*   **Engine:** SQLite
*   **File Location:** `./dev.db` (Located in the root directory, ignored by Git)

## Authentication System
*   **Mechanism:** JSON Web Tokens (JWT)
*   **Password Storage:** Hashed using `bcryptjs`

## User Roles
1.  **Librarian Admin:** Full control over inventory, approval of lending requests, and student/faculty management.
2.  **Faculty Member:** View faculty resources, lookup student copies, request returns.
3.  **Student:** Browse catalog, request book loans, access exam guides, and view dashboard stats.

## Existing Features
*   Role-based dashboards.
*   Book catalog with physical copy tracking and search.
*   One-click borrow requests and lending queues.
*   Exam guide repository.
*   Book lending status and return management.

## Setup Instructions
1.  **Install dependencies:** Run `npm run setup` in the root (which installs root and client dependencies, generates Prisma client, pushes schema, and seeds database).
2.  **Environment Variables:** Create a `.env` file in the root based on `.env.example`.
3.  **Start application:** Run `npm run dev` to concurrently start the backend and frontend.

## Required Environment Variables
*   `PORT`
*   `NODE_ENV`
*   `DATABASE_URL`
*   `JWT_SECRET`
*   `JWT_EXPIRES_IN`
*   `UPLOAD_DIR`
*   `MAX_FILE_SIZE`

## Development Commands
*   `npm run dev`: Starts both backend and frontend development servers.
*   `npm run dev:server`: Starts only the backend server.
*   `npm run dev:client`: Starts only the frontend server.
*   `npm run build`: Builds the client application.
*   `npm run prisma:generate`: Generates Prisma client.
*   `npm run prisma:push`: Pushes schema changes to the SQLite database.
*   `npm run prisma:studio`: Opens the visual Prisma database editor.
*   `npm run setup`: Fully initializes the project (install, generate, push, seed).

## Current Development Status
*   **Git Status:** The project is connected to a GitHub remote (`https://github.com/Nikhilgoud7/rg-kedia-library.git`).
*   **Uncommitted Changes:** Yes, there are several modified files (e.g., `client/src/App.tsx`, `server/index.ts`) and untracked files (e.g., `client/src/pages/student/Profile.tsx`, `server/routes/user.routes.ts`) indicating active, unsaved development.

## Instructions for Continuing Development in Replit
1.  **Create a New Repl:** In your new Replit workspace, choose "Import from GitHub" and connect to `https://github.com/Nikhilgoud7/rg-kedia-library.git`.
2.  **Transfer Uncommitted Changes:** Because there are uncommitted changes in your current workspace, you MUST push these to GitHub first before importing, OR you must manually copy the changed/untracked files over to the new Replit workspace.
3.  **Transfer Ignored Files:** `.env`, `dev.db`, and the `uploads/` directory are ignored by Git. You will need to manually download these from your current workspace and upload them to the new Replit workspace.
4.  **Configure Secrets:** Add the variables from your `.env` file into Replit's "Secrets" tool to keep them secure.
5.  **Run Setup:** Execute `npm install` and `npm run dev` in the new Replit workspace to start the application.
