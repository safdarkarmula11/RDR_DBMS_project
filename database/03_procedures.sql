-- ============================================================
-- NimbusHost | 03_procedures.sql
-- All stored procedures for NimbusHost
-- ============================================================

DELIMITER $$

-- 1. Allocate a free IP address in the region with FOR UPDATE SKIP LOCKED
DROP PROCEDURE IF EXISTS sp_allocate_ip$$
CREATE PROCEDURE sp_allocate_ip(IN p_instance INT, IN p_region INT)
BEGIN
  DECLARE v_ip_id INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT ip_id INTO v_ip_id
  FROM ip_addresses
  WHERE region_id = p_region AND instance_id IS NULL
  ORDER BY ip_id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_ip_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No free IP address left in this region';
  END IF;

  UPDATE ip_addresses
  SET instance_id = p_instance, allocated_at = CURRENT_TIMESTAMP
  WHERE ip_id = v_ip_id;
END$$

-- 2. Launch instance with best-fit scheduler, IP allocation, idempotency
DROP PROCEDURE IF EXISTS sp_launch_instance$$
CREATE PROCEDURE sp_launch_instance(
  IN p_org INT,
  IN p_type INT,
  IN p_image INT,
  IN p_region INT,
  IN p_name VARCHAR(40),
  IN p_config TEXT,
  IN p_idempotency_key VARCHAR(64)
)
proc: BEGIN
  DECLARE v_existing_id INT DEFAULT NULL;
  DECLARE v_existing_host INT DEFAULT NULL;
  DECLARE v_region INT DEFAULT NULL;
  DECLARE v_cpu INT DEFAULT NULL;
  DECLARE v_ram INT;
  DECLARE v_disk INT;
  DECLARE v_img INT DEFAULT NULL;
  DECLARE v_host INT DEFAULT NULL;
  DECLARE v_id INT;
  DECLARE v_cfg JSON;
  DECLARE v_auto_backup TINYINT(1) DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- Idempotency check: if key already exists, return existing instance
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT instance_id, host_id INTO v_existing_id, v_existing_host
    FROM instances
    WHERE idempotency_key = p_idempotency_key
      AND org_id = p_org;

    IF v_existing_id IS NOT NULL THEN
      SELECT v_existing_id AS instance_id, v_existing_host AS host_id;
      LEAVE proc;
    END IF;
  END IF;

  -- Validate region
  SELECT region_id INTO v_region
  FROM regions
  WHERE region_id = p_region AND status = 'active';
  IF v_region IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Region is not available';
  END IF;

  -- Validate instance type
  SELECT vcpu, ram_gb, disk_gb INTO v_cpu, v_ram, v_disk
  FROM instance_types
  WHERE type_id = p_type AND active = TRUE;
  IF v_cpu IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type is not available';
  END IF;

  -- Validate image
  SELECT image_id INTO v_img
  FROM images
  WHERE image_id = p_image;
  IF v_img IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Image not found';
  END IF;

  -- Validate config JSON
  IF p_config IS NOT NULL AND NOT JSON_VALID(p_config) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Config must be valid JSON';
  END IF;

  -- READ COMMITTED for this transaction: the quota trigger locks the organization row and then
  -- counts its instances. Under REPEATABLE READ that count could use a snapshot taken before
  -- the lock and miss a launch another session just committed; READ COMMITTED reads fresh data.
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;

  -- Best fit: pick fullest host that still fits requirements
  -- FOR UPDATE SKIP LOCKED ensures concurrent launches do not collide
  SELECT host_id INTO v_host
  FROM hosts
  WHERE region_id = p_region
    AND status = 'active'
    AND (total_vcpu - used_vcpu) >= v_cpu
    AND (total_ram_gb - used_ram_gb) >= v_ram
    AND (total_disk_gb - used_disk_gb) >= v_disk
  ORDER BY (total_vcpu - used_vcpu) ASC, host_id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No capacity available in this region right now';
  END IF;

  -- Insert instance as pending; triggers validate org quota, tier, and image min_disk
  -- auto_backup is a real column (not a value buried in the JSON), so strip it out of the free-form config
  SET v_cfg = COALESCE(CAST(p_config AS JSON), JSON_OBJECT());
  SET v_auto_backup = IFNULL(JSON_UNQUOTE(JSON_EXTRACT(v_cfg, '$.auto_backup')) = 'true', 0);
  SET v_cfg = JSON_REMOVE(v_cfg, '$.auto_backup');

  INSERT INTO instances(org_id, host_id, type_id, image_id, name, status, config, auto_backup, idempotency_key)
  VALUES (p_org, v_host, p_type, p_image, p_name, 'pending', v_cfg, v_auto_backup, p_idempotency_key);
  SET v_id = LAST_INSERT_ID();

  -- Allocate IP in the region
  CALL sp_allocate_ip(v_id, p_region);

  -- Transition status to running
  UPDATE instances SET status = 'running' WHERE instance_id = v_id;

  COMMIT;

  SELECT v_id AS instance_id, v_host AS host_id;
END proc$$

-- 3. Set instance status with ownership verification and row locking
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

