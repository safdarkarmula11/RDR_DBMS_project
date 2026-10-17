-- ============================================================
-- NimbusHost | 11_consistency.sql
-- Database consistency audit procedure
-- ============================================================

DELIMITER $$

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
    FROM invoice_items
    GROUP BY invoice_id
  ) act ON act.invoice_id = inv.invoice_id
  WHERE inv.status <> 'draft' AND inv.subtotal <> COALESCE(act.sum_amt, 0.00);

  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'invoice_total_mismatch', invoice_id,
         CONCAT('Invoice ', invoice_id, ' total ', total, ' != subtotal ', subtotal, ' + tax ', tax, ' - credit ', credit_applied)
  FROM invoices
  WHERE total <> (subtotal + tax - credit_applied);

  -- Check 4: Paid invoices have sum(payments) >= total, unpaid have less
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'paid_invoice_underpaid', inv.invoice_id,
         CONCAT('Invoice ', inv.invoice_id, ' marked paid but payments sum to ', COALESCE(p.sum_pay, 0.00), ' < total ', inv.total)
  FROM invoices inv
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS sum_pay FROM payments GROUP BY invoice_id
  ) p ON p.invoice_id = inv.invoice_id
  WHERE inv.status = 'paid' AND COALESCE(p.sum_pay, 0.00) < inv.total;

  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT 'unpaid_invoice_fully_paid', inv.invoice_id,
         CONCAT('Invoice ', inv.invoice_id, ' status is ', inv.status, ' but payments sum to ', COALESCE(p.sum_pay, 0.00), ' >= total ', inv.total)
  FROM invoices inv
  JOIN (
    SELECT invoice_id, SUM(amount) AS sum_pay FROM payments GROUP BY invoice_id
  ) p ON p.invoice_id = inv.invoice_id
  WHERE inv.status IN ('issued', 'overdue') AND p.sum_pay >= inv.total AND inv.total > 0;

  -- Check 5: No orphan usage rows
  INSERT INTO tmp_consistency_errors (check_name, record_id, message)
  SELECT DISTINCT 'orphan_usage_record', u.usage_id,
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
    FROM usage_records
    GROUP BY DATE(recorded_at), org_id
  ) raw ON raw.u_date = dus.usage_date AND raw.org_id = dus.org_id
  WHERE dus.cpu_hours <> COALESCE(raw.sum_cpu, 0.000);

  SELECT check_name, record_id, message
  FROM tmp_consistency_errors
  ORDER BY check_name, record_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_consistency_errors;
END$$

DELIMITER ;
