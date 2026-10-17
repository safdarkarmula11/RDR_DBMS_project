import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { setPriceSchema, typeIdParamSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// GET /pricing - Current active prices for all instance types
router.get('/', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT * FROM v_current_pricing ORDER BY type_id ASC`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /pricing/:typeId and /pricing/history/:typeId - Price history of one instance type
const handlePriceHistory = async (req, res, next) => {
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
};

router.get('/history/:typeId', requireRole('super_admin', 'billing', 'support'), validate({ params: typeIdParamSchema }), handlePriceHistory);
router.get('/:typeId', requireRole('super_admin', 'billing', 'support'), validate({ params: typeIdParamSchema }), handlePriceHistory);

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

// POST /pricing and POST /pricing/:typeId - Set price from effective date (admin only)
const handleSetPrice = async (req, res, next) => {
  try {
    const typeId = Number(req.params.typeId || req.body.type_id);
    const { price_per_hour } = req.body;
    const effectiveDate = req.body.effective_from || req.body.valid_from || new Date().toISOString().split('T')[0];

    if (!typeId) {
      return res.status(400).json({ code: 'INVALID', msg: 'Instance type ID is required' });
    }

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_set_price(?, ?, ?)',
        [typeId, price_per_hour, effectiveDate]
      );
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

router.post('/:typeId', requireRole('super_admin'), handleSetPrice);
router.post('/', requireRole('super_admin'), validate({ body: setPriceSchema }), handleSetPrice);

export default router;
