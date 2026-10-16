-- ============================================================
-- Step 4: storage (volumes, snapshots) and network (domains, DNS records)
-- ============================================================

CREATE TABLE volumes (
  volume_id   INT AUTO_INCREMENT PRIMARY KEY,
  org_id      INT NOT NULL,
  region_id   INT NOT NULL,
  instance_id INT NULL,
  name        VARCHAR(40) NOT NULL,
  size_gb     INT NOT NULL,
  vol_type    ENUM('ssd','hdd') NOT NULL DEFAULT 'ssd',
  status      ENUM('available','attached','deleted') NOT NULL DEFAULT 'available',
  live_name   VARCHAR(40) GENERATED ALWAYS AS (IF(status = 'deleted', NULL, name)) STORED,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  CONSTRAINT fk_vol_org      FOREIGN KEY (org_id)      REFERENCES organizations(org_id) ON DELETE RESTRICT,
  CONSTRAINT fk_vol_region   FOREIGN KEY (region_id)   REFERENCES regions(region_id)    ON DELETE RESTRICT,
  CONSTRAINT fk_vol_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE SET NULL,
  CONSTRAINT chk_vol_size CHECK (size_gb BETWEEN 1 AND 16000),
  CONSTRAINT chk_vol_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  UNIQUE KEY uq_vol_live_name (org_id, live_name),
  INDEX idx_vol_org_status (org_id, status),
  INDEX idx_vol_instance (instance_id)
);

CREATE TABLE snapshots (
  snapshot_id INT AUTO_INCREMENT PRIMARY KEY,
  volume_id   INT NOT NULL,
  name        VARCHAR(40) NOT NULL,
  size_gb     INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_snap_volume FOREIGN KEY (volume_id) REFERENCES volumes(volume_id) ON DELETE RESTRICT,
  CONSTRAINT chk_snap_size CHECK (size_gb > 0),
  CONSTRAINT chk_snap_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  UNIQUE KEY uq_snap_name (volume_id, name)
);

CREATE TABLE domains (
  domain_id     INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NOT NULL,
  name          VARCHAR(100) NOT NULL UNIQUE,
  registered_on DATE NOT NULL,
  expires_on    DATE NOT NULL,
  auto_renew    BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_dom_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE RESTRICT,
  CONSTRAINT chk_dom_dates CHECK (expires_on > registered_on),
  CONSTRAINT chk_dom_name  CHECK (name REGEXP '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$')
);

CREATE TABLE dns_records (
  record_id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  rtype     ENUM('A','AAAA','CNAME','MX','TXT') NOT NULL,
  name      VARCHAR(63) NOT NULL DEFAULT '@',
  value     VARCHAR(255) NOT NULL,
  ttl       INT NOT NULL DEFAULT 3600,
  priority  SMALLINT NULL,
  CONSTRAINT fk_dns_domain FOREIGN KEY (domain_id) REFERENCES domains(domain_id) ON DELETE CASCADE,
  CONSTRAINT chk_dns_ttl CHECK (ttl BETWEEN 60 AND 86400),
  UNIQUE KEY uq_dns (domain_id, rtype, name, value)
);