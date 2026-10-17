-- Step 3 stored programs: functions, procedures, triggers
DELIMITER $$

CREATE FUNCTION fn_org_active_instances(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c FROM instances WHERE org_id = p_org AND status <> 'terminated';
  RETURN c;
END$$

CREATE FUNCTION fn_org_quota_left(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE v_max INT DEFAULT 0;
  SELECT t.max_instances INTO v_max
  FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN v_max - fn_org_active_instances(p_org);
END$$

-- ---------------- triggers on instances ----------------
-- Business rules checked for EVERY insert, whoever inserts (procedure, script, admin typing SQL)
CREATE TRIGGER trg_instances_bi_rules BEFORE INSERT ON instances FOR EACH ROW
BEGIN
  DECLARE v_org_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_host_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_active TINYINT DEFAULT NULL;
  DECLARE v_cpu INT; DECLARE v_ram INT; DECLARE v_disk INT; DECLARE v_min_disk INT DEFAULT NULL;
  DECLARE v_free_cpu INT; DECLARE v_free_ram INT; DECLARE v_free_disk INT;

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

  SELECT status, total_vcpu - used_vcpu, total_ram_gb - used_ram_gb, total_disk_gb - used_disk_gb
    INTO v_host_status, v_free_cpu, v_free_ram, v_free_disk
  FROM hosts WHERE host_id = NEW.host_id;
  IF v_host_status IS NULL OR v_host_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host is not accepting new instances';
  END IF;
  IF v_free_cpu < v_cpu OR v_free_ram < v_ram OR v_free_disk < v_disk THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host does not have enough free capacity';
  END IF;
END$$

-- Reserve capacity on the host and write the audit entry
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

-- Status machine and immutability rules
CREATE TRIGGER trg_instances_bu_rules BEFORE UPDATE ON instances FOR EACH ROW
BEGIN
  IF OLD.status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terminated instances are read-only';
  END IF;
  IF NEW.org_id <> OLD.org_id OR NEW.host_id <> OLD.host_id OR NEW.type_id <> OLD.type_id OR NEW.image_id <> OLD.image_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Owner, host, type and image of an instance cannot be changed';
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

-- Side effects of a status change: free host capacity + IP on terminate, audit every change
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
    END IF;
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('instances', NEW.instance_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status), COALESCE(@app_user_id, 0));
  END IF;
END$$

-- Instances are history for billing: never deleted, only terminated
CREATE TRIGGER trg_instances_bd_block BEFORE DELETE ON instances FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instances cannot be deleted; terminate them instead';
END$$

-- ---------------- procedures ----------------
CREATE PROCEDURE sp_allocate_ip(IN p_instance INT, IN p_region INT)
BEGIN
  UPDATE ip_addresses
     SET instance_id = p_instance, allocated_at = CURRENT_TIMESTAMP
   WHERE region_id = p_region AND instance_id IS NULL
   ORDER BY ip_id LIMIT 1;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No free IP address left in this region';
  END IF;
END$$

-- The scheduler: choose a host, create the instance, give it an IP. All or nothing.
CREATE PROCEDURE sp_launch_instance(IN p_org INT, IN p_type INT, IN p_image INT, IN p_region INT,
                                    IN p_name VARCHAR(40), IN p_config TEXT)
BEGIN
  DECLARE v_region INT DEFAULT NULL;
  DECLARE v_img INT DEFAULT NULL;
  DECLARE v_cpu INT DEFAULT NULL; DECLARE v_ram INT; DECLARE v_disk INT;
  DECLARE v_host INT DEFAULT NULL;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT region_id INTO v_region FROM regions WHERE region_id = p_region AND status = 'active';
  IF v_region IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Region is not available';
  END IF;
  SELECT vcpu, ram_gb, disk_gb INTO v_cpu, v_ram, v_disk FROM instance_types WHERE type_id = p_type AND active = TRUE;
  IF v_cpu IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type is not available';
  END IF;
  SELECT image_id INTO v_img FROM images WHERE image_id = p_image;
  IF v_img IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Image not found';
  END IF;
  IF p_config IS NOT NULL AND NOT JSON_VALID(p_config) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Config must be valid JSON';
  END IF;

  START TRANSACTION;

  -- Best fit: the fullest host that still has room (keeps big hosts free for big instances).
  -- FOR UPDATE SKIP LOCKED: if another launch is holding a host row right now, skip it instead of waiting.
  SELECT host_id INTO v_host
  FROM hosts
  WHERE region_id = p_region AND status = 'active'
    AND total_vcpu - used_vcpu >= v_cpu
    AND total_ram_gb - used_ram_gb >= v_ram
    AND total_disk_gb - used_disk_gb >= v_disk
  ORDER BY total_vcpu - used_vcpu, host_id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No capacity available in this region right now';
  END IF;

  -- triggers now check quota, image disk size, host state, and reserve the capacity
  INSERT INTO instances(org_id, host_id, type_id, image_id, name, status, config)
  VALUES (p_org, v_host, p_type, p_image, p_name, 'running', COALESCE(CAST(p_config AS JSON), JSON_OBJECT()));
  SET v_id = LAST_INSERT_ID();

  CALL sp_allocate_ip(v_id, p_region);
  COMMIT;

  SELECT v_id AS instance_id, v_host AS host_id;
END$$

-- Start / stop / suspend / reactivate / terminate. p_org NULL = staff (any org); otherwise must own it.
CREATE PROCEDURE sp_set_instance_status(IN p_instance INT, IN p_org INT, IN p_status VARCHAR(20))
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_status NOT IN ('running','stopped','suspended','terminated') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown status';
  END IF;

  START TRANSACTION;
  SELECT org_id INTO v_org FROM instances WHERE instance_id = p_instance FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;
  UPDATE instances SET status = p_status WHERE instance_id = p_instance;   -- triggers do the rest
  COMMIT;
END$$

CREATE PROCEDURE sp_terminate_instance(IN p_instance INT, IN p_org INT)
BEGIN
  CALL sp_set_instance_status(p_instance, p_org, 'terminated');
END$$

DELIMITER ;
