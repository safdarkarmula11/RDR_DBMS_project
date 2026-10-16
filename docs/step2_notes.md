# Step 2 notes: infrastructure, catalog and temporal pricing

## New tables (5)
regions, hosts, instance_types, images, pricing

## Concepts to be ready to explain in the viva
| Concept | Where |
|---|---|
| CHECK constraints (used <= total, price > 0, valid_to >= valid_from) | 03_infrastructure.sql |
| Composite unique key (type_id, valid_from) | pricing |
| Temporal data: price periods with valid_from / valid_to, "as of" lookup | fn_hourly_price |
| Trigger calling a shared procedure to enforce no overlapping periods | trg_pricing_bi_overlap / bu_overlap + sp_assert_no_price_overlap |
| Atomic multi-statement change with row lock | sp_set_price (SELECT ... FOR UPDATE, UPDATE, INSERT, COMMIT) |
| Immutability of history | trg_pricing_bd_block |
| Status state machine (retired is final) | trg_hosts_bu_rules |
| Audit trail written by triggers, user taken from @app_user_id | trg_*_audit, backend withUser() |
| Views | v_host_capacity, v_current_pricing, v_pricing_history |
| GROUP BY ... WITH ROLLUP and GROUPING() | /api/infra/capacity |
| Denormalized capacity counters (used_*) maintained by triggers from Step 3 | hosts |

## Design decisions worth writing in the report
- Pricing is a history table, not a column: invoices in Step 5 must price each usage hour with the price valid at that hour.
- No DELETE on pricing: closing a period is the only way to retire a price.
- Audit of hosts skips the used_* counters on purpose (they change on every launch); status and capacity changes are logged.
- Procedures and triggers raise SQLSTATE 45000 with readable messages; the API turns them into HTTP 400 responses.

## Manual tests
Run `database/tests/step2_tests.sql` in MySQL Workbench and screenshot each result for the report.
