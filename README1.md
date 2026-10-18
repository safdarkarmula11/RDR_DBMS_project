<div align="center">

# ☁️ NimbusHost — Cloud Hosting Management System

**A mini cloud provider where the database is the brain** 🧠

![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Course](https://img.shields.io/badge/Course-AI203_DBMS-FF6B6B?style=for-the-badge)

🗄️ **31 tables** · ⚙️ **25 procedures** · 🔔 **50 triggers** · 👁️ **20 views** · ⏰ **5 events** · 📊 **20 reports**

</div>

---

> 🌩️ A multi-tenant cloud hosting platform (think a miniature AWS/DigitalOcean) where **the database is the brain**: business rules, billing logic, scheduling, auditing and integrity checks live in MySQL itself (constraints, triggers, stored procedures, scheduled events), with a thin Node.js API and a role-based React console on top.

🎓 Built as the **AI203 – Database Management Systems** course project.

🧱 **Stack:** MySQL 8 · Node.js 20 + Express · React 18 + Vite

---

## 📑 Table of contents

1. ✨ [Highlights](#1-highlights)
2. 🏗️ [Architecture](#2-architecture)
3. 📁 [Repository layout](#3-repository-layout)
4. 🚀 [Quick start](#4-quick-start)
5. 🔧 [Configuration](#5-configuration)
6. 👥 [Demo accounts and roles](#6-demo-accounts-and-roles)
7. 🗄️ [The database](#7-the-database)
8. 🔌 [Backend API](#8-backend-api)
9. 🖥️ [Frontend console](#9-frontend-console)
10. 🛡️ [Security model](#10-security-model)
11. 📊 [Reports R1–R20](#11-reports-r1r20)
12. 🧪 [Testing, benchmarks and simulation](#12-testing-benchmarks-and-simulation)
13. 📚 [Documentation](#13-documentation)
14. 🤝 [Development workflow and conventions](#14-development-workflow-and-conventions)
15. 🩹 [Troubleshooting](#15-troubleshooting)
16. ⚠️ [Known limitations](#16-known-limitations)
17. 🧑‍🤝‍🧑 [Team](#17-team)

---

## ✨ 1. Highlights

| Area | What it demonstrates |
|---|---|
| 🖥️ **Compute scheduler** | `sp_launch_instance` places a VM on the fullest host that still has room (best fit) using `SELECT … FOR UPDATE SKIP LOCKED`, so concurrent launches never claim the same slot and never block each other. Host selection, instance insert and IP allocation commit atomically. |
| 🔒 **Rules enforced for every writer** | Quotas, host state, capacity limits, status state machines and attach rules are enforced by `BEFORE` triggers, not just by API code, so direct SQL cannot bypass them. |
| 🕰️ **Temporal pricing** | Prices are a history table (`valid_from` / `valid_to`), not a column. `fn_hourly_price(type, date)` answers "what did this cost on that day?", and overlapping periods are rejected by trigger. Prices are never deleted. |
| 💳 **Metering and billing** | Usage is metered into a **range-partitioned** table, rolled up nightly, and billed monthly with 18% tax and credit-balance deduction, all inside transactional stored procedures. |
| 📝 **Audit trail** | `AFTER` triggers write a JSON before/after trail to an append-only `audit_log` (update/delete blocked by trigger), attributed to the real user via session variables set by the API. |
| 🔍 **Consistency auditing** | `sp_check_consistency()` runs 11 cross-table invariants (host counters vs. instances, invoice arithmetic, payments vs. totals, orphan usage, quota breaches, price overlaps, credit sanity, and more). |
| 📈 **Analytics** | A star schema (`dim_date`, `dim_org`, `dim_type`, `fact_usage_daily`) plus 20 SQL reports using window functions, recursive CTEs, `ROLLUP`, `JSON_TABLE` and full-text search. |
| 🎭 **Multi-role console** | Four staff/customer personas with separate navigation, route guards, and separate DB connection pools. |

---

## 🏗️ 2. Architecture

```
┌────────────────────────┐   /api (Vite proxy)   ┌─────────────────────────────┐        ┌──────────────────────────┐
│  React 18 + Vite       │ ────────────────────▶ │  Express API (port 5000)    │ ─────▶ │  MySQL 8 (nimbushost)    │
│  http://localhost:5173 │ ◀──────────────────── │  JWT auth · RBAC · Zod      │ ◀───── │  tables · triggers       │
│  React Query · Recharts│                       │  helmet · rate limiting     │        │  procedures · views      │
└────────────────────────┘                       │  4 role-specific DB pools   │        │  events (scheduler)      │
                                                 └─────────────────────────────┘        └──────────────────────────┘
```

**➡️ Request flow for a write:** the API validates input (Zod) → authenticates (JWT) → authorizes (role + tenant guard) → acquires a connection from the pool for that role → sets `@app_user_id`, `@app_org_id`, `@app_role` session variables → calls a stored procedure or runs parameterized SQL → triggers apply the business rules and write the audit row → the API maps SQL errors (`SQLSTATE 45000`) to readable HTTP 400 responses.

---

## 📁 3. Repository layout

```
.
├── database/                    Numbered SQL migrations, applied in order by `npm run db:setup`
│   ├── 01_schema.sql              31 tables, constraints, indexes, partitioning
│   ├── 02_functions.sql           10 stored functions
│   ├── 03_procedures.sql          25 stored procedures
│   ├── 04_triggers.sql            50 triggers (rules, audit, immutability)
│   ├── 05_views.sql               20 views (internal + tenant-scoped "my_*")
│   ├── 06_events.sql              5 scheduled events (metering, rollup, billing, suspension, purge)
│   ├── 11_consistency.sql         sp_check_consistency() — data-integrity audit
│   ├── tests/phase1_tests.sql     Acceptance tests (destructive — see §12)
│   └── old/                       Legacy per-step SQL files (NOT executed by db:setup — see §16)
├── backend/                     Express API
│   ├── src/
│   │   ├── server.js              App bootstrap, security middleware, route mounting
│   │   ├── config.js, db.js       Env config; role-based MySQL pools; withDb()/withUser()
│   │   ├── routes/                17 route modules (auth, orgs, instances, storage, network, billing, …)
│   │   ├── middleware/            auth, rbac, validation, rateLimiter, requestId, errorHandler
│   │   ├── services/              auth.service.js, billing.service.js
│   │   ├── validation/schemas.js  Zod request schemas
│   │   └── lib/splitSql.js        SQL file splitter (understands DELIMITER blocks)
│   ├── scripts/                   runSql, seedUsers, checkConnection, testSplitter
│   └── .env.example
├── frontend/                    React (Vite) console
│   └── src/
│       ├── auth/                  AuthContext, LoginPage, RegisterPage, RequireRole, can.js
│       ├── layout/                Shell, Sidebar, Topbar, MobileNav
│       ├── pages/                 Customer pages + admin/ billing/ support/ subfolders
│       ├── ui/                    Button, DataTable, Drawer, Toast, QuotaBar, StatusBadge, …
│       ├── styles/                tokens.css, global.css, components.css
│       └── nav.js                 Per-role navigation
├── simulator/                   Placeholder README for planned data-generator scripts (see §16)
├── docs/                        Step notes (2–4), blueprint PDF, docs index
├── NimbusHost ER Diagram.html   Interactive crow's-foot ER diagram (open in a browser)
├── NimbusHost_DBMS_Project_Blueprint.pdf
├── NimbusHost_UI_Implementation_Guide.pdf
└── SETUP_CHECKLIST.md           Detailed first-time setup for team members
```

---

## 🚀 4. Quick start

### 🧰 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | `node -v` |
| MySQL Server | **8.0.16 or newer** | Needs `CHECK` constraints, CTEs, window functions, `SKIP LOCKED` |
| Git | any recent | |
| MySQL Workbench | optional | Handy for EXPLAIN visuals and the ER diagram |

### ⚙️ 4.1 Configure the backend

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: set DB_USER / DB_PASSWORD (and the role-specific ones) to your MySQL credentials
npm install
npm run check-db            # should print "Connected to MySQL 8.x"
```

### 🗄️ 4.2 Build the database

```bash
npm run db:setup            # creates database "nimbushost" and applies database/NN_*.sql in order
npm run seed-users          # creates the 5 demo logins
```

Enable these once in MySQL (the scheduled events and function creation need them; `PERSIST` survives restarts):

```sql
SET PERSIST event_scheduler = ON;
SET PERSIST log_bin_trust_function_creators = 1;
```

> [!IMPORTANT]
> **Heads-up:** reference data (tiers, regions, hosts, instance types, images, pricing, and the *Acme Robotics* demo org) is not loaded by the current `db:setup` — see [§16](#16-known-limitations).

### ▶️ 4.3 Run the app (two terminals)

```bash
# Terminal 1 — API on http://localhost:5000
cd backend && npm run dev

# Terminal 2 — UI on http://localhost:5173
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173> and sign in (see [§6](#6-demo-accounts-and-roles)). The Vite dev server proxies `/api` to port 5000.

### 📜 4.4 Backend scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with `node --watch` (auto-restart) |
| `npm start` | Start the API without watch mode |
| `npm run check-db` | Verify the MySQL connection and print the server version |
| `npm run db:setup` | Create the DB if missing and apply **only new** SQL files |
| `npm run db:reset` | **Drop the whole database** and rebuild from scratch |
| `npm run seed-users` | Create/refresh the 5 demo users (run again after every `db:reset`) |
| `npm run test:sql-splitter` | Self-test for the SQL statement splitter |

### 🔄 4.5 How migrations work

`db:setup` reads `database/NN_*.sql` (two-digit prefix, top-level folder only), sorts them, and applies each file once. Every applied file is recorded in a `_migrations` table with a SHA-256 checksum:

- Already-applied files are skipped, so re-running is safe.
- **If you edit a file that was already applied, the runner refuses to continue.** Add a new numbered file instead, or run `npm run db:reset` while developing.
- The splitter understands `DELIMITER` blocks, so procedures, functions, triggers and events load correctly.

---

## 🔧 5. Configuration

All backend settings live in `backend/.env` (never commit it; it is already in `.gitignore`).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port (if you change it, also update the proxy in `frontend/vite.config.js`) |
| `NODE_ENV` | `development` | Runtime mode |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | `localhost`, `3306`, `nimbushost` | MySQL connection |
| `DB_USER`, `DB_PASSWORD` | — | Base account used by migrations and scripts |
| `DB_ADMIN_*`, `DB_SUPPORT_*`, `DB_BILLING_*`, `DB_CUSTOMER_*` | fall back to `DB_USER` / `DB_PASSWORD` | Optional per-role MySQL accounts, so you can apply least-privilege grants per persona |
| `JWT_SECRET` | — | Signing key for access tokens. **Replace the example value with your own long random string.** |
| `JWT_EXPIRES_IN` | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Refresh-token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin (credentials enabled) |

---

## 👥 6. Demo accounts and roles

`npm run seed-users` creates these logins (development only — change or remove them for any real deployment):

| Role | Email | Password | Lands on |
|---|---|---|---|
| 👑 Super admin | `admin@nimbus.test` | `admin123` | `/admin/capacity` |
| 🎧 Support | `support@nimbus.test` | `support123` | `/support/queue` |
| 💳 Billing | `billing@nimbus.test` | `billing123` | `/billing` |
| 🏢 Customer — owner (Acme Robotics) | `owner@acme.test` | `customer123` | `/` |
| 🧑‍💻 Customer — member (Acme Robotics) | `dev@acme.test` | `customer123` | `/` |

New customers can also self-register at `/register`; that creates an organization (on the *Starter*/*Free* tier if present) and makes the registrant its owner.

### 🔐 Permission model

| Role | Can do |
|---|---|
| 👑 **super_admin** | Everything: capacity, hosts/regions, pricing, audit log, consistency checks, perf lab, reports, simulator |
| 💳 **billing** | Invoices, invoice generation, aging, credits/refunds, revenue analytics |
| 🎧 **support** | Ticket queue, assigned tickets, customer lookup, SLA board |
| 🏢 **customer · owner** | Launch / start / stop / resize / terminate, volumes, snapshots, network & DNS, pay invoices, manage team and API keys, tickets |
| 🧑‍💻 **customer · member** | Launch / start / stop, volumes, snapshots, tickets |

---

## 🗄️ 7. The database

### 🧩 7.1 Schema at a glance (31 tables)

| Domain | Tables |
|---|---|
| 🪪 **Identity & tenancy** | `account_tiers`, `organizations` (self-referencing parent for org hierarchy), `users`, `org_members`, `api_keys`, `refresh_tokens` |
| 🏭 **Infrastructure & catalog** | `regions`, `hosts`, `instance_types`, `images`, `pricing` (temporal) |
| 🖥️ **Compute** | `instances`, `ip_addresses` |
| 💾 **Storage** | `volumes`, `snapshots` |
| 🌐 **Network** | `domains`, `dns_records` |
| ⏱️ **Metering** | `usage_records` (monthly range-partitioned), `daily_usage_summary` |
| 💰 **Billing** | `invoices`, `invoice_items`, `payments`, `billing_errors` |
| 🎫 **Support** | `tickets`, `ticket_messages` |
| 📜 **Governance** | `audit_log`, `security_log` |
| ⭐ **Analytics (star schema)** | `dim_date`, `dim_org`, `dim_type`, `fact_usage_daily` |

An interactive ER diagram is in **`NimbusHost ER Diagram.html`** — open it in any browser, click a table to highlight its relationships (dashed lines are logical links with no FK, e.g. on the partitioned table).

### 💡 7.2 Design decisions worth knowing

- **Partitioned metering.** `usage_records` is `PARTITION BY RANGE COLUMNS(recorded_at)` with monthly partitions (Jul 2026 → Jun 2027, plus `pmax`). MySQL forbids foreign keys on partitioned tables, so integrity is enforced by `sp_record_usage` and a `BEFORE INSERT` trigger. `type_id` is stored at metering time so usage is priced correctly even after a resize.
- **Soft deletes & immutability.** Instances, volumes, domains, organizations, invoices, payments, pricing rows and the audit log cannot be hard-deleted (or, for the audit log and payments, updated) — triggers block it so billing history stays intact.
- **Generated columns.** `live_name` is `NULL` once a resource is terminated/deleted, so a `UNIQUE` key still allows reusing names; `auto_backup` is derived from the instance's JSON `config`.
- **Denormalized counters, guarded.** `hosts.used_vcpu/ram/disk` are maintained by triggers, protected by `CHECK (used <= total)`, and cross-verified by `sp_check_consistency()`.
- **Money is `DECIMAL`**, never floating point.
- **Rules raise `SQLSTATE 45000`** with readable messages; the API converts them to HTTP 400.

### 🧮 7.3 Stored functions (10)

`fn_hourly_price` · `fn_org_running_instances` · `fn_org_active_instances` · `fn_org_quota_left` · `fn_org_storage_used` · `fn_org_storage_left` · `fn_instance_volume_count` · `fn_invoice_balance` · `fn_host_utilization` · `fn_current_org_id`

### ⚙️ 7.4 Stored procedures (25)

| Group | Procedures |
|---|---|
| 🖥️ **Compute** | `sp_launch_instance` (scheduler), `sp_allocate_ip`, `sp_set_instance_status`, `sp_terminate_instance`, `sp_resize_instance` |
| 💰 **Metering & billing** | `sp_record_usage`, `sp_generate_invoice`, `sp_run_monthly_billing`, `sp_apply_payment` (methods: card, upi, netbanking, credit) |
| 💾 **Storage** | `sp_create_volume`, `sp_attach_volume`, `sp_detach_volume`, `sp_resize_volume`, `sp_delete_volume`, `sp_take_snapshot`, `sp_restore_snapshot`, `sp_delete_snapshot` |
| 🌐 **Network** | `sp_register_domain`, `sp_renew_domain`, `sp_validate_dns_record` |
| 🏷️ **Pricing** | `sp_assert_no_price_overlap`, `sp_set_price` |
| 🧹 **Maintenance** | `sp_rollup_daily_usage`, `sp_drop_old_partitions`, `sp_check_consistency` |

Concurrency notes: storage procedures lock the organization row (`SELECT … FOR UPDATE`) before checking quota so two simultaneous requests can't both squeak under the limit; `sp_set_instance_status` locks the instance row to serialize state changes.

### 🔔 7.5 Triggers (50)

| Table | Behaviour |
|---|---|
| `instances` | Quota/org/image/host checks on insert; capacity counters on insert/update; status state machine (`running` / `stopped` / `suspended` / `terminated`, terminated is final); delete blocked; terminating detaches volumes |
| `hosts` | State machine (retired is final); audit (capacity/status changes) |
| `pricing` | No overlapping periods; delete blocked; audit |
| `invoices`, `payments` | Status rules; deletes blocked; payments immutable; audit |
| `volumes`, `snapshots` | Attach rules (same org, same region, live instance, max 5 per instance); "attached ⇔ has instance" consistency; soft delete; audit |
| `domains`, `dns_records` | Expiry rules; record validation via `sp_validate_dns_record` (IPv4/IPv6, CNAME exclusivity, MX priority, an A record can't point at another tenant's IP); audit |
| `organizations`, `users`, `org_members`, `api_keys` | Audit; organization delete blocked |
| `usage_records` | Referential checks in lieu of FKs |
| `audit_log` | Update and delete blocked (append-only) |

### 👁️ 7.6 Views (20)

- 📋 **Internal / reporting:** `v_host_capacity`, `v_instances`, `v_running_instances`, `v_org_quota`, `v_current_pricing`, `v_pricing_history`, `v_volumes`, `v_snapshots`, `v_org_storage`, `v_domains` (computes `days_left` and active/expiring/expired), `v_org_ips`, `v_org_monthly_cost`, `v_overdue_invoices`, `v_revenue_by_region`, `v_ticket_sla`
- 🏠 **Tenant-scoped (`v_my_*`):** `v_my_instances`, `v_my_volumes`, `v_my_invoices`, `v_my_tickets`, `v_my_usage` — filtered by `fn_current_org_id()` so a customer session only ever sees its own rows.

### ⏰ 7.7 Scheduled events (5)

Require `event_scheduler = ON` (06_events.sql also issues `SET GLOBAL event_scheduler = ON`).

| Event | Schedule | Action |
|---|---|---|
| 📡 `ev_hourly_metering` | **Every 1 minute** (demo mode) | Records 0.017 `cpu_hour` for every running instance via `sp_record_usage` |
| 🌙 `ev_nightly_rollup` | Daily at 00:15 | Aggregates yesterday's usage into `daily_usage_summary` |
| 🧾 `ev_monthly_invoicing` | 1st of month, 01:00 | Runs `sp_run_monthly_billing` for the previous month |
| ⛔ `ev_suspend_overdue` | Daily at 06:00 | Marks past-due invoices `overdue`; suspends organizations overdue by more than 30 days and their running instances |
| 🗑️ `ev_purge_usage` | Monthly | Drops usage partitions older than 12 months |

> [!NOTE]
> The 1-minute metering interval is deliberately accelerated so dashboards move during a demo. For production semantics, change it to hourly and the quantity to `1.0`.

### 💰 7.8 Billing logic

1. Usage rows for the period are grouped per instance and priced with `fn_hourly_price` for the type recorded at metering time.
2. **Subtotal** = sum of line items; **tax** = 18% of subtotal.
3. The org's **credit balance** is applied (up to the pre-credit total) and decremented atomically.
4. **Total** = subtotal + tax − credit applied; invoice moves through `issued` → `overdue` / `paid` via payments (`sp_apply_payment`).
5. Account tiers carry `max_instances`, `max_storage_gb` and a `discount_pct` (0–50).

---

## 🔌 8. Backend API

Base URL: `http://localhost:5000`. Errors use a consistent shape: `{ "code": "…", "msg": "…" }`. Every request gets an ID (`X-Request-Id`).

| Prefix | Purpose | Highlights |
|---|---|---|
| `/health`, `/api/health` | Liveness + DB status | Shows API ok and MySQL version |
| `/api/auth` | Authentication | `register`, `login`, `refresh`, `logout`, `me`, API-key list/create/revoke |
| `/api/orgs` | Organizations & teams | List/get/create/update orgs, members, API keys, **`/:id/cost-tree`** (recursive org cost) |
| `/api/catalog` | Read-only catalog | `regions`, `instance-types`, `images` |
| `/api/infra` | Hosts & regions *(admin)* | `capacity` (with `ROLLUP`), host/region/instance-type CRUD, infra audit |
| `/api/pricing` | Temporal pricing | List, per-type history, **`/:typeId/as-of/:date`**, set price *(admin)* |
| `/api/instances` | Compute | List, quota, detail, **launch**, start/stop (`/:id/status`), resize, terminate, history |
| `/api/storage` | Volumes & snapshots | Quota, create/attach/detach/resize/delete volumes, snapshot/restore/delete |
| `/api/network` | IPs, domains, DNS | List IPs, register/renew domains, DNS record CRUD |
| `/api/billing`, `/api/invoices` | Billing | Invoices, aging, overview, credits transactions, generate invoices, payments *(billing/admin for staff-only routes)* |
| `/api/usage` | Metered usage | Tenant-scoped usage queries |
| `/api/tickets` | Support tickets | CRUD, messages, full-text **`/search`** |
| `/api/support` | Support staff tools | Queue, assign, status, my-tickets, SLA, customers |
| `/api/reports` | Analytics | **`/R1` … `/R20`** (role-gated per report) |
| `/api/admin` | Admin tools | Consistency check, audit log, slow queries, usage simulation, **perf benchmarks** |
| `/api/simulator` | Demo helpers *(admin)* | `tick-usage`, `run-billing`, `fail-host` |

---

## 🖥️ 9. Frontend console

React 18 with React Router, TanStack Query for data fetching, Recharts for charts and Lucide for icons. Navigation and route guards are role-driven (`nav.js`, `RequireRole`, `can.js`). A responsive shell provides a sidebar on desktop and a mobile nav.

| Persona | Pages |
|---|---|
| 🧑‍💻 **Customer** | Dashboard · Instances (+ Launch Wizard, Instance Detail) · Volumes · Snapshots · Network & DNS · Invoices (+ Invoice Detail) · Usage · Tickets · Team & API Keys |
| 👑 **Super admin** | Capacity · Hosts & Regions · Pricing Editor · Audit Log · Consistency · Perf Lab · Reports (R1–R20) · Simulator |
| 💳 **Billing** | Billing Overview · All Invoices · Generate Invoices · Aging Report · Credits & Refunds · Revenue Analytics |
| 🎧 **Support** | Ticket Queue · My Tickets · Customers · SLA Board |

Reusable UI kit (`src/ui/`): `Button`, `Input`, `DataTable`, `Drawer`, `ConfirmDialog`, `Toast`, `Banner`, `Skeleton`, `EmptyState`, `QuotaBar`, `StatusBadge`. Design tokens are centralized in `styles/tokens.css`.

**📦 Build for production:** `cd frontend && npm run build` (output in `dist/`), preview with `npm run preview`.

---

## 🛡️ 10. Security model

- 🔑 **Authentication:** bcrypt (cost 12) password hashing; short-lived JWT access tokens (15 min) plus **rotating refresh tokens** tracked by token *family* in `refresh_tokens` (supports reuse detection); constant-time dummy compare for unknown emails; **account lockout** after repeated failed logins; security events recorded in `security_log`.
- 🚦 **Authorization:** role checks (`requireRole`), owner-only actions (`requireOwner`), and a **tenant guard** that returns `404` (not `403`) for another tenant's resources to prevent enumeration. The tenant's `org_id` is taken from the login token, never from the request body.
- 🧱 **Defence in depth in the database:** tenant-scoped `v_my_*` views, per-role MySQL pools, and triggers that enforce the same rules regardless of caller.
- 🪖 **HTTP hardening:** `helmet` with a strict CSP, locked-down CORS (single origin, credentials), `hpp`, 100 KB JSON body limit, global rate limit of 100 req/min with stricter limiters on auth routes, disabled `X-Powered-By`.
- 🧼 **Input validation:** Zod schemas on request bodies, params and queries; parameterized SQL (`?` placeholders) everywhere.
- 🕵️ **Accountability:** every write runs inside `withDb`/`withUser`, setting `@app_user_id`, `@app_org_id`, `@app_role` so audit triggers know who acted.

---

## 📊 11. Reports R1–R20

Available at `/api/reports/R<n>` and browsable in the **Reports** page (role-gated per report). Each showcases a different SQL technique.

| # | Report | Technique |
|---|---|---|
| R1 | Monthly revenue by region and instance type | 5-table `JOIN`, `GROUP BY … WITH ROLLUP` |
| R2 | Top 10 customers by spend, rank and share of total | `RANK()`, `SUM() OVER ()` |
| R3 | Month-over-month revenue growth % | `LAG()` |
| R4 | Running cost within the month per organization | `SUM() OVER (ORDER BY …)` |
| R5 | Customer segmentation into spend quartiles | `NTILE(4)` |
| R6 | Total cost of an org including child orgs | **Recursive CTE** |
| R7 | Resource dependency tree (instance → volumes → snapshots → IP) | Multi-table `JOIN`, `UNION ALL` |
| R8 | Hosts above 85% utilization, by region | Aggregate + `HAVING` |
| R9 | Never raised a ticket but spend above average | Subquery, `NOT EXISTS` |
| R10 | Overdue aging buckets (0–30, 31–60, 61–90, 90+) | `CASE`, `DATEDIFF` |
| R11 | Instances launched per hour of day (peak load) | `GROUP BY HOUR()` |
| R12 | Instances by image OS and JSON-stored tags | `JSON_TABLE`, `JSON_EXTRACT` |
| R13 | Same usage priced under old vs. new pricing | Temporal join on `valid_from`/`valid_to` |
| R14 | Ticket full-text search with relevance | `MATCH … AGAINST` |
| R15 | Average ticket resolution time per agent | `AVG`, `TIMESTAMPDIFF` |
| R16 | Host capacity forecast (days until region full) | CTE + window functions |
| R17 | Monthly cost pivot per resource type | Conditional aggregation |
| R18 | Orgs with usage but no invoice (billing gaps) | `LEFT JOIN … IS NULL` |
| R19 | Cumulative distribution of invoice sizes | `PERCENT_RANK` / `CUME_DIST` |
| R20 | Audit trail of one invoice (who changed what) | `JSON_EXTRACT`, join to users |

---

## 🧪 12. Testing, benchmarks and simulation

### ✅ Acceptance tests

```bash
mysql -u <user> -p nimbushost --force < database/tests/phase1_tests.sql
```

> [!CAUTION]
> **Destructive:** this script first **deletes all rows** from the application tables and seeds its own minimal data. Run it only on a throwaway database, then `npm run db:reset` + `npm run seed-users` to get back to a clean state. `--force` keeps going after expected errors so you can see every result.

### 🔍 Consistency check

Super admins can run `sp_check_consistency()` from **Admin → Consistency** (or `GET/POST /api/admin/consistency-check`). It reports any violations of the 11 invariants:

1. Host `used_*` counters equal the sum of non-terminated instances
2. No host has `used > total`
3. Invoice totals match items + tax − credit
4. Paid invoices are fully covered by payments (and unpaid ones aren't)
5. No orphan usage rows
6. No running instance on a retired/maintenance host
7. Running instances have exactly one IP; no IP on a terminated instance
8. No organization above its instance quota
9. Pricing periods never overlap
10. Credit balance never negative
11. Daily summary matches raw usage totals

### ⚡ Perf Lab

**Admin → Perf Lab** (`POST /api/admin/perf/run`) runs predefined benchmark queries (for example *usage of one instance in a date range*, *running instances of an organization*, *overdue invoices*) under `EXPLAIN ANALYZE` and returns timing plus the plan, so you can demonstrate the effect of the covering indexes (e.g. `idx_usage_cover`) and partition pruning. `GET /api/admin/slow-queries` surfaces slow statements.

### 🎮 Simulator (demo helpers, super admin only)

| Endpoint | Effect |
|---|---|
| `POST /api/simulator/tick-usage` | Injects one hour of compute and egress usage for all running instances |
| `POST /api/simulator/run-billing` | Triggers a billing run on demand |
| `POST /api/simulator/fail-host` | Simulates a host failure |
| `POST /api/admin/simulate/usage` | Back-fills usage for a number of hours |

Combined with the 1-minute metering event, these make dashboards and invoices come alive during a live demo.

---

## 📚 13. Documentation

| File | Contents |
|---|---|
| `NimbusHost_DBMS_Project_Blueprint.pdf` (also in `docs/`) | Full project plan, requirements and build steps |
| `NimbusHost_UI_Implementation_Guide.pdf` | UI/UX specification for the console |
| `NimbusHost ER Diagram.html` | Interactive crow's-foot ER diagram |
| `SETUP_CHECKLIST.md` | Step-by-step environment setup, Git workflow, common problems |
| `docs/step2_notes.md` | Infrastructure, catalog and temporal pricing — concepts and design decisions |
| `docs/step3_notes.md` | Compute: scheduler, quotas, status machine, locking |
| `docs/step4_notes.md` | Storage & network: concurrency, cascades, deadlock analysis, DNS validation |
| `docs/README.md` | Index of planned deliverables (relational schema, data dictionary, normalization, test cases, performance analysis) |

The step notes include "viva points" tables that map each concept (SKIP LOCKED, generated columns, trigger evolution, lock ordering, …) to the exact objects that demonstrate it.

---

## 🤝 14. Development workflow and conventions

**📏 Project rules**

- Business rules live in the **database** (constraints, triggers, procedures), not only in JavaScript.
- Every SQL change is a **new numbered file** in `database/`; never edit a file after it has been applied/merged.
- Money is `DECIMAL`; always use `?` placeholders in queries.
- Every write route runs inside `withUser(req.user, …)` / `withDb` so audit triggers can attribute the change.

**🌿 Git workflow**

- One shared repository; `main` must always be runnable.
- One branch per task, named `feat/<name>-<topic>` (e.g. `feat/asha-scheduler-procedure`); merge via reviewed pull requests.
- Never commit `.env`.

**🔁 Updating after pulling new work**

```bash
cd backend && npm install            # only if package.json changed
npm run db:setup                     # applies only the new SQL files
cd ../frontend && npm install
```

---

## 🩹 15. Troubleshooting

| Symptom | Fix |
|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `backend/.env` |
| `ECONNREFUSED 3306` | MySQL isn't running — start the service (Windows: Services app · macOS: System Settings · Linux: `sudo systemctl start mysql`) |
| Error mentioning `utf8mb4_0900_ai_ci` | MySQL is older than 8.0 — upgrade |
| Error 1418 creating functions | `SET PERSIST log_bin_trust_function_creators = 1;` |
| Events never run (no usage appearing) | `SET PERSIST event_scheduler = ON;` and confirm with `SHOW VARIABLES LIKE 'event_scheduler';` |
| `X was edited after it was applied` | Don't edit applied SQL; add a new numbered file, or `npm run db:reset` in development |
| Port 5000 already in use (macOS AirPlay) | Change `PORT` in `.env` **and** the proxy target in `frontend/vite.config.js` |
| UI shows "Cannot reach the API" | Backend not running, or port mismatch |
| Error 1213 (deadlock) on attach/terminate | Expected under contention (documented lock-order case); the API returns a retry message — retry the action |
| Login says account locked | Too many failed attempts — wait for the lockout window to expire |

---

## ⚠️ 16. Known limitations

Things a new contributor should know about the current state of the repository:

1️⃣ **Seed/reference data isn't loaded by `db:setup`.** The runner only reads top-level `database/NN_*.sql`; the seed INSERTs (account tiers, regions, hosts, instance types, images, the *Acme Robotics* org) live in the legacy `database/old/*.sql` files, which are not executed and may not match the current schema. On a fresh `db:reset` you therefore get an empty catalog, and `seed-users` cannot attach the Acme customers to an organization. **🛠️ Suggested fix:** add a new numbered file (e.g. `12_seed.sql`) ported from `old/` for the current schema, then run `db:reset`.
2️⃣ **`simulator/` contains only a README.** The planned `generate_data.js` (bulk data / 1M+ usage rows) and `live_usage.js` are not in the repo; simulation is currently done through the `/api/simulator` and `/api/admin/simulate` endpoints.
3️⃣ **Demo-mode metering.** `ev_hourly_metering` runs every minute and the event handlers swallow errors (`CONTINUE HANDLER FOR SQLEXCEPTION`), so a failing event is silent — check `billing_errors` and run the consistency check if numbers look off.
4️⃣ **Partition window is fixed.** Usage partitions are defined through June 2027; add new monthly partitions before then (a `pmax` catch-all exists as a safety net).
5️⃣ **`.env.example` ships development credentials and a sample `JWT_SECRET`.** Replace them locally, and never reuse them anywhere public.
6️⃣ **Some docs lag the code.** `SETUP_CHECKLIST.md` still mentions "Tables = 5 after Step 1, 10 after Step 2" (the full schema now has 31), and `docs/step2_notes.md` refers to a `step2_tests.sql` that isn't in the repo (only `tests/phase1_tests.sql` is).
7️⃣ **Demo passwords are weak by design.** The five seeded logins are for development only.

---

## 🧑‍🤝‍🧑 17. Team

| Name | Role / area |
|---|---|
| _Add team member_ | _e.g. Database design & stored procedures_ |
| _Add team member_ | _e.g. Backend API_ |
| _Add team member_ | _e.g. Frontend console_ |
| _Add team member_ | _e.g. Testing, reports & documentation_ |

---

<div align="center">

☁️ **NimbusHost** · AI203 DBMS Project · MySQL 8 + Node.js/Express + React · Made with ❤️ and a lot of triggers

</div>