-- 4. Terminate instance, explicitly detaching volumes with audit log rows
DROP PROCEDURE IF EXISTS sp_terminate_instance$$
CREATE PROCEDURE sp_terminate_instance(IN p_instance INT, IN p_org INT)
BEGIN
  DECLARE v_vol_id INT;
  DECLARE v_done INT DEFAULT 0;
  DECLARE cur_vols CURSOR FOR
    SELECT volume_id FROM volumes WHERE instance_id = p_instance;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  -- Verify ownership
  IF p_org IS NOT NULL AND NOT EXISTS (SELECT 1 FROM instances WHERE instance_id = p_instance AND org_id = p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;

  -- Detach volumes and record explicit audit entries
  OPEN cur_vols;
  vol_loop: LOOP
    FETCH cur_vols INTO v_vol_id;
    IF v_done = 1 THEN
      LEAVE vol_loop;
    END IF;

    UPDATE volumes SET status = 'available', instance_id = NULL WHERE volume_id = v_vol_id;
    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('volumes', v_vol_id, 'UPDATE',
            JSON_OBJECT('status', 'attached', 'instance_id', p_instance),
            JSON_OBJECT('status', 'available', 'instance_id', NULL),
            COALESCE(@app_user_id, 0));
  END LOOP;
  CLOSE cur_vols;

  -- Terminate instance (fires triggers for capacity and IP release)
  UPDATE instances SET status = 'terminated' WHERE instance_id = p_instance;
  COMMIT;
END$$

-- 5. Resize instance with capacity verification and session variable flag
DROP PROCEDURE IF EXISTS sp_resize_instance$$
CREATE PROCEDURE sp_resize_instance(IN p_instance INT, IN p_org INT, IN p_new_type INT)
BEGIN
  DECLARE v_org INT DEFAULT NULL;
  DECLARE v_host INT DEFAULT NULL;
  DECLARE v_old_type INT DEFAULT NULL;
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_old_cpu INT; DECLARE v_old_ram INT; DECLARE v_old_disk INT;
  DECLARE v_new_cpu INT DEFAULT NULL; DECLARE v_new_ram INT; DECLARE v_new_disk INT; DECLARE v_active TINYINT;
  DECLARE v_min_disk INT DEFAULT NULL;
  DECLARE v_tot_cpu INT; DECLARE v_tot_ram INT; DECLARE v_tot_disk INT;
  DECLARE v_used_cpu INT; DECLARE v_used_ram INT; DECLARE v_used_disk INT;
  DECLARE v_diff_cpu INT; DECLARE v_diff_ram INT; DECLARE v_diff_disk INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET @app_resizing = 0;
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT org_id, host_id, type_id, status
  INTO v_org, v_host, v_old_type, v_status
  FROM instances
  WHERE instance_id = p_instance
  FOR UPDATE;

  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;

  IF v_status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot resize a terminated instance';
  END IF;

  IF v_old_type = p_new_type THEN
    COMMIT;
  ELSE
    SELECT vcpu, ram_gb, disk_gb, active
    INTO v_new_cpu, v_new_ram, v_new_disk, v_active
    FROM instance_types
    WHERE type_id = p_new_type;

    IF v_active IS NULL OR v_active = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance type is not available';
    END IF;

    SELECT im.min_disk_gb INTO v_min_disk
    FROM images im
    JOIN instances inst ON inst.image_id = im.image_id
    WHERE inst.instance_id = p_instance;

    IF v_min_disk IS NOT NULL AND v_new_disk < v_min_disk THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This instance type has less disk than the image requires';
    END IF;

    SELECT vcpu, ram_gb, disk_gb
    INTO v_old_cpu, v_old_ram, v_old_disk
    FROM instance_types
    WHERE type_id = v_old_type;

    SELECT total_vcpu, total_ram_gb, total_disk_gb, used_vcpu, used_ram_gb, used_disk_gb
    INTO v_tot_cpu, v_tot_ram, v_tot_disk, v_used_cpu, v_used_ram, v_used_disk
    FROM hosts
    WHERE host_id = v_host
    FOR UPDATE;

    SET v_diff_cpu = v_new_cpu - v_old_cpu;
    SET v_diff_ram = v_new_ram - v_old_ram;
    SET v_diff_disk = v_new_disk - v_old_disk;

    IF (v_diff_cpu > 0 AND (v_tot_cpu - v_used_cpu) < v_diff_cpu)
       OR (v_diff_ram > 0 AND (v_tot_ram - v_used_ram) < v_diff_ram)
       OR (v_diff_disk > 0 AND (v_tot_disk - v_used_disk) < v_diff_disk) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host does not have enough capacity to resize this instance';
    END IF;

    -- Enable resizing bypass flag for BEFORE UPDATE trigger
    SET @app_resizing = 1;
    UPDATE instances SET type_id = p_new_type WHERE instance_id = p_instance;
    SET @app_resizing = 0;

    UPDATE hosts
    SET used_vcpu = used_vcpu + v_diff_cpu,
        used_ram_gb = used_ram_gb + v_diff_ram,
        used_disk_gb = used_disk_gb + v_diff_disk
    WHERE host_id = v_host;

    INSERT INTO audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('instances', p_instance, 'UPDATE',
            JSON_OBJECT('type_id', v_old_type),
            JSON_OBJECT('type_id', p_new_type),
            COALESCE(@app_user_id, 0));

    COMMIT;
  END IF;
END$$

-- 6. Record usage metrics with validation
DROP PROCEDURE IF EXISTS sp_record_usage$$
CREATE PROCEDURE sp_record_usage(IN p_instance INT, IN p_metric VARCHAR(20), IN p_quantity DECIMAL(10,3))
BEGIN
  DECLARE v_org_id INT DEFAULT NULL;
  DECLARE v_type_id INT DEFAULT NULL;
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_metric NOT IN ('cpu_hour','storage_gb','egress_gb') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid usage metric';
  END IF;

  IF p_quantity < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usage quantity must be non-negative';
  END IF;

  START TRANSACTION;

  SELECT org_id, type_id, status
  INTO v_org_id, v_type_id, v_status
  FROM instances
  WHERE instance_id = p_instance;

  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Instance not found';
  END IF;

  IF v_status = 'terminated' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot record usage for a terminated instance';
  END IF;

  INSERT INTO usage_records(recorded_at, instance_id, metric, quantity)
  VALUES (NOW(6), p_instance, p_metric, p_quantity);

  COMMIT;
END$$

-- 7. Generate invoice with usage rollup, tax, credit deduction
DROP PROCEDURE IF EXISTS sp_generate_invoice$$
CREATE PROCEDURE sp_generate_invoice(IN p_org INT, IN p_period_start DATE, IN p_period_end DATE)
BEGIN
  DECLARE v_org_id INT DEFAULT NULL;
  DECLARE v_credit_avail DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_invoice_id INT;
  DECLARE v_subtotal DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_tax DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_credit_to_apply DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_total DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_pre_credit DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_tax_rate DECIMAL(5,2) DEFAULT 18.00;

  DECLARE v_cur_inst INT;
  DECLARE v_cur_type INT;
  DECLARE v_cur_name VARCHAR(40);
  DECLARE v_cur_price DECIMAL(8,4);
  DECLARE v_cur_qty DECIMAL(10,3);
  DECLARE v_unit_price DECIMAL(8,4);
  DECLARE v_item_amount DECIMAL(12,2);
  DECLARE v_done INT DEFAULT 0;

  -- Only compute hours are billed; each row is priced with the price version
  -- that was valid on the day the usage was recorded.
  DECLARE cur_usage CURSOR FOR
    SELECT u.instance_id, u.type_id, i.name, pr.price_per_hour, SUM(u.quantity) AS total_qty
    FROM v_usage_records u
    JOIN instances i ON i.instance_id = u.instance_id
    LEFT JOIN pricing pr
           ON pr.type_id = u.type_id
          AND DATE(u.recorded_at) >= pr.valid_from
          AND (pr.valid_to IS NULL OR DATE(u.recorded_at) <= pr.valid_to)
    WHERE i.org_id = p_org
      AND u.metric = 'cpu_hour'
      AND u.recorded_at >= p_period_start
      AND u.recorded_at < DATE_ADD(p_period_end, INTERVAL 1 DAY)
    GROUP BY u.instance_id, u.type_id, i.name, pr.price_per_hour
    ORDER BY u.instance_id, pr.price_per_hour;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_period_end < p_period_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Period end cannot be earlier than period start';
  END IF;

  START TRANSACTION;

  SELECT org_id, credit_balance
  INTO v_org_id, v_credit_avail
  FROM organizations
  WHERE org_id = p_org
  FOR UPDATE;

  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found';
  END IF;

  -- Reject any non-void invoice whose period overlaps the requested one
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE org_id = p_org
      AND status <> 'void'
      AND period_start <= p_period_end
      AND period_end >= p_period_start
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice already exists for this period';
  END IF;

  INSERT INTO invoices(org_id, period_start, period_end, subtotal, tax_rate_pct, credit_applied, status)
  VALUES (p_org, p_period_start, p_period_end, 0.00, v_tax_rate, 0.00, 'draft');
  SET v_invoice_id = LAST_INSERT_ID();

  OPEN cur_usage;
  usage_loop: LOOP
    FETCH cur_usage INTO v_cur_inst, v_cur_type, v_cur_name, v_cur_price, v_cur_qty;
    IF v_done = 1 THEN
      LEAVE usage_loop;
    END IF;

    SET v_unit_price = COALESCE(v_cur_price, 0.0000);
    SET v_item_amount = ROUND(v_cur_qty * v_unit_price, 2);

    INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price)
    VALUES (v_invoice_id, v_cur_inst, CONCAT('Compute - ', v_cur_name), v_cur_qty, v_unit_price);

    SET v_subtotal = v_subtotal + v_item_amount;
  END LOOP;
  CLOSE cur_usage;

  SET v_tax = ROUND(v_subtotal * v_tax_rate / 100, 2);
  SET v_pre_credit = v_subtotal + v_tax;
  SET v_credit_to_apply = LEAST(v_credit_avail, v_pre_credit);

  IF v_credit_to_apply > 0 THEN
    UPDATE organizations
    SET credit_balance = credit_balance - v_credit_to_apply
    WHERE org_id = p_org AND credit_balance >= v_credit_to_apply;

    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Failed to apply credit balance';
    END IF;
  END IF;

  SET v_total = v_subtotal + v_tax - v_credit_to_apply;

  UPDATE invoices
  SET subtotal = v_subtotal,
      credit_applied = v_credit_to_apply,
      status = 'issued',
      issued_at = CURRENT_TIMESTAMP,
      due_date = DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
  WHERE invoice_id = v_invoice_id;

  -- Nothing to pay (no usage, or fully covered by credit): close it now so it
  -- can never turn overdue and trigger a suspension.
  IF v_total <= 0 THEN
    UPDATE invoices SET status = 'paid' WHERE invoice_id = v_invoice_id;
  END IF;

  COMMIT;

  SELECT v_invoice_id AS invoice_id;
