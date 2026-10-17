import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import {
  idParamSchema,
  registerDomainSchema,
  renewDomainSchema,
  dnsRecordSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// Helper to verify domain access (returns 404 for wrong tenant)
async function verifyDomainAccess(conn, user, domainId) {
  const [rows] = await conn.execute(
    'SELECT org_id FROM domains WHERE domain_id = ?',
    [domainId]
  );
  const domain = rows[0];
  if (!domain || (user.role === 'customer' && domain.org_id !== user.org_id)) {
    const err = new Error('Domain not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return domain;
}

// GET /network/ips - IP addresses in use
router.get('/ips', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT * FROM v_org_ips ${isCustomer ? 'WHERE org_id = ?' : ''} ORDER BY region_code ASC, ip_address ASC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /network/domains - List domains
router.get('/domains', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT * FROM v_domains ${isCustomer ? 'WHERE org_id = ?' : ''} ORDER BY expires_on ASC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /network/domains - Register domain
router.post(
  '/domains',
  requireRole('customer'),
  validate({ body: registerDomainSchema }),
  async (req, res, next) => {
    try {
      const u = req.user;
      const { name, years } = req.body;

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_register_domain(?, ?, ?)',
          [u.org_id, name, years || 1]
        );
        return out[0]?.[0];
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /network/domains/:id/renew - Renew domain
router.post(
  '/domains/:id/renew',
  requireRole('customer'),
  validate({ params: idParamSchema, body: renewDomainSchema }),
  async (req, res, next) => {
    try {
      const domainId = Number(req.params.id);
      const { years } = req.body;
      const u = req.user;

      await withDb(req, async (conn) => {
        await verifyDomainAccess(conn, u, domainId);
        await conn.execute(
          'CALL sp_renew_domain(?, ?, ?)',
          [domainId, u.org_id, years || 1]
        );
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// GET /network/domains/:id/records - List DNS records
router.get('/domains/:id/records', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const domainId = Number(req.params.id);
    const u = req.user;

    const rows = await withDb(req, async (conn) => {
      await verifyDomainAccess(conn, u, domainId);
      const [result] = await conn.execute(
        'SELECT record_id, domain_id, rtype, name, value, ttl, priority FROM dns_records WHERE domain_id = ? ORDER BY rtype ASC, name ASC',
        [domainId]
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /network/domains/:id/records - Add DNS record
router.post(
  '/domains/:id/records',
  requireRole('customer'),
  validate({ params: idParamSchema, body: dnsRecordSchema }),
  async (req, res, next) => {
    try {
      const domainId = Number(req.params.id);
      const { rtype, name, value, ttl, priority } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        await verifyDomainAccess(conn, u, domainId);
        const [out] = await conn.execute(
          `INSERT INTO dns_records(domain_id, rtype, name, value, ttl, priority)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [domainId, rtype, name, value, ttl, priority ?? null]
        );
        return { record_id: out.insertId };
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /network/records/:id - Update DNS record
router.put('/records/:id', requireRole('customer'), validate({ params: idParamSchema, body: dnsRecordSchema }), async (req, res, next) => {
  try {
    const recordId = Number(req.params.id);
    const { rtype, name, value, ttl, priority } = req.body;
    const u = req.user;

    await withDb(req, async (conn) => {
      const [records] = await conn.execute(
        'SELECT domain_id FROM dns_records WHERE record_id = ?',
        [recordId]
      );
      if (!records[0]) {
        const err = new Error('Record not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await verifyDomainAccess(conn, u, records[0].domain_id);

      await conn.execute(
        `UPDATE dns_records
         SET rtype = ?, name = ?, value = ?, ttl = ?, priority = ?
         WHERE record_id = ?`,
        [rtype, name, value, ttl, priority ?? null, recordId]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /network/records/:id - Delete DNS record
router.delete('/records/:id', requireRole('customer'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const recordId = Number(req.params.id);
    const u = req.user;

    await withDb(req, async (conn) => {
      const [records] = await conn.execute(
        'SELECT domain_id FROM dns_records WHERE record_id = ?',
        [recordId]
      );
      if (!records[0]) {
        const err = new Error('Record not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await verifyDomainAccess(conn, u, records[0].domain_id);
      await conn.execute('DELETE FROM dns_records WHERE record_id = ?', [recordId]);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;