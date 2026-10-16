-- Manual tests for Step 4 (MySQL Workbench; screenshot each result for the report).
-- These change data. Afterwards run: npm run db:reset  and  npm run seed-users
USE nimbushost;

SET @acme = (SELECT org_id FROM organizations WHERE name = 'Acme Robotics');
SET @mum  = (SELECT region_id FROM regions WHERE code = 'ap-south-1');
SET @dub  = (SELECT region_id FROM regions WHERE code = 'eu-west-1');
SET @db1  = (SELECT instance_id FROM instances WHERE name = 'db-1');
SET @worker = (SELECT instance_id FROM instances WHERE name = 'worker-1');   -- lives in eu-west-1
SET @logs = (SELECT volume_id FROM volumes WHERE name = 'logs');
SET @data = (SELECT volume_id FROM volumes WHERE name = 'data-db1');

-- T-S4-01  Storage quota (Starter plan = 500 GB, 400 used): a 200 GB volume must fail
CALL sp_create_volume(@acme, @mum, 'too-big', 200, 'ssd');
SELECT * FROM v_org_storage WHERE org_name = 'Acme Robotics';

-- T-S4-02  Same-region rule: 'logs' is in ap-south-1, worker-1 in eu-west-1 -> error
CALL sp_attach_volume(@logs, @worker, @acme);

-- T-S4-03  Attach an available volume to a same-region instance, then verify status
CALL sp_attach_volume(@logs, @db1, @acme);
SELECT name, status, instance_name FROM v_volumes WHERE name = 'logs';

-- T-S4-04  Attached volume cannot be deleted; detach first
CALL sp_delete_volume(@logs, @acme);
CALL sp_detach_volume(@logs, @acme);
CALL sp_delete_volume(@logs, @acme);

-- T-S4-05  Deleted volumes are read-only, and a deleted volume's name can be reused (live_name trick)
UPDATE volumes SET size_gb = 500 WHERE name = 'logs' AND status = 'deleted';
CALL sp_create_volume(@acme, @mum, 'logs', 50, 'hdd');

-- T-S4-06  Volumes can only grow
CALL sp_resize_volume(@data, @acme, 100);
CALL sp_resize_volume(@data, @acme, 250);

-- T-S4-07  At most 5 snapshots per volume (2 exist: take 3 more, the 6th must fail)
CALL sp_take_snapshot(@data, @acme, 'snap-3');
CALL sp_take_snapshot(@data, @acme, 'snap-4');
CALL sp_take_snapshot(@data, @acme, 'snap-5');
CALL sp_take_snapshot(@data, @acme, 'snap-6');

-- T-S4-08  Restore a snapshot = new volume (quota applies)
CALL sp_restore_snapshot((SELECT snapshot_id FROM snapshots WHERE name = 'snap-3'), @acme, 'restored-1');

-- T-S4-09  Terminating an instance detaches its volumes (trigger replaced in this step)
CALL sp_terminate_instance(@db1, NULL);
SELECT name, status, instance_id FROM volumes WHERE name IN ('data-db1', 'logs');

-- T-S4-10  Volumes are never hard-deleted
DELETE FROM volumes WHERE name = 'uploads';

-- ---------------- domains and DNS ----------------
SET @dom = (SELECT domain_id FROM domains WHERE name = 'acmerobotics.example');
SET @expired = (SELECT domain_id FROM domains WHERE name = 'acme-labs.example');

-- T-S4-11  Domain name rules and duplicates
CALL sp_register_domain(@acme, 'not a domain', 1);
CALL sp_register_domain(@acme, 'acmerobotics.example', 1);

-- T-S4-12  Expired domain: records cannot be added until it is renewed
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@expired, 'A', '@', '203.0.113.200');
CALL sp_renew_domain(@expired, @acme, 1);
SELECT name, expires_on, state FROM v_domains WHERE name = 'acme-labs.example';

-- T-S4-13  DNS validation rules (each one must fail with its own message)
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'A', 'x', 'not-an-ip');                       -- bad IPv4
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'AAAA', 'x', '203.0.113.5');                   -- IPv4 in AAAA
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'CNAME', '@', 'other.example');               -- CNAME on root
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'A', 'www', '203.0.113.5');                    -- www already has a CNAME
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'CNAME', 'api', 'other.example');             -- api already has an A record
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'MX', 'mail', 'mx.other.example');            -- MX without priority
INSERT INTO dns_records(domain_id, rtype, name, value, ttl) VALUES (@dom, 'A', 'fast', '203.0.113.9', 5);          -- ttl below 60 (CHECK)

-- T-S4-14  Tenant rule: an A record may not point to an IP that belongs to another organization (monitor-1 is Internal's)
SET @foreign_ip = (SELECT ip.ip_address FROM ip_addresses ip JOIN instances i ON i.instance_id = ip.instance_id WHERE i.name = 'monitor-1');
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'A', 'steal', @foreign_ip);

-- T-S4-15  Valid record, then audit trail of DNS changes
INSERT INTO dns_records(domain_id, rtype, name, value) VALUES (@dom, 'TXT', '_verify', 'abc123');
SELECT table_name, action, new_data, changed_at FROM audit_log WHERE table_name = 'dns_records' ORDER BY audit_id DESC LIMIT 5;

-- T-S4-16  Domains cannot be deleted
DELETE FROM domains WHERE name = 'acmerobotics.example';

-- T-S4-17  Consistency: storage used per organization equals the sum of its live volumes
SELECT o.name, fn_org_storage_used(o.org_id) AS used_by_function,
       COALESCE(SUM(v.size_gb), 0) AS used_by_sum
FROM organizations o LEFT JOIN volumes v ON v.org_id = o.org_id AND v.status <> 'deleted'
GROUP BY o.org_id, o.name;

/* ---------------------------------------------------------------------------
   T-S4-18  DEADLOCK DEMO (lock-order inversion between attach and terminate)
   sp_attach_volume locks the VOLUME row first, then the INSTANCE row.
   Terminating an instance updates the INSTANCE row first, then (by trigger) its VOLUMES.
   Two sessions doing these at the same moment can lock in opposite order:
     Session A: START TRANSACTION; SELECT * FROM volumes   WHERE volume_id   = <v> FOR UPDATE;
     Session B: START TRANSACTION; SELECT * FROM instances WHERE instance_id = <i> FOR UPDATE;
     Session A: SELECT * FROM instances WHERE instance_id = <i> FOR UPDATE;   -- waits for B
     Session B: SELECT * FROM volumes   WHERE volume_id   = <v> FOR UPDATE;   -- DEADLOCK, MySQL kills one (error 1213)
   The API maps error 1213 to a "please retry" response. Fix in production: always lock in the same order.
   --------------------------------------------------------------------------- */