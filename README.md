# NimbusHost - Cloud Hosting Management System (AI203 DBMS Project)

MySQL 8 + Node.js/Express + React. See `docs/NimbusHost_DBMS_Project_Blueprint.pdf` for the full plan.

**Start here:** `SETUP_CHECKLIST.md`

## Layout
```
database/   numbered SQL files, run in order by `npm run db:setup`
backend/    Express API, runner scripts (db:setup, db:reset, seed-users, check-db)
frontend/   React (Vite) console
simulator/  data generator and live usage simulator (Step 7)
docs/       blueprint, ER diagram, schema, dictionary, normalization, tests, screenshots
```

## Build steps (from the blueprint)
1. Setup, login, identity tables (done)
2. Infrastructure: regions, hosts, instance types, temporal pricing (done)
3. Compute: instances, scheduler procedure, quota triggers
4. Storage and network
5. Metering, billing, payments, events
6. Support tickets, audit triggers, consistency checks
7. Data generator, indexes, partitioning, benchmarks
8. Reports, dashboards, testing, documentation

## Rules for the team
- Business rules live in the database (constraints, triggers, procedures), not only in JavaScript.
- Every SQL change is a new numbered file in `database/`.
- Money is DECIMAL. Always use `?` placeholders in queries.
- Every write route runs inside `withUser(req.user, ...)` so audit triggers know who made the change.
