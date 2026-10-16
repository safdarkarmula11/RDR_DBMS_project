-- ============================================================
-- Step 2: infrastructure (regions, hosts), catalog (instance types, images) and temporal pricing
-- ============================================================

CREATE TABLE regions (
  region_id INT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(20) NOT NULL UNIQUE,
  name      VARCHAR(60) NOT NULL,
  country   VARCHAR(60) NOT NULL,
  status    ENUM('active','inactive') NOT NULL DEFAULT 'active'
);

CREATE TABLE hosts (
  host_id        INT AUTO_INCREMENT PRIMARY KEY,
  region_id      INT NOT NULL,
  hostname       VARCHAR(60) NOT NULL UNIQUE,
  total_vcpu     INT NOT NULL,
  total_ram_gb   INT NOT NULL,
  total_disk_gb  INT NOT NULL,
  used_vcpu      INT NOT NULL DEFAULT 0,   -- denormalized counters, maintained by triggers (Step 3)
  used_ram_gb    INT NOT NULL DEFAULT 0,
  used_disk_gb   INT NOT NULL DEFAULT 0,
  status         ENUM('active','maintenance','retired') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_host_region FOREIGN KEY (region_id) REFERENCES regions(region_id) ON DELETE RESTRICT,
  CONSTRAINT chk_host_totals   CHECK (total_vcpu > 0 AND total_ram_gb > 0 AND total_disk_gb > 0),
  CONSTRAINT chk_host_used     CHECK (used_vcpu >= 0 AND used_ram_gb >= 0 AND used_disk_gb >= 0),
  CONSTRAINT chk_host_capacity CHECK (used_vcpu <= total_vcpu AND used_ram_gb <= total_ram_gb AND used_disk_gb <= total_disk_gb),
  INDEX idx_host_region_status (region_id, status)
);

CREATE TABLE instance_types (
  type_id  INT AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(40) NOT NULL UNIQUE,
  family   ENUM('general','compute','memory') NOT NULL DEFAULT 'general',
  vcpu     INT NOT NULL,
  ram_gb   INT NOT NULL,
  disk_gb  INT NOT NULL,
  active   BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_type_specs CHECK (vcpu > 0 AND ram_gb > 0 AND disk_gb > 0)
);

CREATE TABLE images (
  image_id    INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  os_family   ENUM('linux','windows','bsd') NOT NULL,
  version     VARCHAR(20) NOT NULL,
  min_disk_gb INT NOT NULL DEFAULT 10,
  UNIQUE KEY uq_image (name, version),
  CONSTRAINT chk_image_disk CHECK (min_disk_gb > 0)
);

-- Temporal pricing: one row per price period. No two periods of the same type may overlap
-- (enforced by triggers in 04_infra_programs.sql). valid_to NULL = still current.
CREATE TABLE pricing (
  price_id       INT AUTO_INCREMENT PRIMARY KEY,
  type_id        INT NOT NULL,
  price_per_hour DECIMAL(8,4) NOT NULL,
  valid_from     DATE NOT NULL,
  valid_to       DATE NULL,
  CONSTRAINT fk_price_type FOREIGN KEY (type_id) REFERENCES instance_types(type_id) ON DELETE RESTRICT,
  CONSTRAINT chk_price_positive CHECK (price_per_hour > 0),
  CONSTRAINT chk_price_range    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE KEY uq_price_start (type_id, valid_from)
);