END$$

-- 8. Run monthly billing across active organizations with error logging
DROP PROCEDURE IF EXISTS sp_run_monthly_billing$$
CREATE PROCEDURE sp_run_monthly_billing(IN p_period_start DATE, IN p_period_end DATE)
BEGIN
  DECLARE v_org_id INT;
  DECLARE v_done INT DEFAULT 0;
  DECLARE cur_orgs CURSOR FOR
    SELECT org_id FROM organizations WHERE status = 'active' ORDER BY org_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur_orgs;
  org_loop: LOOP
    FETCH cur_orgs INTO v_org_id;
    IF v_done = 1 THEN
      LEAVE org_loop;
    END IF;

    BEGIN
      DECLARE v_err_msg TEXT DEFAULT 'Billing generation failed';
      DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
      BEGIN
        GET DIAGNOSTICS CONDITION 1 v_err_msg = MESSAGE_TEXT;
        INSERT INTO billing_errors(org_id, error_message, context)
        VALUES (v_org_id, v_err_msg, JSON_OBJECT('period_start', p_period_start, 'period_end', p_period_end));
      END;

      CALL sp_generate_invoice(v_org_id, p_period_start, p_period_end);
    END;
  END LOOP;
  CLOSE cur_orgs;
END$$

-- 9. Apply payment with balance check, idempotency, and status update
DROP PROCEDURE IF EXISTS sp_apply_payment$$
CREATE PROCEDURE sp_apply_payment(
  IN p_invoice INT,
  IN p_amount DECIMAL(12,2),
  IN p_method VARCHAR(20),
  IN p_txn_ref VARCHAR(100),
  IN p_idempotency_key VARCHAR(64)
)
proc: BEGIN
  DECLARE v_existing_payment INT DEFAULT NULL;
  DECLARE v_org_id INT DEFAULT NULL;
  DECLARE v_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_total DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_balance DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_total_paid DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_payment_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT payment_id INTO v_existing_payment
    FROM payments
    WHERE idempotency_key = p_idempotency_key
      AND invoice_id = p_invoice;

    IF v_existing_payment IS NOT NULL THEN
      SELECT v_existing_payment AS payment_id;
      LEAVE proc;
    END IF;
  END IF;

  IF p_method NOT IN ('card','upi','netbanking','credit') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid payment method';
  END IF;

  IF p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be greater than zero';
  END IF;

  START TRANSACTION;

  SELECT org_id, status, subtotal + ROUND(subtotal * tax_rate_pct / 100, 2) - credit_applied
  INTO v_org_id, v_status, v_total
  FROM invoices
  WHERE invoice_id = p_invoice
  FOR UPDATE;

  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice not found';
  END IF;

  IF v_status NOT IN ('issued', 'overdue') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments can only be applied to issued or overdue invoices';
  END IF;

  SET v_balance = fn_invoice_balance(p_invoice);
  IF p_amount > v_balance THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount exceeds outstanding invoice balance';
  END IF;

  -- Paying from credit must actually spend the credit
  IF p_method = 'credit' THEN
    UPDATE organizations
    SET credit_balance = credit_balance - p_amount
    WHERE org_id = v_org_id AND credit_balance >= p_amount;

    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient credit balance';
    END IF;
  END IF;

  INSERT INTO payments(invoice_id, amount, method, txn_ref, idempotency_key)
  VALUES (p_invoice, p_amount, p_method, p_txn_ref, p_idempotency_key);
  SET v_payment_id = LAST_INSERT_ID();

  SELECT COALESCE(SUM(amount), 0.00) INTO v_total_paid
  FROM payments
  WHERE invoice_id = p_invoice;

  IF v_total_paid >= v_total THEN
    UPDATE invoices SET status = 'paid' WHERE invoice_id = p_invoice;
  END IF;

  COMMIT;

  SELECT v_payment_id AS payment_id;
