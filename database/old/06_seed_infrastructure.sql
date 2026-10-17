INSERT INTO regions(code, name, country) VALUES
  ('ap-south-1', 'Mumbai',      'India'),
  ('eu-west-1',  'Dublin',      'Ireland'),
  ('us-east-1',  'N. Virginia', 'United States');

INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb) VALUES
  ((SELECT region_id FROM regions WHERE code='ap-south-1'), 'mum-h01',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code='ap-south-1'), 'mum-h02',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code='ap-south-1'), 'mum-h03', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code='ap-south-1'), 'mum-h04',  32,  128, 2000),
  ((SELECT region_id FROM regions WHERE code='eu-west-1'),  'dub-h01',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code='eu-west-1'),  'dub-h02',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code='eu-west-1'),  'dub-h03', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code='eu-west-1'),  'dub-h04',  32,  128, 2000),
  ((SELECT region_id FROM regions WHERE code='us-east-1'),  'iad-h01', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code='us-east-1'),  'iad-h02', 128,  512, 8000),
  ((SELECT region_id FROM regions WHERE code='us-east-1'),  'iad-h03',  64,  256, 4000),
  ((SELECT region_id FROM regions WHERE code='us-east-1'),  'iad-h04',  64,  256, 4000);

INSERT INTO instance_types(name, family, vcpu, ram_gb, disk_gb) VALUES
  ('nano',     'general',  1,   1,   10),
  ('micro',    'general',  1,   2,   20),
  ('small',    'general',  2,   4,   40),
  ('medium',   'general',  2,   8,   80),
  ('large',    'general',  4,  16,  160),
  ('xlarge',   'general',  8,  32,  320),
  ('c-large',  'compute',  4,   8,   80),
  ('m-large',  'memory',   4,  32,  160);

INSERT INTO images(name, os_family, version, min_disk_gb) VALUES
  ('Ubuntu',          'linux',   '22.04', 10),
  ('Ubuntu',          'linux',   '24.04', 10),
  ('Debian',          'linux',   '12',    10),
  ('Rocky Linux',     'linux',   '9',     15),
  ('Alpine Linux',    'linux',   '3.19',  5),
  ('Windows Server',  'windows', '2022',  40),
  ('FreeBSD',         'bsd',     '14.0',  10);

-- Current prices (from 2026-01-01, still open)
INSERT INTO pricing(type_id, price_per_hour, valid_from)
SELECT type_id, price, '2026-01-01' FROM (
  SELECT t.type_id,
    CASE t.name WHEN 'nano' THEN 0.0060 WHEN 'micro' THEN 0.0110 WHEN 'large' THEN 0.0840 WHEN 'xlarge' THEN 0.1680
                WHEN 'c-large' THEN 0.0900 WHEN 'm-large' THEN 0.1150 END AS price
  FROM instance_types t WHERE t.name IN ('nano','micro','large','xlarge','c-large','m-large')
) x;

-- 'small' and 'medium' had a price cut on 2026-07-01: two periods each (demonstrates temporal pricing)
INSERT INTO pricing(type_id, price_per_hour, valid_from, valid_to) VALUES
  ((SELECT type_id FROM instance_types WHERE name='small'),  0.0240, '2026-01-01', '2026-06-30'),
  ((SELECT type_id FROM instance_types WHERE name='small'),  0.0210, '2026-07-01', NULL),
  ((SELECT type_id FROM instance_types WHERE name='medium'), 0.0480, '2026-01-01', '2026-06-30'),
  ((SELECT type_id FROM instance_types WHERE name='medium'), 0.0420, '2026-07-01', NULL);
