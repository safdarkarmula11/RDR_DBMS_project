import { ZodError } from 'zod';

export function errorHandler(err, req, res, _next) {
  const reqId = req.id || 'unknown';
  // Log full error details server-side with request ID
  console.error(`[Error reqId=${reqId}]`, {
    message: err.message,
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    stack: err.stack,
  });

  // Handle explicitly thrown application errors
  if (err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      code: err.code,
      msg: err.message,
      hint: err.hint,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError || err.name === 'ZodError') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      msg: err.errors?.[0]?.message || 'Input validation failed',
      details: err.errors?.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle malformed JSON body errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      code: 'INVALID_JSON',
      msg: 'Malformed JSON payload in request body',
    });
  }

  // Handle MySQL errors
  if (err.errno || err.sqlState) {
    // Deadlock or lock wait timeout
    if (err.errno === 1213 || err.errno === 1205) {
      return res.status(503).json({
        code: 'RETRY',
        msg: 'Temporary conflict, please retry',
      });
    }

    // Duplicate key entry
    if (err.errno === 1062) {
      return res.status(409).json({
        code: 'DUPLICATE',
        msg: 'Resource already exists',
      });
    }

    // Foreign key constraint failure (referenced row in use or missing)
    if (err.errno === 1451 || err.errno === 1452) {
      return res.status(409).json({
        code: 'IN_USE',
        msg: 'Resource is referenced by other records',
      });
    }

    // Check constraint violated
    if (err.errno === 3819) {
      return res.status(400).json({
        code: 'INVALID',
        msg: 'Value violates a constraint',
      });
    }

    // Custom SQLSTATE 45000 from triggers and stored procedures
    if (err.sqlState === '45000') {
      const msg = String(err.sqlMessage || '');
      if (/no capacity|no servers available/i.test(msg)) {
        return res.status(422).json({
          code: 'NO_CAPACITY',
          msg: 'No servers available in this region',
          hint: 'Try another region or a smaller size',
        });
      }
      if (/quota/i.test(msg)) {
        return res.status(422).json({
          code: 'QUOTA_EXCEEDED',
          msg: 'Instance quota reached',
          hint: 'Upgrade your plan or terminate unused instances',
        });
      }
      if (/not active|suspended/i.test(msg)) {
        return res.status(422).json({
          code: 'SUSPENDED',
          msg: 'Account is suspended',
        });
      }
      if (/immutable|read-only|cannot be deleted/i.test(msg)) {
        return res.status(422).json({
          code: 'IMMUTABLE',
          msg: 'This record cannot be modified',
        });
      }
      if (/overlap/i.test(msg)) {
        return res.status(422).json({
          code: 'PRICE_OVERLAP',
          msg: 'Price period overlaps an existing price',
          hint: 'Select a non-overlapping effective date',
        });
      }
      if (/exceeds.*balance|overpaid/i.test(msg)) {
        return res.status(422).json({
          code: 'OVERPAYMENT',
          msg: 'Payment amount exceeds outstanding invoice balance',
          hint: 'Check the current balance and adjust payment amount',
        });
      }
      if (/not found/i.test(msg)) {
        return res.status(404).json({
          code: 'NOT_FOUND',
          msg: 'Resource not found',
        });
      }

      // Safe whitelisted fallback for other 45000 signals
      return res.status(422).json({
        code: 'BUSINESS_RULE_VIOLATION',
        msg: 'Operation rejected by business rule',
      });
    }
  }

  // Catch-all for uncaught errors - NEVER leak sqlMessage or internal stack traces
  return res.status(500).json({
    code: 'UNKNOWN',
    msg: 'An unexpected error occurred',
  });
}

export default errorHandler;
