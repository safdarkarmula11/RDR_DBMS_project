# NimbusHost - Cloud Hosting Management System

A multi-tenant cloud hosting platform (a miniature AWS or DigitalOcean) where **the database is the brain**. Business rules, billing logic, scheduling, auditing and integrity checks live in MySQL itself (constraints, triggers, stored procedures, scheduled events). A thin Node.js API and a role-based React console sit on top.

Built as the project for **AI203 - Database Management Systems**, Department of Artificial Intelligence, SVNIT Surat.

| | |
|---|---|
| **Stack** | MySQL 8, Node.js 20 + Express 4, React 18 + Vite (plain JavaScript) |
| **Database objects** | 35 tables, 27 stored procedures, 10 functions, 79 triggers, 25 views, 7 scheduled events |
| **Analytics** | 20 SQL reports (window functions, recursive CTEs, ROLLUP, JSON_TABLE, full-text search) |
| **Roles** | Super admin, Billing, Support, Customer (owner and member) |

## Contents

1. [Highlights](#1-highlights)
2. [Architecture](#2-architecture)
3. [Repository layout](#3-repository-layout)
4. [Quick start (Windows, macOS, Linux)](#4-quick-start)
5. [Configuration](#5-configuration)
6. [Demo accounts and permissions](#6-demo-accounts-and-permissions)
7. [The database](#7-the-database)
8. [Backend API](#8-backend-api)
9. [Frontend console](#9-frontend-console)
10. [Security model](#10-security-model)
11. [Reports R1 to R20](#11-reports-r1-to-r20)
12. [Testing, benchmarks and data generation](#12-testing-benchmarks-and-data-generation)
13. [Troubleshooting](#13-troubleshooting)
14. [Known limitations](#14-known-limitations)
15. [Design notes](#15-design-notes)
16. [Conventions and team](#16-conventions-and-team)

---

## 1. Highlights

| Area | What it demonstrates |
|---|---|
| Compute scheduler | `sp_launch_instance` places a server on the fullest host that still has room (best fit) with `SELECT ... FOR UPDATE SKIP LOCKED`, so concurrent launches do not claim the same slot. Host selection, instance insert and IP allocation commit atomically. |
| Rules enforced for every writer | Quotas, host state, capacity limits, status state machines and attach rules are enforced by `BEFORE` triggers, so direct SQL cannot bypass them. |
| Temporal pricing | Prices are a history table (`valid_from` / `valid_to`), not a column. `fn_hourly_price(type, date)` answers "what did this cost on that day?". Overlapping periods are rejected by trigger. |
| Metering and billing | Usage goes into a range-partitioned table, is rolled up nightly and billed monthly (18% tax, credit-balance deduction) inside transactional procedures. |
| Audit trail | `AFTER` triggers write a JSON before/after trail to an append-only `audit_log`, attributed to the real user through session variables set by the API. |
| Consistency auditing | `sp_check_consistency()` checks 11 cross-table invariants (host counters, invoice arithmetic, payments, orphan usage, quotas, price overlaps, credit sanity). |
| Analytics | A star schema (`dim_date`, `dim_org`, `dim_type`, `fact_usage_daily`) plus 20 reports. |
| Query optimization | A Performance Lab that runs real `EXPLAIN ANALYZE` comparisons with and without indexes, plus a bulk data generator. |
| Normalization | Written normalization proof, a real decomposition (`images` into `operating_systems` and `images`), and the removal of every derived column, so all 35 relations are in 3NF (and BCNF) with no exceptions (see section 15). |
| Concurrency | Row locking, `SKIP LOCKED`, lock ordering, deadlock handling, and a script that demonstrates every isolation anomaly with real connections. |
| Database security and recovery | Roles, least-privilege grants and column-level privileges (`database/security/`), logical backups and point-in-time recovery. |

---

## 2. Architecture

```
React 18 + Vite            Express API (port 5000)              MySQL 8 (nimbushost)
http://localhost:5173  -->  JWT auth, RBAC, Zod validation  -->  tables, triggers, procedures,
(Vite proxies /api)         helmet, rate limiting                 views, scheduled events
                            role-specific DB pools
```

**Write request flow:** validate input (Zod) -> authenticate (JWT) -> authorize (role and tenant guard) -> get a connection for that role -> set `@app_user_id`, `@app_org_id`, `@app_role` -> call a stored procedure or run parameterized SQL -> triggers apply the rules and write the audit row -> SQL errors (`SQLSTATE 45000`) are mapped to readable HTTP 400 responses.

---

## 3. Repository layout

```
.
├── database/                     Numbered SQL files, applied in order by `npm run db:setup`
│   ├── 01_schema.sql               35 tables, constraints, indexes, partitioning, derived-value views
│   ├── 02_functions.sql            10 stored functions
│   ├── 03_procedures.sql           27 stored procedures (including sp_check_consistency, the star-schema ETL and partition maintenance)
│   ├── 04_triggers.sql             79 triggers (rules, audit, immutability)
│   ├── 05_views.sql                22 views (internal, tenant-scoped "my_*", images, star schema); 3 more derived-value views are at the end of 01_schema.sql
│   ├── 06_events.sql               7 scheduled events
│   ├── 07_seed.sql                 Reference data: tiers, orgs, regions, hosts, types, images, pricing, IP pool
│   ├── security/roles_and_grants.sql  Database roles, accounts and least-privilege grants (run by hand)
│   └── tests/phase1_tests.sql      Acceptance tests (destructive, see section 12)
├── backend/                      Express API
│   ├── src/
│   │   ├── server.js, config.js, db.js
│   │   ├── routes/                 17 route modules
│   │   ├── middleware/             auth, rbac, validation, rateLimiter, requestId, errorHandler
│   │   ├── services/               auth.service.js, billing.service.js
│   │   ├── validation/schemas.js   Zod request schemas
│   │   └── lib/splitSql.js         SQL file splitter (understands DELIMITER blocks)
│   ├── scripts/                    runSql, seedUsers, checkConnection, testSplitter, generateData, smokeTest,
│   │                               integrityTests, concurrencyDemo, backup.ps1, restore.ps1
│   └── .env.example
├── frontend/                     React (Vite) console
│   └── src/ auth/  layout/  pages/ (admin, billing, support)  ui/  styles/  api.js  nav.js
└── README.md                     This file
```

---

## 4. Quick start

### Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20 or newer | `node -v` |
| MySQL Server | 8.0.16 or newer (needs CHECK constraints, CTEs, window functions, SKIP LOCKED) | `mysql --version` |
| Git | any recent | `git --version` |
| MySQL Workbench | optional | handy for EXPLAIN visuals |

Make sure the MySQL service is running (Windows: Services app, look for MySQL80).

### Step 1. Enable two MySQL settings (once)

Log in with `mysql -u root -p` (on Windows you can use "MySQL 8.0 Command Line Client" from the Start menu) and run:

```sql
SET PERSIST event_scheduler = ON;
SET PERSIST log_bin_trust_function_creators = 1;
```

These let the scheduled events run and let functions be created. `PERSIST` survives restarts.

### Step 2. Configure the backend

```powershell
cd backend
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

Open `.env` and use your MySQL account. Using `root` for local development:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_NAME=nimbushost
DB_USER=root
DB_PASSWORD=your_root_password

JWT_SECRET=replace_with_a_long_random_string
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
CORS_ORIGIN=http://localhost:5173
```

Delete any `DB_ADMIN_*`, `DB_SUPPORT_*`, `DB_BILLING_*` and `DB_CUSTOMER_*` lines. When they are missing the backend falls back to `DB_USER` and `DB_PASSWORD`. If they stay in the file they still point to the old example account and cause access-denied errors.

### Step 3. Install and build the database

```powershell
npm install
npm run check-db        # should print: Connected to MySQL 8.x
npm run db:setup        # creates "nimbushost" and applies database/01 to 07
npm run seed-users      # creates the 5 demo logins and attaches the Acme customers
```

### Step 4. Run the app (two terminals)

```powershell
# Terminal 1 - API on http://localhost:5000
cd backend
npm run dev

# Terminal 2 - UI on http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with one of the [demo accounts](#6-demo-accounts-and-permissions).

Notes:
- `http://localhost:5000` itself shows `{"code":"NOT_FOUND"}`. That is normal, because the backend is an API with no home page. Use `http://localhost:5000/api/health` to test it, and the website on port 5173.
- At startup the backend log may show `Refresh token is required`, and the browser console may show two `401` responses from `/api/auth/refresh`. That is the app checking for a saved session before you log in. It is harmless.

### Step 5 (optional). Load test data and verify

```powershell
cd backend
node scripts/generateData.js                              # about 90,000 usage rows
node scripts/generateData.js --instances=100 --days=365   # about 1,000,000 usage rows
node scripts/smokeTest.js                                 # backend must be running
node scripts/integrityTests.js                            # database rules, rolled back
node scripts/concurrencyDemo.js                           # concurrency and isolation demo
```

### Backend scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with `node --watch` (auto-restart) |
| `npm start` | Start the API without watch mode |
| `npm run check-db` | Check the MySQL connection and print the server version |
| `npm run db:setup` | Create the database if missing and apply only the new SQL files |
| `npm run db:reset` | Drop the whole database and rebuild it (run `seed-users` again afterwards) |
| `npm run seed-users` | Create or refresh the 5 demo users |
| `npm run test:sql-splitter` | Self-test for the SQL statement splitter |
| `node scripts/generateData.js` | Bulk test-data generator (section 12) |
| `node scripts/smokeTest.js` | Call every endpoint as every role and report failures (section 12) |
| `node scripts/integrityTests.js` | 29 database integrity and normalization tests, rolled back (section 12) |
| `node scripts/concurrencyDemo.js` | Isolation levels, lost update, deadlock, SKIP LOCKED, quota race (section 12) |
| `.\scripts\backup.ps1`, `.\scripts\restore.ps1` | Logical backup and restore |

### How migrations work

`db:setup` reads `database/NN_*.sql` (two-digit prefix, top-level folder only), sorts them and applies each file once. Every applied file is recorded in a `_migrations` table with a SHA-256 checksum:

- Applied files are skipped, so running `db:setup` again is safe.
- If you edit a file that was already applied, the runner refuses to continue. During development run `npm run db:reset` then `npm run seed-users`. For a shared database, add a new numbered file instead.
- The splitter understands `DELIMITER` blocks, so procedures, functions, triggers and events load correctly.

---

## 5. Configuration

All backend settings live in `backend/.env`. It is already in `.gitignore`; never commit it.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port. If you change it, also change the proxy in `frontend/vite.config.js`. |
| `NODE_ENV` | `development` | In `production` the backend refuses to start with the example `JWT_SECRET`. |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | `localhost`, `3306`, `nimbushost` | MySQL connection |
| `DB_USER`, `DB_PASSWORD` | none | Account used by the API, migrations and scripts |
| `DB_ADMIN_*`, `DB_SUPPORT_*`, `DB_BILLING_*`, `DB_CUSTOMER_*` | fall back to `DB_USER` / `DB_PASSWORD` | Optional per-role MySQL accounts |
| `JWT_SECRET` | none | Signing key for access tokens. Use your own long random string. |
| `JWT_EXPIRES_IN` | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Refresh-token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin |

---

## 6. Demo accounts and permissions

`npm run seed-users` creates these logins (development only):

| Role | Email | Password | Lands on |
|---|---|---|---|
| Super admin | `admin@nimbus.test` | `admin123` | `/admin/capacity` |
| Support | `support@nimbus.test` | `support123` | `/support/queue` |
| Billing | `billing@nimbus.test` | `billing123` | `/billing` |
| Customer owner (Acme Robotics) | `owner@acme.test` | `customer123` | `/` |
| Customer member (Acme Robotics) | `dev@acme.test` | `customer123` | `/` |
| Load-test owner (created by `generateData.js`) | `owner@loadtest.test` | `LoadTest123!` | `/` |

New customers can register at `/register` (organization name, full name, email, password of at least 12 characters). That creates an organization on the Starter tier (or Free) and makes the registrant its owner.

| Role | Can do |
|---|---|
| Super admin | Everything: capacity, hosts and regions, pricing, audit log, consistency checks, Performance Lab, reports, simulator. As staff, only a super admin can terminate or resize customer instances. |
| Billing | Invoices, invoice generation, aging, credits, revenue analytics. Cannot change instances. |
| Support | Ticket queue, assigned tickets, customer lookup, SLA board. Can start and stop customer instances to help. |
| Customer owner | Launch, start, stop, resize and terminate servers; volumes, snapshots, network and DNS; pay invoices; manage the team and API keys; tickets. |
| Customer member | Launch, start and stop servers; volumes, snapshots; tickets. |

An owner can add a team member only if that person already has a customer account and does not belong to another organization.

---

## 7. The database

### 7.1 Schema (35 tables)

| Domain | Tables |
|---|---|
| Identity and tenancy | `account_tiers`, `organizations` (self-referencing parent for org hierarchy), `users`, `org_members`, `api_keys`, `refresh_tokens` |
| Infrastructure and catalog | `regions`, `hosts`, `instance_types`, `operating_systems`, `images`, `pricing` (temporal) |
| Compute | `instances`, `ip_addresses` |
| Storage | `volumes`, `snapshots` |
| Network | `domains`, `dns_records` |
| Metering | `usage_records` (monthly range-partitioned), `daily_usage_summary` |
| Billing | `invoices`, `invoice_items`, `payments`, `billing_errors` |
| Support | `tickets`, `ticket_messages` |
| Governance | `audit_log`, `security_log` |
| Analytics (star schema) | `dim_date`, `dim_org`, `dim_type`, `fact_usage_daily` (loaded by `sp_refresh_star_schema`) |


### 7.2 Design decisions

- **Partitioned metering.** `usage_records` is `PARTITION BY RANGE COLUMNS(recorded_at)` with monthly partitions (Jul 2026 to Jun 2027, plus `pmax`). MySQL forbids foreign keys on partitioned tables, so integrity comes from `sp_record_usage` and a `BEFORE INSERT` trigger. `type_id` is stored at metering time so usage is priced correctly even after a resize.
- **Soft deletes and immutability.** Instances, volumes, domains, organizations, invoices, payments, pricing rows and the audit log cannot be hard-deleted (the audit log and payments cannot be updated either). Triggers enforce this so billing history stays intact.
- **Functional unique indexes.** `uq_inst_live_name` and `uq_vol_live_name` index `IF(status = 'terminated'/'deleted', NULL, name)`, so a name is unique among live resources and can be reused after termination, with no stored derived column. `auto_backup` is a real column; `sp_launch_instance` moves it out of the JSON `config`.
- **Normalization.** `images` was split into `operating_systems` and `images` to remove the dependency `name -> os_family` (3NF/BCNF); every other derived value was removed too (invoice `tax`/`total`, line `amount`, usage `org_id`, `live_name`, `month_name`/`quarter`/`is_weekend`) and is computed by the views `v_invoices`, `v_invoice_items` and `v_usage_records` or the lookup tables `dim_month` and `dim_weekday`.
- **Guarded denormalization.** `hosts.used_vcpu/ram/disk` are maintained by triggers, protected by `CHECK (used <= total)` and verified by `sp_check_consistency()`. Other cross-table summaries (`invoices.subtotal`, `daily_usage_summary`, the star schema) are rebuilt and checked by `sp_check_consistency()`.
- **Money is `DECIMAL`**, never floating point.
- **Rules raise `SQLSTATE 45000`** with readable messages. The API maps them to HTTP 400.

### 7.3 Stored functions (10)

`fn_hourly_price`, `fn_org_running_instances`, `fn_org_active_instances`, `fn_org_quota_left`, `fn_org_storage_used`, `fn_org_storage_left`, `fn_instance_volume_count`, `fn_invoice_balance`, `fn_host_utilization`, `fn_current_org_id`

### 7.4 Stored procedures (27)

| Group | Procedures |
|---|---|
| Compute | `sp_launch_instance` (scheduler), `sp_allocate_ip`, `sp_set_instance_status`, `sp_terminate_instance`, `sp_resize_instance` |
| Metering and billing | `sp_record_usage`, `sp_generate_invoice`, `sp_run_monthly_billing`, `sp_apply_payment` (methods: card, upi, netbanking, credit) |
| Storage | `sp_create_volume`, `sp_attach_volume`, `sp_detach_volume`, `sp_resize_volume`, `sp_delete_volume`, `sp_take_snapshot`, `sp_restore_snapshot`, `sp_delete_snapshot` |
| Network | `sp_register_domain`, `sp_renew_domain`, `sp_validate_dns_record` |
| Pricing | `sp_assert_no_price_overlap`, `sp_set_price` |
| Maintenance | `sp_rollup_daily_usage`, `sp_drop_old_partitions`, `sp_add_future_partitions`, `sp_check_consistency` |
| Analytics (ETL) | `sp_refresh_star_schema` |

Concurrency notes: storage procedures lock the organization row (`SELECT ... FOR UPDATE`) before checking quota, so two simultaneous requests cannot both squeak under the limit. `sp_set_instance_status` locks the instance row to serialize state changes.

### 7.5 Triggers (75)

| Table | Behaviour |
|---|---|
| `instances` | Quota, org, image and host checks on insert; capacity counters on insert and update; status state machine (terminated is final); delete blocked; terminating detaches volumes |
| `hosts` | State machine (retired is final); audit of capacity and status changes |
| `pricing` | No overlapping periods; delete blocked; audit |
| `invoices`, `payments` | Status rules; deletes blocked; payments immutable; audit |
| `volumes`, `snapshots` | Attach rules (same org, same region, live instance, max 5 per instance); soft delete; audit |
| `domains`, `dns_records` | Expiry rules; record validation (IPv4/IPv6, CNAME exclusivity, MX priority, no A record pointing at another tenant's IP); audit |
| `organizations`, `users`, `org_members`, `api_keys` | Audit; organization delete blocked |
| `usage_records` | Referential checks in place of foreign keys |
| `audit_log` | Update and delete blocked (append-only) |
| `usage_records` | Also append-only: update and delete are blocked |
| `invoice_items` | Can only change while the invoice is a draft |
| `tickets`, `ticket_messages` | Creator must belong to the organization, assignee must be support staff, closed is final, sender must be a member or staff; audited |
| `account_tiers`, `regions`, `instance_types`, `operating_systems`, `images` | Audit of insert, update and delete |

### 7.6 Views (22)

- **Catalog and analytics:** `v_images` (image with its operating system), `v_star_usage_monthly` (star schema)
- **Internal and reporting:** `v_host_capacity`, `v_instances`, `v_running_instances`, `v_org_quota`, `v_current_pricing`, `v_pricing_history`, `v_volumes`, `v_snapshots`, `v_org_storage`, `v_domains`, `v_org_ips`, `v_org_monthly_cost`, `v_overdue_invoices`, `v_revenue_by_region`, `v_ticket_sla`
- **Tenant-scoped (`v_my_*`):** `v_my_instances`, `v_my_volumes`, `v_my_invoices`, `v_my_tickets`, `v_my_usage`. They filter by `fn_current_org_id()` so a customer session only sees its own rows.

### 7.7 Scheduled events (7)

They need `event_scheduler = ON`.

| Event | Schedule | Action |
|---|---|---|
| `ev_hourly_metering` | Every 1 minute (demo mode) | Records 0.017 `cpu_hour` for every running instance through `sp_record_usage` |
| `ev_nightly_rollup` | Daily 00:15 | Aggregates yesterday's usage into `daily_usage_summary` |
| `ev_monthly_invoicing` | 1st of month, 01:00 | Runs `sp_run_monthly_billing` for the previous month |
| `ev_suspend_overdue` | Daily 06:00 | Marks past-due invoices `overdue`; suspends organizations overdue by more than 30 days and their running instances |
| `ev_purge_usage` | Monthly | Drops usage partitions older than 24 months |
| `ev_refresh_star` | Daily 00:30 | Refreshes the star schema for yesterday and today |
| `ev_add_partitions` | Monthly | Keeps monthly usage partitions ready for the next 6 months |

The 1-minute metering interval is accelerated on purpose so dashboards move during a demo. For real hourly semantics change it to hourly and the quantity to `1.0`.

### 7.8 Billing logic

1. Only compute usage (`cpu_hour`) is billed. Usage rows are grouped per instance and priced with the price version that was valid on the day each row was recorded, so a month that spans a price change gets separate invoice lines per rate.
2. **Subtotal** is the sum of line items; **tax** is 18% of the subtotal.
3. The organization's **credit balance** is applied (up to the pre-credit total) and decremented atomically.
4. **Total** = subtotal + tax - credit applied. The invoice is issued with a 30-day due date, then moves to `paid` or `overdue` through payments (`sp_apply_payment`).
5. An invoice with a zero total (no usage, or fully covered by credit) is marked `paid` immediately, so it can never turn overdue.
6. Overlapping invoice periods for the same organization are rejected.
7. Paying with method `credit` deducts `credit_balance`.
8. Account tiers carry `max_instances`, `max_storage_gb` and a `discount_pct`.

---

## 8. Backend API

Base URL `http://localhost:5000`. Errors use the shape `{ "code": "...", "msg": "..." }`. Every request gets an ID (`X-Request-Id`).

| Prefix | Purpose | Highlights |
|---|---|---|
| `/api/health` | Liveness and DB status | API ok and MySQL version |
| `/api/auth` | Authentication | `register`, `login`, `refresh`, `logout`, `me`, API-key list/create/revoke |
| `/api/orgs` | Organizations and teams | Orgs, members, `/:id/cost-tree` (recursive org cost) |
| `/api/catalog` | Read-only catalog | `regions`, `instance-types`, `images` |
| `/api/infra` | Hosts and regions (admin) | `capacity` (ROLLUP), host/region/type CRUD, infra audit |
| `/api/pricing` | Temporal pricing | List, per-type history, `/:typeId/as-of/:date`, set price (admin) |
| `/api/instances` | Compute | List, quota, detail, launch, start/stop, resize, terminate, history |
| `/api/storage` | Volumes and snapshots | Quota, create/attach/detach/resize/delete, snapshot/restore/delete |
| `/api/network` | IPs, domains, DNS | Register/renew domains, DNS record CRUD |
| `/api/billing`, `/api/invoices` | Billing | Invoices, aging, overview, credits, generate invoices, payments |
| `/api/usage` | Metered usage | Tenant-scoped usage queries |
| `/api/tickets` | Support tickets | CRUD, messages, full-text `/search` |
| `/api/support` | Support tools | Queue, assign, status, my-tickets, SLA, customers |
| `/api/reports` | Analytics | `/R1` to `/R20` |
| `/api/admin` | Admin tools | Consistency check, audit log, slow queries, usage simulation, Performance Lab (`/perf/benchmarks`, `/perf/run`) |
| `/api/simulator` | Demo helpers (admin) | `tick-usage`, `run-billing`, `fail-host` |

---

## 9. Frontend console

React 18 with React Router, TanStack Query, Recharts and Lucide icons. Navigation and route guards are role-driven (`nav.js`, `RequireRole`, `can.js`). The app is designed for desktop screens.

| Persona | Pages |
|---|---|
| Customer | Dashboard, Instances (with Launch Wizard and Instance Detail), Volumes, Snapshots, Network and DNS, Invoices (with Invoice Detail), Usage, Tickets, Team and API Keys |
| Super admin | Capacity, Hosts and Regions, Pricing, Audit Log, Consistency, Performance Lab, Reports (R1 to R20), Simulator |
| Billing | Billing Overview, All Invoices, Generate Invoices, Aging, Credits, Revenue |
| Support | Ticket Queue, My Tickets, Customers, SLA Board |

Every data page shows real data only. A failed request shows a red banner with the server's message, and an empty list shows an empty table. Shared UI components are in `src/ui/` and design tokens in `styles/tokens.css`.

Production build: `cd frontend && npm run build` (output in `dist/`), preview with `npm run preview`.

---

## 10. Security model

- **Authentication.** bcrypt password hashing; short-lived JWT access tokens (15 minutes) plus rotating refresh tokens tracked by token family (reuse detection); account lockout after repeated failed logins; security events in `security_log`.
- **Authorization.** Role checks (`requireRole`), owner-only actions (`requireOwner`) and a tenant guard that returns `404` (not `403`) for another tenant's resources. The organization id comes from the login token, never from the request body.
- **Defence in depth in the database.** Tenant-scoped `v_my_*` views and triggers that enforce the same rules whatever the caller.
- **HTTP hardening.** `helmet`, locked-down CORS (one origin, credentials), `hpp`, 100 KB JSON limit, a global rate limit of 100 requests per minute with stricter limits on auth routes, `X-Powered-By` disabled.
- **Input validation.** Zod schemas on bodies, params and queries; parameterized SQL (`?` placeholders) everywhere.
- **Accountability.** Every write runs inside `withDb` / `withUser`, setting `@app_user_id`, `@app_org_id` and `@app_role` so audit triggers know who acted.
- **Production guard.** With `NODE_ENV=production` the backend exits if `JWT_SECRET` is still the example value.

---

## 11. Reports R1 to R20

Available at `/api/reports/R<n>` and in the admin Reports page. Each one showcases a different SQL technique.

| # | Report | Technique |
|---|---|---|
| R1 | Monthly revenue by region and instance type | 5-table JOIN, `GROUP BY ... WITH ROLLUP` |
| R2 | Top 10 customers by spend, rank and share | `RANK()`, `SUM() OVER ()` |
| R3 | Month-over-month revenue growth | `LAG()` |
| R4 | Running cost within the month per organization | `SUM() OVER (ORDER BY ...)` |
| R5 | Customer segmentation into spend quartiles | `NTILE(4)` |
| R6 | Total cost of an org including child orgs | Recursive CTE |
| R7 | Resource dependency tree (instance, volumes, snapshots, IP) | JOINs, `UNION ALL` |
| R8 | Hosts above 85% utilization by region | Aggregate, `HAVING` |
| R9 | Never raised a ticket but spend above average | Subquery, `NOT EXISTS` |
| R10 | Overdue aging buckets | `CASE`, `DATEDIFF` |
| R11 | Instances launched per hour of day | `GROUP BY HOUR()` |
| R12 | Instances by image OS and JSON tags | `JSON_TABLE`, `JSON_EXTRACT` |
| R13 | Same usage priced under old and new pricing | Temporal join on `valid_from` / `valid_to` |
| R14 | Ticket full-text search with relevance | `MATCH ... AGAINST` |
| R15 | Average ticket resolution time per agent | `AVG`, `TIMESTAMPDIFF` |
| R16 | Host capacity forecast | CTE and window functions |
| R17 | Monthly cost pivot per resource type | Conditional aggregation |
| R18 | Orgs with usage but no invoice | `LEFT JOIN ... IS NULL` |
| R19 | Cumulative distribution of invoice sizes | `PERCENT_RANK`, `CUME_DIST` |
| R20 | Audit trail of one invoice | `JSON_EXTRACT`, join to users |

---

## 12. Testing, benchmarks and data generation

### Smoke test (finds real runtime errors)

```powershell
cd backend
node scripts/smokeTest.js
```

With the backend running, it logs in as the customer, support, billing and admin demo users and calls about 70 endpoints, including all 20 reports, the detail routes and the 10 Performance Lab benchmarks. Output labels: `ok`, `deny` (403, check it is expected), `FAIL` (printed with the real error message), `skip`. It takes about a minute because it stays under the rate limit. Set `API_URL` if the backend is not on port 5000.

### Data generator

```powershell
node scripts/generateData.js [--instances=40] [--days=90] [--tickets=300]
```

Creates a "LoadTest Corp" organization and fills it through the normal rules: servers are launched with `sp_launch_instance`, usage is bulk-inserted through the triggers, invoices come from `sp_generate_invoice` (every second one is paid with `sp_apply_payment`), and tickets get 2 to 4 messages each. It ends with `ANALYZE TABLE`. Run it again safely; nothing is duplicated. Servers are capped at 150 (the seed has 180 IP addresses). Defaults give about 90,000 usage rows; `--instances=100 --days=365` gives about 1,000,000.

### Performance Lab

Admin, Performance Lab runs 10 benchmark queries (Q1 to Q10) under real `EXPLAIN ANALYZE`. Each query runs once as warm-up and then 3 timed runs, once with its index and once with the index ignored (`IGNORE INDEX`, a `LIKE` scan for full-text, or a predicate that blocks partition pruning). The page shows the real plan text, the median execution time, rows read and the measured speed-up. Nothing is dropped or hidden in the database, so it is safe to run on a shared system. Run the data generator first; on tiny tables MySQL scans either way and the times look alike.

### Integrity tests (database rules)

```powershell
node scripts/integrityTests.js
```

29 automated checks that the database itself enforces its rules: the `images` normalization, removed redundant indexes, append-only usage records, frozen invoice items, ticket rules (membership, assignee, closed is final), audit coverage, the star-schema ETL and partition maintenance. All fixtures are created in one transaction and rolled back, so your data is untouched (the partition test only adds empty future partitions). Output is PASS or FAIL per case.

### Concurrency and isolation demo

```powershell
node scripts/concurrencyDemo.js
```

Uses real simultaneous connections to show a dirty read, a non-repeatable read, a lost update and its fix, a deadlock and its fix, `SKIP LOCKED`, and a quota race (6 launches at once against a 2-server quota must never exceed it).

### Backup, restore and database security

- `backend\scripts\backup.ps1` and `restore.ps1` make and restore consistent logical backups.
- `database/security/roles_and_grants.sql` (run by hand as root) creates five roles and accounts with least-privilege grants, including a column-level privilege, and lists the exact `command denied` errors to show in the report.

### Consistency check

Admin, Consistency (or `GET /api/admin/consistency-check`) runs `sp_check_consistency()` and reports any violation of these 11 invariants:

1. Host `used_*` counters equal the sum of non-terminated instances
2. No host has `used > total`
3. Invoice subtotals match the sum of their items, and no invoice total is negative
4. Paid invoices are fully covered by payments, unpaid ones are not
5. No orphan usage rows
6. No running instance on a retired or maintenance host
7. Running instances have exactly one IP; no IP on a terminated instance
8. No organization above its instance quota
9. Pricing periods never overlap
10. Credit balance never negative
11. Daily summary matches raw usage totals

### SQL acceptance tests

```powershell
mysql -u root -p nimbushost --force < database/tests/phase1_tests.sql
```

This script deletes all rows from the application tables (including users) and seeds its own data. Use it only on a throw-away database, then run `npm run db:reset` and `npm run seed-users`. `--force` keeps going after expected errors so every result is shown.

### Simulator (super admin)

| Endpoint | Effect |
|---|---|
| `POST /api/simulator/tick-usage` | Injects one hour of compute and egress usage for all running instances |
| `POST /api/simulator/run-billing` | Runs billing on demand |
| `POST /api/simulator/fail-host` | Simulates a host failure |
| `POST /api/admin/simulate/usage` | Back-fills usage for a number of hours |

---

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` or `DB_PASSWORD` in `backend/.env`; or leftover `DB_ADMIN_*`/`DB_CUSTOMER_*` lines still pointing to an account that does not exist. Test with `mysql -u root -p`. |
| Root password forgotten (Windows) | Stop the MySQL80 service, start `mysqld` with an `--init-file` containing `ALTER USER 'root'@'localhost' IDENTIFIED BY 'newpass';`, then restart the service. |
| `mysql` is not recognized (Windows) | Add `C:\Program Files\MySQL\MySQL Server 8.0\bin` to PATH, or use "MySQL 8.0 Command Line Client". |
| PowerShell blocks `npm` ("running scripts is disabled") | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt. |
| `ECONNREFUSED 3306` | MySQL is not running. Start the MySQL80 service (Services app). |
| Error mentioning `utf8mb4_0900_ai_ci` | MySQL is older than 8.0. |
| Error 1418 creating functions | `SET PERSIST log_bin_trust_function_creators = 1;` |
| No usage appears (events never run) | `SET PERSIST event_scheduler = ON;` and check `SHOW VARIABLES LIKE 'event_scheduler';` |
| "X was edited after it was applied" | Run `npm run db:reset` then `npm run seed-users` (development), or add a new numbered SQL file. |
| Customer login fails or the launch catalog is empty | The seed was not loaded. Run `npm run db:setup` then `npm run seed-users`. |
| `http://localhost:5000` shows `NOT_FOUND` | Normal. Use `/api/health` and the website on port 5173. |
| Port 5000 already in use | Change `PORT` in `.env` and the proxy target in `frontend/vite.config.js`. |
| UI shows "Cannot reach the API" | The backend is not running or the port differs. |
| Blank page | Press F12 and read the Console tab; paste the red error. |
| Error 1213 (deadlock) on attach or terminate | Expected under contention; the API returns a retry message. |
| Login says the account is locked | Too many failed attempts; wait for the lockout to expire. |

---

## 14. Known limitations

- **Not billed yet:** storage, egress, IP addresses and domains. There is no rate table for them. Tax is fixed at 18% and the tier `discount_pct` is not applied.
- **Concurrency:** `SKIP LOCKED` can report "No capacity" while a locked host would fit. The quota check is now serialized per organization, so the earlier over-quota race is closed (demo C6).
- **Metering:** the demo event records 0.017 instead of 1/60 of an hour (about 2% over), because the quantity column has three decimals; its error handler swallows errors (check `billing_errors`).
- **Credits:** there is no credit ledger table; the history screen reads `audit_log`.
- **Database roles:** the API connects with one account unless you set the `DB_*_USER` variables. `database/security/roles_and_grants.sql` shows the role model but is not wired into the API's queries.
- **API keys** can be created and revoked but do not authenticate requests yet.
- **Data retention:** usage partitions older than 24 months are dropped by `ev_purge_usage`. New months are added by `ev_add_partitions`, but both events need `event_scheduler = ON`.
- **Security hardening still open:** `/api/health` is public and shows the MySQL version; rate limiting is in memory per process; registration has no email verification.
- **Per-instance telemetry** charts are not available; the Instance Detail usage tab shows a note.
- **Team page** adds existing accounts only; a user in several organizations always gets the oldest one.
- **Demo passwords** are weak on purpose. Never deploy the seeded logins.

---

## 15. Design notes

**Normalization (all 35 tables are in 3NF and BCNF).** Values that can be computed from other columns of the same row are not stored:

| Table | Not stored | Where it comes from |
|---|---|---|
| `invoices` | `tax`, `total` | view `v_invoices`: `tax = ROUND(subtotal * tax_rate_pct / 100, 2)`, `total = subtotal + tax - credit_applied` |
| `invoice_items` | `amount` | view `v_invoice_items`: `ROUND(quantity * unit_price, 2)` |
| `usage_records` | `org_id` | view `v_usage_records` (joins `instances`) |
| `instances`, `volumes` | `live_name` | functional unique index on `(org_id, IF(status = 'terminated'/'deleted', NULL, name))` |
| `dim_date` | `month_name`, `quarter`, `is_weekend` | lookup tables `dim_month` and `dim_weekday` |

`usage_records` has no surrogate `usage_id`: its primary key is the natural key `(recorded_at, instance_id, metric)`, which also satisfies MySQL's rule that the partition column must be in the key, so every column depends on the whole key. The instance type in effect when usage was metered is not stored on the usage row (it depends only on instance and moment); it comes from `instance_type_history`, which the triggers on `instances` fill at launch and at every resize, and the view `v_usage_records` looks it up. `invoices.due_date` is an independent attribute (billing can extend it; the billing procedure uses 30 days by default).

`images` was also split into `operating_systems` and `images` (`name -> os_family`). Cross-table summaries (`hosts.used_*`, `invoices.subtotal`, `daily_usage_summary`, the star schema) are not dependencies inside one table; triggers and `sp_check_consistency()` keep them correct.

**Tests** (see section 12): `node scripts/integrityTests.js` (includes the 3NF checks N04 to N09), `node scripts/concurrencyDemo.js`, `node scripts/smokeTest.js`.

**Still to prepare by the team (not code):** ER diagram, executive summary, presentation deck, UI screenshots, role allocation and the final report.

---

## 16. Conventions and team

**Project rules**

- Business rules live in the database (constraints, triggers, procedures), not only in JavaScript.
- Every SQL change after the project is shared is a new numbered file in `database/`; never edit a file after it has been applied on a shared database.
- Money is `DECIMAL`; always use `?` placeholders in queries.
- Every write route runs inside `withUser(req.user, ...)` or `withDb` so audit triggers can attribute the change.
- Never commit `.env`.

**Git workflow**

- One shared repository; `main` must always run.
- One branch per task, named `feat/<name>-<topic>`; merge through reviewed pull requests.

**After pulling new work**

```powershell
cd backend
npm install        # only if package.json changed
npm run db:setup   # applies only new SQL files
cd ../frontend
npm install
```

**Team**

| Name | Role / area |
|---|---|
| _Add team member_ | _e.g. Database design and stored procedures_ |
| _Add team member_ | _e.g. Backend API_ |
| _Add team member_ | _e.g. Frontend console_ |
| _Add team member_ | _e.g. Testing, reports and documentation_ |

---

NimbusHost - AI203 DBMS Project - MySQL 8, Node.js/Express, React
