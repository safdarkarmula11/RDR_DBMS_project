-- ============================================================
-- NimbusHost | 01_schema.sql
-- All tables, constraints, FK policy, indexes
-- Requires MySQL 8.0.16+ (CHECK), 8.0.1+ (SKIP LOCKED)
-- Idempotent: DROP IF EXISTS for dev; run on fresh server
-- ============================================================

SELECT CONCAT('NimbusHost schema installing on MySQL ', VERSION()) AS info;

SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ============================================================
-- 1. IDENTITY AND TENANCY
-- ============================================================

DROP TABLE IF EXISTS account_tiers;
CREATE TABLE account_tiers (
  tier_id        INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(40)   NOT NULL UNIQUE,
  max_instances  INT           NOT NULL,
  max_storage_gb INT           NOT NULL,
  discount_pct   DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
  CONSTRAINT chk_tier_limits   CHECK (max_instances > 0 AND max_storage_gb > 0),
  CONSTRAINT chk_tier_discount CHECK (discount_pct BETWEEN 0 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS organizations;
CREATE TABLE organizations (
  org_id         INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120)  NOT NULL UNIQUE,
  tier_id        INT           NOT NULL,
  parent_org_id  INT           NULL,
  status         ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_tier   FOREIGN KEY (tier_id)       REFERENCES account_tiers(tier_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_parent FOREIGN KEY (parent_org_id) REFERENCES organizations(org_id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_org_credit CHECK (credit_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  user_id       INT          AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  system_role   ENUM('super_admin','support','billing','customer') NOT NULL DEFAULT 'customer',
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  failed_logins INT          NOT NULL DEFAULT 0,
  locked_until  TIMESTAMP    NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (system_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS org_members;
CREATE TABLE org_members (
  org_id      INT NOT NULL,
  user_id     INT NOT NULL,
  member_role ENUM('owner','member') NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT fk_om_org  FOREIGN KEY (org_id)  REFERENCES organizations(org_id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users(user_id)        ON DELETE CASCADE  ON UPDATE RESTRICT,
  INDEX idx_om_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS api_keys;
CREATE TABLE api_keys (
  key_id     INT          AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  key_hash   VARCHAR(64)  NOT NULL UNIQUE,
  label      VARCHAR(100) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked    BOOLEAN      NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_ak_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  INDEX idx_ak_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS refresh_tokens;
CREATE TABLE refresh_tokens (
  token_id   BIGINT       AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  family_id  VARCHAR(36)  NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  revoked_at TIMESTAMP    NULL DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  INDEX idx_rt_family (family_id),
  INDEX idx_rt_user   (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. INFRASTRUCTURE
-- ============================================================

DROP TABLE IF EXISTS regions;
CREATE TABLE regions (
  region_id INT          AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(20)  NOT NULL UNIQUE,
  name      VARCHAR(60)  NOT NULL,
  country   VARCHAR(60)  NOT NULL,
  status    ENUM('active','inactive') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS hosts;
CREATE TABLE hosts (
  host_id       INT          AUTO_INCREMENT PRIMARY KEY,
  region_id     INT          NOT NULL,
  hostname      VARCHAR(60)  NOT NULL UNIQUE,
  total_vcpu    INT          NOT NULL,
  total_ram_gb  INT          NOT NULL,
  total_disk_gb INT          NOT NULL,
  used_vcpu     INT          NOT NULL DEFAULT 0,
  used_ram_gb   INT          NOT NULL DEFAULT 0,
  used_disk_gb  INT          NOT NULL DEFAULT 0,
  status        ENUM('active','maintenance','retired') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_host_region    FOREIGN KEY (region_id) REFERENCES regions(region_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_host_totals   CHECK (total_vcpu > 0 AND total_ram_gb > 0 AND total_disk_gb > 0),
  CONSTRAINT chk_host_used     CHECK (used_vcpu >= 0 AND used_ram_gb >= 0 AND used_disk_gb >= 0),
  CONSTRAINT chk_host_capacity CHECK (used_vcpu <= total_vcpu AND used_ram_gb <= total_ram_gb AND used_disk_gb <= total_disk_gb),
  INDEX idx_host_region_status (region_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS instance_types;
CREATE TABLE instance_types (
  type_id INT         AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(40) NOT NULL UNIQUE,
  family  ENUM('general','compute','memory') NOT NULL DEFAULT 'general',
  vcpu    INT         NOT NULL,
  ram_gb  INT         NOT NULL,
  disk_gb INT         NOT NULL,
  active  BOOLEAN     NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_type_specs CHECK (vcpu > 0 AND ram_gb > 0 AND disk_gb > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pricing;
CREATE TABLE pricing (
  price_id       INT          AUTO_INCREMENT PRIMARY KEY,
  type_id        INT          NOT NULL,
  price_per_hour DECIMAL(8,4) NOT NULL,
  valid_from     DATE         NOT NULL,
  valid_to       DATE         NULL,
  CONSTRAINT fk_price_type      FOREIGN KEY (type_id) REFERENCES instance_types(type_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_price_positive CHECK (price_per_hour > 0),
  CONSTRAINT chk_price_range    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE KEY uq_price_start (type_id, valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS images;
CREATE TABLE images (
  image_id    INT         AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  os_family   ENUM('linux','windows','bsd') NOT NULL,
  version     VARCHAR(20) NOT NULL,
  min_disk_gb INT         NOT NULL DEFAULT 10,
  UNIQUE KEY uq_image (name, version),
  CONSTRAINT chk_image_disk CHECK (min_disk_gb > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. COMPUTE
-- ============================================================

DROP TABLE IF EXISTS instances;
CREATE TABLE instances (
  instance_id     INT          AUTO_INCREMENT PRIMARY KEY,
  org_id          INT          NOT NULL,
  host_id         INT          NOT NULL,
  type_id         INT          NOT NULL,
  image_id        INT          NOT NULL,
  name            VARCHAR(40)  NOT NULL,
  status          ENUM('pending','running','stopped','suspended','terminated') NOT NULL DEFAULT 'pending',
  config          JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  auto_backup     TINYINT(1)   GENERATED ALWAYS AS (
                    IFNULL(JSON_UNQUOTE(JSON_EXTRACT(config, '$.auto_backup')) = 'true', 0)
                  ) STORED,
  live_name       VARCHAR(40)  GENERATED ALWAYS AS (
                    IF(status = 'terminated', NULL, name)
                  ) STORED,
  idempotency_key VARCHAR(64)  NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminated_at   TIMESTAMP    NULL DEFAULT NULL,
  CONSTRAINT fk_inst_org   FOREIGN KEY (org_id)   REFERENCES organizations(org_id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inst_host  FOREIGN KEY (host_id)  REFERENCES hosts(host_id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inst_type  FOREIGN KEY (type_id)  REFERENCES instance_types(type_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inst_image FOREIGN KEY (image_id) REFERENCES images(image_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_inst_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  UNIQUE KEY uq_inst_live_name    (org_id, live_name),
  UNIQUE KEY uq_inst_idempotency  (idempotency_key),
  INDEX idx_inst_org_status  (org_id, status),
  INDEX idx_inst_host_status (host_id, status),
  INDEX idx_inst_auto_backup (auto_backup)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS ip_addresses;
CREATE TABLE ip_addresses (
  ip_id        INT         AUTO_INCREMENT PRIMARY KEY,
  region_id    INT         NOT NULL,
  ip_address   VARCHAR(15) NOT NULL UNIQUE,
  instance_id  INT         NULL UNIQUE,
  allocated_at TIMESTAMP   NULL DEFAULT NULL,
  CONSTRAINT fk_ip_region   FOREIGN KEY (region_id)   REFERENCES regions(region_id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ip_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE SET NULL ON UPDATE RESTRICT,
  INDEX idx_ip_free (region_id, instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. STORAGE AND NETWORK
-- ============================================================

DROP TABLE IF EXISTS volumes;
CREATE TABLE volumes (
  volume_id   INT         AUTO_INCREMENT PRIMARY KEY,
  org_id      INT         NOT NULL,
  region_id   INT         NOT NULL,
  instance_id INT         NULL,
  name        VARCHAR(40) NOT NULL,
  size_gb     INT         NOT NULL,
  vol_type    ENUM('ssd','hdd') NOT NULL DEFAULT 'ssd',
  status      ENUM('available','attached','deleted') NOT NULL DEFAULT 'available',
  live_name   VARCHAR(40) GENERATED ALWAYS AS (IF(status = 'deleted', NULL, name)) STORED,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP   NULL DEFAULT NULL,
  CONSTRAINT fk_vol_org      FOREIGN KEY (org_id)      REFERENCES organizations(org_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vol_region   FOREIGN KEY (region_id)   REFERENCES regions(region_id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vol_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT chk_vol_size CHECK (size_gb BETWEEN 1 AND 16000),
  CONSTRAINT chk_vol_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  UNIQUE KEY uq_vol_live_name (org_id, live_name),
  INDEX idx_vol_org_status (org_id, status),
  INDEX idx_vol_instance   (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS snapshots;
CREATE TABLE snapshots (
  snapshot_id INT         AUTO_INCREMENT PRIMARY KEY,
  volume_id   INT         NOT NULL,
  name        VARCHAR(40) NOT NULL,
  size_gb     INT         NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_snap_volume FOREIGN KEY (volume_id) REFERENCES volumes(volume_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_snap_size CHECK (size_gb > 0),
  CONSTRAINT chk_snap_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  UNIQUE KEY uq_snap_name (volume_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS domains;
CREATE TABLE domains (
  domain_id     INT          AUTO_INCREMENT PRIMARY KEY,
  org_id        INT          NOT NULL,
  name          VARCHAR(100) NOT NULL UNIQUE,
  registered_on DATE         NOT NULL,
  expires_on    DATE         NOT NULL,
  auto_renew    BOOLEAN      NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_dom_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_dom_dates CHECK (expires_on > registered_on),
  CONSTRAINT chk_dom_name  CHECK (name REGEXP '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS dns_records;
CREATE TABLE dns_records (
  record_id INT          AUTO_INCREMENT PRIMARY KEY,
  domain_id INT          NOT NULL,
  rtype     ENUM('A','AAAA','CNAME','MX','TXT') NOT NULL,
  name      VARCHAR(63)  NOT NULL DEFAULT '@',
  value     VARCHAR(255) NOT NULL,
  ttl       INT          NOT NULL DEFAULT 3600,
  priority  SMALLINT     NULL,
  CONSTRAINT fk_dns_domain FOREIGN KEY (domain_id) REFERENCES domains(domain_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_dns_ttl CHECK (ttl BETWEEN 60 AND 86400),
  UNIQUE KEY uq_dns (domain_id, rtype, name, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. USAGE AND METERING (partitioned)
-- ============================================================
-- Partition column (recorded_at) must be DATETIME (TIMESTAMP not supported in RANGE COLUMNS).
-- No FKs allowed on partitioned tables in MySQL; integrity enforced by sp_record_usage + triggers.
-- type_id stored at metering time to correctly price usage after resizes (spec 4.5.1).

DROP TABLE IF EXISTS usage_records;
CREATE TABLE usage_records (
  usage_id    BIGINT          AUTO_INCREMENT,
  recorded_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  instance_id INT             NOT NULL,
  org_id      INT             NOT NULL,
  type_id     INT             NOT NULL,
  metric      ENUM('cpu_hour','storage_gb','egress_gb') NOT NULL,
  quantity    DECIMAL(10,3)   NOT NULL,
  PRIMARY KEY (usage_id, recorded_at),
  CONSTRAINT chk_usage_qty CHECK (quantity >= 0),
  INDEX idx_usage_instance (instance_id, recorded_at),
  INDEX idx_usage_org      (org_id, recorded_at),
  INDEX idx_usage_cover    (instance_id, recorded_at, metric, quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE COLUMNS(recorded_at) (
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION p2026_09 VALUES LESS THAN ('2026-10-01'),
  PARTITION p2026_10 VALUES LESS THAN ('2026-11-01'),
  PARTITION p2026_11 VALUES LESS THAN ('2026-12-01'),
  PARTITION p2026_12 VALUES LESS THAN ('2027-01-01'),
  PARTITION p2027_01 VALUES LESS THAN ('2027-02-01'),
  PARTITION p2027_02 VALUES LESS THAN ('2027-03-01'),
  PARTITION p2027_03 VALUES LESS THAN ('2027-04-01'),
  PARTITION p2027_04 VALUES LESS THAN ('2027-05-01'),
  PARTITION p2027_05 VALUES LESS THAN ('2027-06-01'),
  PARTITION p2027_06 VALUES LESS THAN ('2027-07-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

-- ============================================================
-- 6. BILLING
-- ============================================================

DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (
  invoice_id     INT           AUTO_INCREMENT PRIMARY KEY,
  org_id         INT           NOT NULL,
  period_start   DATE          NOT NULL,
  period_end     DATE          NOT NULL,
  subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  credit_applied DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status         ENUM('draft','issued','paid','overdue','void') NOT NULL DEFAULT 'draft',
  issued_at      TIMESTAMP     NULL DEFAULT NULL,
  due_date       DATE          NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_inv_total    CHECK (total = subtotal + tax - credit_applied),
  CONSTRAINT chk_inv_due_date CHECK (due_date IS NULL OR issued_at IS NULL OR due_date >= DATE(issued_at)),
  CONSTRAINT chk_inv_period   CHECK (period_end >= period_start),
  UNIQUE KEY uq_inv_org_period (org_id, period_start),
  INDEX idx_inv_status    (status),
  INDEX idx_inv_due       (status, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS invoice_items;
CREATE TABLE invoice_items (
  item_id      INT           AUTO_INCREMENT PRIMARY KEY,
  invoice_id   INT           NOT NULL,
  instance_id  INT           NULL,
  description  VARCHAR(255)  NOT NULL,
  quantity     DECIMAL(10,3) NOT NULL,
  unit_price   DECIMAL(8,4)  NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_ii_invoice  FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ii_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT chk_ii_amount  CHECK (amount = ROUND(quantity * unit_price, 2)),
  INDEX idx_ii_invoice (invoice_id),
  INDEX idx_ii_instance (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS payments;
CREATE TABLE payments (
  payment_id      INT           AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT           NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  method          ENUM('card','upi','netbanking','credit') NOT NULL,
  txn_ref         VARCHAR(100)  NOT NULL UNIQUE,
  paid_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(64)   NULL UNIQUE,
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_pay_amount CHECK (amount > 0),
  INDEX idx_pay_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. SUPPORT
-- ============================================================

DROP TABLE IF EXISTS tickets;
CREATE TABLE tickets (
  ticket_id   INT          AUTO_INCREMENT PRIMARY KEY,
  org_id      INT          NOT NULL,
  created_by  INT          NOT NULL,
  assigned_to INT          NULL,
  subject     VARCHAR(200) NOT NULL,
  priority    ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status      ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tkt_org      FOREIGN KEY (org_id)      REFERENCES organizations(org_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tkt_creator  FOREIGN KEY (created_by)  REFERENCES users(user_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tkt_assignee FOREIGN KEY (assigned_to) REFERENCES users(user_id)        ON DELETE SET NULL ON UPDATE RESTRICT,
  INDEX idx_tkt_org    (org_id),
  INDEX idx_tkt_status (status, priority),
  INDEX idx_tkt_agent  (assigned_to, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS ticket_messages;
CREATE TABLE ticket_messages (
  message_id INT       AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT       NOT NULL,
  sender_id  INT       NOT NULL,
  body       TEXT      NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_tm_sender FOREIGN KEY (sender_id) REFERENCES users(user_id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  INDEX idx_tm_ticket (ticket_id, created_at),
  FULLTEXT KEY ft_tm_body (body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. AUDIT AND SECURITY LOGGING
-- ============================================================

DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  audit_id   BIGINT       AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(40)  NOT NULL,
  record_id  BIGINT       NOT NULL,
  action     ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  old_data   JSON         NULL,
  new_data   JSON         NULL,
  changed_by INT          NOT NULL DEFAULT 0,
  changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_record (table_name, record_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS security_log;
CREATE TABLE security_log (
  log_id     BIGINT       AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('login_success','login_failure','logout','token_refresh','lockout','api_key_use','reuse_detected') NOT NULL,
  user_id    INT          NULL,
  ip_address VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  detail     JSON         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seclog_user  (user_id, created_at),
  INDEX idx_seclog_event (event_type, created_at),
  INDEX idx_seclog_ip    (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. BILLING ERRORS AND SUMMARIES
-- ============================================================

DROP TABLE IF EXISTS billing_errors;
CREATE TABLE billing_errors (
  error_id      INT       AUTO_INCREMENT PRIMARY KEY,
  org_id        INT       NULL,
  error_message TEXT      NOT NULL,
  context       JSON      NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_be_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS daily_usage_summary;
CREATE TABLE daily_usage_summary (
  usage_date   DATE          NOT NULL,
  org_id       INT           NOT NULL,
  cpu_hours    DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  storage_gb_hours DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  egress_gb    DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  record_count INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, org_id),
  INDEX idx_dus_org (org_id, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. STAR SCHEMA (analytics)
-- ============================================================

DROP TABLE IF EXISTS dim_date;
CREATE TABLE dim_date (
  date_key    INT         PRIMARY KEY,
  full_date   DATE        NOT NULL UNIQUE,
  year        SMALLINT    NOT NULL,
  quarter     TINYINT     NOT NULL,
  month       TINYINT     NOT NULL,
  day         TINYINT     NOT NULL,
  day_of_week TINYINT     NOT NULL,
  month_name  VARCHAR(10) NOT NULL,
  is_weekend  BOOLEAN     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS dim_org;
CREATE TABLE dim_org (
  org_key   INT          AUTO_INCREMENT PRIMARY KEY,
  org_id    INT          NOT NULL UNIQUE,
  org_name  VARCHAR(120) NOT NULL,
  tier_name VARCHAR(40)  NULL,
  status    VARCHAR(20)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS dim_type;
CREATE TABLE dim_type (
  type_key  INT         AUTO_INCREMENT PRIMARY KEY,
  type_id   INT         NOT NULL UNIQUE,
  type_name VARCHAR(40) NOT NULL,
  family    VARCHAR(20) NULL,
  vcpu      INT         NULL,
  ram_gb    INT         NULL,
  disk_gb   INT         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS fact_usage_daily;
CREATE TABLE fact_usage_daily (
  fact_id        BIGINT        AUTO_INCREMENT PRIMARY KEY,
  date_key       INT           NOT NULL,
  org_key        INT           NOT NULL,
  type_key       INT           NOT NULL,
  metric         VARCHAR(20)   NOT NULL,
  total_quantity DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  record_count   INT           NOT NULL DEFAULT 0,
  CONSTRAINT fk_fud_date FOREIGN KEY (date_key) REFERENCES dim_date(date_key) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fud_org  FOREIGN KEY (org_key)  REFERENCES dim_org(org_key)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fud_type FOREIGN KEY (type_key) REFERENCES dim_type(type_key) ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_fact (date_key, org_key, type_key, metric),
  INDEX idx_fact_org  (org_key, date_key),
  INDEX idx_fact_type (type_key, date_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RESTORE
-- ============================================================
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_MODE = @OLD_SQL_MODE;

SELECT 'Schema installation complete' AS info;

