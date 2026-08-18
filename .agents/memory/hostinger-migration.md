---
name: Hostinger migration prep
description: Migration from Replit to os.auronevents.com — status of all portability work.
---

## Hostinger Migration — Status (2026-08-18)

Target: `https://os.auronevents.com` — Hostinger VPS, Ubuntu 24.04, Node 20, PostgreSQL 15, Nginx, PM2.

### All portability items complete

| Item | Status | Details |
|---|---|---|
| Auth | ✅ Done | Replit OIDC → local bcrypt (see auth-setup.md) |
| vite.config.ts | ✅ Done | runtimeErrorOverlay gated behind `REPL_ID` check (dynamic import in conditional) |
| @replit/connectors-sdk | ✅ Done | Removed from root package.json |
| DB backup | ✅ Done | `backups/auron_business_os_backup.dump` (52K) + `.sql` (66K) |
| Migration SQL | ✅ Done | `lib/db/migrations/0000_initial_schema.sql` (17 tables, 9.9K) |
| DB schema | ✅ Done | new columns applied via direct SQL: username, password_hash, role, is_active |
| .env.example | ✅ Done | Replit vars removed; APP_URL/BASE_PATH/ documented |
| MIGRATION.md | ✅ Done | 14-step guide with all commands |
| HOSTINGER_MIGRATION_CHECKLIST.md | ✅ Done | 30-item go-live checklist |
| DEPLOYMENT.md | ✅ Done | §7 MySQL→PostgreSQL corrected; §8 auth status updated |

### Key portability notes
- `vite.config.ts` requires `PORT` and `BASE_PATH` env vars at build time; use `BASE_PATH=/` on Hostinger
- Production frontend build verified clean (no REPL_ID set) — 933KB JS bundle
- User creation on Hostinger: `node scripts/create-users-standalone.cjs` (CJS, uses psql stdin)
- drizzle `generate` output → `lib/db/migrations/`; drizzle `migrate` applies them
- lib/db `drizzle.config.ts` has `out: "./migrations"` pointing to the canonical migrations dir
