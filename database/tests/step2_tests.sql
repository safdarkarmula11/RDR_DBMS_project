-- Manual tests for Step 2. Run in MySQL Workbench (USE nimbushost;) and screenshot each result.
-- NOTE: these tests change data (price change, retired host). Run `npm run db:reset` and `npm run seed-users` afterwards for a clean demo database.
USE nimbushost;

-- T-S2-01  As-of price lookup (temporal pricing): price of 'small' before and after the July price cut
SELECT fn_hourly_price((SELECT type_id FROM instance_types WHERE name='small'), '2026-03-15') AS before_cut,
       fn_hourly_price((SELECT type_id FROM instance_types WHERE name='small'), '2026-09-15') AS after_cut;

-- T-S2-02  Overlapping price period must fail  -> "Price period overlaps ..."
INSERT INTO pricing(type_id, price_per_hour, valid_from, valid_to)
VALUES ((SELECT type_id FROM instance_types WHERE name='small'), 0.0300, '2026-05-01', '2026-08-31');

-- T-S2-03  Deleting price history must fail
DELETE FROM pricing WHERE type_id = (SELECT type_id FROM instance_types WHERE name='nano');

-- T-S2-04  Atomic price change, then inspect history (old period closed the day before)
CALL sp_set_price((SELECT type_id FROM instance_types WHERE name='nano'), 0.0055, '2026-11-01');
SELECT * FROM v_pricing_history WHERE type_name = 'nano' ORDER BY valid_from;

-- T-S2-05  New price may not start before the current one started  -> error
CALL sp_set_price((SELECT type_id FROM instance_types WHERE name='nano'), 0.0050, '2026-01-01');

-- T-S2-06  CHECK constraints
INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb, used_vcpu)
VALUES (1, 'bad-host', 8, 16, 100, 99);                       -- used > total  -> CHECK violation
INSERT INTO pricing(type_id, price_per_hour, valid_from) VALUES (1, -1, '2030-01-01');   -- negative price

-- T-S2-07  Host status machine
UPDATE hosts SET status = 'retired' WHERE hostname = 'mum-h04';     -- allowed (no workloads)
UPDATE hosts SET status = 'active'  WHERE hostname = 'mum-h04';     -- must fail: retired is final

-- T-S2-08  FK RESTRICT: a region with hosts cannot be deleted
DELETE FROM regions WHERE code = 'ap-south-1';

-- T-S2-09  Capacity report with ROLLUP (grand total row)
SELECT IF(GROUPING(r.name), 'ALL REGIONS', r.name) AS region, COUNT(*) AS hosts,
       SUM(h.total_vcpu) AS vcpu, SUM(h.total_ram_gb) AS ram_gb, SUM(h.total_disk_gb) AS disk_gb
FROM hosts h JOIN regions r ON r.region_id = h.region_id
WHERE h.status = 'active'
GROUP BY r.name WITH ROLLUP;

-- T-S2-10  Audit trail written by triggers
SELECT audit_id, table_name, record_id, action, old_data, new_data, changed_at
FROM audit_log ORDER BY audit_id DESC LIMIT 10;
