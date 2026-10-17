-- NimbusHost | 02_programs.sql
-- Functions, Triggers, Views, and Stored Procedures

DELIMITER $$

-- ============================================================
-- FUNCTIONS
-- ============================================================

DROP FUNCTION IF EXISTS fn_hourly_price$$
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

DROP FUNCTION IF EXISTS fn_host_utilization$$
CREATE FUNCTION fn_host_utilization(p_host INT)
RETURNS DECIMAL(5,2) READS SQL DATA
BEGIN
  DECLARE v DECIMAL(5,2) DEFAULT NULL;
  SELECT ROUND(100 * (used_vcpu / total_vcpu + used_ram_gb / total_ram_gb + used_disk_gb / total_disk_gb) / 3, 2)
    INTO v FROM hosts WHERE host_id = p_host;
  RETURN v;
END$$

DROP FUNCTION IF EXISTS fn_org_active_instances$$
CREATE FUNCTION fn_org_active_instances(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c FROM instances WHERE org_id = p_org AND status <> 'terminated';
  RETURN c;
END$$

DROP FUNCTION IF EXISTS fn_org_running_instances$$
CREATE FUNCTION fn_org_running_instances(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c FROM instances WHERE org_id = p_org AND status IN ('running', 'stopped');
  RETURN c;
END$$

DROP FUNCTION IF EXISTS fn_org_quota_left$$
CREATE FUNCTION fn_org_quota_left(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE v_max INT DEFAULT 0;
  SELECT t.max_instances INTO v_max
  FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN v_max - fn_org_active_instances(p_org);
END$$

DROP FUNCTION IF EXISTS fn_org_storage_used$$
CREATE FUNCTION fn_org_storage_used(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COALESCE(SUM(size_gb), 0) INTO c
  FROM volumes WHERE org_id = p_org AND status <> 'deleted';
  RETURN c;
END$$

DROP FUNCTION IF EXISTS fn_org_storage_left$$
CREATE FUNCTION fn_org_storage_left(p_org INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE v_max INT DEFAULT 0;
  SELECT t.max_storage_gb INTO v_max
  FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;
  RETURN v_max - fn_org_storage_used(p_org);
END$$

DROP FUNCTION IF EXISTS fn_instance_volume_count$$
CREATE FUNCTION fn_instance_volume_count(p_instance INT)
RETURNS INT READS SQL DATA
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c FROM volumes WHERE instance_id = p_instance AND status = 'attached';
  RETURN c;
END$$

DROP FUNCTION IF EXISTS fn_invoice_balance$$
CREATE FUNCTION fn_invoice_balance(p_invoice INT)
RETURNS DECIMAL(12,2) READS SQL DATA
BEGIN
  DECLARE v_total DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_paid DECIMAL(12,2) DEFAULT 0.00;
  SELECT total INTO v_total FROM invoices WHERE invoice_id = p_invoice;
  SELECT COALESCE(SUM(amount), 0.00) INTO v_paid FROM payments WHERE invoice_id = p_invoice;
  RETURN v_total - v_paid;
END$$

-- ============================================================
-- PROCEDURES
-- ============================================================

DROP PROCEDURE IF EXISTS sp_assert_no_price_overlap$$
CREATE PROCEDURE sp_assert_no_price_overlap(IN p_type INT, IN p_from DATE, IN p_to DATE, IN p_self INT)
BEGIN
  IF EXISTS (SELECT 1 FROM pricing
             WHERE type_id = p_type AND price_id <> p_self
               AND valid_from <= COALESCE(p_to, '9999-12-31')
               AND COALESCE(valid_to, '9999-12-31') >= p_from) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Price period overlaps an existing price for this instance type';
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_set_price$$
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

DROP PROCEDURE IF EXISTS sp_allocate_ip$$
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

DROP PROCEDURE IF EXISTS sp_launch_instance$$
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

  SELECT host_id INTO v_host
  FROM hosts
  WHERE region_id = p_region AND status = 'active'
    AND total_vcpu - used_vcpu >= v_cpu
    AND total_ram_gb - used_ram_gb >= v_ram
    AND total_disk_gb - used_disk_gb >= v_disk
  ORDER BY (total_vcpu - used_vcpu) ASC, host_id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No capacity available in this region right now';
  END IF;

  INSERT INTO instances(org_id, host_id, type_id, image_id, name, status, config)
  VALUES (p_org, v_host, p_type, p_image, p_name, 'running', COALESCE(CAST(p_config AS JSON), JSON_OBJECT()));
  SET v_id = LAST_INSERT_ID();

  CALL sp_allocate_ip(v_id, p_region);
  COMMIT;

  SELECT v_id AS instance_id, v_host AS host_id;
END$$

DROP PROCEDURE IF EXISTS sp_set_instance_status$$
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
  UPDATE instances SET status = p_status WHERE instance_id = p_instance;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_terminate_instance$$
CREATE PROCEDURE sp_terminate_instance(IN p_instance INT, IN p_org INT)
BEGIN
  CALL sp_set_instance_status(p_instance, p_org, 'terminated');
END$$

DROP PROCEDURE IF EXISTS sp_resize_instance$$
CREATE PROCEDURE sp_resize_instance(IN p_instance INT, IN p_org INT, IN p_new_type INT)
BEGIN
  DECLARE v_org INT;
  DECLARE v_host INT;
  DECLARE v_old_type INT;
  DECLARE v_region INT;
  DECLARE v_status VARCHAR(20);
  DECLARE v_old_cpu, v_old_ram, v_old_disk INT;
  DECLARE v_new_cpu, v_new_ram, v_new_disk INT;
  DECLARE v_delta_cpu, v_delta_ram, v_delta_disk INT;
  DECLARE v_target_host INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT i.org_id, i.host_id, i.type_id, i.status, h.region_id
    INTO v_org, v_host, v_old_type, v_status, v_region
  FROM instances i
  JOIN hosts h ON h.host_id = i.host_id
  WHERE i.instance_id = p_instance FOR UPDATE;

  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;

  IF v_status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terminated instances cannot be resized';
  END IF;

  IF v_old_type = p_new_type THEN
    COMMIT;
    SELECT p_instance AS instance_id, v_host AS host_id, p_new_type AS type_id;
  ELSE
    SELECT vcpu, ram_gb, disk_gb INTO v_old_cpu, v_old_ram, v_old_disk
    FROM instance_types WHERE type_id = v_old_type;

    SELECT vcpu, ram_gb, disk_gb INTO v_new_cpu, v_new_ram, v_new_disk
    FROM instance_types WHERE type_id = p_new_type AND active = TRUE;

    IF v_new_cpu IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Target instance type is not available';
    END IF;

    SET v_delta_cpu = v_new_cpu - v_old_cpu;
    SET v_delta_ram = v_new_ram - v_old_ram;
    SET v_delta_disk = v_new_disk - v_old_disk;

    -- Check if current host has headroom for delta
    IF EXISTS (
      SELECT 1 FROM hosts
      WHERE host_id = v_host
        AND total_vcpu - used_vcpu >= v_delta_cpu
        AND total_ram_gb - used_ram_gb >= v_delta_ram
        AND total_disk_gb - used_disk_gb >= v_delta_disk
    ) THEN
      UPDATE hosts
         SET used_vcpu = used_vcpu + v_delta_cpu,
             used_ram_gb = used_ram_gb + v_delta_ram,
             used_disk_gb = used_disk_gb + v_delta_disk
       WHERE host_id = v_host;

      UPDATE instances SET type_id = p_new_type WHERE instance_id = p_instance;
      COMMIT;
      SELECT p_instance AS instance_id, v_host AS host_id, p_new_type AS type_id;
    ELSE
      -- Need migration to another host in the same region
      SELECT host_id INTO v_target_host
      FROM hosts
      WHERE region_id = v_region AND status = 'active' AND host_id <> v_host
        AND total_vcpu - used_vcpu >= v_new_cpu
        AND total_ram_gb - used_ram_gb >= v_new_ram
        AND total_disk_gb - used_disk_gb >= v_new_disk
      ORDER BY (total_vcpu - used_vcpu) ASC, host_id ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED;

      IF v_target_host IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No capacity available for resize';
      END IF;

      -- Release capacity on old host
      UPDATE hosts
         SET used_vcpu = used_vcpu - v_old_cpu,
             used_ram_gb = used_ram_gb - v_old_ram,
             used_disk_gb = used_disk_gb - v_old_disk
       WHERE host_id = v_host;

      -- Reserve capacity on new host
      UPDATE hosts
         SET used_vcpu = used_vcpu + v_new_cpu,
             used_ram_gb = used_ram_gb + v_new_ram,
             used_disk_gb = used_disk_gb + v_new_disk
       WHERE host_id = v_target_host;

      UPDATE instances SET host_id = v_target_host, type_id = p_new_type WHERE instance_id = p_instance;
      COMMIT;
      SELECT p_instance AS instance_id, v_target_host AS host_id, p_new_type AS type_id;
    END IF;
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_record_usage$$
CREATE PROCEDURE sp_record_usage(IN p_instance INT, IN p_metric VARCHAR(20), IN p_qty DECIMAL(10,3), IN p_ts DATETIME)
BEGIN
  DECLARE v_org INT;
  DECLARE v_type INT;
  DECLARE v_status VARCHAR(20);

  SELECT org_id, type_id, status INTO v_org, v_type, v_status
  FROM instances WHERE instance_id = p_instance;

  IF v_org IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance does not exist';
  END IF;

  IF v_status <> 'running' AND p_metric = 'cpu_hour' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot record compute usage for non-running instance';
  END IF;

  INSERT INTO usage_records(recorded_at, instance_id, org_id, type_id, metric, quantity)
  VALUES (COALESCE(p_ts, NOW()), p_instance, v_org, v_type, p_metric, p_qty);
END$$

DROP PROCEDURE IF EXISTS sp_generate_invoice$$
CREATE PROCEDURE sp_generate_invoice(IN p_org INT, IN p_start DATE, IN p_end DATE)
BEGIN
  DECLARE v_invoice_id INT;
  DECLARE v_subtotal DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_tax DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_credit_avail DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_credit_applied DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_total DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_status VARCHAR(20) DEFAULT 'issued';
  DECLARE v_discount_pct DECIMAL(4,2) DEFAULT 0.00;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE org_id = p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found';
  END IF;

  START TRANSACTION;

  -- Create initial invoice
  INSERT INTO invoices(org_id, period_start, period_end, subtotal, tax, credit_applied, total, status, due_date)
  VALUES (p_org, p_start, p_end, 0.00, 0.00, 0.00, 0.00, 'draft', DATE_ADD(p_end, INTERVAL 15 DAY));
  SET v_invoice_id = LAST_INSERT_ID();

  -- Insert compute usage items priced temporally
  INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price, amount)
  SELECT v_invoice_id, i.instance_id, CONCAT('Compute - ', i.name),
         SUM(u.quantity), p.price_per_hour,
         ROUND(SUM(u.quantity) * p.price_per_hour, 2)
  FROM usage_records u
  JOIN instances i ON i.instance_id = u.instance_id
  JOIN pricing p ON p.type_id = u.type_id
       AND DATE(u.recorded_at) >= p.valid_from
       AND (p.valid_to IS NULL OR DATE(u.recorded_at) <= p.valid_to)
  WHERE u.org_id = p_org AND u.metric = 'cpu_hour'
    AND u.recorded_at >= p_start AND u.recorded_at < DATE_ADD(p_end, INTERVAL 1 DAY)
  GROUP BY i.instance_id, i.name, p.price_id, p.price_per_hour;

  -- Insert storage/egress usage items if any
  INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price, amount)
  SELECT v_invoice_id, u.instance_id,
         CONCAT(UCASE(SUBSTRING(u.metric, 1, 1)), LCASE(SUBSTRING(u.metric, 2))),
         SUM(u.quantity), 0.0500,
         ROUND(SUM(u.quantity) * 0.0500, 2)
  FROM usage_records u
  WHERE u.org_id = p_org AND u.metric IN ('storage_gb', 'egress_gb')
    AND u.recorded_at >= p_start AND u.recorded_at < DATE_ADD(p_end, INTERVAL 1 DAY)
  GROUP BY u.instance_id, u.metric;

  SELECT COALESCE(SUM(amount), 0.00) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = v_invoice_id;

  -- Apply tier discount
  SELECT t.discount_pct INTO v_discount_pct
  FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id
  WHERE o.org_id = p_org;

  IF v_discount_pct > 0 THEN
    SET v_subtotal = ROUND(v_subtotal * (1 - (v_discount_pct / 100)), 2);
  END IF;

  SET v_tax = ROUND(v_subtotal * 0.18, 2);

  -- Credit balance application
  SELECT credit_balance INTO v_credit_avail
  FROM organizations WHERE org_id = p_org FOR UPDATE;

  SET v_credit_applied = LEAST(v_credit_avail, v_subtotal + v_tax);
  IF v_credit_applied > 0 THEN
    UPDATE organizations SET credit_balance = credit_balance - v_credit_applied WHERE org_id = p_org;
  END IF;

  SET v_total = v_subtotal + v_tax - v_credit_applied;
  IF v_total <= 0 THEN
    SET v_total = 0.00;
    SET v_status = 'paid';
  ELSE
    SET v_status = 'issued';
  END IF;

  UPDATE invoices
     SET subtotal = v_subtotal,
         tax = v_tax,
         credit_applied = v_credit_applied,
         total = v_total,
         status = v_status,
         issued_at = CURRENT_TIMESTAMP
   WHERE invoice_id = v_invoice_id;

  COMMIT;

  SELECT v_invoice_id AS invoice_id, v_total AS total, v_status AS status;
END$$

DROP PROCEDURE IF EXISTS sp_apply_payment$$
CREATE PROCEDURE sp_apply_payment(IN p_invoice INT, IN p_amount DECIMAL(12,2),
                                  IN p_method VARCHAR(20), IN p_ref VARCHAR(100),
                                  IN p_idempotency VARCHAR(64))
BEGIN
  DECLARE v_total DECIMAL(12,2);
  DECLARE v_org INT;
  DECLARE v_paid DECIMAL(12,2);
  DECLARE v_payment_id INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT total, org_id INTO v_total, v_org
  FROM invoices WHERE invoice_id = p_invoice FOR UPDATE;

  IF v_total IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice not found';
  END IF;

  -- Support idempotency
  IF p_idempotency IS NOT NULL THEN
    SELECT payment_id INTO v_payment_id FROM payments WHERE idempotency_key = p_idempotency;
    IF v_payment_id IS NOT NULL THEN
      COMMIT;
      SELECT v_payment_id AS payment_id, 'already_processed' AS result;
    END IF;
  END IF;

  INSERT INTO payments(invoice_id, amount, method, txn_ref, idempotency_key)
  VALUES (p_invoice, p_amount, p_method, p_ref, p_idempotency);
  SET v_payment_id = LAST_INSERT_ID();

  SELECT COALESCE(SUM(amount), 0.00) INTO v_paid FROM payments WHERE invoice_id = p_invoice;

  IF v_paid >= v_total THEN
    UPDATE invoices SET status = 'paid' WHERE invoice_id = p_invoice;

    -- If no overdue invoices remain, reactivate any suspended instances
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE org_id = v_org AND status = 'overdue') THEN
      UPDATE instances SET status = 'running' WHERE org_id = v_org AND status = 'suspended';
    END IF;
  END IF;

  COMMIT;

  SELECT v_payment_id AS payment_id, 'success' AS result;
END$$

DROP PROCEDURE IF EXISTS sp_check_consistency$$
CREATE PROCEDURE sp_check_consistency()
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_consistency_results;
  CREATE TEMPORARY TABLE tmp_consistency_results (
    check_name VARCHAR(60) NOT NULL,
    record_id  BIGINT NULL,
    message    TEXT NOT NULL
  );

  -- 1. hosts.used_* equals sum of specs of non-terminated instances
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'host_counter_mismatch', h.host_id,
         CONCAT('Host ', h.hostname, ' mismatch. Host shows used_vcpu=', h.used_vcpu,
                ' but instances sum=', COALESCE(SUM(t.vcpu), 0))
  FROM hosts h
  LEFT JOIN instances i ON i.host_id = h.host_id AND i.status <> 'terminated'
  LEFT JOIN instance_types t ON t.type_id = i.type_id
  GROUP BY h.host_id, h.hostname, h.used_vcpu
  HAVING h.used_vcpu <> COALESCE(SUM(t.vcpu), 0);

  -- 2. No host has used > total
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'host_capacity_exceeded', host_id,
         CONCAT('Host ', hostname, ' used resources exceed total capacity')
  FROM hosts
  WHERE used_vcpu > total_vcpu OR used_ram_gb > total_ram_gb OR used_disk_gb > total_disk_gb;

  -- 3. invoices.total equals subtotal + tax - credit_applied
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'invoice_math_error', invoice_id,
         CONCAT('Invoice #', invoice_id, ' total ', total, ' != ', subtotal, ' + ', tax, ' - ', credit_applied)
  FROM invoices
  WHERE total <> (subtotal + tax - credit_applied);

  -- 4. Paid invoices have payments >= total; unpaid have less
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'paid_invoice_underpaid', i.invoice_id,
         CONCAT('Invoice #', i.invoice_id, ' marked paid but paid amount ', COALESCE(SUM(p.amount), 0), ' < total ', i.total)
  FROM invoices i
  LEFT JOIN payments p ON p.invoice_id = i.invoice_id
  WHERE i.status = 'paid'
  GROUP BY i.invoice_id, i.total
  HAVING COALESCE(SUM(p.amount), 0) < i.total;

  -- 5. No usage rows for non-existent instances
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'orphan_usage_record', u.usage_id,
         CONCAT('Usage record #', u.usage_id, ' references non-existent instance #', u.instance_id)
  FROM usage_records u
  LEFT JOIN instances i ON i.instance_id = u.instance_id
  WHERE i.instance_id IS NULL
  LIMIT 50;

  -- 6. No instance running on retired or maintenance host
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'instance_on_bad_host', i.instance_id,
         CONCAT('Instance #', i.instance_id, ' running on host ', h.hostname, ' with status ', h.status)
  FROM instances i
  JOIN hosts h ON h.host_id = i.host_id
  WHERE i.status = 'running' AND h.status <> 'active';

  -- 7. Every running instance has exactly one IP; no IP on terminated instance
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'missing_or_duplicate_ip', i.instance_id,
         CONCAT('Running instance #', i.instance_id, ' has ', COUNT(ip.ip_id), ' IPs (expected 1)')
  FROM instances i
  LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id
  WHERE i.status = 'running'
  GROUP BY i.instance_id
  HAVING COUNT(ip.ip_id) <> 1;

  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'terminated_instance_has_ip', ip.ip_id,
         CONCAT('IP #', ip.ip_id, ' assigned to terminated instance #', i.instance_id)
  FROM ip_addresses ip
  JOIN instances i ON i.instance_id = ip.instance_id
  WHERE i.status = 'terminated';

  -- 8. No organization has more active instances than tier allows
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'quota_violation', o.org_id,
         CONCAT('Org ', o.name, ' has ', COUNT(i.instance_id), ' active instances exceeding limit ', t.max_instances)
  FROM organizations o
  JOIN account_tiers t ON t.tier_id = o.tier_id
  JOIN instances i ON i.org_id = o.org_id AND i.status <> 'terminated'
  GROUP BY o.org_id, o.name, t.max_instances
  HAVING COUNT(i.instance_id) > t.max_instances;

  -- 9. Overlapping pricing ranges for active types
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'pricing_overlap', p1.price_id,
         CONCAT('Pricing #', p1.price_id, ' overlaps with #', p2.price_id, ' for type #', p1.type_id)
  FROM pricing p1
  JOIN pricing p2 ON p1.type_id = p2.type_id AND p1.price_id < p2.price_id
  WHERE p1.valid_from <= COALESCE(p2.valid_to, '9999-12-31')
    AND COALESCE(p1.valid_to, '9999-12-31') >= p2.valid_from;

  -- 10. Negative credit balance
  INSERT INTO tmp_consistency_results(check_name, record_id, message)
  SELECT 'negative_credit', org_id,
         CONCAT('Org #', org_id, ' has negative credit balance: ', credit_balance)
  FROM organizations
  WHERE credit_balance < 0;

  SELECT * FROM tmp_consistency_results;
  DROP TEMPORARY TABLE IF EXISTS tmp_consistency_results;
END$$

-- Storage procedures from Step 4
DROP PROCEDURE IF EXISTS sp_validate_dns_record$$
CREATE PROCEDURE sp_validate_dns_record(IN p_domain INT, IN p_type VARCHAR(10), IN p_name VARCHAR(63),
                                        IN p_value VARCHAR(255), IN p_priority SMALLINT, IN p_self INT)
BEGIN
  IF p_type = 'A' AND p_value NOT REGEXP '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.]){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid IPv4 address for A record';
  END IF;
  IF p_type = 'MX' AND (p_priority IS NULL OR p_priority < 0 OR p_priority > 65535) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MX record requires a priority between 0 and 65535';
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_create_volume$$
CREATE PROCEDURE sp_create_volume(IN p_org INT, IN p_region INT, IN p_name VARCHAR(40), IN p_size INT, IN p_type VARCHAR(3))
BEGIN
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type, status)
  VALUES (p_org, p_region, p_name, p_size, p_type, 'available');
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT v_id AS volume_id, p_name AS name, p_size AS size_gb, 'available' AS status;
END$$

DROP PROCEDURE IF EXISTS sp_attach_volume$$
CREATE PROCEDURE sp_attach_volume(IN p_volume INT, IN p_instance INT, IN p_org INT)
BEGIN
  DECLARE v_vol_org INT;
  DECLARE v_inst_org INT;
  DECLARE v_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id, status INTO v_vol_org, v_status FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_vol_org IS NULL OR (p_org IS NOT NULL AND v_vol_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  SELECT org_id INTO v_inst_org FROM instances WHERE instance_id = p_instance FOR UPDATE;
  IF v_inst_org IS NULL OR (p_org IS NOT NULL AND v_inst_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;

  UPDATE volumes SET instance_id = p_instance, status = 'attached' WHERE volume_id = p_volume;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_detach_volume$$
CREATE PROCEDURE sp_detach_volume(IN p_volume INT, IN p_org INT)
BEGIN
  DECLARE v_vol_org INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id INTO v_vol_org FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_vol_org IS NULL OR (p_org IS NOT NULL AND v_vol_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  UPDATE volumes SET instance_id = NULL, status = 'available' WHERE volume_id = p_volume;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_resize_volume$$
CREATE PROCEDURE sp_resize_volume(IN p_volume INT, IN p_org INT, IN p_new_size INT)
BEGIN
  DECLARE v_vol_org INT;
  DECLARE v_cur_size INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id, size_gb INTO v_vol_org, v_cur_size FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_vol_org IS NULL OR (p_org IS NOT NULL AND v_vol_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  IF p_new_size <= v_cur_size THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volumes can only be expanded';
  END IF;

  UPDATE volumes SET size_gb = p_new_size WHERE volume_id = p_volume;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_delete_volume$$
CREATE PROCEDURE sp_delete_volume(IN p_volume INT, IN p_org INT)
BEGIN
  DECLARE v_vol_org INT;
  DECLARE v_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id, status INTO v_vol_org, v_status FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_vol_org IS NULL OR (p_org IS NOT NULL AND v_vol_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  IF v_status = 'attached' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume is currently attached to an instance';
  END IF;

  UPDATE volumes SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE volume_id = p_volume;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_take_snapshot$$
CREATE PROCEDURE sp_take_snapshot(IN p_volume INT, IN p_org INT, IN p_name VARCHAR(40))
BEGIN
  DECLARE v_vol_org INT;
  DECLARE v_size INT;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id, size_gb INTO v_vol_org, v_size FROM volumes WHERE volume_id = p_volume FOR UPDATE;
  IF v_vol_org IS NULL OR (p_org IS NOT NULL AND v_vol_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Volume not found';
  END IF;

  INSERT INTO snapshots(volume_id, name, size_gb) VALUES (p_volume, p_name, v_size);
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT v_id AS snapshot_id, p_name AS name, v_size AS size_gb;
END$$

DROP PROCEDURE IF EXISTS sp_restore_snapshot$$
CREATE PROCEDURE sp_restore_snapshot(IN p_snapshot INT, IN p_org INT, IN p_name VARCHAR(40))
BEGIN
  DECLARE v_snap_org INT;
  DECLARE v_region INT;
  DECLARE v_size INT;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT v.org_id, v.region_id, s.size_gb INTO v_snap_org, v_region, v_size
  FROM snapshots s JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot FOR UPDATE;

  IF v_snap_org IS NULL OR (p_org IS NOT NULL AND v_snap_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;

  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type, status)
  VALUES (v_snap_org, v_region, p_name, v_size, 'ssd', 'available');
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT v_id AS volume_id, p_name AS name, v_size AS size_gb;
END$$

DROP PROCEDURE IF EXISTS sp_delete_snapshot$$
CREATE PROCEDURE sp_delete_snapshot(IN p_snapshot INT, IN p_org INT)
BEGIN
  DECLARE v_snap_org INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT v.org_id INTO v_snap_org
  FROM snapshots s JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot FOR UPDATE;

  IF v_snap_org IS NULL OR (p_org IS NOT NULL AND v_snap_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;

  DELETE FROM snapshots WHERE snapshot_id = p_snapshot;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_register_domain$$
CREATE PROCEDURE sp_register_domain(IN p_org INT, IN p_name VARCHAR(100), IN p_years INT)
BEGIN
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  INSERT INTO domains(org_id, name, registered_on, expires_on, auto_renew)
  VALUES (p_org, p_name, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL COALESCE(p_years, 1) YEAR), FALSE);
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT v_id AS domain_id, p_name AS name;
END$$

DROP PROCEDURE IF EXISTS sp_renew_domain$$
CREATE PROCEDURE sp_renew_domain(IN p_domain INT, IN p_org INT, IN p_years INT)
BEGIN
  DECLARE v_dom_org INT;
  DECLARE v_exp DATE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT org_id, expires_on INTO v_dom_org, v_exp FROM domains WHERE domain_id = p_domain FOR UPDATE;
  IF v_dom_org IS NULL OR (p_org IS NOT NULL AND v_dom_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Domain not found';
  END IF;

  UPDATE domains
     SET expires_on = DATE_ADD(GREATEST(v_exp, CURRENT_DATE), INTERVAL COALESCE(p_years, 1) YEAR)
   WHERE domain_id = p_domain;
  COMMIT;
END$$

DELIMITER ;

