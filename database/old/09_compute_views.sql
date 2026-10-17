CREATE OR REPLACE VIEW v_instances AS
SELECT i.instance_id, i.org_id, o.name AS org_name, i.name, i.status,
       t.name AS type_name, t.vcpu, t.ram_gb, t.disk_gb,
       CONCAT(im.name, ' ', im.version) AS image,
       r.code AS region_code, r.name AS region_name, h.hostname,
       ip.ip_address, i.auto_backup, i.created_at, i.terminated_at,
       fn_hourly_price(i.type_id, CURRENT_DATE) AS price_per_hour
FROM instances i
JOIN organizations o   ON o.org_id   = i.org_id
JOIN instance_types t  ON t.type_id  = i.type_id
JOIN images im         ON im.image_id = i.image_id
JOIN hosts h           ON h.host_id  = i.host_id
JOIN regions r         ON r.region_id = h.region_id
LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id;

CREATE OR REPLACE VIEW v_org_quota AS
SELECT o.org_id, o.name AS org_name, t.name AS tier, t.max_instances,
       fn_org_active_instances(o.org_id) AS active_instances,
       fn_org_quota_left(o.org_id)       AS quota_left
FROM organizations o
JOIN account_tiers t ON t.tier_id = o.tier_id;
