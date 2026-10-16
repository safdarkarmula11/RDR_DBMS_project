-- Public IP pools (documentation ranges): 60 addresses per region
INSERT INTO ip_addresses(region_id, ip_address)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
SELECT r.region_id, CONCAT(CASE r.code WHEN 'ap-south-1' THEN '203.0.113.' WHEN 'eu-west-1' THEN '198.51.100.' ELSE '192.0.2.' END, n.i)
FROM n JOIN regions r ON r.code IN ('ap-south-1', 'eu-west-1', 'us-east-1');

-- Demo instances launched through the real scheduler procedure
SET @acme     = (SELECT org_id FROM organizations WHERE name = 'Acme Robotics');
SET @internal = (SELECT org_id FROM organizations WHERE name = 'NimbusHost Internal');
SET @ubuntu24 = (SELECT image_id FROM images WHERE name = 'Ubuntu' AND version = '24.04');
SET @ubuntu22 = (SELECT image_id FROM images WHERE name = 'Ubuntu' AND version = '22.04');
SET @debian   = (SELECT image_id FROM images WHERE name = 'Debian');
SET @rocky    = (SELECT image_id FROM images WHERE name = 'Rocky Linux');
SET @mum      = (SELECT region_id FROM regions WHERE code = 'ap-south-1');
SET @dub      = (SELECT region_id FROM regions WHERE code = 'eu-west-1');
SET @iad      = (SELECT region_id FROM regions WHERE code = 'us-east-1');
SET @t_small  = (SELECT type_id FROM instance_types WHERE name = 'small');
SET @t_medium = (SELECT type_id FROM instance_types WHERE name = 'medium');
SET @t_nano   = (SELECT type_id FROM instance_types WHERE name = 'nano');
SET @t_clarge = (SELECT type_id FROM instance_types WHERE name = 'c-large');
SET @t_mlarge = (SELECT type_id FROM instance_types WHERE name = 'm-large');

CALL sp_launch_instance(@acme, @t_small,  @ubuntu24, @mum, 'web-1',    '{"auto_backup": true, "tags": {"env": "prod"}}');
CALL sp_launch_instance(@acme, @t_small,  @ubuntu24, @mum, 'web-2',    '{"auto_backup": true, "tags": {"env": "prod"}}');
CALL sp_launch_instance(@acme, @t_mlarge, @debian,   @mum, 'db-1',     '{"auto_backup": true, "tags": {"env": "prod", "role": "database"}}');
CALL sp_launch_instance(@acme, @t_clarge, @rocky,    @dub, 'worker-1', '{"auto_backup": false, "tags": {"env": "staging"}}');
CALL sp_launch_instance(@acme, @t_medium, @ubuntu22, @iad, 'batch-1',  NULL);
CALL sp_launch_instance(@acme, @t_small,  @ubuntu22, @iad, 'old-test', NULL);
CALL sp_launch_instance(@internal, @t_nano, @ubuntu24, @mum, 'monitor-1', '{"auto_backup": true}');

-- worker-1 is stopped, old-test was terminated (its name can be reused thanks to the generated live_name column)
SET @worker = (SELECT instance_id FROM instances WHERE name = 'worker-1');
SET @oldtest = (SELECT instance_id FROM instances WHERE name = 'old-test');
CALL sp_set_instance_status(@worker, NULL, 'stopped');
CALL sp_terminate_instance(@oldtest, NULL);
