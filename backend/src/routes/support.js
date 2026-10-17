import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { idParamSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'support'));

// GET /support/queue - Ticket queue sorted by SLA urgency
router.get('/queue', async (req, res, next) => {
  try {
    const queue = await withDb(req, async (conn) => {
      const sql = `
        SELECT t.ticket_id, t.subject, t.priority, o.name AS org_name, t.status,
               u.full_name AS assigned_to_name,
               GREATEST(0, ROUND((CASE t.priority 
                 WHEN 'critical' THEN 2 
                 WHEN 'high' THEN 4 
                 WHEN 'medium' THEN 24 
                 ELSE 48 
               END) - TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) / 60.0, 1)) AS hours_left,
               t.created_at
        FROM tickets t
        JOIN organizations o ON o.org_id = t.org_id
        LEFT JOIN users u ON u.user_id = t.assigned_to
        WHERE t.status IN ('open', 'in_progress')
        ORDER BY (CASE t.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END) ASC, t.created_at ASC
      `;
      const [rows] = await conn.execute(sql);
      return rows;
    });

    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// POST /support/tickets/:id/assign - Assign ticket to staff member
router.post('/tickets/:id/assign', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = Number(req.body.user_id || req.user.sub);

    await withDb(req, async (conn) => {
      await conn.execute(
        'UPDATE tickets SET assigned_to = ?, status = IF(status = "open", "in_progress", status) WHERE ticket_id = ?',
        [userId, ticketId]
      );
    });

    res.json({ ok: true, ticket_id: ticketId, assigned_to: userId });
  } catch (err) {
    next(err);
  }
});

// POST /support/tickets/:id/status - Update ticket workflow status
router.post('/tickets/:id/status', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const { status } = req.body;

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ code: 'INVALID', msg: 'Invalid ticket status' });
    }

    await withDb(req, async (conn) => {
      await conn.execute(
        'UPDATE tickets SET status = ? WHERE ticket_id = ?',
        [status, ticketId]
      );
    });

    res.json({ ok: true, ticket_id: ticketId, status });
  } catch (err) {
    next(err);
  }
});

// GET /support/my-tickets - Tickets assigned to the logged-in agent
router.get('/my-tickets', async (req, res, next) => {
  try {
    const userId = req.user.sub;

    const tickets = await withDb(req, async (conn) => {
      const sql = `
        SELECT t.ticket_id, t.subject, t.priority, o.name AS org_name, t.status,
               GREATEST(0, ROUND((CASE t.priority 
                 WHEN 'critical' THEN 2 
                 WHEN 'high' THEN 4 
                 WHEN 'medium' THEN 24 
                 ELSE 48 
               END) - TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) / 60.0, 1)) AS hours_left,
               t.created_at
        FROM tickets t
        JOIN organizations o ON o.org_id = t.org_id
        WHERE t.assigned_to = ?
        ORDER BY t.created_at DESC
      `;
      const [rows] = await conn.execute(sql, [userId]);
      return rows;
    });

    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

// GET /support/sla - SLA compliance board
router.get('/sla', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT ticket_id, subject, priority, org_name, status,
               GREATEST(0, ROUND(sla_target_hours - TIMESTAMPDIFF(MINUTE, created_at, NOW()) / 60.0, 1)) AS hours_left
        FROM v_ticket_sla
        ORDER BY hours_left ASC
      `;
      const [result] = await conn.execute(sql);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /support/customers - Customer directory for support agents
router.get('/customers', async (req, res, next) => {
  try {
    const customers = await withDb(req, async (conn) => {
      const sql = `
        SELECT o.org_id, o.name, COALESCE(t.name, 'Developer') AS tier_name, o.status,
               COALESCE(inst.active_instances, 0) AS active_instances,
               COALESCE(vol.storage_gb, 0) AS storage_gb,
               COALESCE(tk.open_tickets, 0) AS open_tickets,
               o.credit_balance, o.created_at
        FROM organizations o
        LEFT JOIN tiers t ON t.tier_id = o.tier_id
        LEFT JOIN (
          SELECT org_id, COUNT(*) AS active_instances 
          FROM instances 
          WHERE status != 'terminated' 
          GROUP BY org_id
        ) inst ON inst.org_id = o.org_id
        LEFT JOIN (
          SELECT org_id, SUM(size_gb) AS storage_gb 
          FROM volumes 
          WHERE status != 'deleted' 
          GROUP BY org_id
        ) vol ON vol.org_id = o.org_id
        LEFT JOIN (
          SELECT org_id, COUNT(*) AS open_tickets 
          FROM tickets 
          WHERE status IN ('open', 'in_progress') 
          GROUP BY org_id
        ) tk ON tk.org_id = o.org_id
        ORDER BY o.name ASC
      `;
      const [rows] = await conn.execute(sql);
      return rows;
    });

    res.json(customers);
  } catch (err) {
    next(err);
  }
});

export default router;

