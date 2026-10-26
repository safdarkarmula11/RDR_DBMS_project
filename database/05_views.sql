-- ============================================================
-- NimbusHost | 05_views.sql
-- All views for NimbusHost
-- ============================================================

-- ============================================================
-- 1. INFRASTRUCTURE & CAPACITY VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_host_capacity AS
SELECT h.host_id, h.hostname, r.region_id, r.code AS region_code, r.name AS region_name, h.status,
       h.total_vcpu, h.used_vcpu, (h.total_vcpu - h.used_vcpu) AS free_vcpu,
       h.total_ram_gb, h.used_ram_gb, (h.total_ram_gb - h.used_ram_gb) AS free_ram_gb,
       h.total_disk_gb, h.used_disk_gb, (h.total_disk_gb - h.used_disk_gb) AS free_disk_gb,
       ROUND(100 * h.used_vcpu / h.total_vcpu, 1)       AS cpu_pct,
       ROUND(100 * h.used_ram_gb / h.total_ram_gb, 1)   AS ram_pct,
       ROUND(100 * h.used_disk_gb / h.total_disk_gb, 1) AS disk_pct,
       ROUND(100 * (h.used_vcpu / h.total_vcpu + h.used_ram_gb / h.total_ram_gb + h.used_disk_gb / h.total_disk_gb) / 3, 1) AS utilization_pct
FROM hosts h
JOIN regions r ON r.region_id = h.region_id;

-- ============================================================
-- 2. COMPUTE VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_instances AS
SELECT i.instance_id, i.org_id, o.name AS org_name, i.name, i.status,
       t.name AS type_name, t.vcpu, t.ram_gb, t.disk_gb,
       CONCAT(os.name, ' ', im.version) AS image,
       r.code AS region_code, r.name AS region_name, h.hostname,
       ip.ip_address, i.auto_backup, i.created_at, i.terminated_at,
       fn_hourly_price(i.type_id, CURRENT_DATE) AS price_per_hour
FROM instances i
JOIN organizations o   ON o.org_id   = i.org_id
JOIN instance_types t  ON t.type_id  = i.type_id
JOIN images im         ON im.image_id = i.image_id
JOIN operating_systems os ON os.os_id = im.os_id
JOIN hosts h           ON h.host_id  = i.host_id
JOIN regions r         ON r.region_id = h.region_id
LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id;

CREATE OR REPLACE VIEW v_running_instances AS
SELECT i.instance_id, i.org_id, o.name AS org_name, i.name, i.status,
       t.name AS type_name, t.vcpu, t.ram_gb, t.disk_gb,
       CONCAT(os.name, ' ', im.version) AS image,
       r.code AS region_code, r.name AS region_name, h.hostname,
       ip.ip_address, i.auto_backup, i.created_at, i.terminated_at,
       fn_hourly_price(i.type_id, CURRENT_DATE) AS price_per_hour
FROM instances i
JOIN organizations o   ON o.org_id   = i.org_id
JOIN instance_types t  ON t.type_id  = i.type_id
JOIN images im         ON im.image_id = i.image_id
JOIN operating_systems os ON os.os_id = im.os_id
JOIN hosts h           ON h.host_id  = i.host_id
JOIN regions r         ON r.region_id = h.region_id
LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id
WHERE i.status = 'running';

CREATE OR REPLACE VIEW v_org_quota AS
SELECT o.org_id, o.name AS org_name, t.name AS tier, t.max_instances,
       fn_org_running_instances(o.org_id) AS active_instances,
       fn_org_quota_left(o.org_id)        AS quota_left
FROM organizations o
JOIN account_tiers t ON t.tier_id = o.tier_id;

-- ============================================================
-- 3. PRICING VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_current_pricing AS
SELECT t.type_id, t.name, t.family, t.vcpu, t.ram_gb, t.disk_gb, t.active,
       fn_hourly_price(t.type_id, CURRENT_DATE)                 AS price_per_hour,
       ROUND(fn_hourly_price(t.type_id, CURRENT_DATE) * 730, 2) AS price_per_month
