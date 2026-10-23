-- ============================================================
-- NimbusHost | 04_triggers.sql
-- All triggers for NimbusHost
-- ============================================================

DELIMITER $$

-- ============================================================
-- 1. INSTANCES TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_instances_bi_rules$$
CREATE TRIGGER trg_instances_bi_rules BEFORE INSERT ON instances FOR EACH ROW
BEGIN
  DECLARE v_org_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_host_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_active TINYINT DEFAULT NULL;
  DECLARE v_cpu INT;
  DECLARE v_ram INT;
  DECLARE v_disk INT;
  DECLARE v_min_disk INT DEFAULT NULL;
  DECLARE v_free_cpu INT;
  DECLARE v_free_ram INT;
  DECLARE v_free_disk INT;

  -- 1. Check organization status
  -- FOR UPDATE locks the organization row, so two launches for the same organization
  -- are serialized and cannot both pass the quota check below (check-then-insert race).
  SELECT status INTO v_org_status
  FROM organizations
  WHERE org_id = NEW.org_id
  FOR UPDATE;

  IF v_org_status IS NULL OR v_org_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not active';
  END IF;

  -- 2. Check instance quota
  IF fn_org_quota_left(NEW.org_id) <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance quota of your plan is used up';
  END IF;

  -- 3. Check instance type availability
  SELECT vcpu, ram_gb, disk_gb, active
  INTO v_cpu, v_ram, v_disk, v_active
  FROM instance_types
  WHERE type_id = NEW.type_id;

  IF v_active IS NULL OR v_active = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type is not available';
  END IF;

  -- 4. Check image minimum disk requirement
  SELECT min_disk_gb INTO v_min_disk
  FROM images
  WHERE image_id = NEW.image_id;

  IF v_min_disk IS NOT NULL AND v_disk < v_min_disk THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This instance type has less disk than the image requires';
  END IF;

  -- 5. Check host status and capacity
  SELECT status, (total_vcpu - used_vcpu), (total_ram_gb - used_ram_gb), (total_disk_gb - used_disk_gb)
  INTO v_host_status, v_free_cpu, v_free_ram, v_free_disk
  FROM hosts
  WHERE host_id = NEW.host_id;

  IF v_host_status IS NULL OR v_host_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host is not accepting new instances';
  END IF;

  IF v_free_cpu < v_cpu OR v_free_ram < v_ram OR v_free_disk < v_disk THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host does not have enough free capacity';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_instances_ai_capacity$$
CREATE TRIGGER trg_instances_ai_capacity AFTER INSERT ON instances FOR EACH ROW
BEGIN
  DECLARE v_cpu INT;
  DECLARE v_ram INT;
  DECLARE v_disk INT;

  SELECT vcpu, ram_gb, disk_gb
  INTO v_cpu, v_ram, v_disk
  FROM instance_types
  WHERE type_id = NEW.type_id;

  UPDATE hosts
  SET used_vcpu = used_vcpu + v_cpu,
      used_ram_gb = used_ram_gb + v_ram,
      used_disk_gb = used_disk_gb + v_disk
  WHERE host_id = NEW.host_id;

  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('instances', NEW.instance_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'type_id', NEW.type_id, 'host_id', NEW.host_id, 'status', NEW.status),
          COALESCE(@app_user_id, 0));
END$$

-- Keep instance_type_history in step with instances.type_id (the history is what usage is priced with)
DROP TRIGGER IF EXISTS trg_instances_ai_type_history$$
CREATE TRIGGER trg_instances_ai_type_history AFTER INSERT ON instances FOR EACH ROW
BEGIN
  INSERT INTO instance_type_history(instance_id, valid_from, type_id)
  VALUES (NEW.instance_id, '2000-01-01 00:00:00.000000', NEW.type_id);
END$$

DROP TRIGGER IF EXISTS trg_instances_au_type_history$$
CREATE TRIGGER trg_instances_au_type_history AFTER UPDATE ON instances FOR EACH ROW
BEGIN
  IF NEW.type_id <> OLD.type_id THEN
    INSERT INTO instance_type_history(instance_id, valid_from, type_id)
    VALUES (NEW.instance_id, NOW(6), NEW.type_id);
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ith_bu_block$$
CREATE TRIGGER trg_ith_bu_block BEFORE UPDATE ON instance_type_history FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type history is append-only';
END$$

DROP TRIGGER IF EXISTS trg_ith_bd_block$$
CREATE TRIGGER trg_ith_bd_block BEFORE DELETE ON instance_type_history FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type history is append-only';
END$$

