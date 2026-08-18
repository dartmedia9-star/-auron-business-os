---
name: Demo Data Seed Script
description: Location and execution of the demo seed script for Auron OS.
---

## Rule
Run `npx tsx scripts/seed.ts` from workspace root to seed demo data. No dotenv import needed — DATABASE_URL is already set in the Replit environment.

## Why
The script uses tsx (via npx) to run TypeScript directly. The `import "dotenv/config"` line was removed because it caused an ERR_MODULE_NOT_FOUND error (dotenv not installed at root level).

## What it seeds
- Company settings (Auron Event Productions, GST 32AABCA1234A1ZR, target ₹90 Cr)
- 6 employees (CEO Arjun Nair + team)
- 6 vendors (AV, florals, catering, photo, tent, logistics)
- 7 assets (lighting, sound, LED wall, vehicle, stage, truss, genset)
- 5 marketing channels + 12 months of spend data
- 10 clients (mix of weddings, corporate, government)
- 12 events (completed/in-progress/upcoming) with full revenue + cost breakdowns
- 8 months of operating expenses by category
- 10 leads across all pipeline stages
- 3 valuation scenarios (conservative/base/aggressive)
- 5 notifications, 3 audit log entries

## Important
The `isDemo: true` flag is set on clients, events, and leads seeded here for easy identification.