FROM instance_types t;

CREATE OR REPLACE VIEW v_pricing_history AS
SELECT p.price_id, p.type_id, t.name AS type_name, p.price_per_hour, p.valid_from, p.valid_to,
       CASE WHEN p.valid_from > CURRENT_DATE THEN 'scheduled'
            WHEN p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE THEN 'current'
            ELSE 'expired' END AS period_status
FROM pricing p
JOIN instance_types t ON t.type_id = p.type_id;

-- ============================================================
-- 4. STORAGE & NETWORK VIEWS
-- ============================================================

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

-- ============================================================
-- 5. BILLING & FINANCIAL VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_org_monthly_cost AS
SELECT o.org_id,
       o.name AS org_name,
       DATE_FORMAT(inv.period_start, '%Y-%m') AS billing_month,
       COALESCE(SUM(inv.subtotal), 0.00) AS subtotal,
       COALESCE(SUM(inv.tax), 0.00) AS tax,
       COALESCE(SUM(inv.credit_applied), 0.00) AS credit_applied,
       COALESCE(SUM(inv.total), 0.00) AS total_billed,
       COUNT(inv.invoice_id) AS invoice_count
FROM v_invoices inv
JOIN organizations o ON o.org_id = inv.org_id
WHERE inv.status IN ('issued', 'paid', 'overdue')
GROUP BY o.org_id, o.name, DATE_FORMAT(inv.period_start, '%Y-%m');

CREATE OR REPLACE VIEW v_overdue_invoices AS
SELECT inv.invoice_id,
       inv.org_id,
       o.name AS org_name,
       inv.period_start,
       inv.period_end,
       inv.subtotal,
       inv.tax,
       inv.credit_applied,
       inv.total,
       fn_invoice_balance(inv.invoice_id) AS balance_due,
       inv.status,
       inv.issued_at,
       inv.due_date,
       DATEDIFF(CURRENT_DATE, inv.due_date) AS days_overdue,
       CASE
         WHEN DATEDIFF(CURRENT_DATE, inv.due_date) <= 30 THEN '1-30 days'
         WHEN DATEDIFF(CURRENT_DATE, inv.due_date) <= 60 THEN '31-60 days'
         WHEN DATEDIFF(CURRENT_DATE, inv.due_date) <= 90 THEN '61-90 days'
         ELSE '90+ days'
       END AS aging_bucket
FROM v_invoices inv
JOIN organizations o ON o.org_id = inv.org_id
WHERE inv.status = 'overdue' OR (inv.status = 'issued' AND inv.due_date < CURRENT_DATE);

CREATE OR REPLACE VIEW v_revenue_by_region AS
SELECT r.region_id,
       r.code AS region_code,
       r.name AS region_name,
       COALESCE(SUM(ii.amount), 0.00) AS total_revenue,
       COUNT(DISTINCT ii.invoice_id) AS invoice_count
FROM regions r
LEFT JOIN hosts h ON h.region_id = r.region_id
LEFT JOIN instances i ON i.host_id = h.host_id
LEFT JOIN v_invoice_items ii ON ii.instance_id = i.instance_id
LEFT JOIN invoices inv ON inv.invoice_id = ii.invoice_id AND inv.status = 'paid'
GROUP BY r.region_id, r.code, r.name;

