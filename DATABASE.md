# Auron Business OS — Database Documentation

## Overview

- **Database**: PostgreSQL 15+
- **ORM**: Drizzle ORM (drizzle-orm + drizzle-kit)
- **Schema location**: `lib/db/src/schema/`
- **Connection**: `lib/db/src/index.ts` (reads `DATABASE_URL` env var)
- **Migration tool**: `drizzle-kit push` (development) / `drizzle-kit generate` + `drizzle-kit migrate` (production)

---

## Tables

### 1. `users`
Stores authenticated user accounts (populated by Replit Auth on first login).

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (Replit user ID) |
| `email` | text | Nullable |
| `first_name` | text | Nullable |
| `last_name` | text | Nullable |
| `profile_image_url` | text | Nullable |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

### 2. `sessions`
HTTP session storage (connect-pg-simple).

| Column | Type | Notes |
|---|---|---|
| `sid` | varchar | Primary key (session ID) |
| `sess` | json | Session payload |
| `expire` | timestamp | Expiry time (indexed) |

### 3. `clients`
Client organisations or individuals who book events.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `company` | text | Nullable |
| `contact_person` | text | Nullable |
| `phone` | text | Nullable |
| `email` | text | Nullable |
| `location` | text | Nullable |
| `client_type` | text | individual \| corporate \| government \| ngo \| association \| school |
| `industry` | text | Nullable |
| `lead_source` | text | How client was acquired |
| `notes` | text | Nullable |
| `is_demo` | boolean | Default false (demo seed data flag) |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

**Computed fields** (returned by API, not stored):
- `total_events`: count of linked events
- `lifetime_revenue`: sum of event net revenues
- `lifetime_gross_profit`: sum of event gross profits
- `total_outstanding`: sum of unpaid amounts
- `repeat_client`: true if total_events > 1

### 4. `events`
Core event record for each production.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `client_id` | integer | FK → clients.id (NOT NULL) |
| `name` | text | NOT NULL |
| `event_type` | text | Wedding \| Corporate \| Birthday \| Cultural \| Conference \| Reception \| Other |
| `status` | text | upcoming \| in_progress \| completed \| cancelled |
| `event_date` | date | NOT NULL |
| `venue` | text | Nullable |
| `location` | text | Nullable |
| `salesperson_id` | integer | FK → employees.id (Nullable) |
| `operations_manager_id` | integer | FK → employees.id (Nullable) |
| `lead_source` | text | Nullable |
| `notes` | text | Nullable |
| `is_demo` | boolean | Default false |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

**Computed fields** (returned by API):
- `total_revenue`: from event_revenue.net_revenue
- `total_cost`: sum of event_costs.amount + event_costs.gst
- `gross_profit`: total_revenue − total_cost
- `gross_margin_pct`: (gross_profit / total_revenue) × 100
- `profitability_indicator`: excellent (≥40%) \| healthy (≥25%) \| warning (≥0%) \| loss (<0%) \| awaiting_data
- `total_collected`: advance + second + final payments received
- `total_outstanding`: net_revenue − total_collected

### 5. `event_revenue`
One-to-one with events. Records the contract value and payment schedule.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `event_id` | integer | FK → events.id (unique, cascade delete) |
| `contract_value` | numeric(14,2) | Gross contract amount |
| `discount` | numeric(14,2) | Default 0 |
| `gst` | numeric(14,2) | GST amount (NOT revenue; treat as tax liability) |
| `net_revenue` | numeric(14,2) | Computed: contract_value − discount |
| `advance_received` | numeric(14,2) | Default 0 |
| `second_payment` | numeric(14,2) | Default 0 |
| `final_payment` | numeric(14,2) | Default 0 |
| `payment_status` | text | pending \| partially_paid \| paid \| overdue |
| `invoice_number` | text | Nullable |
| `due_date` | date | Nullable |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

**Financial note**: GST collected is a liability to the government, not business revenue. The API uses `net_revenue` (contract minus discount) as the revenue figure in all P&L calculations. GST is tracked separately.

### 6. `event_costs`
Direct costs incurred per event (COGS). Many-to-one with events.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `event_id` | integer | FK → events.id (cascade delete) |
| `vendor_id` | integer | FK → vendors.id (Nullable) |
| `category` | text | Venue \| Catering \| Décor \| AV \| Photography \| Videography \| DJ/Music \| Security \| Staffing \| Transport \| Other |
| `description` | text | Nullable |
| `amount` | numeric(14,2) | Base cost (NOT NULL) |
| `gst` | numeric(14,2) | Default 0 |
| `total_amount` | numeric(14,2) | Computed: amount + gst |
| `payment_status` | text | pending \| paid \| partially_paid |
| `date` | date | Nullable (expense date) |
| `reference_number` | text | Nullable |
| `created_at` | timestamp | Auto-set |