END$$

-- 10. Volume operations
DROP PROCEDURE IF EXISTS sp_create_volume$$
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
  IF v_lock IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found';
  END IF;

  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type)
  VALUES (p_org, p_region, p_name, p_size, p_type);
  SET v_id = LAST_INSERT_ID();

  COMMIT;
  SELECT v_id AS volume_id;
END$$

DROP PROCEDURE IF EXISTS sp_attach_volume$$
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

DROP PROCEDURE IF EXISTS sp_detach_volume$$
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

DROP PROCEDURE IF EXISTS sp_resize_volume$$
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

DROP PROCEDURE IF EXISTS sp_delete_volume$$
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

-- 11. Snapshot operations
DROP PROCEDURE IF EXISTS sp_take_snapshot$$
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

  INSERT INTO snapshots(volume_id, name, size_gb)
  SELECT volume_id, p_name, size_gb FROM volumes WHERE volume_id = p_volume;
  SET v_id = LAST_INSERT_ID();

  COMMIT;
  SELECT v_id AS snapshot_id;
END$$

DROP PROCEDURE IF EXISTS sp_restore_snapshot$$
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

  SELECT v.org_id INTO v_org
  FROM snapshots s
  JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot;

  IF v_org IS NULL OR (p_org IS NOT NULL AND v_org <> p_org) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;

  START TRANSACTION;
  SELECT org_id INTO v_lock FROM organizations WHERE org_id = v_org FOR UPDATE;

  INSERT INTO volumes(org_id, region_id, name, size_gb, vol_type)
  SELECT v.org_id, v.region_id, p_name, s.size_gb, v.vol_type
  FROM snapshots s
  JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot;
  SET v_id = LAST_INSERT_ID();

  COMMIT;
  SELECT v_id AS volume_id;
