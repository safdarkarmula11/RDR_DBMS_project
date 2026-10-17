-- ============================================================
-- NimbusHost  |  Step 1: identity, tenancy and audit foundation
-- Run through the runner:  cd backend && npm run db:setup
-- (the runner creates the database and selects it first)
-- ============================================================

CREATE TABLE account_tiers (
  tier_id         INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(40) NOT NULL UNIQUE,
  max_instances   INT NOT NULL,
  max_storage_gb  INT NOT NULL,
  discount_pct    DECIMAL(4,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_tier_limits   CHECK (max_instances > 0 AND max_storage_gb > 0),
  CONSTRAINT chk_tier_discount CHECK (discount_pct BETWEEN 0 AND 50)
);

CREATE TABLE organizations (
  org_id         INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120) NOT NULL UNIQUE,
  tier_id        INT NOT NULL,
  parent_org_id  INT NULL,
  status         ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_tier   FOREIGN KEY (tier_id)       REFERENCES account_tiers(tier_id)  ON DELETE RESTRICT,
  CONSTRAINT fk_org_parent FOREIGN KEY (parent_org_id) REFERENCES organizations(org_id)   ON DELETE RESTRICT,
  CONSTRAINT chk_org_credit CHECK (credit_balance >= 0)
);

CREATE TABLE users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  system_role   ENUM('super_admin','support','billing','customer') NOT NULL DEFAULT 'customer',
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- M:N between users and organizations
CREATE TABLE org_members (
  org_id      INT NOT NULL,
  user_id     INT NOT NULL,
  member_role ENUM('owner','member') NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT fk_om_org  FOREIGN KEY (org_id)  REFERENCES organizations(org_id) ON DELETE CASCADE,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users(user_id)        ON DELETE CASCADE
);

-- Written by triggers only (triggers are added in a later step)
CREATE TABLE audit_log (
  audit_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name  VARCHAR(40) NOT NULL,
  record_id   BIGINT NOT NULL,
  action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  old_data    JSON NULL,
  new_data    JSON NULL,
  changed_by  INT NOT NULL DEFAULT 0,
  changed_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_record (table_name, record_id, changed_at)
);
