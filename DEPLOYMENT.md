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
Authentication is handled by **Replit Auth** (OpenID Connect / PKCE). When the user clicks "Sign In", they are redirected through:
1. `GET /api/login` → Replit OIDC provider
2. Callback → `GET /api/callback` → session cookie set
3. Frontend reads session from `GET /api/auth/user`

Sessions are stored in the PostgreSQL `sessions` table via `connect-pg-simple`.

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
| `REPLIT_DOMAINS` | Replit only | Allowed OIDC redirect domains (set by Replit) |
| `REPL_ID` | Replit only | Replit environment identifier |
| `BASE_PATH` | Replit only | URL base path for Vite frontend (e.g. `/auron-os`) |
| `NODE_ENV` | ✅ | `development` or `production` |

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

## 7. Future Hostinger Migration

> **Do NOT migrate yet.** This section is a reference for when the time comes.

### Migration Overview
Hostinger Business hosting provides:
- Shared hosting or VPS (Ubuntu)
- MySQL / MariaDB (not PostgreSQL — see note below)
- Node.js via hPanel or SSH
- Let's Encrypt SSL

### Step-by-Step Migration Path

**Step 1: Provision a VPS** (recommended over shared hosting for Node.js apps)
- Minimum: 2 vCPU, 4GB RAM, 40GB SSD
- OS: Ubuntu 22.04 LTS

**Step 2: Set up PostgreSQL on the VPS** (or use Hostinger's managed DB add-on)
```bash
sudo apt install postgresql-15
sudo -u postgres createdb auron_os
sudo -u postgres createuser auron_user -P
```

**Step 3: Export and import data**
```bash
# On Replit
pg_dump "$DATABASE_URL" -F c -f auron_backup.dump
# Transfer to VPS via scp
scp auron_backup.dump user@hostinger-vps:/home/auron/
# On VPS
pg_restore -d auron_os auron_backup.dump
```

**Step 4: Clone and build on VPS**
```bash
git clone https://github.com/your-org/auron-os.git
cd auron-os
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/auron-os run build
```

**Step 5: Configure environment**
```bash
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET, PORT, NODE_ENV=production
# Replace Replit Auth (see §9)
```

**Step 6: Set up PM2 process manager**
```bash
npm install -g pm2
pm2 start artifacts/api-server/dist/index.mjs --name auron-api
pm2 save
pm2 startup
```

**Step 7: Configure Nginx as reverse proxy**
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / {
        root /home/auron/auron-os/artifacts/auron-os/dist/public;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 8. Replit-Specific Dependencies

| Dependency | Where Used | Migration Risk |
|---|---|---|
| **Replit Auth (OIDC)** | `artifacts/api-server/src/lib/auth.ts` | 🔴 High — must replace entirely |
| **Replit PostgreSQL** | `DATABASE_URL` env var | 🟢 Low — standard PostgreSQL, any host works |
| **`@replit/vite-plugin-*`** | `artifacts/auron-os/vite.config.ts` | 🟡 Medium — plugins are dev-only, remove for production build |
| **`PORT` / `BASE_PATH`** | Both services | 🟢 Low — already reads from env vars |
| **`REPLIT_DOMAINS`** | Auth callback URL | 🔴 High — required by Replit Auth OIDC |

---

## 9. Components to Replace During Migration

### Auth (Critical)

The current auth is **Replit Auth** — an OIDC provider that only works within Replit. When migrating:

**Option A: Clerk** (recommended SaaS auth)
```bash
pnpm add @clerk/express @clerk/clerk-js
```
Replace `artifacts/api-server/src/lib/auth.ts` and `artifacts/api-server/src/middlewares/authMiddleware.ts`.

**Option B: Passport.js with local strategy** (self-hosted)
```bash
pnpm add passport passport-local express-session bcryptjs
```

**Option C: Auth.js / NextAuth** (if migrating to Next.js)

The database tables (`users`, `sessions`) are already in place and use standard schemas — they will not need structural changes regardless of auth provider.

### Vite Plugins (Minor)

Remove from `artifacts/auron-os/vite.config.ts`:
```ts
// Remove these for non-Replit builds:
@replit/vite-plugin-runtime-error-modal
@replit/vite-plugin-cartographer  
@replit/vite-plugin-dev-banner
```

The production build (`vite build`) already gates these behind `process.env.REPL_ID !== undefined`, so they are automatically excluded in production.

### Frontend Base Path

Currently the frontend uses `BASE_PATH` env var for the Vite `base` config. When serving from root on Hostinger, set `BASE_PATH=/` in the build environment.

---

*Last updated: 2026-08-18*
