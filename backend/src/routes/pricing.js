import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { setPriceSchema, typeIdParamSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// GET /pricing/:typeId - Price history of one instance type
router.get('/:typeId', requireRole('super_admin', 'billing', 'support'), validate({ params: typeIdParamSchema }), async (req, res, next) => {
  try {
    const typeId = Number(req.params.typeId);
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT price_id, type_id, type_name, price_per_hour, valid_from, valid_to, period_status
         FROM v_pricing_history
         WHERE type_id = ?
         ORDER BY valid_from DESC`,
        [typeId]
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /pricing/:typeId/as-of/:date - Price as of a specific date using fn_hourly_price
router.get('/:typeId/as-of/:date', requireRole('super_admin', 'billing', 'support'), async (req, res, next) => {
  try {
    const typeId = Number(req.params.typeId);
    const date = req.params.date;

    const row = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        'SELECT fn_hourly_price(?, ?) AS price_per_hour',
        [typeId, date]
      );
      return result[0];
    });

    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST /pricing - Set price from effective date (admin only)
router.post('/', requireRole('super_admin'), validate({ body: setPriceSchema }), async (req, res, next) => {
  try {
    const { type_id, price_per_hour, effective_from } = req.body;

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_set_price(?, ?, ?)',
        [type_id, price_per_hour, effective_from]
      );
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