END$$

DROP PROCEDURE IF EXISTS sp_delete_snapshot$$
CREATE PROCEDURE sp_delete_snapshot(IN p_snapshot INT, IN p_org INT)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  DELETE s FROM snapshots s
  JOIN volumes v ON v.volume_id = s.volume_id
  WHERE s.snapshot_id = p_snapshot AND (p_org IS NULL OR v.org_id = p_org);

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Snapshot not found';
  END IF;
  COMMIT;
END$$

-- 12. Domain and DNS operations
DROP PROCEDURE IF EXISTS sp_register_domain$$
CREATE PROCEDURE sp_register_domain(IN p_org INT, IN p_name VARCHAR(100), IN p_years INT)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_years IS NULL OR p_years < 1 OR p_years > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registration period must be 1 to 10 years';
  END IF;

  START TRANSACTION;
  INSERT INTO domains(org_id, name, registered_on, expires_on)
  VALUES (p_org, p_name, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL p_years YEAR));
  COMMIT;

  SELECT LAST_INSERT_ID() AS domain_id;
END$$

DROP PROCEDURE IF EXISTS sp_renew_domain$$
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

  UPDATE domains
  SET expires_on = DATE_ADD(GREATEST(expires_on, CURRENT_DATE), INTERVAL p_years YEAR)
  WHERE domain_id = p_domain;

  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_validate_dns_record$$
CREATE PROCEDURE sp_validate_dns_record(
  IN p_domain INT,
  IN p_type VARCHAR(10),
  IN p_name VARCHAR(63),
  IN p_value VARCHAR(255),
  IN p_priority SMALLINT,
  IN p_self INT
)
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
    FROM ip_addresses ip
    JOIN instances i ON i.instance_id = ip.instance_id
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

  IF p_type <> 'CNAME' AND EXISTS (
    SELECT 1 FROM dns_records
    WHERE domain_id = p_domain AND name = p_name AND rtype = 'CNAME' AND record_id <> p_self
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This name already has a CNAME record';
  END IF;
END$$

-- 13. Pricing procedures
DROP PROCEDURE IF EXISTS sp_assert_no_price_overlap$$
CREATE PROCEDURE sp_assert_no_price_overlap(IN p_type INT, IN p_from DATE, IN p_to DATE, IN p_self INT)
BEGIN
  IF EXISTS (
    SELECT 1 FROM pricing
    WHERE type_id = p_type
      AND price_id <> p_self
      AND valid_from <= COALESCE(p_to, '9999-12-31')
      AND COALESCE(valid_to, '9999-12-31') >= p_from
  ) THEN
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
  FROM pricing
  WHERE type_id = p_type AND valid_to IS NULL
  FOR UPDATE;

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

-- 14. Daily usage rollup into daily_usage_summary
DROP PROCEDURE IF EXISTS sp_rollup_daily_usage$$
CREATE PROCEDURE sp_rollup_daily_usage(IN p_date DATE)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  INSERT INTO daily_usage_summary(usage_date, org_id, cpu_hours, storage_gb_hours, egress_gb, record_count)
  SELECT
    p_date AS usage_date,
    org_id,
    COALESCE(SUM(CASE WHEN metric = 'cpu_hour' THEN quantity ELSE 0 END), 0.000) AS cpu_hours,
    COALESCE(SUM(CASE WHEN metric = 'storage_gb' THEN quantity ELSE 0 END), 0.000) AS storage_gb_hours,
    COALESCE(SUM(CASE WHEN metric = 'egress_gb' THEN quantity ELSE 0 END), 0.000) AS egress_gb,
    COUNT(*) AS record_count
  FROM v_usage_records
  WHERE recorded_at >= p_date AND recorded_at < DATE_ADD(p_date, INTERVAL 1 DAY)
  GROUP BY org_id
  ON DUPLICATE KEY UPDATE
    cpu_hours = VALUES(cpu_hours),
    storage_gb_hours = VALUES(storage_gb_hours),
    egress_gb = VALUES(egress_gb),
    record_count = VALUES(record_count);
  COMMIT;
END$$

-- 15. Drop old monthly partitions of usage_records
DROP PROCEDURE IF EXISTS sp_drop_old_partitions$$
CREATE PROCEDURE sp_drop_old_partitions(IN p_months_to_keep INT)
BEGIN
  DECLARE v_part_name VARCHAR(64);
  DECLARE v_cutoff_str VARCHAR(20);
  DECLARE v_done INT DEFAULT 0;
  DECLARE cur_part CURSOR FOR
    SELECT PARTITION_NAME
    FROM information_schema.PARTITIONS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usage_records'
      AND PARTITION_NAME IS NOT NULL
      AND PARTITION_NAME <> 'pmax'
      AND PARTITION_NAME REGEXP '^p[0-9]{4}_[0-9]{2}$'
      AND PARTITION_NAME < v_cutoff_str;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    RESIGNAL;
  END;

  IF p_months_to_keep IS NULL OR p_months_to_keep < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Months to keep must be at least 1';
  END IF;

  SET v_cutoff_str = CONCAT('p', DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL p_months_to_keep MONTH), '%Y_%m'));

  OPEN cur_part;
  part_loop: LOOP
    FETCH cur_part INTO v_part_name;
    IF v_done = 1 THEN
      LEAVE part_loop;
    END IF;

    SET @sql = CONCAT('ALTER TABLE usage_records DROP PARTITION ', v_part_name);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;
  CLOSE cur_part;
