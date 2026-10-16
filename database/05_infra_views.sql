-- Step 2 views

CREATE OR REPLACE VIEW v_host_capacity AS
SELECT h.host_id, h.hostname, r.region_id, r.code AS region_code, r.name AS region_name, h.status,
       h.total_vcpu, h.used_vcpu, h.total_vcpu - h.used_vcpu AS free_vcpu,
       h.total_ram_gb, h.used_ram_gb, h.total_ram_gb - h.used_ram_gb AS free_ram_gb,
       h.total_disk_gb, h.used_disk_gb, h.total_disk_gb - h.used_disk_gb AS free_disk_gb,
       ROUND(100 * h.used_vcpu / h.total_vcpu, 1)       AS cpu_pct,
       ROUND(100 * h.used_ram_gb / h.total_ram_gb, 1)   AS ram_pct,
       ROUND(100 * h.used_disk_gb / h.total_disk_gb, 1) AS disk_pct,
       ROUND(100 * (h.used_vcpu / h.total_vcpu + h.used_ram_gb / h.total_ram_gb + h.used_disk_gb / h.total_disk_gb) / 3, 1) AS utilization_pct
FROM hosts h
JOIN regions r ON r.region_id = h.region_id;

CREATE OR REPLACE VIEW v_current_pricing AS
SELECT t.type_id, t.name, t.family, t.vcpu, t.ram_gb, t.disk_gb, t.active,
       fn_hourly_price(t.type_id, CURRENT_DATE)               AS price_per_hour,
       ROUND(fn_hourly_price(t.type_id, CURRENT_DATE) * 730, 2) AS price_per_month
FROM instance_types t;

CREATE OR REPLACE VIEW v_pricing_history AS
SELECT p.price_id, p.type_id, t.name AS type_name, p.price_per_hour, p.valid_from, p.valid_to,
       CASE WHEN p.valid_from > CURRENT_DATE THEN 'scheduled'
            WHEN p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE THEN 'current'
            ELSE 'expired' END AS period_status
FROM pricing p
JOIN instance_types t ON t.type_id = p.type_id;
