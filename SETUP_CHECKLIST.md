# NimbusHost - Setup Checklist (every team member does this once)

## 1. Install the tools
| Tool | Version | Check with |
|---|---|---|
| Node.js (LTS) | 20 or newer | `node -v` |
| Git | any recent | `git --version` |
| MySQL Server | **8.0 or newer** (required: CHECK, CTE, window functions, SKIP LOCKED) | `mysql --version` |
| MySQL Workbench | 8.0 | for the ER diagram and EXPLAIN visuals |
| VS Code | optional | with the "MySQL" and "ESLint" extensions |

Install MySQL natively: MySQL Installer (Windows), `brew install mysql` (Mac) or `sudo apt install mysql-server` (Linux).
Remember the root password you set during installation.

## 2. Get the code and configure
```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
# open .env and set DB_PASSWORD to your MySQL root password (and DB_USER if not root)
npm install
npm run check-db            # must print "Connected to MySQL 8.x"
```

## 3. Create the database and demo users
```bash
npm run db:setup            # creates database "nimbushost" and runs database/NN_*.sql in order
npm run seed-users          # creates the 5 demo logins
```
If you ever need a clean slate: `npm run db:reset` (drops the database, then rebuilds).

Run these once in MySQL (needed by later steps; PERSIST keeps them after a restart):
```sql
SET PERSIST event_scheduler = ON;
SET PERSIST log_bin_trust_function_creators = 1;
```

## 4. Start the app (two terminals)
```bash
cd backend  && npm run dev     # API on http://localhost:5000
cd frontend && npm install && npm run dev   # UI on http://localhost:5173
```
Open http://localhost:5173 and sign in with `admin@nimbus.test` / `admin123`.
**Setup is complete when the Overview page shows API ok and your MySQL version.** (Tables = 5 after Step 1, 10 after Step 2.)

## 4b. Updating to a new step
Copy the new files over your project (keep your `backend/.env`), then:
```bash
cd backend
npm install                 # only if package.json changed
npm run db:setup            # applies ONLY the new SQL files; applied files are skipped
npm run seed-users          # only needed after db:reset
cd ../frontend && npm install
```
`db:setup` records every applied file (name plus checksum) in the `_migrations` table. If you edit a file that was already
applied it refuses to continue: add a new numbered file instead, or run `npm run db:reset` while developing.

## 5. Team workflow (Git)
- One shared GitHub repository; `main` is always runnable.
- One branch per task: `feat/<name>-<topic>` (example: `feat/asha-scheduler-procedure`). Merge through pull requests reviewed by a teammate.
- SQL changes: **never edit a file after it has been merged**. Add a new numbered file (`03_...sql`) so everyone can rebuild with `npm run db:reset`.
- Never commit `.env` (already in .gitignore).

## 6. Demo logins
| Role | Email | Password |
|---|---|---|
| Super admin | admin@nimbus.test | admin123 |
| Support | support@nimbus.test | support123 |
| Billing | billing@nimbus.test | billing123 |
| Customer owner (Acme) | owner@acme.test | customer123 |
| Customer member (Acme) | dev@acme.test | customer123 |

## 7. Common problems
| Symptom | Fix |
|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong DB_USER / DB_PASSWORD in `backend/.env`. |
| `ECONNREFUSED 3306` | MySQL is not running. Start the MySQL service (Windows: Services app, Mac: System Settings, Linux: `sudo systemctl start mysql`). |
| Error about `utf8mb4_0900_ai_ci` | MySQL is older than 8.0. Upgrade. |
| Later: error 1418 creating functions | Run `SET PERSIST log_bin_trust_function_creators = 1;`. |
| Port 5000 in use (Mac AirPlay) | Change `PORT` in `.env` and the proxy target in `frontend/vite.config.js`. |
| Overview shows "Cannot reach the API" | Backend not running, or wrong port. |