---
name: Auron OS Database Schema
description: All domain tables and their locations; push command; schema conventions.
---

## Rule
All domain schemas live in `lib/db/src/schema/`. Export everything from `lib/db/src/schema/index.ts`. Run `pnpm --filter @workspace/db run push` after schema changes.

## Why
The api-server imports all tables from `@workspace/db` which re-exports everything from `lib/db/src/index.ts` → `./schema`. If you add a table but forget the index export, you get TS2305 errors across all route files.

## Tables
- `auth.ts` — sessionsTable, usersTable (Replit Auth mandatory)
- `clients.ts` — clientsTable
- `events.ts` — eventsTable (references clientsTable)
- `event-revenue.ts` — eventRevenueTable (unique per event, references eventsTable cascade delete)
- `event-costs.ts` — eventCostsTable (references eventsTable cascade delete)
- `leads.ts` — leadsTable
- `marketing.ts` — marketingChannelsTable, marketingSpendTable
- `finance.ts` — operatingExpensesTable
- `vendors.ts` — vendorsTable
- `assets.ts` — assetsTable
- `employees.ts` — employeesTable
- `valuation.ts` — valuationScenariosTable (targetValuation default = 900000000 = ₹90 Cr)
- `notifications.ts` — notificationsTable
- `settings.ts` — companySettingsTable (single row, upsert pattern)
- `audit-logs.ts` — auditLogsTable

## Convention
All numeric money fields use `numeric(15, 2)` stored as strings in Postgres; always `parseFloat(String(value))` when reading in routes.
