-- Manual tests for Step 3 (run in MySQL Workbench; screenshot each result for the report).
-- These change data. Afterwards run: npm run db:reset  and  npm run seed-users
USE nimbushost;

SET @acme    = (SELECT org_id FROM organizations WHERE name = 'Acme Robotics');
SET @mum     = (SELECT region_id FROM regions WHERE code = 'ap-south-1');
SET @small   = (SELECT type_id FROM instance_types WHERE name = 'small');
SET @nano    = (SELECT type_id FROM instance_types WHERE name = 'nano');
SET @xlarge  = (SELECT type_id FROM instance_types WHERE name = 'xlarge');
SET @ubuntu  = (SELECT image_id FROM images WHERE name = 'Ubuntu' AND version = '24.04');
SET @windows = (SELECT image_id FROM images WHERE name = 'Windows Server');

-- T-S3-01  Successful launch: instance, IP and host counters change together
CALL sp_launch_instance(@acme, @small, @ubuntu, @mum, 'test-1', NULL);
SELECT * FROM v_instances WHERE name = 'test-1';
SELECT hostname, used_vcpu, used_ram_gb, used_disk_gb FROM hosts WHERE region_id = @mum;

-- T-S3-02  Best-fit scheduling: the fullest host that still fits is chosen (see which host test-1 landed on)
SELECT hostname, total_vcpu - used_vcpu AS free_vcpu FROM hosts WHERE region_id = @mum ORDER BY free_vcpu;

-- T-S3-03  Image needs more disk than the type has (nano 10 GB, Windows needs 40 GB) -> error, nothing inserted
CALL sp_launch_instance(@acme, @nano, @windows, @mum, 'win-test', NULL);

-- T-S3-04  Invalid names are rejected by the CHECK constraint
CALL sp_launch_instance(@acme, @nano, @ubuntu, @mum, 'Bad Name!', NULL);

-- T-S3-05  Duplicate live name in the same organization -> UNIQUE violation
CALL sp_launch_instance(@acme, @nano, @ubuntu, @mum, 'web-1', NULL);

-- T-S3-06  Terminate, then reuse the name (works because live_name becomes NULL when terminated)
CALL sp_terminate_instance((SELECT instance_id FROM instances WHERE name = 'test-1'), NULL);
SELECT instance_id, name, status, live_name, terminated_at FROM instances WHERE name = 'test-1';
CALL sp_launch_instance(@acme, @nano, @ubuntu, @mum, 'test-1', NULL);

-- T-S3-07  Terminated instance is read-only and cannot change status again
UPDATE instances SET status = 'running' WHERE name = 'old-test';

-- T-S3-08  Status machine: stopped -> suspended is allowed, suspended -> terminated allowed, terminated -> anything is not
CALL sp_set_instance_status((SELECT instance_id FROM instances WHERE name = 'worker-1'), NULL, 'suspended');
CALL sp_set_instance_status((SELECT instance_id FROM instances WHERE name = 'worker-1'), NULL, 'running');

-- T-S3-09  Ownership: an organization cannot touch another organization's instance (p_org = Acme, instance is Internal's)
CALL sp_set_instance_status((SELECT instance_id FROM instances WHERE name = 'monitor-1'), @acme, 'stopped');

-- T-S3-10  Instances cannot be deleted
DELETE FROM instances WHERE name = 'batch-1';

-- T-S3-11  No capacity: xlarge (8 vCPU) many times in one region until hosts are full -> "No capacity available"
--          (repeat this CALL with different names; or lower capacity first)
CALL sp_launch_instance(@acme, @xlarge, @ubuntu, @mum, 'big-1', NULL);

-- T-S3-12  Quota: Starter plan allows 10 active instances. Launch nano instances until the 11th fails.
SELECT * FROM v_org_quota WHERE org_name = 'Acme Robotics';

-- T-S3-13  Generated column and JSON: query instances with automatic backups
SELECT name, auto_backup, config->>'$.tags.env' AS env FROM instances WHERE auto_backup = 1;

-- T-S3-14  Audit trail of an instance (written by triggers)
SELECT a.action, a.old_data, a.new_data, a.changed_at
FROM audit_log a WHERE a.table_name = 'instances' AND a.record_id = (SELECT instance_id FROM instances WHERE name = 'worker-1')
ORDER BY a.audit_id;

-- T-S3-15  Consistency: host counters must equal the sum of live instances on each host (should return 0 rows)
SELECT h.hostname, h.used_vcpu, COALESCE(SUM(t.vcpu), 0) AS expected_vcpu
FROM hosts h
LEFT JOIN instances i ON i.host_id = h.host_id AND i.status <> 'terminated'
LEFT JOIN instance_types t ON t.type_id = i.type_id
GROUP BY h.host_id, h.hostname, h.used_vcpu
HAVING h.used_vcpu <> COALESCE(SUM(t.vcpu), 0);

-- T-S3-16  No IP stays assigned to a terminated instance (should return 0 rows)
SELECT ip.ip_address, i.name FROM ip_addresses ip JOIN instances i ON i.instance_id = ip.instance_id WHERE i.status = 'terminated';

/* ---------------------------------------------------------------------------
   T-S3-17  CONCURRENCY DEMO: two sessions, same last slot (scheduler + SKIP LOCKED)
   Prepare: make exactly one host in a region able to take one more 'small' (for example, shrink other hosts
   with UPDATE hosts SET status='maintenance' ...), then use TWO Workbench query tabs.

   Session A:  START TRANSACTION;
               SELECT host_id FROM hosts WHERE region_id = @mum AND status='active' AND total_vcpu-used_vcpu >= 2
                 ORDER BY total_vcpu-used_vcpu, host_id LIMIT 1 FOR UPDATE SKIP LOCKED;     -- returns the host
   Session B:  (while A is still open)  run the same SELECT ... FOR UPDATE SKIP LOCKED     -- returns a DIFFERENT host or none,
                                         it does not wait and cannot choose the host A holds.
   Session A:  ROLLBACK;
   Repeat WITHOUT "SKIP LOCKED": session B now waits (lock wait) until A finishes -> shows the difference.

   T-S3-18  LOCK DEMO: two sessions terminate / stop the same instance at once
   Session A: START TRANSACTION; CALL ... or SELECT org_id FROM instances WHERE instance_id = 1 FOR UPDATE;
   Session B: CALL sp_set_instance_status(1, NULL, 'stopped');   -- blocks until A commits (row lock)
   --------------------------------------------------------------------------- */
