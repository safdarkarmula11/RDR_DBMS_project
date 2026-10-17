-- Step 4 stored programs
DELIMITER $$

-- ---------------- functions ----------------
CREATE FUNCTION fn_org_storage_used(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE s INT DEFAULT 0;
  SELECT COALESCE(SUM(size_gb), 0) INTO s FROM volumes WHERE org_id = p_org AND status <> 'deleted';
  RETURN s;
END$$

CREATE FUNCTION fn_org_storage_left(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE m INT DEFAULT 0;
  SELECT t.max_storage_gb INTO m
  FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN m - fn_org_storage_used(p_org);
END$$

CREATE FUNCTION fn_instance_volume_count(p_instance INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c FROM volumes WHERE instance_id = p_instance AND status = 'attached';
  RETURN c;
END$$

-- ---------------- volume triggers ----------------
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
  IF NEW.size_gb > OLD.size_gb AND NEW.size_gb - OLD.size_gb > fn_org_storage_left(NEW.org_id) THEN
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

  -- attaching: the instance must be ours, alive, in the same region, and not overloaded with volumes
  IF NEW.instance_id IS NOT NULL AND OLD.instance_id IS NULL THEN
    SELECT i.org_id, i.status, h.region_id INTO v_inst_org, v_inst_status, v_inst_region
    FROM instances i JOIN hosts h ON h.host_id = i.host_id
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

CREATE TRIGGER trg_volumes_ai_audit AFTER INSERT ON volumes FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('volumes', NEW.volume_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'size_gb', NEW.size_gb, 'vol_type', NEW.vol_type),
          COALESCE(@app_user_id, 0));
END$$

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

CREATE TRIGGER trg_volumes_bd_block BEFORE DELETE ON volumes FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volumes cannot be deleted; delete them through the delete procedure (soft delete)';
END$$

-- ---------------- snapshot triggers ----------------
CREATE TRIGGER trg_snapshots_bi_rules BEFORE INSERT ON snapshots FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_size INT DEFAULT NULL;
  SELECT status, size_gb INTO v_status, v_size FROM volumes WHERE volume_id = NEW.volume_id;
  IF v_status IS NULL OR v_status = 'deleted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  IF (SELECT COUNT(*) FROM snapshots WHERE volume_id = NEW.volume_id) >= 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A volume can have at most 5 snapshots';
  END IF;
  SET NEW.size_gb = v_size;
END$$

CREATE TRIGGER trg_snapshots_ai_audit AFTER INSERT ON snapshots FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('snapshots', NEW.snapshot_id, 'INSERT',
          JSON_OBJECT('volume_id', NEW.volume_id, 'name', NEW.name, 'size_gb', NEW.size_gb), COALESCE(@app_user_id, 0));
END$$

CREATE TRIGGER trg_snapshots_ad_audit AFTER DELETE ON snapshots FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('snapshots', OLD.snapshot_id, 'DELETE',
          JSON_OBJECT('volume_id', OLD.volume_id, 'name', OLD.name, 'size_gb', OLD.size_gb), COALESCE(@app_user_id, 0));
END$$

-- ---------------- domain triggers ----------------
CREATE TRIGGER trg_domains_bi_rules BEFORE INSERT ON domains FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  SET NEW.name = LOWER(TRIM(NEW.name));
  SELECT status INTO v_status FROM organizations WHERE org_id = NEW.org_id;
  IF v_status IS NULL OR v_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not active';
  END IF;
END$$

CREATE TRIGGER trg_domains_bu_rules BEFORE UPDATE ON domains FOR EACH ROW
BEGIN
  IF NEW.name <> OLD.name OR NEW.org_id <> OLD.org_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain name and owner cannot be changed';
  END IF;
  IF NEW.expires_on < OLD.expires_on THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The expiry date cannot move backwards';
  END IF;
END$$

CREATE TRIGGER trg_domains_bd_block BEFORE DELETE ON domains FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domains cannot be deleted';
END$$

CREATE TRIGGER trg_domains_ai_audit AFTER INSERT ON domains FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('domains', NEW.domain_id, 'INSERT',
          JSON_OBJECT('org_id', NEW.org_id, 'name', NEW.name, 'expires_on', NEW.expires_on), COALESCE(@app_user_id, 0));
END$$

CREATE TRIGGER trg_domains_au_audit AFTER UPDATE ON domains FOR EACH ROW
BEGIN
  IF OLD.expires_on <> NEW.expires_on OR OLD.auto_renew <> NEW.auto_renew THEN
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('domains', NEW.domain_id, 'UPDATE',
            JSON_OBJECT('expires_on', OLD.expires_on, 'auto_renew', OLD.auto_renew),
            JSON_OBJECT('expires_on', NEW.expires_on, 'auto_renew', NEW.auto_renew), COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ---------------- DNS validation (shared by the insert and update triggers) ----------------
CREATE PROCEDURE sp_validate_dns_record(IN p_domain INT, IN p_type VARCHAR(10), IN p_name VARCHAR(63),
                                        IN p_value VARCHAR(255), IN p_priority SMALLINT, IN p_self INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_exp DATE DEFAULT NULL;
  DECLARE v_ip_org INT DEFAULT NULL;

  SELECT org_id, expires_on INTO v_org, v_exp FROM domains WHERE domain_id = p_domain;
  IF v_org IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain not found';
  END IF;
  IF v_exp < CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain has expired: renew it first';
  END IF;
  IF p_name NOT REGEXP '^(@|[a-z0-9_*]([a-z0-9_.*-]{0,60}[a-z0-9_*])?)$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid record name (use @ for the domain itself)';
  END IF;

  IF p_type = 'A' THEN
    IF NOT IS_IPV4(p_value) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An A record needs an IPv4 address';
    END IF;
    SELECT i.org_id INTO v_ip_org
    FROM ip_addresses ip JOIN instances i ON i.instance_id = ip.instance_id
    WHERE ip.ip_address = p_value;
    IF v_ip_org IS NOT NULL AND v_ip_org <> v_org THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This IP address belongs to another organization';
    END IF;
  ELSEIF p_type = 'AAAA' THEN
    IF NOT IS_IPV6(p_value) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An AAAA record needs an IPv6 address';
    END IF;
  ELSEIF p_type = 'CNAME' THEN
    IF p_name = '@' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A CNAME cannot be set on the root of the domain';
    END IF;
    IF p_value NOT REGEXP '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A CNAME needs a full host name as its value';
    END IF;
    IF EXISTS (SELECT 1 FROM dns_records WHERE domain_id = p_domain AND name = p_name AND record_id <> p_self) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A CNAME cannot share its name with other records';
    END IF;
  ELSEIF p_type = 'MX' THEN
    IF p_priority IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An MX record needs a priority';
    END IF;
  END IF;

  IF p_type <> 'CNAME' AND EXISTS (SELECT 1 FROM dns_records
                                   WHERE domain_id = p_domain AND name = p_name AND rtype = 'CNAME' AND record_id <> p_self) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This name already has a CNAME record';
  END IF;
END$$

CREATE TRIGGER trg_dns_bi_rules BEFORE INSERT ON dns_records FOR EACH ROW
BEGIN
  IF NEW.rtype <> 'MX' THEN
    SET NEW.priority = NULL;
  END IF;
  CALL sp_validate_dns_record(NEW.domain_id, NEW.rtype, NEW.name, NEW.value, NEW.priority, NEW.record_id);
END$$

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

CREATE TRIGGER trg_dns_ai_audit AFTER INSERT ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
  VALUES ('dns_records', NEW.record_id, 'INSERT',
          JSON_OBJECT('domain_id', NEW.domain_id, 'rtype', NEW.rtype, 'name', NEW.name, 'value', NEW.value), COALESCE(@app_user_id, 0));
END$$

CREATE TRIGGER trg_dns_au_audit AFTER UPDATE ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('dns_records', NEW.record_id, 'UPDATE',
          JSON_OBJECT('rtype', OLD.rtype, 'name', OLD.name, 'value', OLD.value, 'ttl', OLD.ttl),
          JSON_OBJECT('rtype', NEW.rtype, 'name', NEW.name, 'value', NEW.value, 'ttl', NEW.ttl), COALESCE(@app_user_id, 0));
END$$

CREATE TRIGGER trg_dns_ad_audit AFTER DELETE ON dns_records FOR EACH ROW
BEGIN
  INSERT INTO audit_log(table_name, record_id, action, old_data, changed_by)
  VALUES ('dns_records', OLD.record_id, 'DELETE',
          JSON_OBJECT('domain_id', OLD.domain_id, 'rtype', OLD.rtype, 'name', OLD.name, 'value', OLD.value), COALESCE(@app_user_id, 0));
END$$

-- ---------------- replace the Step 3 instance trigger: terminating an instance now also detaches its volumes ----------------
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
      UPDATE volumes SET status = 'available', instance_id = NULL WHERE instance_id = NEW.instance_id;
    END IF;
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('instances', NEW.instance_id, 'UPDATE',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status), COALESCE(@app_user_id, 0));
  END IF;
END$$

-- ---------------- volume procedures ----------------
-- The organization row is locked first, so two simultaneous requests cannot both squeeze under the quota.
CREATE PROCEDURE sp_create_volume(IN p_org INT, IN p_region INT, IN p_name VARCHAR(40), IN p_size INT, IN p_type VARCHAR(3))
BEGIN
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  IF p_type NOT IN ('ssd','hdd') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume type must be ssd or hdd';
  END IF;
  START TRANSACTION;
  SELECT org_id INTO v_lock FROM organizations WHERE org_id = p_org FOR UPDATE;
  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type) VALUES (p_org, p_region, p_name, p_size, p_type);
  SET v_id = LAST_INSERT_ID();
  COMMIT;
  SELECT v_id AS volume_id;
END$$

CREATE PROCEDURE sp_attach_volume(IN p_volume INT, IN p_instance INT, IN p_org INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_inst_org INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT org_id INTO v_org FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  SELECT org_id INTO v_inst_org FROM instances WHERE instance_id = p_instance FOR UPDATE;
  IF v_inst_org IS NULL OR v_inst_org <> v_org THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;
  UPDATE volumes SET instance_id = p_instance, status = 'attached' WHERE volume_id = p_volume;
  COMMIT;
END$$

CREATE PROCEDURE sp_detach_volume(IN p_volume INT, IN p_org INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT org_id, status INTO v_org, v_status FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  IF v_status <> 'attached' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume is not attached';
  END IF;
  UPDATE volumes SET instance_id = NULL, status = 'available' WHERE volume_id = p_volume;
  COMMIT;
END$$

CREATE PROCEDURE sp_resize_volume(IN p_volume INT, IN p_org INT, IN p_new_size INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT org_id INTO v_org FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  SELECT org_id INTO v_lock FROM organizations WHERE org_id = v_org FOR UPDATE;
  UPDATE volumes SET size_gb = p_new_size WHERE volume_id = p_volume;
  COMMIT;
END$$

CREATE PROCEDURE sp_delete_volume(IN p_volume INT, IN p_org INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT org_id INTO v_org FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  UPDATE volumes SET status = 'deleted' WHERE volume_id = p_volume;
  COMMIT;
END$$

CREATE PROCEDURE sp_take_snapshot(IN p_volume INT, IN p_org INT, IN p_name VARCHAR(40))
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT org_id INTO v_org FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;
  INSERT INTO snapshots(volume_id, name, size_gb) SELECT volume_id, p_name, size_gb FROM volumes WHERE volume_id = p_volume;
  SET v_id = LAST_INSERT_ID();
  COMMIT;
  SELECT v_id AS snapshot_id;
END$$

-- Restore = create a brand new volume from a snapshot (quota is checked by the volume trigger)
CREATE PROCEDURE sp_restore_snapshot(IN p_snapshot INT, IN p_org INT, IN p_name VARCHAR(40))
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  SELECT v.org_id INTO v_org FROM snapshots s JOIN volumes v ON v.volume_id = s.volume_id WHERE s.snapshot_id = p_snapshot;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;
  START TRANSACTION;
  SELECT org_id INTO v_lock FROM organizations WHERE org_id = v_org FOR UPDATE;
  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type)
  SELECT v.org_id, v.region_id, p_name, s.size_gb, v.vol_type
  FROM snapshots s JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot;
  SET v_id = LAST_INSERT_ID();
  COMMIT;
  SELECT v_id AS volume_id;
END$$

CREATE PROCEDURE sp_delete_snapshot(IN p_snapshot INT, IN p_org INT)
BEGIN
  DELETE s FROM snapshots s JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot AND (p_org IS NULL OR v.org_id = p_org);
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;
END$$

-- ---------------- domain procedures ----------------
CREATE PROCEDURE sp_register_domain(IN p_org INT, IN p_name VARCHAR(100), IN p_years INT)
BEGIN
  IF p_years IS NULL OR p_years < 1 OR p_years > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registration period must be 1 to 10 years';
  END IF;
  INSERT INTO domains(org_id, name, registered_on, expires_on)
  VALUES (p_org, p_name, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL p_years YEAR));
  SELECT LAST_INSERT_ID() AS domain_id;
END$$

CREATE PROCEDURE sp_renew_domain(IN p_domain INT, IN p_org INT, IN p_years INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  IF p_years IS NULL OR p_years < 1 OR p_years > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Renewal period must be 1 to 10 years';
  END IF;
  START TRANSACTION;
  SELECT org_id INTO v_org FROM domains WHERE domain_id = p_domain FOR UPDATE;
  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain not found';
  END IF;
  UPDATE domains SET expires_on = DATE_ADD(GREATEST(expires_on, CURRENT_DATE), INTERVAL p_years YEAR)
  WHERE domain_id = p_domain;
  COMMIT;
END$$

DELIMITER ;