---
name: Auth setup
description: Auth system replaced from Replit OIDC to local bcrypt username/password; migration complete.
---

## Auth System — Local bcrypt (replaced Replit OIDC)

Replit OIDC auth has been fully replaced with a local username/password system.

### What changed
- `artifacts/api-server/src/lib/auth.ts` — OIDC removed; session functions kept; `SessionData = { user: AuthUser }`
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — OIDC token refresh removed; pure session lookup
- `artifacts/api-server/src/routes/auth.ts` — `POST /api/login` (bcrypt), `POST /api/logout`, `GET /api/logout`
- `artifacts/auron-os/src/pages/login.tsx` — username/password form, POSTs to `/api/login`, reloads on success
- `lib/db/src/schema/auth.ts` — added `username varchar(64) UNIQUE`, `password_hash varchar`, `role varchar(32)`, `is_active boolean` to `usersTable`
- `lib/api-zod/src/generated/types/authUser.ts` — added `role: string` and `username: string | null`

### User creation
Run: `node scripts/create-users-standalone.cjs`

**Why standalone CJS not tsx:** The scripts package's local `node_modules` (with bcryptjs) conflicts with workspace dep resolution for drizzle-orm. The CJS script uses bcryptjs from `scripts/node_modules` and psql via stdin (not `-c` shell arg — bcrypt hashes contain `$` which shell expands in double-quoted args).

### Users in DB (created 2026-08-18)
Four users: `ceo` (admin), `finance`, `sales`, `operations` — all with 60-char bcrypt hashes.

### replit-auth-web hook compatibility
`@workspace/replit-auth-web` hook (`useAuth`) is already portable — calls `/api/auth/user`, `/api/login`, `/api/logout` only; no OIDC dependency.
