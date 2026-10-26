import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// GET /catalog/regions
router.get('/regions', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT r.region_id, r.code, r.name, r.country,
                (SELECT COUNT(*) FROM hosts h WHERE h.region_id = r.region_id AND h.status = 'active') AS active_hosts
         FROM regions r
         WHERE r.status = 'active'
         ORDER BY r.name ASC`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /catalog/instance-types
router.get('/instance-types', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT type_id, name, family, vcpu, ram_gb, disk_gb, active,
                price_per_hour, price_per_month
         FROM v_current_pricing
         WHERE active = 1
         ORDER BY vcpu ASC, ram_gb ASC, name ASC`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /catalog/images
router.get('/images', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT image_id, name, os_family, version, min_disk_gb
         FROM v_images
         ORDER BY os_family ASC, name ASC, version ASC`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
