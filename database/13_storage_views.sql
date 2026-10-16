CREATE OR REPLACE VIEW v_volumes AS
SELECT v.volume_id, v.org_id, o.name AS org_name, v.name, v.size_gb, v.vol_type, v.status,
       v.region_id, r.code AS region_code, v.instance_id, i.name AS instance_name, v.created_at,
       (SELECT COUNT(*) FROM snapshots s WHERE s.volume_id = v.volume_id) AS snapshot_count
FROM volumes v
JOIN organizations o ON o.org_id = v.org_id
JOIN regions r       ON r.region_id = v.region_id
LEFT JOIN instances i ON i.instance_id = v.instance_id
WHERE v.status <> 'deleted';

CREATE OR REPLACE VIEW v_snapshots AS
SELECT s.snapshot_id, s.volume_id, v.name AS volume_name, v.org_id, o.name AS org_name,
       s.name, s.size_gb, s.created_at
FROM snapshots s
JOIN volumes v       ON v.volume_id = s.volume_id
JOIN organizations o ON o.org_id = v.org_id;

CREATE OR REPLACE VIEW v_org_storage AS
SELECT o.org_id, o.name AS org_name, t.name AS tier, t.max_storage_gb,
       fn_org_storage_used(o.org_id) AS used_gb,
       fn_org_storage_left(o.org_id) AS left_gb,
       (SELECT COUNT(*) FROM volumes v WHERE v.org_id = o.org_id AND v.status <> 'deleted') AS volume_count
FROM organizations o
JOIN account_tiers t ON t.tier_id = o.tier_id;

CREATE OR REPLACE VIEW v_domains AS
SELECT d.domain_id, d.org_id, o.name AS org_name, d.name, d.registered_on, d.expires_on, d.auto_renew,
       DATEDIFF(d.expires_on, CURRENT_DATE) AS days_left,
       CASE WHEN d.expires_on < CURRENT_DATE THEN 'expired'
            WHEN DATEDIFF(d.expires_on, CURRENT_DATE) <= 30 THEN 'expiring'
            ELSE 'active' END AS state,
       (SELECT COUNT(*) FROM dns_records r WHERE r.domain_id = d.domain_id) AS record_count
FROM domains d
JOIN organizations o ON o.org_id = d.org_id;

CREATE OR REPLACE VIEW v_org_ips AS
SELECT ip.ip_id, ip.ip_address, r.code AS region_code, ip.allocated_at,
       i.instance_id, i.name AS instance_name, i.status AS instance_status,
       i.org_id, o.name AS org_name
FROM ip_addresses ip
JOIN instances i     ON i.instance_id = ip.instance_id
JOIN organizations o ON o.org_id = i.org_id
JOIN regions r       ON r.region_id = ip.region_id;