# Auron Business OS — Deployment Guide

## Table of Contents
1. [How the App Runs on Replit](#1-replit)
2. [Running Locally](#2-local)
3. [Required Environment Variables](#3-env-vars)
4. [Database Configuration](#4-database)
5. [Database Backup & Export](#5-backup)
6. [Deployment Process](#6-deployment)
7. [Future Hostinger Migration](#7-hostinger)
8. [Replit-Specific Dependencies](#8-replit-deps)
9. [Components to Replace During Migration](#9-migration-components)

---

## 1. How the App Runs on Replit

The project is a **pnpm monorepo** with three services managed by Replit Artifact workflows:

| Workflow | Service | Port |
|---|---|---|
| `artifacts/api-server: API Server` | Express API backend | `$PORT` (8080) |
| `artifacts/auron-os: web` | Vite React frontend | `$PORT` (23434) |
| `artifacts/mockup-sandbox: Component Preview Server` | Mockup sandbox (dev only) | 8081 |

Replit routes traffic through a shared proxy. The frontend is served at `/auron-os/` and the API at `/api-server/`. Both use the `PORT` and `BASE_PATH` environment variables injected automatically by Replit.

### Auth
Authentication uses **username + password** (bcrypt, local). The login flow:
1. User submits credentials to `POST /api/login`
2. Server validates bcrypt hash, sets a session cookie
3. Frontend reads session from `GET /api/auth/user`
4. `GET /api/logout` clears the session and redirects to `/`

Sessions are stored in the PostgreSQL `sessions` table.

### Run Commands
```bash
# Start the API server
pnpm --filter @workspace/api-server run dev

# Start the frontend
pnpm --filter @workspace/auron-os run dev

# Database migrations
pnpm --filter @workspace/db run push

# Seed demo data
npx tsx scripts/seed.ts
```

---

## 2. Running Locally

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### Setup
```bash
# Clone the repository
git clone https://github.com/your-org/auron-os.git
cd auron-os

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and SESSION_SECRET

# Push database schema
pnpm --filter @workspace/db run push

# Seed demo data (optional)
npx tsx scripts/seed.ts

# Start both services
pnpm --filter @workspace/api-server run dev &
pnpm --filter @workspace/auron-os run dev
```

**Important when running locally:**
- Replit Auth requires `REPLIT_DOMAINS` and `REPL_ID` env vars that only exist inside Replit.  
  To run locally, you must replace Replit Auth with a different auth strategy (see §9).
- Set `PORT=8080` for the API and a separate `PORT=5173` for the frontend in each service's environment.

---

## 3. Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Minimum 32-char random string for session signing |
| `PORT` | ✅ | HTTP port for each service (different per service) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `BASE_PATH` | ✅ build-time | URL base path for Vite frontend — use `/auron-os` on Replit, `/` on Hostinger |
| `REPL_ID` | Replit only | Enables Replit dev plugins (cartographer, dev-banner, error overlay) |

See `.env.example` for a full reference.

---

## 4. Database Configuration

### Technology
- **Database**: PostgreSQL (version 15+ recommended)
- **ORM**: Drizzle ORM (`drizzle-orm` + `drizzle-kit`)
- **Schema**: `lib/db/src/schema/`
- **Connection**: `lib/db/src/index.ts` — reads `DATABASE_URL` from environment

### Schema Push (development)
```bash
pnpm --filter @workspace/db run push
```

### Migration Files (production)
```bash
# Generate migration SQL
pnpm --filter @workspace/db run generate

# Apply migration
pnpm --filter @workspace/db run migrate
```

Migration files are stored in `lib/db/migrations/`.

### Database Tables
See `DATABASE.md` for full schema documentation.

---

## 5. Database Backup & Export

### Export from Replit (via `pg_dump`)
```bash
# In Replit shell, DATABASE_URL is available as an env var
pg_dump "$DATABASE_URL" -F p -f auron_os_backup_$(date +%Y%m%d).sql
```

### Restore
```bash
psql "$DATABASE_URL" < auron_os_backup_20260818.sql
```

### Scheduled Backups
For production on Hostinger, set up a cron job:
```cron
0 2 * * * pg_dump $DATABASE_URL -F c -f /backups/auron_$(date +\%Y\%m\%d).dump
```

### Replit Database
Replit provides a hosted PostgreSQL via the Database integration. The connection string is stored as `DATABASE_URL` in secrets. The database persists independently of the Repl — it is safe across deploys and restarts.

---

## 6. Deployment Process (Replit)

1. Make your changes and verify both workflows are running cleanly.
2. From the Replit UI, click **Publish** (Deploy).
3. Replit builds each artifact into its `dist/` directory.
4. The production environment uses separate `DATABASE_URL` and `SESSION_SECRET` secrets.
5. Run any pending migrations against production before switching traffic.

### Production Verification Checklist
- [ ] `GET /api/healthz` returns `{ "status": "ok" }`
- [ ] Auth login/callback flow works
- [ ] Dashboard loads real data
- [ ] CRUD operations work (create/edit/delete an event)
- [ ] No console errors in browser

---

## 7. Hostinger Migration

> **Migration is complete** — the codebase is fully portable. See `MIGRATION.md` for the step-by-step guide and `HOSTINGER_MIGRATION_CHECKLIST.md` for the go-live checklist.

### Migration Overview
Target: `https://os.auronevents.com` on a Hostinger VPS
- VPS (Ubuntu 24.04 LTS) — **not** shared hosting (Node.js requires VPS)
- **PostgreSQL 15** — Hostinger VPS supports PostgreSQL (install via `apt`)
  > ⚠️ Shared/starter Hostinger plans offer MySQL/MariaDB only. A VPS is required for PostgreSQL.
- Node.js 20 LTS, PM2 process manager
- Nginx reverse proxy with Let's Encrypt SSL

### Quick Migration Steps

**Step 1: Provision VPS** — min 2 vCPU / 4 GB RAM / 40 GB SSD, Ubuntu 24.04

**Step 2: Set up PostgreSQL on the VPS**
```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER auron_user WITH PASSWORD 'strong-password';"
sudo -u postgres psql -c "CREATE DATABASE auron_os OWNER auron_user;"
```

**Step 3: Export and restore data**
```bash
# On Replit — backup files already in backups/
pg_dump "$DATABASE_URL" -F c -f backups/auron_$(date +%Y%m%d).dump

# Transfer to VPS
scp backups/auron_*.dump auron@<VPS_IP>:/home/auron/auron-os/backups/

# On VPS — restore
pg_restore -U auron_user -d auron_os --no-owner backups/auron_latest.dump
```

**Step 4: Clone and build on VPS**
```bash
git clone https://github.com/your-org/auron-os.git && cd auron-os
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/auron-os run build
```

**Step 5: Configure environment**
```bash
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET, PORT=8080, NODE_ENV=production, BASE_PATH=/
```

**Step 6: Create user accounts**
```bash
node scripts/create-users-standalone.cjs
# Save the printed credentials immediately
```

**Step 7: Set up PM2**
```bash
npm install -g pm2
export $(grep -v '^#' .env | xargs)
pm2 start artifacts/api-server/dist/index.mjs --name auron-api -- --enable-source-maps
pm2 save && pm2 startup
```

**Step 8: Configure Nginx**
```nginx
server {
    listen 443 ssl http2;
    server_name os.auronevents.com;

    location /api/ {
        proxy_pass         http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    root /home/auron/auron-os/artifacts/auron-os/dist/public;
    location / { try_files $uri $uri/ /index.html; }
}
```

---

## 8. Replit-Specific Dependencies

| Dependency | Where Used | Status |
|---|---|---|
| **Replit Auth (OIDC)** | `artifacts/api-server/src/lib/auth.ts` | ✅ Replaced — bcrypt username/password auth |
| **Replit PostgreSQL** | `DATABASE_URL` env var | ✅ Portable — standard PostgreSQL, any host works |
| **`@replit/vite-plugin-*`** | `artifacts/auron-os/vite.config.ts` | ✅ Gated — only loaded when `REPL_ID` is set; production builds skip them |
| **`PORT` / `BASE_PATH`** | Both services | ✅ Portable — reads from env vars; set `BASE_PATH=/` on Hostinger |
| **`REPLIT_DOMAINS`** | Auth callback URL | ✅ Removed — no longer needed after auth replacement |
| **`@replit/connectors-sdk`** | Root `package.json` | ✅ Removed — was unused in application code |

---

## 9. Migration Status — All Items Resolved

| Component | Status | Notes |
|---|---|---|
| **Auth** | ✅ Done | Replaced with bcrypt username/password; run `create-users-standalone.cjs` on VPS |
| **Vite Replit plugins** | ✅ Done | Gated behind `REPL_ID` check — absent from production builds |
| **Frontend base path** | ✅ Done | Set `BASE_PATH=/` on Hostinger |
| **Database backup** | ✅ Done | `backups/auron_business_os_backup.dump` and `.sql` |
| **Migration SQL** | ✅ Done | `lib/db/migrations/0000_initial_schema.sql` |

### User Creation on Hostinger

After restoring the database backup and running `pnpm install`:
```bash
# Uses only bcryptjs (bundled in scripts/node_modules) + psql
node scripts/create-users-standalone.cjs
```

This creates four accounts (ceo/admin, finance, sales, operations) and prints their passwords.

---

*Last updated: 2026-08-18*