END$$

-- 16. Comprehensive consistency check procedure
DROP PROCEDURE IF EXISTS sp_check_consistency$$
CREATE PROCEDURE sp_check_consistency()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    DROP TEMPORARY TABLE IF EXISTS tmp_consistency_errors;
    RESIGNAL;
  END;

  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_consistency_errors (
    check_name VARCHAR(60) NOT NULL,
    record_id  BIGINT NULL,
    message    VARCHAR(255) NOT NULL
  );
  TRUNCATE TABLE tmp_consistency_errors;

  -- Check 1: hosts.used_* equals sum of specs of non-terminated instances
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'host_used_counters', h.host_id,
         CONCAT('Host ', h.hostname, ' mismatch: reported (', h.used_vcpu, ' vcpu, ', h.used_ram_gb, 'GB ram, ', h.used_disk_gb, 'GB disk) vs actual (',
                COALESCE(act.sum_vcpu, 0), ' vcpu, ', COALESCE(act.sum_ram, 0), 'GB ram, ', COALESCE(act.sum_disk, 0), 'GB disk)')
  FROM hosts h
  LEFT JOIN (
    SELECT i.host_id,
           SUM(t.vcpu) AS sum_vcpu,
           SUM(t.ram_gb) AS sum_ram,
           SUM(t.disk_gb) AS sum_disk
    FROM instances i
    JOIN instance_types t ON t.type_id = i.type_id
    WHERE i.status <> 'terminated'
    GROUP BY i.host_id
  ) act ON act.host_id = h.host_id
  WHERE h.used_vcpu <> COALESCE(act.sum_vcpu, 0)
     OR h.used_ram_gb <> COALESCE(act.sum_ram, 0)
     OR h.used_disk_gb <> COALESCE(act.sum_disk, 0);

  -- Check 2: No host has used greater than total
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'host_overbooked', host_id,
         CONCAT('Host ', hostname, ' overbooked: vcpu ', used_vcpu, '/', total_vcpu, ', ram ', used_ram_gb, '/', total_ram_gb, ', disk ', used_disk_gb, '/', total_disk_gb)
  FROM hosts
  WHERE used_vcpu > total_vcpu OR used_ram_gb > total_ram_gb OR used_disk_gb > total_disk_gb;

  -- Check 3: Invoice totals match sum of items plus tax minus credit
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'invoice_subtotal_mismatch', inv.invoice_id,
         CONCAT('Invoice ', inv.invoice_id, ' subtotal ', inv.subtotal, ' does not match items sum ', COALESCE(act.sum_amt, 0.00))
  FROM invoices inv
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS sum_amt
    FROM v_invoice_items
    GROUP BY invoice_id
  ) act ON act.invoice_id = inv.invoice_id
  WHERE inv.status <> 'draft' AND inv.subtotal <> COALESCE(act.sum_amt, 0.00);

  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'invoice_total_negative', invoice_id,
         CONCAT('Invoice ', invoice_id, ' total ', total, ' is negative: credit ', credit_applied, ' exceeds subtotal ', subtotal, ' + tax ', tax)
  FROM v_invoices
  WHERE total < 0;

  -- Check 4: Paid invoices have sum(payments) >= total, unpaid have less
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'paid_invoice_underpaid', inv.invoice_id,
         CONCAT('Invoice ', inv.invoice_id, ' marked paid but payments sum to ', COALESCE(p.sum_pay, 0.00), ' < total ', inv.total)
  FROM v_invoices inv
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS sum_pay FROM payments GROUP BY invoice_id
  ) p ON p.invoice_id = inv.invoice_id
  WHERE inv.status = 'paid' AND COALESCE(p.sum_pay, 0.00) < inv.total;

  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'unpaid_invoice_fully_paid', inv.invoice_id,
         CONCAT('Invoice ', inv.invoice_id, ' status is ', inv.status, ' but payments sum to ', COALESCE(p.sum_pay, 0.00), ' >= total ', inv.total)
  FROM v_invoices inv
  JOIN (
    SELECT invoice_id, SUM(amount) AS sum_pay FROM payments GROUP BY invoice_id
  ) p ON p.invoice_id = inv.invoice_id
  WHERE inv.status IN ('issued', 'overdue') AND p.sum_pay >= inv.total AND inv.total > 0;

  -- Check 5: No orphan usage rows
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT DISTINCT 'orphan_usage_record', u.instance_id,
         CONCAT('Usage record references non-existent instance_id ', u.instance_id)
  FROM usage_records u
  LEFT JOIN instances i ON i.instance_id = u.instance_id
  WHERE i.instance_id IS NULL;

  -- Check 6: No running instance on retired or maintenance host
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'instance_on_inactive_host', i.instance_id,
         CONCAT('Instance ', i.instance_id, ' is ', i.status, ' but host ', h.hostname, ' is ', h.status)
  FROM instances i
  JOIN hosts h ON h.host_id = i.host_id
  WHERE i.status = 'running' AND h.status IN ('retired', 'maintenance');

  -- Check 7: Running instances have exactly 1 IP; no IP assigned to terminated instance
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'running_instance_no_ip', i.instance_id,
         CONCAT('Running instance ', i.name, ' (ID ', i.instance_id, ') has no IP address')
  FROM instances i
  LEFT JOIN ip_addresses ip ON ip.instance_id = i.instance_id
  WHERE i.status = 'running' AND ip.ip_id IS NULL;

  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'terminated_instance_has_ip', ip.ip_id,
         CONCAT('IP address ', ip.ip_address, ' is assigned to terminated instance ', ip.instance_id)
  FROM ip_addresses ip
  JOIN instances i ON i.instance_id = ip.instance_id
  WHERE i.status = 'terminated';

  -- Check 8: No organization above instance quota
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'org_over_instance_quota', o.org_id,
         CONCAT('Org ', o.name, ' running ', act.cnt, ' instances, exceeds tier max ', t.max_instances)
  FROM organizations o
  JOIN account_tiers t ON t.tier_id = o.tier_id
  JOIN (
    SELECT org_id, COUNT(*) AS cnt FROM instances WHERE status <> 'terminated' GROUP BY org_id
  ) act ON act.org_id = o.org_id
  WHERE act.cnt > t.max_instances;

  -- Check 9: Pricing ranges do not overlap
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'pricing_overlap', p1.price_id,
         CONCAT('Pricing ', p1.price_id, ' overlaps with ', p2.price_id, ' for type ', p1.type_id)
  FROM pricing p1
  JOIN pricing p2 ON p1.type_id = p2.type_id AND p1.price_id < p2.price_id
  WHERE p1.valid_from <= COALESCE(p2.valid_to, '9999-12-31')
    AND COALESCE(p1.valid_to, '9999-12-31') >= p2.valid_from;

  -- Check 10: Credit balance is never negative
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'negative_credit_balance', org_id,
         CONCAT('Organization ', name, ' has negative credit balance: ', credit_balance)
  FROM organizations
  WHERE credit_balance < 0;

  -- Check 11: Daily summary matches raw usage totals
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'daily_summary_mismatch', NULL,
         CONCAT('Daily summary mismatch on date ', dus.usage_date, ' for org ', dus.org_id,
                ': summary cpu ', dus.cpu_hours, ' vs raw ', COALESCE(raw.sum_cpu, 0.000))
  FROM daily_usage_summary dus
  LEFT JOIN (
    SELECT DATE(recorded_at) AS u_date, org_id,
           SUM(CASE WHEN metric = 'cpu_hour' THEN quantity ELSE 0 END) AS sum_cpu
    FROM v_usage_records
    GROUP BY DATE(recorded_at), org_id
  ) raw ON raw.u_date = dus.usage_date AND raw.org_id = dus.org_id
  WHERE dus.cpu_hours <> COALESCE(raw.sum_cpu, 0.000);

  SELECT check_name, record_id, message
  FROM tmp_consistency_errors
  ORDER BY check_name, record_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_consistency_errors;
