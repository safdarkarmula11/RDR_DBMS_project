import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import {
  idParamSchema,
  createHostSchema,
  updateHostSchema,
  createRegionSchema,
  updateRegionSchema,
  createInstanceTypeSchema,
  updateInstanceTypeSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// View permission: super_admin, support, billing
const canView = requireRole('super_admin', 'support', 'billing');
// Admin mutation permission: super_admin only
const canManage = requireRole('super_admin');

// GET /infra/capacity - Capacity dashboard (hosts + ROLLUP regions)
router.get('/capacity', canView, async (req, res, next) => {
  try {
    const data = await withDb(req, async (conn) => {
      const [hosts] = await conn.execute(
        `SELECT * FROM v_host_capacity ORDER BY region_name ASC, hostname ASC`
      );

      const [regions] = await conn.execute(
        `SELECT IF(GROUPING(r.name), 'All regions', r.name) AS region,
                GROUPING(r.name) AS is_total,
                COUNT(*) AS hosts,
                SUM(h.total_vcpu) AS total_vcpu, SUM(h.used_vcpu) AS used_vcpu,
                SUM(h.total_ram_gb) AS total_ram_gb, SUM(h.used_ram_gb) AS used_ram_gb,
                SUM(h.total_disk_gb) AS total_disk_gb, SUM(h.used_disk_gb) AS used_disk_gb,
                ROUND(100 * SUM(h.used_vcpu) / SUM(h.total_vcpu), 1) AS cpu_pct,
                ROUND(100 * SUM(h.used_ram_gb) / SUM(h.total_ram_gb), 1) AS ram_pct,
                ROUND(100 * SUM(h.used_disk_gb) / SUM(h.total_disk_gb), 1) AS disk_pct
         FROM hosts h
         JOIN regions r ON r.region_id = h.region_id
         WHERE h.status = 'active'
         GROUP BY r.name WITH ROLLUP`
      );

      return { hosts, regions };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /infra/hosts - List hosts
router.get('/hosts', canView, async (req, res, next) => {
  try {
    const hosts = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT h.*, r.name AS region_name, r.code AS region_code,
                ROUND(100 * h.used_vcpu / h.total_vcpu, 1) AS cpu_pct,
                ROUND(100 * h.used_ram_gb / h.total_ram_gb, 1) AS ram_pct,
                ROUND(100 * h.used_disk_gb / h.total_disk_gb, 1) AS disk_pct
         FROM hosts h
         JOIN regions r ON r.region_id = h.region_id
         ORDER BY r.name ASC, h.hostname ASC`
      );
      return rows;
    });

    res.json(hosts);
  } catch (err) {
    next(err);
  }
});

// POST /infra/hosts - Add host
router.post('/hosts', canManage, validate({ body: createHostSchema }), async (req, res, next) => {
  try {
    const { region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb } = req.body;
    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        `INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb)
         VALUES (?, ?, ?, ?, ?)`,
        [region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb]
      );
      return { host_id: out.insertId, hostname };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /infra/hosts/:id - Update host
router.put(
  '/hosts/:id',
  canManage,
  validate({ params: idParamSchema, body: updateHostSchema }),
  async (req, res, next) => {
    try {
      const hostId = Number(req.params.id);
      const { status, total_vcpu, total_ram_gb, total_disk_gb } = req.body;

      const updates = [];
      const params = [];
      if (status) { updates.push('status = ?'); params.push(status); }
      if (total_vcpu) { updates.push('total_vcpu = ?'); params.push(total_vcpu); }
      if (total_ram_gb) { updates.push('total_ram_gb = ?'); params.push(total_ram_gb); }
      if (total_disk_gb) { updates.push('total_disk_gb = ?'); params.push(total_disk_gb); }

      if (updates.length > 0) {
        params.push(hostId);
        await withDb(req, async (conn) => {
          await conn.execute(
            `UPDATE hosts SET ${updates.join(', ')} WHERE host_id = ?`,
            params
          );
        });
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /infra/hosts/:id/status - Update host status
router.post(
  '/hosts/:id/status',
  canManage,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const hostId = Number(req.params.id);
      const { status } = req.body;
      if (!['active', 'maintenance', 'retired'].includes(status)) {
        return res.status(400).json({ code: 'INVALID', msg: 'Invalid host status' });
      }

      await withDb(req, async (conn) => {
        await conn.execute('UPDATE hosts SET status = ? WHERE host_id = ?', [status, hostId]);
      });

      res.json({ ok: true, status });
    } catch (err) {
      next(err);
    }
  }
);

// GET /infra/audit - System audit log with diffs
router.get('/audit', canView, async (req, res, next) => {
  try {
    const { table, record_id, action, limit = 50 } = req.query;
    const where = [];
    const params = [];

    if (table) {
      where.push('a.table_name = ?');
      params.push(String(table));
    }
    if (record_id) {
      where.push('a.record_id = ?');
      params.push(Number(record_id));
    }
    if (action) {
      where.push('a.action = ?');
      params.push(String(action).toUpperCase());
    }

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT a.audit_id, a.table_name, a.record_id, a.action,
                          a.old_data, a.new_data, a.changed_at, a.changed_by,
                          COALESCE(u.full_name, 'system') AS changed_by_name
                   FROM audit_log a
                   LEFT JOIN users u ON u.user_id = a.changed_by
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY a.changed_at DESC
                   LIMIT ?`;

      params.push(Math.min(Number(limit) || 50, 200));
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /infra/regions - List regions with host counts
router.get('/regions', canView, async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT r.*, COUNT(h.host_id) AS total_hosts,
                COUNT(CASE WHEN h.status = 'active' THEN 1 END) AS active_hosts
         FROM regions r
         LEFT JOIN hosts h ON h.region_id = r.region_id
         GROUP BY r.region_id
         ORDER BY r.name ASC`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /infra/regions - Create region
router.post('/regions', canManage, validate({ body: createRegionSchema }), async (req, res, next) => {
  try {
    const { code, name, country } = req.body;
    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        `INSERT INTO regions(code, name, country) VALUES (?, ?, ?)`,
        [code, name, country]
      );
      return { region_id: out.insertId, code, name };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /infra/regions/:id - Update region
router.put(
  '/regions/:id',
  canManage,
  validate({ params: idParamSchema, body: updateRegionSchema }),
  async (req, res, next) => {
    try {
      const regionId = Number(req.params.id);
      const { name, country, status } = req.body;

      const updates = [];
      const params = [];
      if (name) { updates.push('name = ?'); params.push(name); }
      if (country) { updates.push('country = ?'); params.push(country); }
      if (status) { updates.push('status = ?'); params.push(status); }

      if (updates.length > 0) {
        params.push(regionId);
        await withDb(req, async (conn) => {
          await conn.execute(
            `UPDATE regions SET ${updates.join(', ')} WHERE region_id = ?`,
            params
          );
        });
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// GET /infra/instance-types - List all types
router.get('/instance-types', canView, async (req, res, next) => {
  try {
    const types = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT t.*, fn_hourly_price(t.type_id, CURRENT_DATE) AS price_per_hour
         FROM instance_types t
         ORDER BY t.vcpu ASC, t.ram_gb ASC, t.name ASC`
      );
      return rows;
    });

    res.json(types);
  } catch (err) {
    next(err);
  }
});

// POST /infra/instance-types - Create type
router.post('/instance-types', canManage, validate({ body: createInstanceTypeSchema }), async (req, res, next) => {
  try {
    const { name, family, vcpu, ram_gb, disk_gb } = req.body;
    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        `INSERT INTO instance_types(name, family, vcpu, ram_gb, disk_gb) VALUES (?, ?, ?, ?, ?)`,
        [name, family, vcpu, ram_gb, disk_gb]
      );
      return { type_id: out.insertId, name };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /infra/instance-types/:id - Update type
router.put(
  '/instance-types/:id',
  canManage,
  validate({ params: idParamSchema, body: updateInstanceTypeSchema }),
  async (req, res, next) => {
    try {
      const typeId = Number(req.params.id);
      const { name, family, vcpu, ram_gb, disk_gb, active } = req.body;

      const updates = [];
      const params = [];
      if (name) { updates.push('name = ?'); params.push(name); }
      if (family) { updates.push('family = ?'); params.push(family); }
      if (vcpu) { updates.push('vcpu = ?'); params.push(vcpu); }
      if (ram_gb) { updates.push('ram_gb = ?'); params.push(ram_gb); }
      if (disk_gb) { updates.push('disk_gb = ?'); params.push(disk_gb); }
      if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

      if (updates.length > 0) {
        params.push(typeId);
        await withDb(req, async (conn) => {
          await conn.execute(
            `UPDATE instance_types SET ${updates.join(', ')} WHERE type_id = ?`,
            params
          );
        });
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
