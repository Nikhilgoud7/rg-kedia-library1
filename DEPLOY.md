# RG-Kedia Library Management System — Deployment & Operations Guide

This guide documents the production deployment architecture, setup procedures, environment configurations, and the 3-year zero-cost operational runbook for the RG-Kedia Library Management System.

---

## 1. Architecture Overview

The application is deployed as a single-origin full-stack service with decoupled cloud database storage:

- **Compute & Web Server**: Hosted on **Render** (Free Tier Web Service).
  - Runtime: Node.js 22 LTS.
  - Express.js backend serving compiled REST API endpoints (`/api/*`).
  - Express static asset handler serving the compiled React 19 / Vite frontend (`client/dist`).
  - React Router client-side SPA fallback for non-API routes.
- **Database**: **Neon Serverless PostgreSQL** (`production` branch).
  - Pooled connection (`DATABASE_URL`) with PgBouncer for transactional queries and concurrency.
  - Direct connection (`DATABASE_URL_UNPOOLED`) for Prisma schema migrations and DDL operations.
  - Automatic scale-to-zero when idle, sub-second cold starts.
- **Security & Session Boundary**:
  - HttpOnly, `SameSite=Strict`, `Secure` JWT session cookies (`rg_kedia_session`).
  - Anti-tamper demo safeguards (`DEMO_MODE=true`).
  - Production seed guards (`FORCE_SEED=true`, minimum 12-char seed password).
  - Rate limiting on authentication routes (10 requests per 15 minutes).

---

## 2. Infrastructure Specification (`render.yaml`)

The repository includes a declarative `render.yaml` specification for zero-configuration deployments:

```yaml
services:
  - type: web
    name: rg-kedia-library
    runtime: node
    plan: free
    region: singapore # Closest to Hyderabad / India
    buildCommand: npm install --include=dev && npm --prefix client install --include=dev && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: TRUST_PROXY
        value: "1"
      - key: JWT_EXPIRES_IN
        value: 7d
      - key: STORAGE_DRIVER
        value: r2
      - key: R2_REGION
        value: auto
      - key: CLIENT_URL
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_URL_UNPOOLED
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: R2_ACCOUNT_ID
        sync: false
      - key: R2_ACCESS_KEY_ID
        sync: false
      - key: R2_SECRET_ACCESS_KEY
        sync: false
      - key: R2_BUCKET_NAME
        sync: false
```

---

## 3. Environment Variables Reference

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enables Express production optimizations and secure cookie requirements. |
| `PORT` | Yes | `10000` (Render default) or `5000` | Port on which the HTTP server listens. |
| `DATABASE_URL` | Yes | `postgresql://...@ep-...-pooler...neon.tech/neondb?sslmode=require` | Pooled connection string for application runtime queries (via PgBouncer). |
| `DATABASE_URL_UNPOOLED` | Yes | `postgresql://...@ep-...neon.tech/neondb?sslmode=require` | Direct unpooled connection string for Prisma DDL migrations. |
| `JWT_SECRET` | Yes | Cryptographically random string ($\ge 32$ chars) | Signing key for authentication tokens. |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiration duration. |
| `TRUST_PROXY` | Yes | `1` | Number of upstream reverse proxy hops (required on Render). |
| `STORAGE_DRIVER` | Yes | `r2` | Cloud object storage provider. Fail-fast guard blocks startup if unset or `local`. |
| `R2_ACCOUNT_ID` | Yes | Cloudflare Account ID hash | Cloudflare R2 account identifier. |
| `R2_ACCESS_KEY_ID` | Yes | Cloudflare R2 API Access Key | Access credential for R2 storage bucket. |
| `R2_SECRET_ACCESS_KEY` | Yes | Cloudflare R2 Secret Access Key | Secret credential for R2 storage bucket. |
| `R2_BUCKET_NAME` | Yes | `rg-kedia-library-exam-papers` | Dedicated private object storage bucket name. |
| `R2_REGION` | No | `auto` | Cloudflare R2 storage region. |
| `COOKIE_SECURE` | Yes | `true` | Enforces `Secure` flag on session cookies (requires HTTPS). |
| `COOKIE_SAME_SITE` | Yes | `strict` | Sets cookie `SameSite` attribute (`strict` or `lax`). |
| `CORS_ORIGIN` | No | Single-origin default (omit or set to custom domain) | Trusted cross-origin origin if frontend is hosted separately. |
| `RATE_LIMIT_MAX` | No | `10` | Max auth attempts per IP per 15-minute window. |
| `DEMO_MODE` | No | `false` | Locks synthetic demo accounts and displays disclaimer banner (set `false` for live college ops). |
| `FORCE_SEED` | No | `false` (set `true` only during initial seed) | Production protection guard for `prisma/seed.ts`. |
| `SEED_PASSWORD` | No | Defaults to `DemoPass@1234` | Default password for seeded demo personas ($\ge 12$ chars in prod). |