END$$

-- ============================================================
-- STAR SCHEMA ETL: refresh dim_date, dim_org, dim_type and fact_usage_daily
-- Idempotent: running it again for the same dates replaces the facts.
-- ============================================================
DROP PROCEDURE IF EXISTS sp_refresh_star_schema$$
CREATE PROCEDURE sp_refresh_star_schema(IN p_from DATE, IN p_to DATE)
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid date range';
  END IF;
  IF DATEDIFF(p_to, p_from) > 3000 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date range is too large (maximum 3000 days)';
  END IF;

  SET SESSION cte_max_recursion_depth = 5000;

  -- Date dimension: one row per calendar day
  INSERT IGNORE INTO dim_date(date_key, full_date, year, month, day, day_of_week)
  WITH RECURSIVE d(dt) AS (
    SELECT p_from
    UNION ALL
    SELECT DATE_ADD(dt, INTERVAL 1 DAY) FROM d WHERE dt < p_to
  )
  SELECT CAST(DATE_FORMAT(dt, '%Y%m%d') AS UNSIGNED), dt, YEAR(dt), MONTH(dt), DAY(dt), DAYOFWEEK(dt)
  FROM d;

  -- Organization dimension (type 1: current values overwrite old ones)
  INSERT INTO dim_org(org_id, org_name, tier_name, status)
  SELECT o.org_id, o.name, t.name, o.status
  FROM organizations o
  LEFT JOIN account_tiers t ON t.tier_id = o.tier_id
  ON DUPLICATE KEY UPDATE org_name = VALUES(org_name), tier_name = VALUES(tier_name), status = VALUES(status);

  -- Instance type dimension
  INSERT INTO dim_type(type_id, type_name, family, vcpu, ram_gb, disk_gb)
  SELECT type_id, name, family, vcpu, ram_gb, disk_gb
  FROM instance_types
  ON DUPLICATE KEY UPDATE type_name = VALUES(type_name), family = VALUES(family),
                          vcpu = VALUES(vcpu), ram_gb = VALUES(ram_gb), disk_gb = VALUES(disk_gb);

  -- Fact table: usage per day, organization, instance type and metric
  INSERT INTO fact_usage_daily(date_key, org_key, type_key, metric, total_quantity, record_count)
  SELECT CAST(DATE_FORMAT(u.recorded_at, '%Y%m%d') AS UNSIGNED), o.org_key, t.type_key, u.metric,
         SUM(u.quantity), COUNT(*)
  FROM v_usage_records u
  JOIN dim_org  o ON o.org_id  = u.org_id
  JOIN dim_type t ON t.type_id = u.type_id
  WHERE u.recorded_at >= p_from AND u.recorded_at < DATE_ADD(p_to, INTERVAL 1 DAY)
  GROUP BY CAST(DATE_FORMAT(u.recorded_at, '%Y%m%d') AS UNSIGNED), o.org_key, t.type_key, u.metric
  ON DUPLICATE KEY UPDATE total_quantity = VALUES(total_quantity), record_count = VALUES(record_count);

  SELECT COUNT(*) AS fact_rows
  FROM fact_usage_daily
  WHERE date_key BETWEEN CAST(DATE_FORMAT(p_from, '%Y%m%d') AS UNSIGNED)
                     AND CAST(DATE_FORMAT(p_to,   '%Y%m%d') AS UNSIGNED);
