# Auron Business OS — Hostinger VPS Migration Checklist

**Target URL:** `https://os.auronevents.com`  
**VPS OS:** Ubuntu 24.04 LTS  
**Node.js:** 20 LTS · **DB:** PostgreSQL 15 · **Web:** Nginx · **Process:** PM2

Work through each item in order. Do NOT skip ahead.

---

## Phase 1 — VPS Provisioning

- [ ] **1. Purchase/configure Hostinger VPS**
  - Select Ubuntu 24.04 LTS
  - Minimum spec: 2 vCPU, 4 GB RAM, 40 GB SSD
  - Note your VPS IPv4 address

- [ ] **2. Configure SSH access**
  ```bash
  # From your local machine — copy your public key
  ssh-copy-id root@<VPS_IP>
  # Verify you can log in without password
  ssh root@<VPS_IP>
  ```

- [ ] **3. Create a non-root deployment user**
  ```bash
  adduser auron
  usermod -aG sudo auron
  # Copy SSH keys to new user
  rsync --archive --chown=auron:auron ~/.ssh /home/auron
  # Test non-root login
  ssh auron@<VPS_IP>
  ```

- [ ] **4. Configure firewall (UFW)**
  ```bash
  ufw allow OpenSSH
  ufw allow 80
  ufw allow 443
  ufw enable
  ufw status
  ```

---

## Phase 2 — Software Installation

- [ ] **5. Update system packages**
  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y git curl wget build-essential
  ```

- [ ] **6. Install Node.js 20 LTS**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  node --version   # Should show v20.x.x
  ```

- [ ] **7. Install pnpm**
  ```bash
  npm install -g pnpm@10
  pnpm --version
  ```

- [ ] **8. Install PM2**
  ```bash
  npm install -g pm2
  pm2 --version
  ```

- [ ] **9. Install PostgreSQL 15**
  ```bash
  sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
  psql --version   # Should show 15.x or 16.x
  ```

---

## Phase 3 — Database Setup

- [ ] **10. Create Auron PostgreSQL database and user**
  ```bash
  sudo -u postgres psql << 'EOF'
  CREATE USER auron_user WITH PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';
  CREATE DATABASE auron_os OWNER auron_user;
  GRANT ALL PRIVILEGES ON DATABASE auron_os TO auron_user;
  \q
  EOF
  ```
  > Replace `CHANGE_THIS_STRONG_PASSWORD` with a real strong password. Record it.

- [ ] **Verify DB connection:**
  ```bash
  psql -U auron_user -d auron_os -h localhost -c "SELECT current_database();"
  ```

---

## Phase 4 — Application Deployment

- [ ] **11. Clone the GitHub repository**
  ```bash
  cd /home/auron
  git clone https://github.com/your-org/auron-os.git
  cd auron-os
  ```

- [ ] **12. Configure environment variables**
  ```bash
  cp .env.example .env
  nano .env
  ```
  Set these values:
  ```env
  DATABASE_URL=postgresql://auron_user:CHANGE_THIS@localhost:5432/auron_os
  SESSION_SECRET=<output of: openssl rand -base64 32>
  NODE_ENV=production
  PORT=8080
  BASE_PATH=/
  ```

- [ ] **13. Install application dependencies**
  ```bash
  pnpm install --frozen-lockfile
  ```

- [ ] **14. Run database migrations**
  ```bash
  export $(grep -v '^#' .env | xargs)
  pnpm --filter @workspace/db run migrate
  ```

- [ ] **15. Restore database backup (if migrating data from Replit)**
  ```bash
  # Transfer backup file from your local machine first:
  # scp auron_business_os_backup.dump auron@<VPS_IP>:/home/auron/auron-os/backups/

  pg_restore -U auron_user -d auron_os --no-owner \
    --clean --if-exists \
    backups/auron_business_os_backup.dump
  ```
  > If restoring backup, skip step 14 (migrations) as schema is included in the backup.
  > After restore, verify: `psql -U auron_user -d auron_os -c "\dt"` should show 17 tables.

- [ ] **16. Create application user accounts**
  ```bash
  export $(grep -v '^#' .env | xargs)
  npx tsx scripts/create-users.ts
  ```
  > ⚠️ **Save the printed credentials immediately.** They are shown only once.

