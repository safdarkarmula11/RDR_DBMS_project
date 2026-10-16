import jwt from 'jsonwebtoken';

const SECRET = () => process.env.JWT_SECRET || 'dev_secret';

export const signToken = (payload) => jwt.sign(payload, SECRET(), { expiresIn: '8h' });

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' });

// Wrap async route handlers and translate MySQL errors into clean HTTP responses.
// SQLSTATE 45000 is what our triggers/procedures raise with SIGNAL for business-rule violations.
export const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate value: ' + err.sqlMessage });
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'Record is in use and cannot be deleted' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Referenced record does not exist' });
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'Value violates a table rule: ' + err.sqlMessage });
    if (err.errno === 1213) return res.status(503).json({ error: 'Database deadlock, please retry' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