END$$

-- ============================================================
-- PARTITION MAINTENANCE: keep monthly partitions ahead of today
-- Splits the catch-all pmax partition; safe to run repeatedly.
-- ============================================================
DROP PROCEDURE IF EXISTS sp_add_future_partitions$$
CREATE PROCEDURE sp_add_future_partitions(IN p_months_ahead INT)
BEGIN
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_month_start DATE;
  DECLARE v_bound VARCHAR(10);
  DECLARE v_last_bound VARCHAR(10) DEFAULT NULL;

  IF p_months_ahead IS NULL OR p_months_ahead < 1 OR p_months_ahead > 36 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Months ahead must be between 1 and 36';
  END IF;

  SELECT MAX(REPLACE(PARTITION_DESCRIPTION, '''', ''))
  INTO v_last_bound
  FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usage_records'
    AND PARTITION_NAME <> 'pmax';

  WHILE v_i <= p_months_ahead DO
    SET v_month_start = DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL v_i MONTH);
    SET v_bound = DATE_FORMAT(DATE_ADD(v_month_start, INTERVAL 1 MONTH), '%Y-%m-%d');

    IF v_last_bound IS NULL OR v_bound > v_last_bound THEN
      SET @nb_ddl = CONCAT(
        'ALTER TABLE usage_records REORGANIZE PARTITION pmax INTO (',
        'PARTITION p', DATE_FORMAT(v_month_start, '%Y_%m'), ' VALUES LESS THAN (''', v_bound, '''), ',
        'PARTITION pmax VALUES LESS THAN (MAXVALUE))');
      PREPARE nb_stmt FROM @nb_ddl;
      EXECUTE nb_stmt;
      DEALLOCATE PREPARE nb_stmt;
      SET v_last_bound = v_bound;
    END IF;

    SET v_i = v_i + 1;
  END WHILE;
END$$


DELIMITER ;
