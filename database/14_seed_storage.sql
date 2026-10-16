SET @acme = (SELECT org_id FROM organizations WHERE name = 'Acme Robotics');
SET @mum  = (SELECT region_id FROM regions WHERE code = 'ap-south-1');
SET @db1  = (SELECT instance_id FROM instances WHERE name = 'db-1');
SET @web1 = (SELECT instance_id FROM instances WHERE name = 'web-1');
SET @web2 = (SELECT instance_id FROM instances WHERE name = 'web-2');

-- volumes (through the real procedures, so quota and rules are applied)
CALL sp_create_volume(@acme, @mum, 'data-db1', 200, 'ssd');
CALL sp_create_volume(@acme, @mum, 'uploads',  100, 'ssd');
CALL sp_create_volume(@acme, @mum, 'logs',     100, 'hdd');
SET @v_data = (SELECT volume_id FROM volumes WHERE name = 'data-db1');
SET @v_up   = (SELECT volume_id FROM volumes WHERE name = 'uploads');
CALL sp_attach_volume(@v_data, @db1,  @acme);
CALL sp_attach_volume(@v_up,   @web1, @acme);
CALL sp_take_snapshot(@v_data, @acme, 'data-db1-nightly-1');
CALL sp_take_snapshot(@v_data, @acme, 'data-db1-nightly-2');

-- domains: one active, one expiring soon, one already expired (shows the three states)
INSERT INTO domains(org_id, name, registered_on, expires_on) VALUES
  (@acme, 'acmerobotics.example', '2025-11-20', '2026-11-20'),
  (@acme, 'acme-labs.example',    '2025-06-01', '2026-06-01');
CALL sp_register_domain(@acme, 'acme-robots.example', 2);

SET @dom    = (SELECT domain_id FROM domains WHERE name = 'acmerobotics.example');
SET @ip_web1 = (SELECT ip_address FROM ip_addresses WHERE instance_id = @web1);
SET @ip_web2 = (SELECT ip_address FROM ip_addresses WHERE instance_id = @web2);
INSERT INTO dns_records(domain_id, rtype, name, value, ttl, priority) VALUES
  (@dom, 'A',     '@',   @ip_web1,                      3600, NULL),
  (@dom, 'A',     'api', @ip_web2,                      300,  NULL),
  (@dom, 'CNAME', 'www', 'acmerobotics.example',        3600, NULL),
  (@dom, 'MX',    '@',   'mail.acmerobotics.example',   3600, 10),
  (@dom, 'TXT',   '@',   'v=spf1 -all',                 3600, NULL);