- [ ] **17. Build the backend**
  ```bash
  pnpm --filter @workspace/api-server run build
  # Verify: ls -lh artifacts/api-server/dist/index.mjs
  ```

- [ ] **18. Build the frontend**
  ```bash
  export NODE_ENV=production BASE_PATH=/ PORT=8080
  pnpm --filter @workspace/auron-os run build
  # Verify: ls artifacts/auron-os/dist/public/index.html
  ```

---

## Phase 5 — Process Management

- [ ] **19. Configure PM2**
  ```bash
  # Create PM2 ecosystem file
  cat > ecosystem.config.cjs << 'EOF'
  module.exports = {
    apps: [{
      name: 'auron-api',
      script: 'artifacts/api-server/dist/index.mjs',
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DATABASE_URL: process.env.DATABASE_URL,
        SESSION_SECRET: process.env.SESSION_SECRET,
      }
    }]
  };
  EOF

  # Load env and start
  export $(grep -v '^#' .env | xargs)
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup   # Run the printed command as root
  ```

- [ ] **Verify API is running:**
  ```bash
  curl http://localhost:8080/api/healthz
  # Expected: {"status":"ok"}
  ```

---

## Phase 6 — Nginx & SSL

- [ ] **20. Install Nginx**
  ```bash
  sudo apt install -y nginx
  sudo systemctl enable nginx
  ```

- [ ] **21. Configure Nginx**
  ```bash
  sudo nano /etc/nginx/sites-available/auron-os
  ```
  Paste the Nginx config from `MIGRATION.md §11`, then:
  ```bash
  sudo ln -s /etc/nginx/sites-available/auron-os /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
  ```

- [ ] **22. Configure SSL (Let's Encrypt)**
  > DNS must already point to this VPS before running this step.
  ```bash
  sudo apt install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d os.auronevents.com
  # Follow prompts — choose redirect HTTP → HTTPS
  sudo systemctl enable certbot.timer
  ```

---

## Phase 7 — DNS & Go-Live

- [ ] **23. Configure DNS for os.auronevents.com**
  In Hostinger DNS panel (or your DNS provider):

  | Type | Name | Value | TTL |
  |---|---|---|---|
  | A | os | `<your VPS IP>` | 300 |

  Wait for propagation (5–60 min). Verify:
  ```bash
  dig +short os.auronevents.com
  # Should return your VPS IP
  ```

---

## Phase 8 — Verification

- [ ] **24. Test authentication**
  ```bash
  curl -c /tmp/cookies.txt -X POST https://os.auronevents.com/api/login \
    -H "Content-Type: application/json" \
    -d '{"username":"ceo","password":"YOUR_CEO_PASSWORD"}'
  # Expected: {"user":{"id":"...","role":"admin",...}}
  ```

- [ ] **25. Test database access**
  ```bash
  curl -b /tmp/cookies.txt https://os.auronevents.com/api/auth/user
  curl -b /tmp/cookies.txt https://os.auronevents.com/api/dashboard/summary
  ```

- [ ] **26. Test all major application modules** (open in browser)
  - [ ] Dashboard loads with real data
  - [ ] Events list loads
  - [ ] Clients list loads
  - [ ] Finance / P&L loads
  - [ ] Reports page loads
  - [ ] ₹90 Cr Valuation Command loads
  - [ ] Marketing ROI loads
  - [ ] Vendors / Assets / Team load

- [ ] **27. Verify financial calculations**
  - [ ] Gross Profit = Net Revenue − Direct Costs
  - [ ] EBITDA = Gross Profit − Operating Expenses
  - [ ] Margin percentages are correct

- [ ] **28. Verify mobile experience**
  - [ ] Open on iPhone (Safari)
  - [ ] Hamburger menu opens navigation drawer
  - [ ] Tables scroll horizontally
  - [ ] Forms and dialogs usable on mobile

- [ ] **29. Logout works**
  ```bash
  curl -b /tmp/cookies.txt https://os.auronevents.com/api/logout
  ```

- [ ] **30. Only after all checks pass — switch production usage to Hostinger**

---

## Rollback Plan

If anything fails after switching DNS:
```bash
# Point DNS back to Replit (find your .replit.app URL first)
# In Hostinger DNS: change the A record back to Replit's IP
# Or remove the A record to stop routing to VPS
```

Keep the Replit project active as a fallback until Hostinger is fully verified.

---

*Last updated: 2026-08-18*
