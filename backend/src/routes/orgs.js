import { Router } from 'express';
import crypto from 'node:crypto';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, tenantGuard } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import {
  idParamSchema,
  createOrgSchema,
  updateOrgSchema,
  addMemberSchema,
  createApiKeySchema,
} from '../validation/schemas.js';
import { sha256 } from '../services/auth.service.js';

const router = Router();

router.use(authenticate);

// GET /orgs - List orgs (customer sees own org, staff sees all)
router.get('/', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const rows = await withDb(req, async (conn) => {
      if (isCustomer) {
        if (!req.user.org_id) return [];
        const [result] = await conn.execute(
          `SELECT o.org_id, o.name, o.tier_id, t.name AS tier_name, o.status,
                  o.credit_balance, o.created_at,
                  (SELECT COUNT(*) FROM org_members om WHERE om.org_id = o.org_id) AS member_count,
                  (SELECT COUNT(*) FROM instances i WHERE i.org_id = o.org_id AND i.status <> 'terminated') AS active_instances
           FROM organizations o
           JOIN account_tiers t ON t.tier_id = o.tier_id
           WHERE o.org_id = ?`,
          [req.user.org_id]
        );
        return result;
      } else {
        const [result] = await conn.execute(
          `SELECT o.org_id, o.name, o.tier_id, t.name AS tier_name, o.parent_org_id, o.status,
                  o.credit_balance, o.created_at,
                  (SELECT COUNT(*) FROM org_members om WHERE om.org_id = o.org_id) AS member_count,
                  (SELECT COUNT(*) FROM instances i WHERE i.org_id = o.org_id AND i.status <> 'terminated') AS active_instances
           FROM organizations o
           JOIN account_tiers t ON t.tier_id = o.tier_id
           ORDER BY o.name ASC`
        );
        return result;
      }
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /orgs/members - List members of current organization
router.get('/members', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    if (!orgId) return res.json([]);
    const members = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT u.user_id, u.email, u.full_name, u.status, om.member_role, om.joined_at
         FROM org_members om
         JOIN users u ON u.user_id = om.user_id
         WHERE om.org_id = ?
         ORDER BY om.joined_at ASC`,
        [orgId]
      );
      return rows;
    });

    res.json(members);
  } catch (err) {
    next(err);
  }
});

// POST /orgs/members - Add member by email to current org
router.post('/members', validate({ body: addMemberSchema }), async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    if (!orgId) {
      return res.status(400).json({ code: 'NO_ORG', msg: 'User does not belong to an organization' });
    }
    if (req.user.role === 'customer' && req.user.member_role !== 'owner') {
      return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can add members' });
    }

    const { email, member_role, role } = req.body;
    const finalRole = member_role || role || 'member';

    const result = await withDb(req, async (conn) => {
      // Only an existing customer account that is not already in another
      // organization can be added. Every other case returns the same answer,
      // so this endpoint cannot be used to find out which emails exist.
      const [users] = await conn.execute(
        `SELECT u.user_id
           FROM users u
          WHERE u.email = ?
            AND u.system_role = 'customer'
            AND NOT EXISTS (
              SELECT 1 FROM org_members om
               WHERE om.user_id = u.user_id AND om.org_id <> ?
            )`,
        [email, orgId]
      );
      const user = users[0];
      if (!user) {
        const err = new Error('No eligible account found for that email. The person must register first and must not belong to another organization.');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await conn.execute(
        'INSERT INTO org_members(org_id, user_id, member_role) VALUES (?, ?, ?)',
        [orgId, user.user_id, finalRole]
      );

      return { org_id: orgId, user_id: user.user_id, member_role: finalRole };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /orgs/:id - Org detail (404 for wrong tenant)
router.get('/:id', validate({ params: idParamSchema }), tenantGuard('id'), async (req, res, next) => {
  try {
    const orgId = Number(req.params.id);
    const org = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT o.org_id, o.name, o.tier_id, t.name AS tier_name, t.max_instances, t.max_storage_gb,
                t.discount_pct, o.parent_org_id, o.status, o.credit_balance, o.created_at
         FROM organizations o
         JOIN account_tiers t ON t.tier_id = o.tier_id
         WHERE o.org_id = ?`,
        [orgId]
      );
      return rows[0];
    });

    if (!org) {
      return res.status(404).json({ code: 'NOT_FOUND', msg: 'Organization not found' });
    }

    res.json(org);
  } catch (err) {
    next(err);
  }
});

