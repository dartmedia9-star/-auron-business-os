# Auron Business OS — Hostinger Migration Guide

**Target:** `https://os.auronevents.com`  
**Stack:** Node.js 20 LTS · PostgreSQL 15 · Nginx · PM2 · Ubuntu 24.04

---

## 1. Obtain the Source Code

```bash
git clone https://github.com/your-org/auron-os.git
cd auron-os
```

> **Ensure the repository includes:**
> - `pnpm-lock.yaml`
> - `lib/db/migrations/` (SQL migration files)
> - `.env.example`
> - All workspace packages under `lib/` and `artifacts/`

---

## 2. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm@10

# Install all workspace dependencies
pnpm install --frozen-lockfile
```

---

## 3. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

**Required variables:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Min 32-char random secret |
| `NODE_ENV` | Set to `production` |
| `PORT` | API server port (default `8080`) |

**Generate a session secret:**
```bash
openssl rand -base64 32
```

**No Replit variables are needed.** `REPL_ID`, `REPLIT_DOMAINS`, and `BASE_PATH` are not required outside Replit.

---

## 4. Create the PostgreSQL Database

```bash
# Connect as postgres superuser
sudo -u postgres psql

-- Inside psql:
CREATE USER auron_user WITH PASSWORD 'strong-password-here';
CREATE DATABASE auron_os OWNER auron_user;
GRANT ALL PRIVILEGES ON DATABASE auron_os TO auron_user;
\q
```

**Connection string:**
```
DATABASE_URL=postgresql://auron_user:strong-password-here@localhost:5432/auron_os
```

---

## 5. Run Database Migrations (Fresh Database)

This creates all 17 tables from scratch on a new PostgreSQL instance:

```bash
# Set DATABASE_URL first
export DATABASE_URL="postgresql://auron_user:password@localhost:5432/auron_os"

# Apply migrations
pnpm --filter @workspace/db run migrate
```

If `migrate` script is not present, use push (development only):
```bash
pnpm --filter @workspace/db run push
```

Migration files are at: `lib/db/migrations/`

---

## 6. Restore Database Backup (Existing Data)

If migrating from Replit with existing data, restore the backup **instead of** running migrations:

```bash
# Restore custom-format dump (recommended)
pg_restore -U auron_user -d auron_os --no-owner --role=auron_user auron_business_os_backup.dump

# OR restore plain SQL dump
psql -U auron_user -d auron_os < auron_business_os_backup.sql
```

After restore, run any pending migrations to apply new schema changes:
```bash
pnpm --filter @workspace/db run migrate
```

---

## 7. Create Application Users

After the database is ready, create the initial login accounts:

```bash
export DATABASE_URL="postgresql://..."
npx tsx scripts/create-users.ts
```

This creates four accounts (admin, finance, sales, operations) with random passwords printed to the terminal. **Save these immediately.**

To set custom passwords:
```bash
ADMIN_PASSWORD=MySecurePass npx tsx scripts/create-users.ts
```

---

## 8. Build the Frontend

```bash
# Set required env for the build
export BASE_PATH=/
export PORT=3000   # Temp value; not used at build time but required by vite.config.ts
export NODE_ENV=production

pnpm --filter @workspace/auron-os run build
```

Output: `artifacts/auron-os/dist/public/`

---

## 9. Build the Backend

```bash
pnpm --filter @workspace/api-server run build
```

Output: `artifacts/api-server/dist/index.mjs`

---

## 10. Start the Node.js Server

**Direct start (for testing):**
```bash
export DATABASE_URL="postgresql://..."
export SESSION_SECRET="your-secret"
export NODE_ENV=production
export PORT=8080

node --enable-source-maps artifacts/api-server/dist/index.mjs
```

**Via PM2 (for production):**
```bash
pm2 start artifacts/api-server/dist/index.mjs \
  --name auron-api \
  --interpreter node \
  -- --enable-source-maps

pm2 save
pm2 startup   # Follow the printed command to enable auto-restart
```

---

## 11. Configure Nginx

Create `/etc/nginx/sites-available/auron-os`:

```nginx
server {
    listen 80;
    server_name os.auronevents.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name os.auronevents.com;

    ssl_certificate     /etc/letsencrypt/live/os.auronevents.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/os.auronevents.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # API — proxy to Node.js process
    location /api/ {
        proxy_pass         http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_read_timeout 60s;
    }

    # Frontend — serve static files with SPA fallback
    root /home/auron/auron-os/artifacts/auron-os/dist/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/auron-os /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 12. Configure SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d os.auronevents.com
sudo systemctl enable certbot.timer
```

---

## 13. Point os.auronevents.com to the VPS

In your DNS provider (Hostinger DNS panel):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | os | `<VPS IPv4 address>` | 300 |

Wait for propagation (5–60 minutes). Verify:
```bash
dig os.auronevents.com
```

---

## 14. Verify the Deployment

```bash
# API health check
curl https://os.auronevents.com/api/healthz
# Expected: {"status":"ok"}

# Test login
curl -c cookies.txt -X POST https://os.auronevents.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ceo","password":"YOUR_PASSWORD"}'
# Expected: {"user":{...}}

# Test authenticated endpoint
curl -b cookies.txt https://os.auronevents.com/api/auth/user
# Expected: {"user":{...}}
```

Open `https://os.auronevents.com` in a browser and verify:
- [ ] Login page loads
- [ ] Login with ceo credentials works
- [ ] Dashboard loads with real data
- [ ] Events, Clients, Finance, Reports all load
- [ ] CRUD operations work (create a test event)
- [ ] Mobile layout works (test on phone)

---

## Database Restore Command Reference

```bash
# Restore from custom dump (preferred — compressed, faster)
pg_restore -U auron_user -d auron_os --no-owner --role=auron_user \
  --clean --if-exists auron_business_os_backup.dump

# Restore from plain SQL
psql -U auron_user -d auron_os -f auron_business_os_backup.sql

# Verify tables after restore
psql -U auron_user -d auron_os -c "\dt"
# Should list 17 tables
```

---

## Production Build Commands (Summary)

```bash
# Full production build sequence
export DATABASE_URL="postgresql://..."
export SESSION_SECRET="$(openssl rand -base64 32)"
export NODE_ENV=production
export BASE_PATH=/
export PORT=8080

pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/auron-os run build
```

---

*Last updated: 2026-08-18*
