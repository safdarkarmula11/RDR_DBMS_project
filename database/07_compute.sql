-- ============================================================
-- Step 3: compute  (instances and the public IP pool)
-- ============================================================

CREATE TABLE instances (
  instance_id   INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NOT NULL,
  host_id       INT NOT NULL,
  type_id       INT NOT NULL,
  image_id      INT NOT NULL,
  name          VARCHAR(40) NOT NULL,
  status        ENUM('running','stopped','suspended','terminated') NOT NULL DEFAULT 'running',
  config        JSON NOT NULL DEFAULT (JSON_OBJECT()),
  -- generated column: value read out of the JSON config (indexable, queryable like a normal column)
  auto_backup   TINYINT(1) GENERATED ALWAYS AS (IFNULL(JSON_UNQUOTE(JSON_EXTRACT(config, '$.auto_backup')) = 'true', 0)) STORED,
  -- generated column: lets a name be reused once its instance is terminated (NULLs do not collide in a UNIQUE key)
  live_name     VARCHAR(40) GENERATED ALWAYS AS (IF(status = 'terminated', NULL, name)) STORED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminated_at TIMESTAMP NULL,
  CONSTRAINT fk_inst_org   FOREIGN KEY (org_id)   REFERENCES organizations(org_id)   ON DELETE RESTRICT,
  CONSTRAINT fk_inst_host  FOREIGN KEY (host_id)  REFERENCES hosts(host_id)          ON DELETE RESTRICT,
  CONSTRAINT fk_inst_type  FOREIGN KEY (type_id)  REFERENCES instance_types(type_id) ON DELETE RESTRICT,
  CONSTRAINT fk_inst_image FOREIGN KEY (image_id) REFERENCES images(image_id)        ON DELETE RESTRICT,
  CONSTRAINT chk_inst_name CHECK (name REGEXP '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  UNIQUE KEY uq_inst_live_name (org_id, live_name),
  INDEX idx_inst_org_status  (org_id, status),
  INDEX idx_inst_host_status (host_id, status)
);

-- Pool of public IPs per region. instance_id NULL = free.
CREATE TABLE ip_addresses (
  ip_id        INT AUTO_INCREMENT PRIMARY KEY,
  region_id    INT NOT NULL,
  ip_address   VARCHAR(15) NOT NULL UNIQUE,
  instance_id  INT NULL UNIQUE,
  allocated_at TIMESTAMP NULL,
  CONSTRAINT fk_ip_region   FOREIGN KEY (region_id)   REFERENCES regions(region_id)     ON DELETE RESTRICT,
  CONSTRAINT fk_ip_instance FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE SET NULL,
  INDEX idx_ip_free (region_id, instance_id)
);
