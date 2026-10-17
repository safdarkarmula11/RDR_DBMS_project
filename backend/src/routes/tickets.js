import { Router } from 'express';
import { withDb, withTransactionRetry } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  idParamSchema,
  createTicketSchema,
  addMessageSchema,
  updateTicketSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate);

// Helper to verify ticket access (404 for wrong tenant)
async function verifyTicketAccess(conn, user, ticketId) {
  const [rows] = await conn.execute(
    'SELECT ticket_id, org_id, status FROM tickets WHERE ticket_id = ?',
    [ticketId]
  );
  const ticket = rows[0];
  if (!ticket || (user.role === 'customer' && ticket.org_id !== user.org_id)) {
    const err = new Error('Ticket not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return ticket;
}

// GET /tickets/search - Full-text search on ticket messages
router.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.json([]);
    }

    const u = req.user;
    const isCustomer = u.role === 'customer';

    const results = await withDb(req, async (conn) => {
      const sql = `SELECT tm.message_id, tm.ticket_id, tm.body, tm.created_at,
                          t.subject, t.status, t.priority, t.org_id,
                          MATCH(tm.body) AGAINST (? IN BOOLEAN MODE) AS score
                   FROM ticket_messages tm
                   JOIN tickets t ON t.ticket_id = tm.ticket_id
                   WHERE MATCH(tm.body) AGAINST (? IN BOOLEAN MODE)
                   ${isCustomer ? 'AND t.org_id = ?' : ''}
                   ORDER BY score DESC
                   LIMIT 50`;

      const params = isCustomer ? [query, query, u.org_id || 0] : [query, query];
      const [rows] = await conn.execute(sql, params);
      return rows;
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /tickets - List tickets
router.get('/', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const where = [];
    const params = [];

    if (isCustomer) {
      if (!u.org_id) return res.json([]);
      where.push('t.org_id = ?');
      params.push(u.org_id);
    } else if (req.query.org_id) {
      where.push('t.org_id = ?');
      params.push(req.query.org_id);
    }

    if (req.query.status) {
      where.push('t.status = ?');
      params.push(req.query.status);
    }

    if (req.query.priority) {
      where.push('t.priority = ?');
      params.push(req.query.priority);
    }

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT t.*, o.name AS org_name,
                          u_creator.full_name AS creator_name,
                          u_agent.full_name AS assignee_name,
                          (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.ticket_id) AS message_count
                   FROM tickets t
                   JOIN organizations o ON o.org_id = t.org_id
                   JOIN users u_creator ON u_creator.user_id = t.created_by
                   LEFT JOIN users u_agent ON u_agent.user_id = t.assigned_to
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY t.status = 'closed', t.updated_at DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /tickets/:id - Single ticket detail with messages
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const u = req.user;

    const ticketData = await withDb(req, async (conn) => {
      await verifyTicketAccess(conn, u, ticketId);

      const [ticketRows] = await conn.execute(
        `SELECT t.*, o.name AS org_name,
                u_creator.full_name AS creator_name,
                u_agent.full_name AS assignee_name
         FROM tickets t
         JOIN organizations o ON o.org_id = t.org_id
         JOIN users u_creator ON u_creator.user_id = t.created_by
         LEFT JOIN users u_agent ON u_agent.user_id = t.assigned_to
         WHERE t.ticket_id = ?`,
        [ticketId]
      );

      const [messages] = await conn.execute(
        `SELECT tm.message_id, tm.ticket_id, tm.body, tm.created_at,
                u.user_id AS sender_id, u.full_name AS sender_name, u.system_role AS sender_role
         FROM ticket_messages tm
         JOIN users u ON u.user_id = tm.sender_id
         WHERE tm.ticket_id = ?
         ORDER BY tm.created_at ASC`,
        [ticketId]
      );

      return {
        ...ticketRows[0],
        messages,
      };
    });

    res.json(ticketData);
  } catch (err) {
    next(err);
  }
});

// GET /tickets/:id/messages - Dedicated messages endpoint for ticket thread
router.get('/:id/messages', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const u = req.user;

    const messages = await withDb(req, async (conn) => {
      await verifyTicketAccess(conn, u, ticketId);
      const [rows] = await conn.execute(
        `SELECT tm.message_id, tm.ticket_id, tm.body, tm.created_at,
                u.user_id AS sender_id, u.full_name AS sender_name, u.system_role AS sender_role,
                (u.system_role <> 'customer') AS is_staff
         FROM ticket_messages tm
         JOIN users u ON u.user_id = tm.sender_id
         WHERE tm.ticket_id = ?
         ORDER BY tm.created_at ASC`,
        [ticketId]
      );
      return rows;
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// POST /tickets - Create ticket with initial message (Atomic Transaction)
router.post('/', validate({ body: createTicketSchema }), async (req, res, next) => {
  try {
    const u = req.user;
    if (!u.org_id && u.role === 'customer') {
      return res.status(400).json({ code: 'NO_ORG', msg: 'Account not associated with an organization' });
    }

    const { subject, priority, message } = req.body;
    const orgId = u.org_id || 1; // Staff default to internal org

    const result = await withDb(req, async (conn) => {
      return withTransactionRetry(conn, async () => {
        // 1. Create ticket
        const [tResult] = await conn.execute(
          'INSERT INTO tickets(org_id, created_by, subject, priority, status) VALUES (?, ?, ?, ?, ?)',
          [orgId, u.sub, subject, priority, 'open']
        );
        const ticketId = tResult.insertId;

        // 2. Add first message
        await conn.execute(
          'INSERT INTO ticket_messages(ticket_id, sender_id, body) VALUES (?, ?, ?)',
          [ticketId, u.sub, message]
        );

        return {
          ticket_id: ticketId,
          subject,
          priority,
          status: 'open',
        };
      });
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /tickets/:id/messages - Add message to ticket
router.post(
  '/:id/messages',
  validate({ params: idParamSchema, body: addMessageSchema }),
  async (req, res, next) => {
    try {
      const ticketId = Number(req.params.id);
      const { body } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        const ticket = await verifyTicketAccess(conn, u, ticketId);

        if (ticket.status === 'closed') {
          const err = new Error('Cannot add messages to a closed ticket');
          err.statusCode = 400;
          err.code = 'TICKET_CLOSED';
          throw err;
        }

        const [out] = await conn.execute(
          'INSERT INTO ticket_messages(ticket_id, sender_id, body) VALUES (?, ?, ?)',
          [ticketId, u.sub, body]
        );

        // Update ticket's updated_at timestamp
        await conn.execute(
          'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
          [ticketId]
        );

        return {
          message_id: out.insertId,
          ticket_id: ticketId,
          sender_id: u.sub,
          created_at: new Date().toISOString(),
        };
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /tickets/:id - Update ticket status / assignment
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTicketSchema }),
  async (req, res, next) => {
    try {
      const ticketId = Number(req.params.id);
      const { status, priority, assigned_to } = req.body;
      const u = req.user;

      await withDb(req, async (conn) => {
        await verifyTicketAccess(conn, u, ticketId);

        const updates = [];
        const params = [];

        if (status) {
          // Customers can only close their tickets
          if (u.role === 'customer' && status !== 'closed') {
            const err = new Error('Customers can only close resolved tickets');
            err.statusCode = 403;
            err.code = 'FORBIDDEN';
            throw err;
          }
          updates.push('status = ?');
          params.push(status);
        }

        if (priority && u.role !== 'customer') {
          updates.push('priority = ?');
          params.push(priority);
        }

        if (assigned_to !== undefined && u.role !== 'customer') {
          updates.push('assigned_to = ?');
          params.push(assigned_to);
        }

        if (updates.length > 0) {
          params.push(ticketId);
          await conn.execute(
            `UPDATE tickets SET ${updates.join(', ')} WHERE ticket_id = ?`,
            params
          );
        }
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