---

## 4. Step-by-Step Deployment Instructions

### Step 4.1: Database Provisioning (Neon)
1. Log in to the [Neon Console](https://console.neon.tech).
2. Create or select the `rg-kedia-library` project.
3. Ensure the active database branch is `production`.
4. Copy both the **Pooled connection string** (use for `DATABASE_URL`) and the **Direct connection string** (use for `DATABASE_URL_UNPOOLED`).

### Step 4.2: Web Service Setup (Render)
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub repository: `https://github.com/Nikhilgoud7/rg-kedia-library.git`.
4. Configure service parameters:
   - **Name**: `rg-kedia-library`
   - **Region**: `Singapore` (or nearest region)
   - **Branch**: `main` (or `release`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install --include=dev && npm --prefix client install --include=dev && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`
5. Add the Environment Variables from Section 3 above into the Render environment tab.
6. Click **Create Web Service**.

### Step 4.3: Controlled Database Schema Migration & Librarian Bootstrap
Schema migrations must **never** run automatically during ordinary application builds. This prevents uncontrolled schema alterations on unbacked-up databases.

To apply migrations safely:
1. **Pre-Migration Safety Check**: Verify database backup exists (via `npm run backup:create` or Neon branch snapshot) and verify target database connection.
2. In the Render Shell or authorized administrative terminal connected to Neon:
   ```bash
   DATABASE_URL_UNPOOLED="<your-neon-direct-unpooled-url>" npx prisma migrate deploy
   ```
3. **Safe First-Time Chief Librarian Bootstrap**:
   Do NOT run `prisma/seed.ts` in production. Instead, run the secure, non-destructive initial librarian bootstrap CLI:
   ```bash
   INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" \
   INITIAL_LIBRARIAN_PASSWORD="<YourSecureTemporaryPassword12+>" \
   INITIAL_LIBRARIAN_NAME="Chief Librarian" \
   npm run admin:bootstrap -- --confirm
   ```
4. **First Login**: Log in as Chief Librarian and complete the mandatory password change.

---

## 5. Health Check & Monitoring

The service exposes a lightweight, unauthenticated health check:
```http
GET /api/health
```
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-16T16:20:00.000Z",
  "database": "connected",
  "environment": "production"
}
```
Render's health check monitor checks `/api/health` automatically before marking a new deployment live.

---

## 6. Zero-Downtime Redeployments & Rollback

- **Zero-Downtime Deploys**: Render builds the new container before stopping the old one. If `/api/health` fails, traffic is not routed to the new build.
- **Rollback**: In the Render Dashboard under **Deploys**, select any previous successful deployment and click **Rollback to this deploy**.
- **Database Safety**: Schema migrations are strictly additive (no destructive drops during routine deployments). If rolling back code, ensure new columns are nullable or have defaults.

---

## 7. Running for 3 Years — Free-Tier Operations Runbook

This section details how to keep the RG-Kedia Library Management System operating **100% free of charge for 3+ years** with zero degradation, zero bill shocks, and optimal performance.

### 7.1 Free Tier Resource Budgets

| Resource | Free Tier Allowance | Application Consumption | Headroom / Margin |
| :--- | :--- | :--- | :--- |
| **Neon Storage** | 0.5 GB (500 MB) | Initial seed: ~3.2 MB<br>Annual growth: ~12 MB/year | **>92% free space** remaining after 3 years |
| **Neon Compute** | 100 Compute Unit (CU) hours/mo | ~3 to 8 CU-hours/month with auto-suspend | **>90% unused allowance** |
| **Render Web Service** | 750 free instance hours/month | 1 instance $\times$ 720 hours = 720 hours | **$0.00/month** (fits entirely in monthly free pool) |
| **Render Bandwidth** | 100 GB/month outbound | Single-origin gzip/brotli static assets: <1.5 GB/mo | **>98% headroom** |

### 7.2 Database Storage Preservation Strategy
To guarantee the database never exceeds Neon's 500 MB limit over a 3-year period:
1. **Notification Retention Engine**:
   - Notifications accumulate over time from borrow requests, approvals, and reminders.
   - Run the automated retention job quarterly or configure a recurring task:
     ```bash
     npm run notifications:retention
     ```
   - This purges read notifications older than 90 days (`read = true` AND `createdAt < 90 days ago`). Unread notifications are strictly preserved.
2. **Synthetic Data Hygiene**:
   - The CLI utility `npm run demo:reset -- --confirm` allows clearing out test borrow requests and restoring the clean catalog state at any time.
3. **Connection Pooling**:
   - Always connect through the Neon pooled hostname (`-pooler`) using `DATABASE_URL`. This limits active PostgreSQL backend processes and prevents connection starvation during traffic spikes.

### 7.3 Render Free Tier Sleep & Wakeup Handling
- **Spin-Down Behavior**: Render free tier services automatically spin down after 15 minutes of inbound HTTP inactivity.
- **Cold Starts**: When an incoming request arrives while sleeping, Render spins up the container within 30–50 seconds.
- **Neon Sleep**: Neon suspends compute after 5 minutes of inactivity; waking up Neon takes $\le 1.5$ seconds and is handled transparently by the pooled connection.
- **Best Practice for Demos/Presentations**: Visit the URL 2 minutes prior to a live presentation to warm up both Render and Neon caches.

### 7.4 Cloud Object Storage & File Durability Policy (Cloudflare R2)
- Render's free tier web service has an **ephemeral disk**. Files saved to the local container disk do not persist across redeployments or container restarts.
- **Production Architecture**:
  - Examination papers and question banks are stored permanently in **Cloudflare R2** (`STORAGE_DRIVER=r2`).
  - Cloudflare R2 provides 10 GB/month of free storage and **zero egress (bandwidth) charges**, ensuring perpetual free tier compliance.
  - A production fail-fast guard (`server/config.ts`) strictly prevents the application from starting if `STORAGE_DRIVER` is unset or set to `local`/`disk` in production.
  - The storage bucket is private; file downloads are served through authenticated 60-second presigned URLs (`/api/exam/papers/:id/download`).
  - Book covers are stored transactionally in PostgreSQL as WebP byte arrays (`BookCover` table) via `DatabaseStorageDriver`, cached by client browsers with ETags.

### 7.5 Quarterly Maintenance Routine (5-Minute Checklist)
Every 3 months, run this quick check:
1. **Health Verification**:
   ```bash
   curl -s https://<your-render-app>.onrender.com/api/health
   ```
2. **Notification Prune**:
   Execute `npm run notifications:retention` via Render One-off Job or local CLI.
3. **Neon Metrics Check**:
   Inspect [Neon Console](https://console.neon.tech) storage widget to confirm total storage is under 50 MB.
4. **Dependency Audit**:
   Run `npm audit` locally to check for any critical security patches.

---

## 8. Demo Personas & Credentials

When `DEMO_MODE=true` is enabled:
- Banner `"DEMO PROTOTYPE — all data is synthetic. Do not enter personal information."` is displayed across all pages.
- Demo accounts cannot have passwords changed or be deleted via the API (HTTP 403 Forbidden).

### Seeded Persona Credentials:
- **Librarian**: `demo.librarian@demo.rgkedia.local` (Password: `DemoPass@1234`)
- **Teachers**:
  - `demo.teacher1@demo.rgkedia.local` (B.Com General)
  - `demo.teacher2@demo.rgkedia.local` (B.Sc Computer Science & Data)
  - `demo.teacher3@demo.rgkedia.local` (BBA General Business Admin)
  (Password: `DemoPass@1234`)
- **Students**:
  - `demo.student1@demo.rgkedia.local` (Roll: `1052-24-401-001`, B.Com Computer Applications)
  - `demo.student2@demo.rgkedia.local` (Roll: `1052-24-401-045`, B.Com Business Analytics)
  - `demo.student3@demo.rgkedia.local` (Roll: `1052-24-402-012`, BBA General Business Admin)
  - `demo.student4@demo.rgkedia.local` (Roll: `1052-24-403-008`, B.Sc Computer Science & Data)
  - `demo.student5@demo.rgkedia.local` (Roll: `1052-24-401-099`, B.Com Honors)
  (Password: `DemoPass@1234`)
