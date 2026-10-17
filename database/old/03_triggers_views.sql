-- NimbusHost | 03_triggers_views.sql
-- Views and Triggers

CREATE OR REPLACE VIEW v_running_instances AS
SELECT i.instance_id, i.org_id, o.name AS org_name, i.name, i.status,
       t.name AS type_name, t.vcpu, t.ram_gb, t.disk_gb,
       r.code AS region_code, r.name AS region_name, h.hostname,
       ip.ip_address, i.created_at
FROM instances i
JOIN organizations o ON o.org_id = i.org_id
JOIN instance_types t ON t.type_id = i.type_id
JOIN hosts h ON h.host_id = i.host_id
JOIN regions r ON r.region_id = h.region_id
LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id
WHERE i.status = 'running';

CREATE OR REPLACE VIEW v_overdue_invoices AS
SELECT i.invoice_id, i.org_id, o.name AS org_name, i.period_start, i.period_end,
       i.total, fn_invoice_balance(i.invoice_id) AS balance,
       i.due_date, DATEDIFF(CURRENT_DATE, i.due_date) AS days_overdue,
       CASE WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 30 THEN '0-30'
            WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 60 THEN '31-60'
            WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 90 THEN '61-90'
            ELSE '90+' END AS aging_bucket
FROM invoices i
JOIN organizations o ON o.org_id = i.org_id
WHERE i.status = 'overdue' OR (i.status = 'issued' AND i.due_date < CURRENT_DATE);

CREATE OR REPLACE VIEW v_ticket_sla AS
SELECT t.ticket_id, t.org_id, o.name AS org_name, t.subject, t.priority, t.status,
       t.created_at, TIMESTAMPDIFF(HOUR, t.created_at, CURRENT_TIMESTAMP) AS hours_open,
       CASE t.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 12
            WHEN 'medium' THEN 24
            WHEN 'low' THEN 48 END AS target_sla_hours,
       CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, CURRENT_TIMESTAMP) >
                 (CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 12 WHEN 'medium' THEN 24 WHEN 'low' THEN 48 END)
            THEN 1 ELSE 0 END AS sla_breached
FROM tickets t
JOIN organizations o ON o.org_id = t.org_id;

DELIMITER $$

-- ---------------- Triggers on instances ----------------
DROP TRIGGER IF EXISTS trg_instances_bi_rules$$
CREATE TRIGGER trg_instances_bi_rules BEFORE INSERT ON instances FOR EACH ROW
BEGIN
  DECLARE v_org_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_host_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_active TINYINT DEFAULT NULL;
  DECLARE v_cpu INT; DECLARE v_ram INT; DECLARE v_disk INT; DECLARE v_min_disk INT DEFAULT NULL;

  SELECT status INTO v_org_status FROM organizations WHERE org_id = NEW.org_id;
  IF v_org_status IS NULL OR v_org_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not active';
  END IF;

  IF fn_org_quota_left(NEW.org_id) <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance quota of your plan is used up';
  END IF;

  SELECT vcpu, ram_gb, disk_gb, active INTO v_cpu, v_ram, v_disk, v_active
  FROM instance_types WHERE type_id = NEW.type_id;
  IF v_active IS NULL OR v_active = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type is not available';
  END IF;

  SELECT min_disk_gb INTO v_min_disk FROM images WHERE image_id = NEW.image_id;
  IF v_min_disk IS NOT NULL AND v_disk < v_min_disk THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This instance type has less disk than the image requires';
  END IF;

  SELECT status INTO v_host_status FROM hosts WHERE host_id = NEW.host_id;
  IF v_host_status IS NULL OR v_host_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host is not active';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_instances_ai_capacity$$
CREATE TRIGGER trg_instances_ai_capacity AFTER INSERT ON instances FOR EACH ROW
BEGIN
  DECLARE v_cpu INT; DECLARE v_ram INT; DECLARE v_disk INT;
  SELECT vcpu, ram_gb, disk_gb INTO v_cpu, v_ram, v_disk FROM instance_types WHERE type_id = NEW.type_id;
  UPDATE hosts
     SET used_vcpu = used_vcpu + v_cpu, used_ram_gb = used_ram_gb + v_ram, used_disk_gb = used_disk_gb + v_disk
   WHERE host_id = NEW.host_id;
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('instances', NEW.instance_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'type_id', NEW.type_id, 'host_id', NEW.host_id, 'status', NEW.status),
          COALESCE(@app_user_id, 0));
END$$

DROP TRIGGER IF EXISTS trg_instances_bu_rules$$
CREATE TRIGGER trg_instances_bu_rules BEFORE UPDATE ON instances FOR EACH ROW
BEGIN
  IF OLD.status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terminated instances are read-only';
  END IF;
  IF NEW.org_id <> OLD.org_id OR NEW.image_id <> OLD.image_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Owner and image of an instance cannot be changed';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF NOT ( (OLD.status = 'running'   AND NEW.status IN ('stopped','suspended','terminated'))
          OR (OLD.status = 'stopped'   AND NEW.status IN ('running','suspended','terminated'))
          OR (OLD.status = 'suspended' AND NEW.status IN ('running','stopped','terminated')) ) THEN
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
  DECLARE v_cpu INT; DECLARE v_ram INT; DECLARE v_disk INT;
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'terminated' THEN
      SELECT vcpu, ram_gb, disk_gb INTO v_cpu, v_ram, v_disk FROM instance_types WHERE type_id = NEW.type_id;
      UPDATE hosts
         SET used_vcpu = used_vcpu - v_cpu, used_ram_gb = used_ram_gb - v_ram, used_disk_gb = used_disk_gb - v_disk
       WHERE host_id = NEW.host_id;
      UPDATE ip_addresses SET instance_id = NULL, allocated_at = NULL WHERE instance_id = NEW.instance_id;
      UPDATE volumes SET instance_id = NULL, status = 'available' WHERE instance_id = NEW.instance_id;
    END IF;
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('instances', NEW.instance_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status), COALESCE(@app_user_id, 0));
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_instances_bd_block$$
CREATE TRIGGER trg_instances_bd_block BEFORE DELETE ON instances FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instances cannot be deleted; terminate them instead';
END$$

-- ---------------- Triggers on pricing ----------------
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

-- ---------------- Financial and Audit Immutability Triggers ----------------
DROP TRIGGER IF EXISTS trg_invoices_bu_immutable$$
CREATE TRIGGER trg_invoices_bu_immutable BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
  IF OLD.status IN ('paid', 'void') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paid and void invoices are immutable';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoices_bd_block$$
CREATE TRIGGER trg_invoices_bd_block BEFORE DELETE ON invoices FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoices cannot be deleted';
END$$

DROP TRIGGER IF EXISTS trg_payments_bd_block$$
CREATE TRIGGER trg_payments_bd_block BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments cannot be deleted';
END$$

DROP TRIGGER IF EXISTS trg_audit_bd_block$$
CREATE TRIGGER trg_audit_bd_block BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log records are immutable and cannot be deleted';
END$$

DELIMITER ;
