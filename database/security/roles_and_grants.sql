-- ============================================================
-- NimbusHost | database/security/roles_and_grants.sql
-- Database-level security (DCL): roles, accounts, least-privilege grants.
--
-- This script is NOT part of the numbered migrations. Run it by hand as root:
--   mysql -u root -p < database/security/roles_and_grants.sql
--
-- What it demonstrates:
--   * roles (CREATE ROLE / GRANT role / SET DEFAULT ROLE)
--   * least privilege: each role gets only what it needs
--   * column-level privilege (billing may change only credit_balance)
--   * SQL SECURITY DEFINER: customers can EXECUTE a procedure without having any
--     privilege on the tables the procedure touches (the procedure runs with its
--     definer's rights)
--
-- The Node API still connects with one account (DB_USER) because its routes also
-- query base tables directly. To run the API on these accounts, put them in
-- backend/.env as DB_CUSTOMER_USER / DB_SUPPORT_USER / DB_BILLING_USER / DB_ADMIN_USER
-- and extend the grants below for any route that reports "command denied".
--
-- CHANGE THESE PASSWORDS before using the accounts anywhere except your own laptop.
-- ============================================================

CREATE ROLE IF NOT EXISTS 'nimbus_customer', 'nimbus_support', 'nimbus_billing', 'nimbus_admin', 'nimbus_analyst';

-- ---------------- customer: tenant-scoped views, catalog, and procedures only ----------------
GRANT SELECT ON nimbushost.v_my_instances   TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_my_volumes     TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_my_invoices    TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_my_tickets     TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_my_usage       TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_images         TO 'nimbus_customer';
GRANT SELECT ON nimbushost.v_current_pricing TO 'nimbus_customer';
GRANT SELECT ON nimbushost.regions          TO 'nimbus_customer';
GRANT SELECT ON nimbushost.instance_types   TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_launch_instance     TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_set_instance_status TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_terminate_instance  TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_resize_instance     TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_create_volume       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_attach_volume       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_detach_volume       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_resize_volume       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_delete_volume       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_take_snapshot       TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_restore_snapshot    TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_delete_snapshot     TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_register_domain     TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_renew_domain        TO 'nimbus_customer';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_apply_payment       TO 'nimbus_customer';
GRANT INSERT ON nimbushost.tickets          TO 'nimbus_customer';
GRANT INSERT ON nimbushost.ticket_messages  TO 'nimbus_customer';

-- ---------------- support: tickets and customer lookup ----------------
GRANT SELECT, INSERT, UPDATE ON nimbushost.tickets         TO 'nimbus_support';
GRANT SELECT, INSERT         ON nimbushost.ticket_messages TO 'nimbus_support';
GRANT SELECT ON nimbushost.v_ticket_sla    TO 'nimbus_support';
GRANT SELECT ON nimbushost.v_instances     TO 'nimbus_support';
GRANT SELECT ON nimbushost.organizations   TO 'nimbus_support';
GRANT SELECT ON nimbushost.account_tiers   TO 'nimbus_support';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_set_instance_status TO 'nimbus_support';

-- ---------------- billing: money tables, one column on organizations ----------------
GRANT SELECT ON nimbushost.invoices        TO 'nimbus_billing';
GRANT SELECT ON nimbushost.invoice_items   TO 'nimbus_billing';
GRANT SELECT ON nimbushost.payments        TO 'nimbus_billing';
GRANT SELECT ON nimbushost.organizations   TO 'nimbus_billing';
GRANT SELECT ON nimbushost.usage_records   TO 'nimbus_billing';
GRANT SELECT ON nimbushost.v_invoices        TO 'nimbus_billing';   -- derived tax and total
GRANT SELECT ON nimbushost.v_invoice_items   TO 'nimbus_billing';   -- derived line amount
GRANT SELECT ON nimbushost.v_usage_records   TO 'nimbus_billing';   -- usage with organization
GRANT SELECT ON nimbushost.v_org_monthly_cost TO 'nimbus_billing';
GRANT SELECT ON nimbushost.v_overdue_invoices TO 'nimbus_billing';
GRANT UPDATE (credit_balance) ON nimbushost.organizations TO 'nimbus_billing';   -- column-level privilege
GRANT EXECUTE ON PROCEDURE nimbushost.sp_generate_invoice     TO 'nimbus_billing';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_run_monthly_billing  TO 'nimbus_billing';
GRANT EXECUTE ON PROCEDURE nimbushost.sp_apply_payment        TO 'nimbus_billing';

-- ---------------- analyst: read-only reporting ----------------
GRANT SELECT ON nimbushost.v_star_usage_monthly TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.fact_usage_daily     TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.dim_date             TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.dim_month            TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.dim_weekday          TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.dim_org              TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.dim_type             TO 'nimbus_analyst';
GRANT SELECT ON nimbushost.v_revenue_by_region  TO 'nimbus_analyst';

-- ---------------- admin: everything inside the application database ----------------
GRANT ALL PRIVILEGES ON nimbushost.* TO 'nimbus_admin';

-- ---------------- accounts (one per role) ----------------
CREATE USER IF NOT EXISTS 'nimbus_customer_app'@'localhost' IDENTIFIED BY 'Change_Me_Customer_1';
CREATE USER IF NOT EXISTS 'nimbus_support_app'@'localhost'  IDENTIFIED BY 'Change_Me_Support_1';
CREATE USER IF NOT EXISTS 'nimbus_billing_app'@'localhost'  IDENTIFIED BY 'Change_Me_Billing_1';
CREATE USER IF NOT EXISTS 'nimbus_admin_app'@'localhost'    IDENTIFIED BY 'Change_Me_Admin_1';
CREATE USER IF NOT EXISTS 'nimbus_analyst_app'@'localhost'  IDENTIFIED BY 'Change_Me_Analyst_1';

GRANT 'nimbus_customer' TO 'nimbus_customer_app'@'localhost';
GRANT 'nimbus_support'  TO 'nimbus_support_app'@'localhost';
GRANT 'nimbus_billing'  TO 'nimbus_billing_app'@'localhost';
GRANT 'nimbus_admin'    TO 'nimbus_admin_app'@'localhost';
GRANT 'nimbus_analyst'  TO 'nimbus_analyst_app'@'localhost';

SET DEFAULT ROLE ALL TO
  'nimbus_customer_app'@'localhost', 'nimbus_support_app'@'localhost', 'nimbus_billing_app'@'localhost',
  'nimbus_admin_app'@'localhost',    'nimbus_analyst_app'@'localhost';

-- ============================================================
-- DEMONSTRATION (run each line in a terminal and keep the output for the report)
--
--  mysql -u nimbus_customer_app -p -e "SELECT * FROM nimbushost.users LIMIT 1"
--      -> ERROR 1142: SELECT command denied  (customers cannot read user accounts or password hashes)
--
--  mysql -u nimbus_customer_app -p -e "DELETE FROM nimbushost.invoices"
--      -> ERROR 1142: DELETE command denied
--
--  mysql -u nimbus_customer_app -p -e "SELECT COUNT(*) FROM nimbushost.v_my_instances"
--      -> works (the view filters on the session's organization id; with no organization set it returns 0 rows)
--
--  mysql -u nimbus_billing_app -p -e "UPDATE nimbushost.organizations SET credit_balance = credit_balance + 1 WHERE org_id = 1"
--      -> works (column-level privilege)
--  mysql -u nimbus_billing_app -p -e "UPDATE nimbushost.organizations SET name = 'x' WHERE org_id = 1"
--      -> ERROR 1143: UPDATE command denied for column 'name'
--
--  mysql -u nimbus_analyst_app -p -e "SELECT * FROM nimbushost.v_star_usage_monthly LIMIT 5"
--      -> works (read-only reporting)
--  mysql -u nimbus_analyst_app -p -e "INSERT INTO nimbushost.regions(code,name,country) VALUES ('x','x','x')"
--      -> ERROR 1142: INSERT command denied
--
-- Inspect what a role can do:
--   SHOW GRANTS FOR 'nimbus_customer_app'@'localhost' USING 'nimbus_customer';
--
-- Undo everything:
--   DROP USER IF EXISTS 'nimbus_customer_app'@'localhost', 'nimbus_support_app'@'localhost',
--        'nimbus_billing_app'@'localhost', 'nimbus_admin_app'@'localhost', 'nimbus_analyst_app'@'localhost';
--   DROP ROLE IF EXISTS 'nimbus_customer', 'nimbus_support', 'nimbus_billing', 'nimbus_admin', 'nimbus_analyst';
-- ============================================================