-- ============================================================
-- 6. SUPPORT & SLA VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_ticket_sla AS
SELECT t.ticket_id,
       t.org_id,
       o.name AS org_name,
       t.created_by,
       u.full_name AS creator_name,
       t.assigned_to,
       a.full_name AS assignee_name,
       t.subject,
       t.priority,
       t.status,
       t.created_at,
       TIMESTAMPDIFF(HOUR, t.created_at, NOW()) AS age_hours,
       CASE t.priority
         WHEN 'critical' THEN 2
         WHEN 'high'     THEN 4
         WHEN 'medium'   THEN 24
         WHEN 'low'      THEN 48
       END AS sla_target_hours,
       (
         SELECT MIN(m.created_at)
         FROM ticket_messages m
         WHERE m.ticket_id = t.ticket_id AND m.sender_id <> t.created_by
       ) AS first_response_at,
       TIMESTAMPDIFF(
         HOUR,
         t.created_at,
         (SELECT MIN(m.created_at) FROM ticket_messages m WHERE m.ticket_id = t.ticket_id AND m.sender_id <> t.created_by)
       ) AS response_time_hours,
       CASE
         WHEN t.status IN ('resolved', 'closed') THEN
           CASE
             WHEN TIMESTAMPDIFF(
               HOUR,
               t.created_at,
               (SELECT MIN(m.created_at) FROM ticket_messages m WHERE m.ticket_id = t.ticket_id AND m.sender_id <> t.created_by)
             ) <= (CASE t.priority WHEN 'critical' THEN 2 WHEN 'high' THEN 4 WHEN 'medium' THEN 24 ELSE 48 END)
             THEN 'met'
             ELSE 'breached'
           END
         WHEN TIMESTAMPDIFF(HOUR, t.created_at, NOW()) > (CASE t.priority WHEN 'critical' THEN 2 WHEN 'high' THEN 4 WHEN 'medium' THEN 24 ELSE 48 END)
         THEN 'breached'
         ELSE 'within_sla'
       END AS sla_status
FROM tickets t
JOIN organizations o ON o.org_id = t.org_id
JOIN users u ON u.user_id = t.created_by
LEFT JOIN users a ON a.user_id = t.assigned_to;

-- ============================================================
-- 7. TENANT-SCOPED VIEWS (Filtered by session @app_org_id via fn_current_org_id())
-- Note: MySQL forbids user session variables directly in view SELECTs (Error 1351).
-- The function fn_current_org_id() resolves @app_org_id.
-- Note: WITH CHECK OPTION is not possible on views referencing functions or complex
-- expressions; tenant isolation is enforced by the application layer and trigger checks.
-- ============================================================

CREATE OR REPLACE VIEW v_my_instances AS
SELECT *
FROM instances
WHERE org_id = fn_current_org_id();

CREATE OR REPLACE VIEW v_my_volumes AS
SELECT *
FROM volumes
WHERE org_id = fn_current_org_id();

CREATE OR REPLACE VIEW v_my_invoices AS
SELECT *
FROM v_invoices
WHERE org_id = fn_current_org_id();

CREATE OR REPLACE VIEW v_my_tickets AS
SELECT *
FROM tickets
WHERE org_id = fn_current_org_id();

CREATE OR REPLACE VIEW v_my_usage AS
SELECT *
FROM v_usage_records
WHERE org_id = fn_current_org_id();

-- Images with their operating system (keeps the old "name / os_family / version" shape for callers)
CREATE OR REPLACE VIEW v_images AS
SELECT im.image_id, os.name, os.os_family, im.version, im.min_disk_gb
FROM images im
JOIN operating_systems os ON os.os_id = im.os_id;

-- Star-schema view: monthly usage by organization, tier, instance type and metric
CREATE OR REPLACE VIEW v_star_usage_monthly AS
SELECT d.year, d.month, m.month_name, o.org_name, o.tier_name, t.type_name, f.metric,
       SUM(f.total_quantity) AS total_quantity, SUM(f.record_count) AS record_count
FROM fact_usage_daily f
JOIN dim_date  d ON d.date_key = f.date_key
JOIN dim_month m ON m.month    = d.month
JOIN dim_org  o ON o.org_key  = f.org_key
JOIN dim_type t ON t.type_key = f.type_key
GROUP BY d.year, d.month, m.month_name, o.org_name, o.tier_name, t.type_name, f.metric;
