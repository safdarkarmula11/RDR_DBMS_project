-- Step 2 stored programs: functions, procedures, triggers
DELIMITER $$

-- Price in force for an instance type on a given date (NULL when no price covers that date)
CREATE FUNCTION fn_hourly_price(p_type INT, p_at DATE)
RETURNS DECIMAL(8,4) READS SQL DATA
BEGIN
  DECLARE v DECIMAL(8,4) DEFAULT NULL;
  SELECT price_per_hour INTO v
  FROM pricing
  WHERE type_id = p_type AND valid_from <= p_at AND (valid_to IS NULL OR valid_to >= p_at)
  ORDER BY valid_from DESC LIMIT 1;
  RETURN v;
END$$

-- Average of CPU, RAM and disk utilization of one host, in percent
CREATE FUNCTION fn_host_utilization(p_host INT)
RETURNS DECIMAL(5,2) READS SQL DATA
BEGIN
  DECLARE v DECIMAL(5,2) DEFAULT NULL;
  SELECT ROUND(100 * (used_vcpu / total_vcpu + used_ram_gb / total_ram_gb + used_disk_gb / total_disk_gb) / 3, 2)
    INTO v FROM hosts WHERE host_id = p_host;
  RETURN v;
END$$

-- Shared check used by the pricing triggers
CREATE PROCEDURE sp_assert_no_price_overlap(IN p_type INT, IN p_from DATE, IN p_to DATE, IN p_self INT)
BEGIN
  IF EXISTS (SELECT 1 FROM pricing
             WHERE type_id = p_type AND price_id <> p_self
               AND valid_from <= COALESCE(p_to, '9999-12-31')
               AND COALESCE(valid_to, '9999-12-31') >= p_from) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Price period overlaps an existing price for this instance type';
  END IF;
END$$

-- Change the price of a type from a given date: closes the current period and opens a new one, atomically
CREATE PROCEDURE sp_set_price(IN p_type INT, IN p_price DECIMAL(8,4), IN p_effective DATE)
BEGIN
  DECLARE v_id INT DEFAULT NULL;
  DECLARE v_from DATE DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF NOT EXISTS (SELECT 1 FROM instance_types WHERE type_id = p_type) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type not found';
  END IF;

  START TRANSACTION;
  SELECT price_id, valid_from INTO v_id, v_from
  FROM pricing WHERE type_id = p_type AND valid_to IS NULL FOR UPDATE;

  IF v_id IS NOT NULL THEN
    IF p_effective <= v_from THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New price must start after the current price started';
    END IF;
    UPDATE pricing SET valid_to = DATE_SUB(p_effective, INTERVAL 1 DAY) WHERE price_id = v_id;
  END IF;

  INSERT INTO pricing(type_id, price_per_hour, valid_from, valid_to)
  VALUES (p_type, p_price, p_effective, NULL);
  COMMIT;
END$$

-- ---------- pricing triggers ----------
CREATE TRIGGER trg_pricing_bi_overlap BEFORE INSERT ON pricing FOR EACH ROW
BEGIN
  CALL sp_assert_no_price_overlap(NEW.type_id, NEW.valid_from, NEW.valid_to, NEW.price_id);
END$$

CREATE TRIGGER trg_pricing_bu_overlap BEFORE UPDATE ON pricing FOR EACH ROW
BEGIN
  CALL sp_assert_no_price_overlap(NEW.type_id, NEW.valid_from, NEW.valid_to, NEW.price_id);
END$$

-- Price history is part of the billing record and is never deleted
CREATE TRIGGER trg_pricing_bd_block BEFORE DELETE ON pricing FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Price history cannot be deleted; end the period instead';
END$$

CREATE TRIGGER trg_pricing_ai_audit AFTER INSERT ON pricing FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('pricing', NEW.price_id, 'INSERT',
          JSON_OBJECT('type_id', NEW.type_id, 'price_per_hour', NEW.price_per_hour,
                      'valid_from', NEW.valid_from, 'valid_to', NEW.valid_to),
          COALESCE(@app_user_id, 0));
END$$

CREATE TRIGGER trg_pricing_au_audit AFTER UPDATE ON pricing FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('pricing', NEW.price_id, 'UPDATE',
          JSON_OBJECT('price_per_hour', OLD.price_per_hour, 'valid_from', OLD.valid_from, 'valid_to', OLD.valid_to),
          JSON_OBJECT('price_per_hour', NEW.price_per_hour, 'valid_from', NEW.valid_from, 'valid_to', NEW.valid_to),
          COALESCE(@app_user_id, 0));
END$$

-- ---------- host triggers ----------
-- Status machine: retired is final, and a host with workloads cannot be retired
CREATE TRIGGER trg_hosts_bu_rules BEFORE UPDATE ON hosts FOR EACH ROW
BEGIN
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A retired host cannot be reactivated';
  END IF;
  IF NEW.status = 'retired' AND OLD.status <> 'retired'
     AND (OLD.used_vcpu > 0 OR OLD.used_ram_gb > 0 OR OLD.used_disk_gb > 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot retire a host that still runs workloads';
  END IF;
END$$

CREATE TRIGGER trg_hosts_ai_audit AFTER INSERT ON hosts FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('hosts', NEW.host_id, 'INSERT',
          JSON_OBJECT('hostname', NEW.hostname, 'region_id', NEW.region_id, 'status', NEW.status,
                      'total_vcpu', NEW.total_vcpu, 'total_ram_gb', NEW.total_ram_gb, 'total_disk_gb', NEW.total_disk_gb),
          COALESCE(@app_user_id, 0));
END$$

-- Only status and capacity changes are audited (the used_* counters change too often)
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

DELIMITER ;