### 7. `leads`
Sales pipeline leads. May or may not be linked to an existing client.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `client_id` | integer | FK → clients.id (Nullable — link after conversion) |
| `contact_name` | text | NOT NULL |
| `contact_phone` | text | Nullable |
| `contact_email` | text | Nullable |
| `source` | text | referral \| instagram \| facebook \| website \| google \| walk_in \| event_expo \| other |
| `event_type` | text | Expected event type |
| `expected_value` | numeric(14,2) | Estimated deal value |
| `expected_profit` | numeric(14,2) | Nullable |
| `probability` | integer | 0–100 % |
| `salesperson_id` | integer | FK → employees.id (Nullable) |
| `date_received` | date | When lead came in |
| `follow_up_date` | date | Nullable |
| `status` | text | new \| contacted \| qualified \| requirement_received \| proposal_sent \| negotiation \| won \| lost |
| `lost_reason` | text | Nullable |
| `notes` | text | Nullable |
| `is_demo` | boolean | Default false |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

**Computed field**: `weighted_value` = expected_value × (probability / 100)

### 8. `marketing_channels`
Defines a marketing channel (e.g. Instagram Ads, Referral).

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `is_active` | boolean | Default true |
| `created_at` | timestamp | Auto-set |

### 9. `marketing_spend`
Monthly marketing spend per channel with performance metrics.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `channel_id` | integer | FK → marketing_channels.id |
| `year` | integer | NOT NULL |
| `month` | integer | 1–12 |
| `amount` | numeric(14,2) | Spend amount |
| `leads_generated` | integer | Default 0 |
| `qualified_leads` | integer | Default 0 |
| `customers_acquired` | integer | Default 0 |
| `revenue_generated` | numeric(14,2) | Default 0 |
| `gross_profit_generated` | numeric(14,2) | Default 0 |
| `notes` | text | Nullable |
| `created_at` | timestamp | Auto-set |

**CAC formula**: amount / customers_acquired (per channel)  
**LTV formula**: total lifetime gross profit / total customers (company-wide)

### 10. `operating_expenses`
Company-level overhead / SG&A (not direct event costs).

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `category` | text | Rent \| Salaries \| Marketing \| Admin \| Utilities \| Insurance \| Software \| Equipment \| Other |
| `description` | text | NOT NULL |
| `amount` | numeric(14,2) | NOT NULL |
| `gst` | numeric(14,2) | Default 0 |
| `year` | integer | NOT NULL |
| `month` | integer | NOT NULL |
| `date` | date | Nullable (specific expense date) |
| `reference_number` | text | Nullable |
| `created_at` | timestamp | Auto-set |

**Financial note**: These are company-level overheads subtracted from Gross Profit to arrive at EBITDA. They must NOT include event-level costs (which live in `event_costs`).

### 11. `vendors`
Supplier/service-provider directory.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `category` | text | Catering \| Décor \| AV-Tech \| Photography \| Videography \| DJ-Music \| Venue \| Security \| Transport \| Staffing \| Other |
| `contact_person` | text | Nullable |
| `phone` | text | Nullable |
| `email` | text | Nullable |
| `location` | text | Nullable |
| `payment_terms` | text | Nullable |
| `rating` | integer | 1–5 Nullable |
| `notes` | text | Nullable |
| `is_demo` | boolean | Default false |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

### 12. `assets`
Company-owned equipment and property.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `category` | text | Audio \| Lighting \| Staging \| Vehicle \| Furniture \| Tent \| Generator \| Camera \| Other |
| `purchase_date` | date | NOT NULL |
| `purchase_cost` | numeric(14,2) | NOT NULL |
| `current_book_value` | numeric(14,2) | Nullable (manual update) |
| `storage_location` | text | Nullable |
| `condition` | text | excellent \| good \| fair \| poor \| retired |
| `maintenance_cost` | numeric(14,2) | Default 0 |
| `rental_value` | numeric(14,2) | Nullable |
| `notes` | text | Nullable |
| `is_demo` | boolean | Default false |
| `created_at` | timestamp | Auto-set |

### 13. `employees`
Team members and HR records.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `role` | text | NOT NULL |
| `department` | text | Operations \| Sales \| Creative \| Finance \| Admin \| Tech \| Other |
| `salary` | numeric(14,2) | Nullable |
| `joining_date` | date | NOT NULL |
| `responsibilities` | text | Nullable |
| `is_active` | boolean | Default true |
| `is_demo` | boolean | Default false |
| `created_at` | timestamp | Auto-set |

