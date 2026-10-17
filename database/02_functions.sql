-- ============================================================
-- NimbusHost | 02_functions.sql
-- All stored functions for NimbusHost
-- ============================================================

DELIMITER $$

-- 1. Price in force for an instance type on a given date
DROP FUNCTION IF EXISTS fn_hourly_price$$
CREATE FUNCTION fn_hourly_price(p_type INT, p_at DATE)
RETURNS DECIMAL(8,4)
READS SQL DATA
BEGIN
  DECLARE v DECIMAL(8,4) DEFAULT NULL;
  SELECT price_per_hour INTO v
  FROM pricing
  WHERE type_id = p_type
    AND valid_from <= p_at
    AND (valid_to IS NULL OR valid_to >= p_at)
  ORDER BY valid_from DESC
  LIMIT 1;
  RETURN v;
END$$

-- 2. Count of non-terminated (billable/active) instances for an organization
DROP FUNCTION IF EXISTS fn_org_running_instances$$
CREATE FUNCTION fn_org_running_instances(p_org INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c
  FROM instances
  WHERE org_id = p_org AND status <> 'terminated';
  RETURN c;
END$$

-- Alias for backward compatibility
DROP FUNCTION IF EXISTS fn_org_active_instances$$
CREATE FUNCTION fn_org_active_instances(p_org INT)
RETURNS INT
READS SQL DATA
BEGIN
  RETURN fn_org_running_instances(p_org);
END$$

-- 3. Remaining instance quota for an organization under its tier
DROP FUNCTION IF EXISTS fn_org_quota_left$$
CREATE FUNCTION fn_org_quota_left(p_org INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_max INT DEFAULT 0;
  SELECT t.max_instances INTO v_max
  FROM organizations o
  JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN v_max - fn_org_running_instances(p_org);
END$$

-- 4. Total storage allocated to an organization in GB (non-deleted volumes)
DROP FUNCTION IF EXISTS fn_org_storage_used$$
CREATE FUNCTION fn_org_storage_used(p_org INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE s INT DEFAULT 0;
  SELECT COALESCE(SUM(size_gb), 0) INTO s
  FROM volumes
  WHERE org_id = p_org AND status <> 'deleted';
  RETURN s;
END$$

-- 5. Remaining storage quota in GB for an organization under its tier
DROP FUNCTION IF EXISTS fn_org_storage_left$$
CREATE FUNCTION fn_org_storage_left(p_org INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE m INT DEFAULT 0;
  SELECT t.max_storage_gb INTO m
  FROM organizations o
  JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN m - fn_org_storage_used(p_org);
END$$

-- 6. Count of volumes currently attached to an instance
DROP FUNCTION IF EXISTS fn_instance_volume_count$$
CREATE FUNCTION fn_instance_volume_count(p_inst INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c
  FROM volumes
  WHERE instance_id = p_inst AND status = 'attached';
  RETURN c;
END$$

-- 7. Outstanding balance on an invoice (total minus sum of payments)
DROP FUNCTION IF EXISTS fn_invoice_balance$$
CREATE FUNCTION fn_invoice_balance(p_invoice INT)
RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
  DECLARE v_total DECIMAL(12,2) DEFAULT NULL;
  DECLARE v_paid DECIMAL(12,2) DEFAULT 0.00;

  SELECT total INTO v_total
  FROM invoices
  WHERE invoice_id = p_invoice;

  IF v_total IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0.00) INTO v_paid
  FROM payments
  WHERE invoice_id = p_invoice;

  RETURN v_total - v_paid;
END$$

-- 8. Average utilization percentage across CPU, RAM, and Disk for a host
DROP FUNCTION IF EXISTS fn_host_utilization$$
CREATE FUNCTION fn_host_utilization(p_host INT)
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
  DECLARE v DECIMAL(5,2) DEFAULT NULL;
  SELECT ROUND(100 * (used_vcpu / total_vcpu + used_ram_gb / total_ram_gb + used_disk_gb / total_disk_gb) / 3, 2)
  INTO v
  FROM hosts
  WHERE host_id = p_host;
  RETURN v;
END$$

-- 9. Helper function to return current session organization ID for tenant views
DROP FUNCTION IF EXISTS fn_current_org_id$$
CREATE FUNCTION fn_current_org_id()
RETURNS INT
NO SQL
BEGIN
  RETURN COALESCE(@app_org_id, 0);
END$$

DELIMITER ;
