import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { launchLimiter } from '../middleware/rateLimiter.js';
import {
  idParamSchema,
  launchInstanceSchema,
  statusUpdateSchema,
  resizeInstanceSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// Columns visible to customer tenants (no internal hostnames)
const CUSTOMER_COLS = `instance_id, org_id, name, status, type_name, vcpu, ram_gb, disk_gb, image,
  region_code, region_name, ip_address, auto_backup, created_at, terminated_at, price_per_hour`;

// GET /instances - List instances (tenant-scoped for customers)
router.get('/', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const where = [];
    const params = [];

    if (isCustomer) {
      if (!u.org_id) return res.json([]);
      where.push('org_id = ?');
      params.push(u.org_id);
    } else if (req.query.org_id) {
      where.push('org_id = ?');
      params.push(req.query.org_id);
    }

    if (req.query.status) {
      where.push('status = ?');
      params.push(req.query.status);
    }

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT ${isCustomer ? CUSTOMER_COLS : '*'} FROM v_instances
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY status = 'terminated', instance_id DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /instances/quota - Quota information
router.get('/quota', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';

    const quota = await withDb(req, async (conn) => {
      if (isCustomer) {
        const [rows] = await conn.execute(
          'SELECT * FROM v_org_quota WHERE org_id = ?',
          [u.org_id || 0]
        );
        return rows[0] || null;
      } else {
        const [rows] = await conn.execute(
          'SELECT * FROM v_org_quota ORDER BY org_name ASC'
        );
        return rows;
      }
    });

    res.json(quota);
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id - Single instance detail (404 for wrong tenant)
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const instanceId = Number(req.params.id);
    const u = req.user;
    const isCustomer = u.role === 'customer';

    const instance = await withDb(req, async (conn) => {
      const sql = isCustomer
        ? `SELECT ${CUSTOMER_COLS} FROM v_instances WHERE instance_id = ? AND org_id = ?`
        : `SELECT * FROM v_instances WHERE instance_id = ?`;
      const params = isCustomer ? [instanceId, u.org_id || 0] : [instanceId];
      const [rows] = await conn.execute(sql, params);
      return rows[0];
    });

    if (!instance) {
      return res.status(404).json({ code: 'NOT_FOUND', msg: 'Instance not found' });
    }

    res.json(instance);
  } catch (err) {
    next(err);
  }
});

// POST /instances - Launch instance (CALL sp_launch_instance with idempotency)
router.post(
  '/',
  requireRole('customer'),
  launchLimiter,
  validate({ body: launchInstanceSchema }),
  async (req, res, next) => {
    try {
      const u = req.user;
      if (!u.org_id) {
        return res.status(400).json({ code: 'NO_ORG', msg: 'Account is not linked to an organization' });
      }

      const idempotencyKey = req.headers['idempotency-key'] || null;
      const { name, type_id, image_id, region_id, config } = req.body;
      const configStr = config && Object.keys(config).length ? JSON.stringify(config) : null;

      const launched = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_launch_instance(?, ?, ?, ?, ?, ?, ?)',
          [u.org_id, type_id, image_id, region_id, name, configStr, idempotencyKey]
        );
        return out[0]?.[0];
      });

      res.status(201).json(launched);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /instances/:id/status - start / stop / suspend / reactivate
router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: statusUpdateSchema }),
  async (req, res, next) => {
    try {
      const instanceId = Number(req.params.id);
      const u = req.user;
      const { status } = req.body;

      if (u.role === 'customer') {
        if (!['running', 'stopped', 'terminated'].includes(status)) {
          return res.status(403).json({ code: 'FORBIDDEN', msg: 'Customers can only start, stop, or terminate instances' });
        }
        if (status === 'terminated' && u.member_role !== 'owner') {
          return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can terminate instances' });
        }
      }

      await withDb(req, async (conn) => {
        await conn.execute(
          'CALL sp_set_instance_status(?, ?, ?)',
          [instanceId, u.role === 'customer' ? u.org_id : null, status]
        );
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /instances/:id/resize - Resize instance (CALL sp_resize_instance)
router.post(
  '/:id/resize',
  validate({ params: idParamSchema, body: resizeInstanceSchema }),
  async (req, res, next) => {
    try {
      const instanceId = Number(req.params.id);
      const u = req.user;
      const { type_id } = req.body;

      if (u.role === 'customer' && u.member_role !== 'owner') {
        return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can resize instances' });
      }

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_resize_instance(?, ?, ?)',
          [instanceId, u.role === 'customer' ? u.org_id : null, type_id]
        );
        return out[0]?.[0];
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /instances/:id - Terminate instance (CALL sp_terminate_instance)
router.delete('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const instanceId = Number(req.params.id);
    const u = req.user;

    if (u.role === 'customer' && u.member_role !== 'owner') {
      return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can terminate instances' });
    }

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_terminate_instance(?, ?)',
        [instanceId, u.role === 'customer' ? u.org_id : null]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/history - Audit trail of one instance
router.get('/:id/history', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const instanceId = Number(req.params.id);
    const u = req.user;

    const rows = await withDb(req, async (conn) => {
      if (u.role === 'customer') {
        const [own] = await conn.execute(
          'SELECT 1 FROM instances WHERE instance_id = ? AND org_id = ?',
          [instanceId, u.org_id || 0]
        );
        if (own.length === 0) {
          const err = new Error('Instance not found');
          err.statusCode = 404;
          err.code = 'NOT_FOUND';
          throw err;
        }
      }

      const [result] = await conn.execute(
        `SELECT a.audit_id, a.action, a.old_data, a.new_data, a.changed_at,
                COALESCE(us.full_name, 'system') AS changed_by_name
         FROM audit_log a
         LEFT JOIN users us ON us.user_id = a.changed_by
         WHERE a.table_name = 'instances' AND a.record_id = ?
         ORDER BY a.audit_id DESC`,
        [instanceId]
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
