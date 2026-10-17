import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// GET /usage - List usage records (tenant scoped for customers)
router.get('/', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT u.*, i.name AS instance_name
                   FROM usage_records u
                   JOIN instances i ON i.instance_id = u.instance_id
                   ${isCustomer ? 'WHERE u.org_id = ?' : ''}
                   ORDER BY u.recorded_at DESC
                   LIMIT 200`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;

