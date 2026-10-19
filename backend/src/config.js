import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Development-only fallback. Production refuses to start with it (see below).
const DEFAULT_JWT_SECRET = 'nimbushost_production_super_secure_jwt_secret_key_2026';

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Base DB credentials
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('nimbushost'),
  DB_USER: z.string().default('deku'),
  DB_PASSWORD: z.string().default('1234'),

  // Per-role DB credentials (fall back to base if omitted)
  DB_ADMIN_USER: z.string().optional(),
  DB_ADMIN_PASSWORD: z.string().optional(),
  DB_SUPPORT_USER: z.string().optional(),
  DB_SUPPORT_PASSWORD: z.string().optional(),
  DB_BILLING_USER: z.string().optional(),
  DB_BILLING_PASSWORD: z.string().optional(),
  DB_CUSTOMER_USER: z.string().optional(),
  DB_CUSTOMER_PASSWORD: z.string().optional(),

  // JWT configuration
  JWT_SECRET: z.string().min(16).default(DEFAULT_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(7),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const raw = parsedEnv.data;

if (raw.NODE_ENV === 'production' && raw.JWT_SECRET === DEFAULT_JWT_SECRET) {
  console.error('Refusing to start: set a private JWT_SECRET in the environment for production.');
  process.exit(1);
}

export const config = {
  port: raw.PORT,
  env: raw.NODE_ENV,
  isProd: raw.NODE_ENV === 'production',

  db: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    database: raw.DB_NAME,
    baseUser: raw.DB_USER,
    basePassword: raw.DB_PASSWORD,
    roles: {
      admin: {
        user: raw.DB_ADMIN_USER || raw.DB_USER,
        password: raw.DB_ADMIN_PASSWORD ?? raw.DB_PASSWORD,
      },
      support: {
        user: raw.DB_SUPPORT_USER || raw.DB_USER,
        password: raw.DB_SUPPORT_PASSWORD ?? raw.DB_PASSWORD,
      },
      billing: {
        user: raw.DB_BILLING_USER || raw.DB_USER,
        password: raw.DB_BILLING_PASSWORD ?? raw.DB_PASSWORD,
      },
      customer: {
        user: raw.DB_CUSTOMER_USER || raw.DB_USER,
        password: raw.DB_CUSTOMER_PASSWORD ?? raw.DB_PASSWORD,
      },
    },
  },

  jwt: {
    secret: raw.JWT_SECRET,
    expiresIn: raw.JWT_EXPIRES_IN,
    refreshDays: raw.REFRESH_TOKEN_EXPIRES_DAYS,
  },

  cors: {
    origin: raw.CORS_ORIGIN,
  },
};

export default config;