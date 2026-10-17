import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';

import { config } from './config.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import orgsRoutes from './routes/orgs.js';
import catalogRoutes from './routes/catalog.js';
import infraRoutes from './routes/infra.js';
import pricingRoutes from './routes/pricing.js';
import instancesRoutes from './routes/instances.js';
import storageRoutes from './routes/storage.js';
import networkRoutes from './routes/network.js';
import billingRoutes from './routes/billing.js';
import ticketsRoutes from './routes/tickets.js';
import adminRoutes from './routes/admin.js';
import reportsRoutes from './routes/reports.js';

const app = express();

// Disable x-powered-by header
app.disable('x-powered-by');

// Security headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", config.cors.origin],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Strict CORS: allow specified frontend origin with credentials for cookies
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  })
);

// HTTP Parameter Pollution protection
app.use(hpp());

// Cookie parsing for refresh tokens
app.use(cookieParser());

// Body parser with strict 100kb limit
app.use(express.json({ limit: '100kb' }));

// Request ID tracking
app.use(requestIdMiddleware);

// Global rate limiting: 100 req/min
app.use(globalLimiter);

// ==========================================
// API ROUTE MOUNTING
// ==========================================
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgsRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/infra', infraRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/instances', instancesRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);

// Catch-all 404 for unknown endpoints
app.use((_req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    msg: 'Endpoint not found',
  });
});

// Central Error Handler
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`NimbusHost API running in ${config.env} mode on http://localhost:${config.port}`);
});

export default app;
export { server };