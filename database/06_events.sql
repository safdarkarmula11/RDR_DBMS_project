-- ============================================================
-- NimbusHost | 06_events.sql
-- All scheduled events for NimbusHost
-- Requires Event Scheduler enabled: SET GLOBAL event_scheduler = ON;
-- ============================================================

SET GLOBAL event_scheduler = ON;

DELIMITER $$

-- 1. Hourly metering (demo mode: runs every 1 minute)
-- Records 1/60 cpu_hour usage for all currently running instances
DROP EVENT IF EXISTS ev_hourly_metering$$
CREATE EVENT IF NOT EXISTS ev_hourly_metering
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
  DECLARE v_inst_id INT;
  DECLARE v_done INT DEFAULT 0;
  DECLARE cur_running CURSOR FOR
    SELECT instance_id FROM instances WHERE status = 'running';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

  OPEN cur_running;
  meter_loop: LOOP
    FETCH cur_running INTO v_inst_id;
    IF v_done = 1 THEN
      LEAVE meter_loop;
    END IF;
    -- 1/60th hour = 0.017 CPU hours
    CALL sp_record_usage(v_inst_id, 'cpu_hour', 0.017);
  END LOOP;
  CLOSE cur_running;
END$$

-- 2. Nightly usage rollup (runs daily at 00:15)
-- Aggregates raw usage records from yesterday into daily_usage_summary
DROP EVENT IF EXISTS ev_nightly_rollup$$
CREATE EVENT IF NOT EXISTS ev_nightly_rollup
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY) + INTERVAL 15 MINUTE)
DO
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
  CALL sp_rollup_daily_usage(DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY));
END$$

-- 3. Monthly invoicing (runs on the 1st of each month at 01:00)
-- Generates billing invoices for all active organizations for the previous month
DROP EVENT IF EXISTS ev_monthly_invoicing$$
CREATE EVENT IF NOT EXISTS ev_monthly_invoicing
ON SCHEDULE EVERY 1 MONTH
STARTS (TIMESTAMP(DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH), '%Y-%m-01')) + INTERVAL 1 HOUR)
DO
BEGIN
  DECLARE v_p_start DATE;
  DECLARE v_p_end DATE;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

  SET v_p_start = DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH);
  SET v_p_end = LAST_DAY(v_p_start);

  CALL sp_run_monthly_billing(v_p_start, v_p_end);
END$$

-- 4. Suspend overdue accounts (runs daily at 06:00)
-- Marks overdue invoices, suspends organizations overdue > 30 days, suspends their instances
DROP EVENT IF EXISTS ev_suspend_overdue$$
CREATE EVENT IF NOT EXISTS ev_suspend_overdue
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY) + INTERVAL 6 HOUR)
DO
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

  -- Step 1: Transition issued invoices past their due date to overdue
  UPDATE invoices
  SET status = 'overdue'
  WHERE status = 'issued' AND due_date < CURRENT_DATE;

  -- Step 2: Suspend active organizations with invoices overdue by more than 30 days
  UPDATE organizations
  SET status = 'suspended'
  WHERE status = 'active'
    AND org_id IN (
      SELECT DISTINCT org_id
      FROM invoices
      WHERE status = 'overdue' AND DATEDIFF(CURRENT_DATE, due_date) > 30
    );

  -- Step 3: Suspend running instances belonging to suspended organizations
  UPDATE instances i
  JOIN organizations o ON o.org_id = i.org_id
  SET i.status = 'suspended'
  WHERE o.status = 'suspended' AND i.status = 'running';
END$$

-- 5. Monthly usage partition cleanup (runs monthly)
-- Drops monthly partitions older than 12 months
DROP EVENT IF EXISTS ev_purge_usage$$
CREATE EVENT IF NOT EXISTS ev_purge_usage
ON SCHEDULE EVERY 1 MONTH
DO
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
  CALL sp_drop_old_partitions(12);
END$$

DELIMITER ;
