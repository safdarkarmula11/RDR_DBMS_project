import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const standardRateLimitHandler = (_req, res) => {
  res.status(429).json({
    code: 'RATE_LIMIT_EXCEEDED',
    msg: 'Too many requests, please slow down',
  });
};

// Global rate limiter: 100 req/min
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardRateLimitHandler,
});

// Auth endpoints rate limiter: 10 req/min per IP
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardRateLimitHandler,
});

// Payment rate limiter: 5 req/min per user
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.sub ? `user_${req.user.sub}` : req.ip),
  validate: { keyGeneratorIpFallback: false },
  handler: standardRateLimitHandler,
});

// Launch rate limiter: 10 req/min per user
export const launchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.sub ? `user_${req.user.sub}` : req.ip),
  validate: { keyGeneratorIpFallback: false },
  handler: standardRateLimitHandler,
});

export default {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  launchLimiter,
};