DROP TRIGGER IF EXISTS trg_instances_bu_rules$$
CREATE TRIGGER trg_instances_bu_rules BEFORE UPDATE ON instances FOR EACH ROW
BEGIN
  -- Terminated instances are completely read-only
  IF OLD.status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terminated instances are read-only';
  END IF;

  -- Immutability of org_id, host_id, and image_id
  IF NEW.org_id <> OLD.org_id OR NEW.host_id <> OLD.host_id OR NEW.image_id <> OLD.image_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Owner, host and image of an instance cannot be changed';
  END IF;

  -- Immutability of type_id unless @app_resizing is explicitly set by resize procedure
  IF NEW.type_id <> OLD.type_id AND COALESCE(@app_resizing, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type cannot be changed directly; use resize procedure';
  END IF;

  -- State machine validation
  IF NEW.status <> OLD.status THEN
    IF NOT (
         (OLD.status = 'pending'   AND NEW.status IN ('running','terminated'))
      OR (OLD.status = 'running'   AND NEW.status IN ('stopped','suspended','terminated'))
      OR (OLD.status = 'stopped'   AND NEW.status IN ('running','suspended','terminated'))
      OR (OLD.status = 'suspended' AND NEW.status IN ('running','stopped','terminated'))
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This status change is not allowed';
    END IF;

    IF NEW.status = 'terminated' THEN
      SET NEW.terminated_at = CURRENT_TIMESTAMP;
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_instances_au_effects$$
CREATE TRIGGER trg_instances_au_effects AFTER UPDATE ON instances FOR EACH ROW
BEGIN
  DECLARE v_cpu INT;
  DECLARE v_ram INT;
  DECLARE v_disk INT;

  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'terminated' THEN
      SELECT vcpu, ram_gb, disk_gb INTO v_cpu, v_ram, v_disk
      FROM instance_types
      WHERE type_id = NEW.type_id;

      UPDATE hosts
      SET used_vcpu = used_vcpu - v_cpu,
          used_ram_gb = used_ram_gb - v_ram,
          used_disk_gb = used_disk_gb - v_disk
      WHERE host_id = NEW.host_id;

      UPDATE ip_addresses
      SET instance_id = NULL, allocated_at = NULL
      WHERE instance_id = NEW.instance_id;

      UPDATE volumes
      SET status = 'available', instance_id = NULL
      WHERE instance_id = NEW.instance_id;
    END IF;

    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('instances', NEW.instance_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status),
            JSON_OBJECT('status', NEW.status),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_instances_bd_block$$
CREATE TRIGGER trg_instances_bd_block BEFORE DELETE ON instances FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instances cannot be deleted; terminate them instead';
END$$

-- ============================================================
-- 2. ORGANIZATIONS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_organizations_ai_audit$$
CREATE TRIGGER trg_organizations_ai_audit AFTER INSERT ON organizations FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('organizations', NEW.org_id, 'INSERT',
          JSON_OBJECT('name', NEW.name, 'tier_id', NEW.tier_id, 'status', NEW.status),
          COALESCE(@app_user_id, 0));
END$$

-- Exclude credit_balance from routine audit since it changes often via billing/triggers
DROP TRIGGER IF EXISTS trg_organizations_au_audit$$
CREATE TRIGGER trg_organizations_au_audit AFTER UPDATE ON organizations FOR EACH ROW
BEGIN
  IF OLD.name <> NEW.name OR OLD.tier_id <> NEW.tier_id OR NOT (OLD.parent_org_id <=> NEW.parent_org_id) OR OLD.status <> NEW.status THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('organizations', NEW.org_id, 'UPDATE',
            JSON_OBJECT('name', OLD.name, 'tier_id', OLD.tier_id, 'parent_org_id', OLD.parent_org_id, 'status', OLD.status),
            JSON_OBJECT('name', NEW.name, 'tier_id', NEW.tier_id, 'parent_org_id', NEW.parent_org_id, 'status', NEW.status),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_organizations_bd_block$$
CREATE TRIGGER trg_organizations_bd_block BEFORE DELETE ON organizations FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM instances WHERE org_id = OLD.org_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete organization with instances';
  END IF;
END$$

-- ============================================================
-- 3. USERS TRIGGERS (password_hash excluded from audit)
-- ============================================================

DROP TRIGGER IF EXISTS trg_users_ai_audit$$
CREATE TRIGGER trg_users_ai_audit AFTER INSERT ON users FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('users', NEW.user_id, 'INSERT',
          JSON_OBJECT('user_id', NEW.user_id, 'email', NEW.email, 'full_name', NEW.full_name, 'system_role', NEW.system_role, 'status', NEW.status),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_users_au_audit$$
CREATE TRIGGER trg_users_au_audit AFTER UPDATE ON users FOR EACH ROW
BEGIN
  IF OLD.email <> NEW.email OR OLD.full_name <> NEW.full_name OR OLD.system_role <> NEW.system_role OR OLD.status <> NEW.status OR NOT (OLD.locked_until <=> NEW.locked_until) THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('users', NEW.user_id, 'UPDATE',
            JSON_OBJECT('email', OLD.email, 'full_name', OLD.full_name, 'system_role', OLD.system_role, 'status', OLD.status, 'locked_until', OLD.locked_until),
            JSON_OBJECT('email', NEW.email, 'full_name', NEW.full_name, 'system_role', NEW.system_role, 'status', NEW.status, 'locked_until', NEW.locked_until),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ============================================================
-- 4. HOSTS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_hosts_bu_rules$$
CREATE TRIGGER trg_hosts_bu_rules BEFORE UPDATE ON hosts FOR EACH ROW
BEGIN
  -- Retired hosts cannot be reactivated
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A retired host cannot be reactivated';
  END IF;

  -- Cannot retire a host that still runs workloads
  IF NEW.status = 'retired' AND OLD.status <> 'retired'
     AND (OLD.used_vcpu > 0 OR OLD.used_ram_gb > 0 OR OLD.used_disk_gb > 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot retire a host that still runs workloads';
  END IF;

  -- Capacity limit check
  IF NEW.used_vcpu > NEW.total_vcpu OR NEW.used_ram_gb > NEW.total_ram_gb OR NEW.used_disk_gb > NEW.total_disk_gb THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host capacity exceeded';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_hosts_ai_audit$$
CREATE TRIGGER trg_hosts_ai_audit AFTER INSERT ON hosts FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('hosts', NEW.host_id, 'INSERT',
          JSON_OBJECT('hostname', NEW.hostname, 'region_id', NEW.region_id, 'status', NEW.status,
                      'total_vcpu', NEW.total_vcpu, 'total_ram_gb', NEW.total_ram_gb, 'total_disk_gb', NEW.total_disk_gb),
          COALESCE(@app_user_id, 0));
END$$

-- Audit status and total capacity changes (used_* counters change too often for audit log)
DROP TRIGGER IF EXISTS trg_hosts_au_audit$$
CREATE TRIGGER trg_hosts_au_audit AFTER UPDATE ON hosts FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status OR OLD.total_vcpu <> NEW.total_vcpu
     OR OLD.total_ram_gb <> NEW.total_ram_gb OR OLD.total_disk_gb <> NEW.total_disk_gb THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('hosts', NEW.host_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status, 'total_vcpu', OLD.total_vcpu, 'total_ram_gb', OLD.total_ram_gb, 'total_disk_gb', OLD.total_disk_gb),
            JSON_OBJECT('status', NEW.status, 'total_vcpu', NEW.total_vcpu, 'total_ram_gb', NEW.total_ram_gb, 'total_disk_gb', NEW.total_disk_gb),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ============================================================
-- 5. PRICING TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_pricing_bi_overlap$$
CREATE TRIGGER trg_pricing_bi_overlap BEFORE INSERT ON pricing FOR EACH ROW
BEGIN
  CALL sp_assert_no_price_overlap(NEW.type_id, NEW.valid_from, NEW.valid_to, NEW.price_id);
END$$

DROP TRIGGER IF EXISTS trg_pricing_bu_overlap$$
CREATE TRIGGER trg_pricing_bu_overlap BEFORE UPDATE ON pricing FOR EACH ROW
BEGIN
  CALL sp_assert_no_price_overlap(NEW.type_id, NEW.valid_from, NEW.valid_to, NEW.price_id);
END$$

DROP TRIGGER IF EXISTS trg_pricing_bd_block$$
CREATE TRIGGER trg_pricing_bd_block BEFORE DELETE ON pricing FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Price history cannot be deleted; end the period instead';
END$$

DROP TRIGGER IF EXISTS trg_pricing_ai_audit$$
CREATE TRIGGER trg_pricing_ai_audit AFTER INSERT ON pricing FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('pricing', NEW.price_id, 'INSERT',
          JSON_OBJECT('type_id', NEW.type_id, 'price_per_hour', NEW.price_per_hour, 'valid_from', NEW.valid_from, 'valid_to', NEW.valid_to),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_pricing_au_audit$$
CREATE TRIGGER trg_pricing_au_audit AFTER UPDATE ON pricing FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('pricing', NEW.price_id, 'UPDATE',
          JSON_OBJECT('price_per_hour', OLD.price_per_hour, 'valid_from', OLD.valid_from, 'valid_to', OLD.valid_to),
          JSON_OBJECT('price_per_hour', NEW.price_per_hour, 'valid_from', NEW.valid_from, 'valid_to', NEW.valid_to),
          COALESCE(@app_user_id, 0));
END$$

-- ============================================================
-- 6. INVOICES TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_invoices_bu_rules$$
CREATE TRIGGER trg_invoices_bu_rules BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
  -- Amounts frozen once status is no longer 'draft'
  IF OLD.status <> 'draft' AND (
     OLD.subtotal <> NEW.subtotal
     OR OLD.tax_rate_pct <> NEW.tax_rate_pct
     OR OLD.credit_applied <> NEW.credit_applied
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice amounts are frozen once issued';
  END IF;

  -- Status forward-only state machine: draft -> issued -> paid/overdue/void; overdue -> paid/void
  IF NEW.status <> OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status NOT IN ('issued', 'void') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Draft invoice can only transition to issued or void';
    ELSEIF OLD.status = 'issued' AND NEW.status NOT IN ('paid', 'overdue', 'void') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issued invoice can only transition to paid, overdue, or void';
    ELSEIF OLD.status = 'overdue' AND NEW.status NOT IN ('paid', 'void') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overdue invoice can only transition to paid or void';
    ELSEIF OLD.status IN ('paid', 'void') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paid or void invoices cannot change status';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoices_bd_block$$
CREATE TRIGGER trg_invoices_bd_block BEFORE DELETE ON invoices FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoices cannot be deleted; financial records are permanent';
END$$

DROP TRIGGER IF EXISTS trg_invoices_ai_audit$$
CREATE TRIGGER trg_invoices_ai_audit AFTER INSERT ON invoices FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('invoices', NEW.invoice_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'period_start', NEW.period_start, 'period_end', NEW.period_end,
                      'total', NEW.subtotal + ROUND(NEW.subtotal * NEW.tax_rate_pct / 100, 2) - NEW.credit_applied, 'status', NEW.status),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_invoices_au_audit$$
CREATE TRIGGER trg_invoices_au_audit AFTER UPDATE ON invoices FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status
     OR OLD.subtotal <> NEW.subtotal OR OLD.tax_rate_pct <> NEW.tax_rate_pct OR OLD.credit_applied <> NEW.credit_applied THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('invoices', NEW.invoice_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status,
                        'total', OLD.subtotal + ROUND(OLD.subtotal * OLD.tax_rate_pct / 100, 2) - OLD.credit_applied),
            JSON_OBJECT('status', NEW.status,
                        'total', NEW.subtotal + ROUND(NEW.subtotal * NEW.tax_rate_pct / 100, 2) - NEW.credit_applied),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ============================================================
-- 7. PAYMENTS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_payments_bu_block$$
CREATE TRIGGER trg_payments_bu_block BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments are immutable';
END$$

DROP TRIGGER IF EXISTS trg_payments_bd_block$$
CREATE TRIGGER trg_payments_bd_block BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments cannot be deleted; financial records are permanent';
END$$

DROP TRIGGER IF EXISTS trg_payments_ai_audit$$
CREATE TRIGGER trg_payments_ai_audit AFTER INSERT ON payments FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('payments', NEW.payment_id, 'INSERT',
          JSON_OBJECT('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'method', NEW.method, 'txn_ref', NEW.txn_ref),
          COALESCE(@app_user_id, 0));
END$$

-- ============================================================
-- 8. AUDIT LOG IMMUTABILITY TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_log_bu_block$$
CREATE TRIGGER trg_audit_log_bu_block BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log records are immutable and cannot be updated';
END$$

DROP TRIGGER IF EXISTS trg_audit_log_bd_block$$
CREATE TRIGGER trg_audit_log_bd_block BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log records cannot be deleted';
END$$

-- ============================================================
-- 9. VOLUMES TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_volumes_bi_rules$$
CREATE TRIGGER trg_volumes_bi_rules BEFORE INSERT ON volumes FOR EACH ROW
BEGIN
  DECLARE v_org_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_region_status VARCHAR(20) DEFAULT NULL;

  SELECT status INTO v_org_status FROM organizations WHERE org_id = NEW.org_id;
  IF v_org_status IS NULL OR v_org_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not active';
  END IF;

  SELECT status INTO v_region_status FROM regions WHERE region_id = NEW.region_id;
  IF v_region_status IS NULL OR v_region_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Region is not available';
  END IF;

  IF NEW.status <> 'available' OR NEW.instance_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New volumes must start detached';
  END IF;

  IF NEW.size_gb > fn_org_storage_left(NEW.org_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage quota of your plan would be exceeded';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_volumes_bu_rules$$
CREATE TRIGGER trg_volumes_bu_rules BEFORE UPDATE ON volumes FOR EACH ROW
BEGIN
  DECLARE v_inst_org INT DEFAULT NULL;
  DECLARE v_inst_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_inst_region INT DEFAULT NULL;

  IF OLD.status = 'deleted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Deleted volumes are read-only';
  END IF;

  IF NEW.org_id <> OLD.org_id OR NEW.region_id <> OLD.region_id OR NEW.vol_type <> OLD.vol_type THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Owner, region and type of a volume cannot be changed';
  END IF;

  IF NEW.size_gb < OLD.size_gb THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A volume can only grow, never shrink';
  END IF;

  IF NEW.size_gb > OLD.size_gb AND (NEW.size_gb - OLD.size_gb) > fn_org_storage_left(NEW.org_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage quota of your plan would be exceeded';
  END IF;

  IF NEW.status = 'deleted' AND OLD.status <> 'available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Detach the volume before deleting it';
  END IF;

  IF NEW.status = 'deleted' THEN
    SET NEW.deleted_at = CURRENT_TIMESTAMP;
  END IF;

  IF NEW.status <> 'deleted' AND ((NEW.status = 'attached') <> (NEW.instance_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A volume is attached exactly when it has an instance';
  END IF;

  IF OLD.status = 'attached' AND NEW.status = 'attached' AND NEW.instance_id <> OLD.instance_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Detach the volume before attaching it somewhere else';
  END IF;

  -- Attaching: check target instance
  IF NEW.instance_id IS NOT NULL AND OLD.instance_id IS NULL THEN
    SELECT i.org_id, i.status, h.region_id INTO v_inst_org, v_inst_status, v_inst_region
    FROM instances i
    JOIN hosts h ON h.host_id = i.host_id
    WHERE i.instance_id = NEW.instance_id;

    IF v_inst_org IS NULL OR v_inst_org <> NEW.org_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
    END IF;

    IF v_inst_status NOT IN ('running','stopped') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance must be running or stopped to attach a volume';
    END IF;

    IF v_inst_region <> NEW.region_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume and instance must be in the same region';
    END IF;

    IF fn_instance_volume_count(NEW.instance_id) >= 5 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An instance can have at most 5 volumes';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_volumes_ai_audit$$
CREATE TRIGGER trg_volumes_ai_audit AFTER INSERT ON volumes FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('volumes', NEW.volume_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'size_gb', NEW.size_gb, 'vol_type', NEW.vol_type),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_volumes_au_audit$$
CREATE TRIGGER trg_volumes_au_audit AFTER UPDATE ON volumes FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status OR OLD.size_gb <> NEW.size_gb OR NOT (OLD.instance_id <=> NEW.instance_id) THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('volumes', NEW.volume_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status, 'size_gb', OLD.size_gb, 'instance_id', OLD.instance_id),
            JSON_OBJECT('status', NEW.status, 'size_gb', NEW.size_gb, 'instance_id', NEW.instance_id),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_volumes_bd_block$$
CREATE TRIGGER trg_volumes_bd_block BEFORE DELETE ON volumes FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volumes cannot be deleted; delete them through the delete procedure (soft delete)';
END$$

-- ============================================================
-- 10. SNAPSHOTS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_snapshots_bi_rules$$
CREATE TRIGGER trg_snapshots_bi_rules BEFORE INSERT ON snapshots FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_size INT DEFAULT NULL;

  SELECT status, size_gb INTO v_status, v_size
  FROM volumes
  WHERE volume_id = NEW.volume_id;

  IF v_status IS NULL OR v_status = 'deleted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  IF (SELECT COUNT(*) FROM snapshots WHERE volume_id = NEW.volume_id) >= 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A volume can have at most 5 snapshots';
  END IF;

  SET NEW.size_gb = v_size;
END$$

DROP TRIGGER IF EXISTS trg_snapshots_ai_audit$$
CREATE TRIGGER trg_snapshots_ai_audit AFTER INSERT ON snapshots FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('snapshots', NEW.snapshot_id, 'INSERT',
          JSON_OBJECT('volume_id', NEW.volume_id, 'name', NEW.name, 'size_gb', NEW.size_gb),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_snapshots_ad_audit$$
CREATE TRIGGER trg_snapshots_ad_audit AFTER DELETE ON snapshots FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('snapshots', OLD.snapshot_id, 'DELETE',
          JSON_OBJECT('volume_id', OLD.volume_id, 'name', OLD.name, 'size_gb', OLD.size_gb),
          COALESCE(@app_user_id, 0));
END$$

-- ============================================================
-- 11. DOMAINS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_domains_bi_rules$$
CREATE TRIGGER trg_domains_bi_rules BEFORE INSERT ON domains FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  SET NEW.name = LOWER(TRIM(NEW.name));

  SELECT status INTO v_status
  FROM organizations
  WHERE org_id = NEW.org_id;

  IF v_status IS NULL OR v_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not active';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_domains_bu_rules$$
CREATE TRIGGER trg_domains_bu_rules BEFORE UPDATE ON domains FOR EACH ROW
BEGIN
  IF NEW.name <> OLD.name OR NEW.org_id <> OLD.org_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain name and owner cannot be changed';
  END IF;

  IF NEW.expires_on < OLD.expires_on THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The expiry date cannot move backwards';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_domains_bd_block$$
CREATE TRIGGER trg_domains_bd_block BEFORE DELETE ON domains FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domains cannot be deleted';
END$$

DROP TRIGGER IF EXISTS trg_domains_ai_audit$$
CREATE TRIGGER trg_domains_ai_audit AFTER INSERT ON domains FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('domains', NEW.domain_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'expires_on', NEW.expires_on),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_domains_au_audit$$
CREATE TRIGGER trg_domains_au_audit AFTER UPDATE ON domains FOR EACH ROW
BEGIN
  IF OLD.expires_on <> NEW.expires_on OR OLD.auto_renew <> NEW.auto_renew THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('domains', NEW.domain_id, 'UPDATE',
            JSON_OBJECT('expires_on', OLD.expires_on, 'auto_renew', OLD.auto_renew),
            JSON_OBJECT('expires_on', NEW.expires_on, 'auto_renew', NEW.auto_renew),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ============================================================
-- 12. DNS RECORDS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_dns_bi_rules$$
CREATE TRIGGER trg_dns_bi_rules BEFORE INSERT ON dns_records FOR EACH ROW
BEGIN
  IF NEW.rtype <> 'MX' THEN
    SET NEW.priority = NULL;
  END IF;
  CALL sp_validate_dns_record(NEW.domain_id, NEW.rtype, NEW.name, NEW.value, NEW.priority, NEW.record_id);
END$$

DROP TRIGGER IF EXISTS trg_dns_bu_rules$$
CREATE TRIGGER trg_dns_bu_rules BEFORE UPDATE ON dns_records FOR EACH ROW
BEGIN
  IF NEW.domain_id <> OLD.domain_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A record cannot be moved to another domain';
  END IF;
  IF NEW.rtype <> 'MX' THEN
    SET NEW.priority = NULL;
  END IF;
  CALL sp_validate_dns_record(NEW.domain_id, NEW.rtype, NEW.name, NEW.value, NEW.priority, NEW.record_id);
END$$

DROP TRIGGER IF EXISTS trg_dns_ai_audit$$
CREATE TRIGGER trg_dns_ai_audit AFTER INSERT ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('dns_records', NEW.record_id, 'INSERT',
          JSON_OBJECT('domain_id', NEW.domain_id, 'rtype', NEW.rtype, 'name', NEW.name, 'value', NEW.value),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_dns_au_audit$$
CREATE TRIGGER trg_dns_au_audit AFTER UPDATE ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('dns_records', NEW.record_id, 'UPDATE',
          JSON_OBJECT('rtype', OLD.rtype, 'name', OLD.name, 'value', OLD.value, 'ttl', OLD.ttl),
          JSON_OBJECT('rtype', NEW.rtype, 'name', NEW.name, 'value', NEW.value, 'ttl', NEW.ttl),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_dns_ad_audit$$
CREATE TRIGGER trg_dns_ad_audit AFTER DELETE ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('dns_records', OLD.record_id, 'DELETE',
          JSON_OBJECT('domain_id', OLD.domain_id, 'rtype', OLD.rtype, 'name', OLD.name, 'value', OLD.value),
          COALESCE(@app_user_id, 0));
END$$

-- ============================================================
-- 13. ORG MEMBERS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_org_members_ai_audit$$
CREATE TRIGGER trg_org_members_ai_audit AFTER INSERT ON org_members FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('org_members', NEW.user_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'user_id', NEW.user_id, 'member_role', NEW.member_role),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_org_members_ad_audit$$
CREATE TRIGGER trg_org_members_ad_audit AFTER DELETE ON org_members FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('org_members', OLD.user_id, 'DELETE',
          JSON_OBJECT('org_id', OLD.org_id, 'user_id', OLD.user_id, 'member_role', OLD.member_role),
          COALESCE(@app_user_id, 0));
END$$

-- ============================================================
-- 14. API KEYS TRIGGERS (key_hash excluded from audit)
-- ============================================================

DROP TRIGGER IF EXISTS trg_api_keys_ai_audit$$
CREATE TRIGGER trg_api_keys_ai_audit AFTER INSERT ON api_keys FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('api_keys', NEW.key_id, 'INSERT',
          JSON_OBJECT('user_id', NEW.user_id, 'label', NEW.label, 'revoked', NEW.revoked),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_api_keys_au_audit$$
CREATE TRIGGER trg_api_keys_au_audit AFTER UPDATE ON api_keys FOR EACH ROW
BEGIN
  IF OLD.revoked <> NEW.revoked OR NOT (OLD.label <=> NEW.label) THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('api_keys', NEW.key_id, 'UPDATE',
            JSON_OBJECT('label', OLD.label, 'revoked', OLD.revoked),
            JSON_OBJECT('label', NEW.label, 'revoked', NEW.revoked),
            COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ============================================================
-- 15. USAGE RECORDS TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_usage_bi_rules$$
CREATE TRIGGER trg_usage_bi_rules BEFORE INSERT ON usage_records FOR EACH ROW
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_type INT DEFAULT NULL;
  DECLARE v_status VARCHAR(20) DEFAULT NULL;

  SELECT org_id, type_id, status
  INTO v_org, v_type, v_status
  FROM instances
  WHERE instance_id = NEW.instance_id;

  IF v_org IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance does not exist';
  END IF;

  IF v_status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot record usage for a terminated instance';
  END IF;

END$$


-- ============================================================
-- 20. INTEGRITY RULES ADDED AFTER REVIEW
-- ============================================================

-- usage_records is billing evidence: append-only (partition drops by the retention job are DDL and still work)
DROP TRIGGER IF EXISTS trg_usage_bu_block$$
CREATE TRIGGER trg_usage_bu_block BEFORE UPDATE ON usage_records FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usage records are append-only and cannot be updated';
END$$

DROP TRIGGER IF EXISTS trg_usage_bd_block$$
CREATE TRIGGER trg_usage_bd_block BEFORE DELETE ON usage_records FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usage records are append-only and cannot be deleted';
END$$

-- invoice_items can only change while the parent invoice is still a draft
DROP TRIGGER IF EXISTS trg_invoice_items_bi_rules$$
CREATE TRIGGER trg_invoice_items_bi_rules BEFORE INSERT ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  SELECT status INTO v_status FROM invoices WHERE invoice_id = NEW.invoice_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice not found';
  END IF;
  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Line items can only be changed while the invoice is a draft';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoice_items_bu_rules$$
CREATE TRIGGER trg_invoice_items_bu_rules BEFORE UPDATE ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  SELECT status INTO v_status FROM invoices WHERE invoice_id = OLD.invoice_id;
  IF v_status IS NULL OR v_status <> 'draft' OR NEW.invoice_id <> OLD.invoice_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Line items can only be changed while the invoice is a draft';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoice_items_bd_rules$$
CREATE TRIGGER trg_invoice_items_bd_rules BEFORE DELETE ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  SELECT status INTO v_status FROM invoices WHERE invoice_id = OLD.invoice_id;
  IF v_status IS NULL OR v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Line items can only be changed while the invoice is a draft';
  END IF;
END$$

-- tickets: creator must belong to the organization, only support staff can be assignees, closed is final
DROP TRIGGER IF EXISTS trg_tickets_bi_rules$$
CREATE TRIGGER trg_tickets_bi_rules BEFORE INSERT ON tickets FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(20) DEFAULT NULL;
  DECLARE v_member INT DEFAULT 0;
  DECLARE v_assignee_role VARCHAR(20) DEFAULT NULL;

  SELECT system_role INTO v_role FROM users WHERE user_id = NEW.created_by;
  IF v_role = 'customer' THEN
    SELECT COUNT(*) INTO v_member FROM org_members WHERE org_id = NEW.org_id AND user_id = NEW.created_by;
    IF v_member = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket creator must be a member of the organization';
    END IF;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT system_role INTO v_assignee_role FROM users WHERE user_id = NEW.assigned_to;
    IF v_assignee_role IS NULL OR v_assignee_role NOT IN ('support', 'super_admin') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets can only be assigned to support staff';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_tickets_bu_rules$$
CREATE TRIGGER trg_tickets_bu_rules BEFORE UPDATE ON tickets FOR EACH ROW
BEGIN
  DECLARE v_assignee_role VARCHAR(20) DEFAULT NULL;

  IF NEW.org_id <> OLD.org_id OR NEW.created_by <> OLD.created_by THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket organization and creator cannot be changed';
  END IF;

  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A closed ticket cannot be reopened';
  END IF;

  IF NOT (NEW.assigned_to <=> OLD.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    SELECT system_role INTO v_assignee_role FROM users WHERE user_id = NEW.assigned_to;
    IF v_assignee_role IS NULL OR v_assignee_role NOT IN ('support', 'super_admin') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets can only be assigned to support staff';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ticket_messages_bi_rules$$
CREATE TRIGGER trg_ticket_messages_bi_rules BEFORE INSERT ON ticket_messages FOR EACH ROW
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_role VARCHAR(20) DEFAULT NULL;
  DECLARE v_member INT DEFAULT 0;

  SELECT org_id INTO v_org FROM tickets WHERE ticket_id = NEW.ticket_id;
  SELECT system_role INTO v_role FROM users WHERE user_id = NEW.sender_id;

  IF v_role = 'customer' THEN
    SELECT COUNT(*) INTO v_member FROM org_members WHERE org_id = v_org AND user_id = NEW.sender_id;
    IF v_member = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sender is not allowed to post on this ticket';
    END IF;
  END IF;
END$$

-- Audit trails for catalog and support tables that had none

DROP TRIGGER IF EXISTS trg_account_tiers_ai_audit$$
CREATE TRIGGER trg_account_tiers_ai_audit AFTER INSERT ON account_tiers FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('account_tiers', NEW.tier_id, 'INSERT', JSON_OBJECT('name', NEW.name, 'max_instances', NEW.max_instances, 'max_storage_gb', NEW.max_storage_gb, 'discount_pct', NEW.discount_pct), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_account_tiers_au_audit$$
CREATE TRIGGER trg_account_tiers_au_audit AFTER UPDATE ON account_tiers FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('account_tiers', NEW.tier_id, 'UPDATE', JSON_OBJECT('name', OLD.name, 'max_instances', OLD.max_instances, 'max_storage_gb', OLD.max_storage_gb, 'discount_pct', OLD.discount_pct), JSON_OBJECT('name', NEW.name, 'max_instances', NEW.max_instances, 'max_storage_gb', NEW.max_storage_gb, 'discount_pct', NEW.discount_pct), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_account_tiers_ad_audit$$
CREATE TRIGGER trg_account_tiers_ad_audit AFTER DELETE ON account_tiers FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('account_tiers', OLD.tier_id, 'DELETE', JSON_OBJECT('name', OLD.name, 'max_instances', OLD.max_instances, 'max_storage_gb', OLD.max_storage_gb, 'discount_pct', OLD.discount_pct), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_regions_ai_audit$$
CREATE TRIGGER trg_regions_ai_audit AFTER INSERT ON regions FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('regions', NEW.region_id, 'INSERT', JSON_OBJECT('code', NEW.code, 'name', NEW.name, 'country', NEW.country, 'status', NEW.status), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_regions_au_audit$$
CREATE TRIGGER trg_regions_au_audit AFTER UPDATE ON regions FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('regions', NEW.region_id, 'UPDATE', JSON_OBJECT('code', OLD.code, 'name', OLD.name, 'country', OLD.country, 'status', OLD.status), JSON_OBJECT('code', NEW.code, 'name', NEW.name, 'country', NEW.country, 'status', NEW.status), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_regions_ad_audit$$
CREATE TRIGGER trg_regions_ad_audit AFTER DELETE ON regions FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('regions', OLD.region_id, 'DELETE', JSON_OBJECT('code', OLD.code, 'name', OLD.name, 'country', OLD.country, 'status', OLD.status), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_instance_types_ai_audit$$
CREATE TRIGGER trg_instance_types_ai_audit AFTER INSERT ON instance_types FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('instance_types', NEW.type_id, 'INSERT', JSON_OBJECT('name', NEW.name, 'family', NEW.family, 'vcpu', NEW.vcpu, 'ram_gb', NEW.ram_gb, 'disk_gb', NEW.disk_gb, 'active', NEW.active), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_instance_types_au_audit$$
CREATE TRIGGER trg_instance_types_au_audit AFTER UPDATE ON instance_types FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('instance_types', NEW.type_id, 'UPDATE', JSON_OBJECT('name', OLD.name, 'family', OLD.family, 'vcpu', OLD.vcpu, 'ram_gb', OLD.ram_gb, 'disk_gb', OLD.disk_gb, 'active', OLD.active), JSON_OBJECT('name', NEW.name, 'family', NEW.family, 'vcpu', NEW.vcpu, 'ram_gb', NEW.ram_gb, 'disk_gb', NEW.disk_gb, 'active', NEW.active), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_instance_types_ad_audit$$
CREATE TRIGGER trg_instance_types_ad_audit AFTER DELETE ON instance_types FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('instance_types', OLD.type_id, 'DELETE', JSON_OBJECT('name', OLD.name, 'family', OLD.family, 'vcpu', OLD.vcpu, 'ram_gb', OLD.ram_gb, 'disk_gb', OLD.disk_gb, 'active', OLD.active), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_operating_systems_ai_audit$$
CREATE TRIGGER trg_operating_systems_ai_audit AFTER INSERT ON operating_systems FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('operating_systems', NEW.os_id, 'INSERT', JSON_OBJECT('name', NEW.name, 'os_family', NEW.os_family), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_operating_systems_au_audit$$
CREATE TRIGGER trg_operating_systems_au_audit AFTER UPDATE ON operating_systems FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('operating_systems', NEW.os_id, 'UPDATE', JSON_OBJECT('name', OLD.name, 'os_family', OLD.os_family), JSON_OBJECT('name', NEW.name, 'os_family', NEW.os_family), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_operating_systems_ad_audit$$
CREATE TRIGGER trg_operating_systems_ad_audit AFTER DELETE ON operating_systems FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('operating_systems', OLD.os_id, 'DELETE', JSON_OBJECT('name', OLD.name, 'os_family', OLD.os_family), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_images_ai_audit$$
CREATE TRIGGER trg_images_ai_audit AFTER INSERT ON images FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('images', NEW.image_id, 'INSERT', JSON_OBJECT('os_id', NEW.os_id, 'version', NEW.version, 'min_disk_gb', NEW.min_disk_gb), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_images_au_audit$$
CREATE TRIGGER trg_images_au_audit AFTER UPDATE ON images FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('images', NEW.image_id, 'UPDATE', JSON_OBJECT('os_id', OLD.os_id, 'version', OLD.version, 'min_disk_gb', OLD.min_disk_gb), JSON_OBJECT('os_id', NEW.os_id, 'version', NEW.version, 'min_disk_gb', NEW.min_disk_gb), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_images_ad_audit$$
CREATE TRIGGER trg_images_ad_audit AFTER DELETE ON images FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('images', OLD.image_id, 'DELETE', JSON_OBJECT('os_id', OLD.os_id, 'version', OLD.version, 'min_disk_gb', OLD.min_disk_gb), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_tickets_ai_audit$$
CREATE TRIGGER trg_tickets_ai_audit AFTER INSERT ON tickets FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('tickets', NEW.ticket_id, 'INSERT', JSON_OBJECT('org_id', NEW.org_id, 'created_by', NEW.created_by, 'assigned_to', NEW.assigned_to, 'subject', NEW.subject, 'priority', NEW.priority, 'status', NEW.status), COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_tickets_au_audit$$
CREATE TRIGGER trg_tickets_au_audit AFTER UPDATE ON tickets FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('tickets', NEW.ticket_id, 'UPDATE', JSON_OBJECT('org_id', OLD.org_id, 'created_by', OLD.created_by, 'assigned_to', OLD.assigned_to, 'subject', OLD.subject, 'priority', OLD.priority, 'status', OLD.status), JSON_OBJECT('org_id', NEW.org_id, 'created_by', NEW.created_by, 'assigned_to', NEW.assigned_to, 'subject', NEW.subject, 'priority', NEW.priority, 'status', NEW.status), COALESCE(@app_user_id, 0));
END$$

DELIMITER ;
