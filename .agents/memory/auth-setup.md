---
name: Replit Auth Setup for Auron OS
description: How Replit Auth (OIDC) is wired in this monorepo — server templates, web lib, and key gotchas.
---

## Rule
Use `@workspace/replit-auth-web` for frontend auth — do NOT use generated API hooks for auth. Import `useAuth` from it to get `{ user, isLoading, isAuthenticated, login, logout }`.

## Why
The generated hooks don't include auth endpoints in a way that handles cookies/sessions correctly. The `replit-auth-web` lib wraps the OIDC flow with a simple `fetch('/api/auth/user')` check.

## Key files
- Backend: `artifacts/api-server/src/lib/auth.ts`, `src/middlewares/authMiddleware.ts`, `src/routes/auth.ts`
- Frontend lib: `lib/replit-auth-web/src/` — `use-auth.ts`, `index.ts`
- DB sessions: `lib/db/src/schema/auth.ts` — `sessionsTable` and `usersTable` are mandatory, don't drop.

## Gotcha — import.meta.env
`lib/replit-auth-web` is a shared lib, NOT a Vite project itself. Do NOT use `import.meta.env.BASE_URL` in it (causes `tsc --build` to fail with TS2339). Instead use `document.baseURI` for basepath detection.

## Gotcha — replit-auth-web tsconfig
Must have `composite: true`, `declarationMap: true`, `emitDeclarationOnly: true` for it to work as a TypeScript project reference in the monorepo.
