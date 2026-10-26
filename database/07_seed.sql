-- ============================================================
-- NimbusHost | 07_seed.sql
-- Reference data + demo organizations (no demo instances).
-- Run with: npm run db:setup   then: npm run seed-users
-- ============================================================

INSERT INTO account_tiers(name, max_instances, max_storage_gb, discount_pct) VALUES
  ('Free',        2,      50,     0),
  ('Starter',     10,     500,    0),
  ('Business',    50,     5000,   5),
  ('Enterprise',  500,    100000, 15);

INSERT INTO organizations(name, tier_id) VALUES
  ('NimbusHost Internal', (SELECT tier_id FROM account_tiers WHERE name = 'Enterprise')),
  ('Acme Robotics',       (SELECT tier_id FROM account_tiers WHERE name = 'Starter'));

INSERT INTO regions(code, name, country) VALUES
  ('ap-south-1', 'Mumbai',      'India'),
  ('eu-west-1',  'Dublin',      'Ireland'),
  ('us-east-1',  'N. Virginia', 'United States');

INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb) VALUES
  ((SELECT region_id FROM regions WHERE code = 'ap-south-1'), 'mum-h01',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code = 'ap-south-1'), 'mum-h02',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code = 'ap-south-1'), 'mum-h03', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code = 'ap-south-1'), 'mum-h04',  32,  128, 2000),
  ((SELECT region_id FROM regions WHERE code = 'eu-west-1'),  'dub-h01',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code = 'eu-west-1'),  'dub-h02',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code = 'eu-west-1'),  'dub-h03', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code = 'eu-west-1'),  'dub-h04',  32,  128, 2000),
  ((SELECT region_id FROM regions WHERE code = 'us-east-1'),  'iad-h01', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code = 'us-east-1'),  'iad-h02', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code = 'us-east-1'),  'iad-h03',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code = 'us-east-1'),  'iad-h04',  64,  256, 4000);

INSERT INTO instance_types(name, family, vcpu, ram_gb, disk_gb) VALUES
  ('nano',     'general',  1,   1,   10),
  ('micro',    'general',  1,   2,   20),
  ('small',    'general',  2,   4,   40),
  ('medium',   'general',  2,   8,   80),
  ('large',    'general',  4,  16,  160),
  ('xlarge',   'general',  8,  32,  320),
  ('c-large',  'compute',  4,   8,   80),
  ('m-large',  'memory',   4,  32,  160);

INSERT INTO operating_systems(name, os_family) VALUES
  ('Ubuntu',         'linux'),
  ('Debian',         'linux'),
  ('Rocky Linux',    'linux'),
  ('Alpine Linux',   'linux'),
  ('Windows Server', 'windows'),
  ('FreeBSD',        'bsd');

INSERT INTO images(os_id, version, min_disk_gb) VALUES
  ((SELECT os_id FROM operating_systems WHERE name = 'Ubuntu'),         '22.04', 10),
  ((SELECT os_id FROM operating_systems WHERE name = 'Ubuntu'),         '24.04', 10),
  ((SELECT os_id FROM operating_systems WHERE name = 'Debian'),         '12',    10),
  ((SELECT os_id FROM operating_systems WHERE name = 'Rocky Linux'),    '9',     15),
  ((SELECT os_id FROM operating_systems WHERE name = 'Alpine Linux'),   '3.19',  5),
  ((SELECT os_id FROM operating_systems WHERE name = 'Windows Server'), '2022',  40),
  ((SELECT os_id FROM operating_systems WHERE name = 'FreeBSD'),        '14.0',  10);

INSERT INTO pricing(type_id, price_per_hour, valid_from) VALUES
  ((SELECT type_id FROM instance_types WHERE name = 'nano'),    0.0060, '2026-01-01'),
  ((SELECT type_id FROM instance_types WHERE name = 'micro'),   0.0110, '2026-01-01'),
  ((SELECT type_id FROM instance_types WHERE name = 'large'),   0.0840, '2026-01-01'),
  ((SELECT type_id FROM instance_types WHERE name = 'xlarge'),  0.1680, '2026-01-01'),
  ((SELECT type_id FROM instance_types WHERE name = 'c-large'), 0.0900, '2026-01-01'),
  ((SELECT type_id FROM instance_types WHERE name = 'm-large'), 0.1150, '2026-01-01');

INSERT INTO pricing(type_id, price_per_hour, valid_from, valid_to) VALUES
  ((SELECT type_id FROM instance_types WHERE name = 'small'),  0.0240, '2026-01-01', '2026-06-30'),
  ((SELECT type_id FROM instance_types WHERE name = 'small'),  0.0210, '2026-07-01', NULL),
  ((SELECT type_id FROM instance_types WHERE name = 'medium'), 0.0480, '2026-01-01', '2026-06-30'),
  ((SELECT type_id FROM instance_types WHERE name = 'medium'), 0.0420, '2026-07-01', NULL);

INSERT INTO ip_addresses(region_id, ip_address)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
SELECT r.region_id,
       CONCAT(CASE r.code WHEN 'ap-south-1' THEN '203.0.113.' WHEN 'eu-west-1' THEN '198.51.100.' ELSE '192.0.2.' END, n.i)
FROM n
JOIN regions r ON r.code IN ('ap-south-1', 'eu-west-1', 'us-east-1');
