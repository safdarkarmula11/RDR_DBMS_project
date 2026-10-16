import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import { auth } from './middleware.js';
import catalogRoutes from './routes/catalog.js';
import infraRoutes from './routes/infra.js';
import pricingRoutes from './routes/pricing.js';
import instanceRoutes from './routes/instances.js';
import storageRoutes from './routes/storage.js';
import networkRoutes from './routes/network.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/catalog', auth, catalogRoutes);
app.use('/api/infra', auth, infraRoutes);
app.use('/api/pricing', auth, pricingRoutes);
app.use('/api/instances', auth, instanceRoutes);
app.use('/api/storage', auth, storageRoutes);
app.use('/api/network', auth, networkRoutes);
// Next steps add: /api/orgs, /api/instances, /api/invoices, ... (each behind auth + allow(...))

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`NimbusHost API running on http://localhost:${port}`));