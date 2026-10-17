import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import {
  idParamSchema,
  createVolumeSchema,
  attachVolumeSchema,
  resizeVolumeSchema,
  createSnapshotSchema,
  restoreSnapshotSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// GET /storage/quota - Storage quota info
router.get('/quota', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';

    const quota = await withDb(req, async (conn) => {
      if (isCustomer) {
        const [rows] = await conn.execute(
          'SELECT * FROM v_org_storage WHERE org_id = ?',
          [u.org_id || 0]
        );
        return rows[0] || null;
      } else {
        const [rows] = await conn.execute(
          'SELECT * FROM v_org_storage ORDER BY org_name ASC'
        );
        return rows;
      }
    });

    res.json(quota);
  } catch (err) {
    next(err);
  }
});

// GET /storage/volumes - List volumes
router.get('/volumes', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT * FROM v_volumes ${isCustomer ? 'WHERE org_id = ?' : ''} ORDER BY volume_id DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /storage/volumes (or /storage) - Create volume
router.post(['/', '/volumes'], requireRole('customer'), validate({ body: createVolumeSchema }), async (req, res, next) => {
  try {
    const u = req.user;
    const { region_id, name, size_gb, vol_type } = req.body;

    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        'CALL sp_create_volume(?, ?, ?, ?, ?)',
        [u.org_id, region_id, name, size_gb, vol_type]
      );
      return out[0]?.[0];
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /storage/volumes/:id/attach - Attach volume
router.post(
  '/volumes/:id/attach',
  requireRole('customer'),
  validate({ params: idParamSchema, body: attachVolumeSchema }),
  async (req, res, next) => {
    try {
      const volumeId = Number(req.params.id);
      const { instance_id } = req.body;
      const u = req.user;

      await withDb(req, async (conn) => {
        await conn.execute(
          'CALL sp_attach_volume(?, ?, ?)',
          [volumeId, instance_id, u.org_id]
        );
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /storage/volumes/:id/detach - Detach volume
router.post('/volumes/:id/detach', requireRole('customer'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const volumeId = Number(req.params.id);
    const u = req.user;

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_detach_volume(?, ?)',
        [volumeId, u.org_id]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /storage/volumes/:id/resize - Expand volume
router.post(
  '/volumes/:id/resize',
  requireRole('customer'),
  validate({ params: idParamSchema, body: resizeVolumeSchema }),
  async (req, res, next) => {
    try {
      const volumeId = Number(req.params.id);
      const { size_gb } = req.body;
      const u = req.user;

      await withDb(req, async (conn) => {
        await conn.execute(
          'CALL sp_resize_volume(?, ?, ?)',
          [volumeId, u.org_id, size_gb]
        );
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /storage/volumes/:id - Delete volume
router.delete('/volumes/:id', requireRole('customer'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const volumeId = Number(req.params.id);
    const u = req.user;

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_delete_volume(?, ?)',
        [volumeId, u.org_id]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /storage/snapshots - List snapshots
router.get('/snapshots', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT * FROM v_snapshots ${isCustomer ? 'WHERE org_id = ?' : ''} ORDER BY snapshot_id DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /storage/snapshots - Take snapshot directly with volume_id in body
router.post(
  '/snapshots',
  requireRole('customer'),
  validate({ body: createSnapshotSchema }),
  async (req, res, next) => {
    try {
      const { volume_id, name } = req.body;
      const u = req.user;

      if (!volume_id) {
        return res.status(400).json({ code: 'INVALID', msg: 'Volume ID is required' });
      }

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_take_snapshot(?, ?, ?)',
          [Number(volume_id), u.org_id, name]
        );
        return out[0]?.[0];
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /storage/volumes/:id/snapshots - Take snapshot
router.post(
  '/volumes/:id/snapshots',
  requireRole('customer'),
  validate({ params: idParamSchema, body: createSnapshotSchema }),
  async (req, res, next) => {
    try {
      const volumeId = Number(req.params.id);
      const { name } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_take_snapshot(?, ?, ?)',
          [volumeId, u.org_id, name]
        );
        return out[0]?.[0];
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /storage/snapshots/:id/restore - Restore snapshot to new volume
router.post(
  '/snapshots/:id/restore',
  requireRole('customer'),
  validate({ params: idParamSchema, body: restoreSnapshotSchema }),
  async (req, res, next) => {
    try {
      const snapshotId = Number(req.params.id);
      const { name } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        const [out] = await conn.execute(
          'CALL sp_restore_snapshot(?, ?, ?)',
          [snapshotId, u.org_id, name]
        );
        return out[0]?.[0];
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /storage/snapshots/:id - Delete snapshot
router.delete('/snapshots/:id', requireRole('customer'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const snapshotId = Number(req.params.id);
    const u = req.user;

    await withDb(req, async (conn) => {
      await conn.execute(
        'CALL sp_delete_snapshot(?, ?)',
        [snapshotId, u.org_id]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;