### 14. `valuation_scenarios`
Strategic scenarios for the ₹90 Crore valuation target.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | NOT NULL |
| `scenario_type` | text | conservative \| base \| aggressive \| custom |
| `target_valuation` | numeric(14,2) | Default 900,000,000 (₹90 Cr) |
| `current_revenue` | numeric(14,2) | Manual input or synced from live data |
| `current_ebitda` | numeric(14,2) | Nullable |
| `current_net_profit` | numeric(14,2) | Nullable |
| `revenue_growth_rate` | numeric(8,2) | % per year |
| `ebitda_margin` | numeric(8,2) | % |
| `revenue_multiple` | numeric(8,2) | Valuation/Revenue multiple |
| `ebitda_multiple` | numeric(8,2) | Valuation/EBITDA multiple |
| `notes` | text | Nullable |
| `is_default` | boolean | Default false |
| `created_at` | timestamp | Auto-set |

**Computed fields** (returned by API, derived at query time):
- `estimated_valuation`: max(revenue × revenue_multiple, ebitda × ebitda_multiple)
- `gap_to_target`: target_valuation − estimated_valuation
- `required_revenue`: target_valuation / revenue_multiple
- `required_annual_growth`: CAGR needed to reach required_revenue

### 15. `notifications`
In-app notifications.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `type` | text | alert \| info \| success \| warning |
| `title` | text | NOT NULL |
| `message` | text | NOT NULL |
| `is_read` | boolean | Default false |
| `link` | text | Nullable (deep link) |
| `created_at` | timestamp | Auto-set |

### 16. `company_settings`
Single-row settings table (upsert pattern).

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key (always row 1) |
| `company_name` | text | Default: "Auron Event Productions" |
| `country` | text | Default: "India" |
| `currency` | text | Default: "INR" |
| `gst_number` | text | Nullable |
| `gst_rate` | numeric(5,2) | Default 18 |
| `excellent_margin_threshold` | numeric(5,2) | Default 40 |
| `healthy_margin_threshold` | numeric(5,2) | Default 25 |
| `warning_margin_threshold` | numeric(5,2) | Default 15 |
| `ltv_cac_target` | numeric(8,2) | Default 3.0 |
| `cac_target` | numeric(14,2) | Nullable |
| `valuation_target` | numeric(14,2) | Default 900,000,000 |
| `updated_at` | timestamp | Auto-updated |

### 17. `audit_logs`
Immutable log of all data-modifying actions.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | Primary key |
| `user_id` | text | FK → users.id (Nullable) |
| `action` | text | create \| update \| delete |
| `entity_type` | text | e.g. "event", "client" |
| `entity_id` | text | ID of affected record |
| `old_values` | json | Nullable (previous state) |
| `new_values` | json | Nullable (new state) |
| `ip_address` | text | Nullable |
| `created_at` | timestamp | Auto-set |

---

## Relationships

```
clients ──< events ──< event_costs >── vendors
                └──< event_revenue

employees >── events (salesperson, ops_manager)
employees >── leads (salesperson)

marketing_channels ──< marketing_spend
leads >── clients (optional, after conversion)
```

---

## Key Financial Calculations

### Gross Profit (per event)
```
gross_profit = net_revenue − SUM(event_costs.total_amount)
gross_margin_pct = (gross_profit / net_revenue) × 100
```

### EBITDA (company level)
```
ebitda = SUM(gross_profit) − SUM(operating_expenses.amount)
ebitda_margin_pct = (ebitda / total_revenue) × 100
```

### CAC (per channel)
```
cac = marketing_spend.amount / marketing_spend.customers_acquired
```

### LTV
```
ltv = total_lifetime_gross_profit / total_customers
ltv_cac_ratio = ltv / blended_cac
```

### Repeat Client Rate
```
repeat_client_rate = (clients with total_events > 1 / total_clients) × 100
```

---

## Indexes

The following indexes exist on the schema:
- `sessions(expire)` — session cleanup
- `events(client_id)` — event queries by client
- `events(event_date)` — date range queries
- `event_costs(event_id)` — cost queries by event
- `event_revenue(event_id)` — unique index (one revenue per event)
- `leads(status)` — pipeline stage filtering
- `marketing_spend(channel_id, year, month)` — ROI queries
- `operating_expenses(year, month)` — P&L date filtering
- `audit_logs(entity_type, entity_id)` — audit trail lookup

---

## Demo Data

The seed script at `scripts/seed.ts` inserts realistic Kerala event production data:
- 10 clients (5 individual, 5 corporate/association)
- 12 events (18-month spread, various types)
- Full revenue + itemised costs per event
- 6 vendors, 7 assets, 6 employees
- 5 marketing channels + 12 months of spend history
- 10 leads in various pipeline stages
- 3 valuation scenarios (conservative, base, aggressive)
- 5 notifications

All demo records have `is_demo = true` and can be identified/removed independently.

Run seed:
```bash
npx tsx scripts/seed.ts
```

---

*Last updated: 2026-08-18*