// POST /orgs - Create organization (admin only)
router.post('/', requireRole('super_admin'), validate({ body: createOrgSchema }), async (req, res, next) => {
  try {
    const { name, tier_id } = req.body;
    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        'INSERT INTO organizations(name, tier_id) VALUES (?, ?)',
        [name, tier_id]
      );
      return { org_id: out.insertId, name, tier_id };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /orgs/:id - Update organization (admin or owner)
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateOrgSchema }),
  tenantGuard('id'),
  async (req, res, next) => {
    try {
      const orgId = Number(req.params.id);
      if (req.user.role === 'customer' && req.user.member_role !== 'owner') {
        return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can update details' });
      }

      const { name, tier_id, status } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      // Customers cannot change tier or status directly
      if (req.user.role !== 'customer') {
        if (tier_id) { updates.push('tier_id = ?'); params.push(tier_id); }
        if (status) { updates.push('status = ?'); params.push(status); }
      }

      if (updates.length === 0) {
        return res.json({ ok: true });
      }

      params.push(orgId);
      await withDb(req, async (conn) => {
        await conn.execute(
          `UPDATE organizations SET ${updates.join(', ')} WHERE org_id = ?`,
          params
        );
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);



// GET /orgs/:id/members - List members
router.get('/:id/members', validate({ params: idParamSchema }), tenantGuard('id'), async (req, res, next) => {
  try {
    const orgId = Number(req.params.id);
    const members = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT u.user_id, u.email, u.full_name, u.status, om.member_role, om.joined_at
         FROM org_members om
         JOIN users u ON u.user_id = om.user_id
         WHERE om.org_id = ?
         ORDER BY om.joined_at ASC`,
        [orgId]
      );
      return rows;
    });

    res.json(members);
  } catch (err) {
    next(err);
  }
});

// POST /orgs/:id/members - Add member by email (owner or admin)
router.post(
  '/:id/members',
  validate({ params: idParamSchema, body: addMemberSchema }),
  tenantGuard('id'),
  async (req, res, next) => {
    try {
      const orgId = Number(req.params.id);
      if (req.user.role === 'customer' && req.user.member_role !== 'owner') {
        return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only the organization owner can add members' });
      }

      const { email, member_role, role } = req.body;
      const finalRole = member_role || role || 'member';

      const result = await withDb(req, async (conn) => {
        const [users] = await conn.execute(
          'SELECT user_id FROM users WHERE email = ?',
          [email]
        );
        const user = users[0];
        if (!user) {
          const err = new Error('No user found with that email address');
          err.statusCode = 404;
          err.code = 'NOT_FOUND';
          throw err;
        }

        await conn.execute(
          'INSERT INTO org_members(org_id, user_id, member_role) VALUES (?, ?, ?)',
          [orgId, user.user_id, finalRole]
        );

        return { org_id: orgId, user_id: user.user_id, member_role: finalRole };
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /orgs/:id/members/:userId - Remove member (owner or admin)
router.delete('/:id/members/:userId', tenantGuard('id'), async (req, res, next) => {
  try {
    const orgId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);

    if (isNaN(targetUserId)) {
      return res.status(400).json({ code: 'INVALID', msg: 'Invalid user ID' });
    }

    if (req.user.role === 'customer' && req.user.member_role !== 'owner') {
      return res.status(403).json({ code: 'FORBIDDEN', msg: 'Only owner can remove members' });
    }

    await withDb(req, async (conn) => {
      // Disallow removing self if only owner
      if (targetUserId === req.user.sub) {
        const [owners] = await conn.execute(
          `SELECT COUNT(*) AS count FROM org_members WHERE org_id = ? AND member_role = 'owner'`,
          [orgId]
        );
        if (owners[0].count <= 1) {
          const err = new Error('Cannot remove the sole owner of an organization');
          err.statusCode = 400;
          err.code = 'LAST_OWNER';
          throw err;
        }
      }

      await conn.execute(
        'DELETE FROM org_members WHERE org_id = ? AND user_id = ?',
        [orgId, targetUserId]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /orgs/:id/api-keys - List API keys (user sees their keys)
router.get('/:id/api-keys', validate({ params: idParamSchema }), tenantGuard('id'), async (req, res, next) => {
  try {
    const keys = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT key_id, label, created_at, revoked
         FROM api_keys
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.sub]
      );
      return rows;
    });

    res.json(keys);
  } catch (err) {
    next(err);
  }
});

// POST /orgs/:id/api-keys - Create API key (returns raw key once)
router.post(
  '/:id/api-keys',
  validate({ params: idParamSchema, body: createApiKeySchema }),
  tenantGuard('id'),
  async (req, res, next) => {
    try {
      const { label } = req.body;
      const rawKey = `nh_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = sha256(rawKey);

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'INSERT INTO api_keys(user_id, key_hash, label) VALUES (?, ?, ?)',
          [req.user.sub, keyHash, label]
        );
        return {
          key_id: out.insertId,
          key: rawKey,
          label,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /orgs/:id/api-keys/:keyId - Revoke API key
router.delete('/:id/api-keys/:keyId', tenantGuard('id'), async (req, res, next) => {
  try {
    const keyId = Number(req.params.keyId);
    await withDb(req, async (conn) => {
      await conn.execute(
        'UPDATE api_keys SET revoked = TRUE WHERE key_id = ? AND user_id = ?',
        [keyId, req.user.sub]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /orgs/:id/cost-tree - Recursive CTE of cost for org + all descendants
router.get('/:id/cost-tree', validate({ params: idParamSchema }), tenantGuard('id'), async (req, res, next) => {
  try {
    const rootOrgId = Number(req.params.id);

    const costTree = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `WITH RECURSIVE org_tree AS (
           SELECT org_id, name, parent_org_id, 0 AS level
           FROM organizations
           WHERE org_id = ?
           UNION ALL
           SELECT o.org_id, o.name, o.parent_org_id, ot.level + 1
           FROM organizations o
           JOIN org_tree ot ON o.parent_org_id = ot.org_id
         )
         SELECT ot.org_id, ot.name, ot.parent_org_id, ot.level,
                COALESCE(SUM(inv.total), 0.00) AS total_invoiced,
                COALESCE(SUM(p.amount), 0.00) AS total_paid
         FROM org_tree ot
         LEFT JOIN v_invoices inv ON inv.org_id = ot.org_id AND inv.status <> 'void'
         LEFT JOIN payments p ON p.invoice_id = inv.invoice_id
         GROUP BY ot.org_id, ot.name, ot.parent_org_id, ot.level
         ORDER BY ot.level, ot.name`,
        [rootOrgId]
      );
      return rows;
    });

    res.json(costTree);
  } catch (err) {
    next(err);
  }
});

export default router;