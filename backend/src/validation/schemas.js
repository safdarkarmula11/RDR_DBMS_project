import { z } from 'zod';

// ==========================================
// COMMON HELPERS
// ==========================================
const nameSlugRegex = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,24}$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
}).strict();

export const typeIdParamSchema = z.object({
  typeId: z.coerce.number().int().positive(),
}).strict();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

// ==========================================
// AUTH SCHEMAS
// ==========================================
export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  org_name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(120),
}).strict();

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
}).strict();

// ==========================================
// ORGANIZATIONS & MEMBERS
// ==========================================
export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tier_id: z.coerce.number().int().positive().default(1),
}).strict();

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  tier_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'suspended', 'closed']).optional(),
}).strict();

export const addMemberSchema = z.object({
  email: z.string().email(),
  member_role: z.enum(['owner', 'member']).default('member'),
}).strict();

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(100),
}).strict();

// ==========================================
// INSTANCES
// ==========================================
export const launchInstanceSchema = z.object({
  name: z.string().regex(nameSlugRegex, 'Name must be 2-40 chars, lowercase alphanumeric with hyphens'),
  type_id: z.coerce.number().int().positive(),
  image_id: z.coerce.number().int().positive(),
  region_id: z.coerce.number().int().positive(),
  config: z.record(z.any()).optional(),
}).strict();

export const statusUpdateSchema = z.object({
  status: z.enum(['running', 'stopped', 'suspended', 'terminated']),
}).strict();

export const resizeInstanceSchema = z.object({
  type_id: z.coerce.number().int().positive(),
}).strict();

// ==========================================
// STORAGE & NETWORK
// ==========================================
export const createVolumeSchema = z.object({
  name: z.string().regex(nameSlugRegex, 'Volume name must be lowercase alphanumeric with hyphens'),
  region_id: z.coerce.number().int().positive(),
  size_gb: z.coerce.number().int().min(1).max(16000),
  vol_type: z.enum(['ssd', 'hdd']).default('ssd'),
}).strict();

export const attachVolumeSchema = z.object({
  instance_id: z.coerce.number().int().positive(),
}).strict();

export const resizeVolumeSchema = z.object({
  size_gb: z.coerce.number().int().min(1).max(16000),
}).strict();

export const createSnapshotSchema = z.object({
  name: z.string().regex(nameSlugRegex, 'Snapshot name must be lowercase alphanumeric with hyphens'),
}).strict();

export const restoreSnapshotSchema = z.object({
  name: z.string().regex(nameSlugRegex, 'Restored volume name must be lowercase alphanumeric with hyphens'),
}).strict();

export const registerDomainSchema = z.object({
  name: z.string().trim().toLowerCase().regex(domainRegex, 'Valid domain name required (e.g. example.com)'),
  years: z.coerce.number().int().min(1).max(10).default(1),
}).strict();

export const renewDomainSchema = z.object({
  years: z.coerce.number().int().min(1).max(10).default(1),
}).strict();

export const dnsRecordSchema = z.object({
  rtype: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT']),
  name: z.string().trim().toLowerCase().default('@'),
  value: z.string().trim().min(1),
  ttl: z.coerce.number().int().min(60).max(86400).default(3600),
  priority: z.coerce.number().int().min(0).max(65535).nullable().optional(),
}).strict();

// ==========================================
// BILLING
// ==========================================
export const generateInvoiceSchema = z.object({
  org_id: z.coerce.number().int().positive().optional(),
  period_start: z.string().regex(dateRegex, 'Date format YYYY-MM-DD required'),
  period_end: z.string().regex(dateRegex, 'Date format YYYY-MM-DD required'),
}).strict();

export const payInvoiceSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  method: z.enum(['card', 'upi', 'netbanking', 'credit']),
  txn_ref: z.string().trim().min(1, 'Transaction reference is required'),
}).strict();

export const addCreditSchema = z.object({
  org_id: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  note: z.string().trim().optional(),
}).strict();

// ==========================================
// TICKETS
// ==========================================
export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  message: z.string().trim().min(1),
}).strict();

export const addMessageSchema = z.object({
  body: z.string().trim().min(1),
}).strict();

export const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_to: z.coerce.number().int().nullable().optional(),
}).strict();

// ==========================================
// INFRASTRUCTURE & PRICING
// ==========================================
export const setPriceSchema = z.object({
  type_id: z.coerce.number().int().positive(),
  price_per_hour: z.coerce.number().positive(),
  effective_from: z.string().regex(dateRegex, 'Date format YYYY-MM-DD required'),
}).strict();

export const createHostSchema = z.object({
  region_id: z.coerce.number().int().positive(),
  hostname: z.string().trim().min(1).max(60),
  total_vcpu: z.coerce.number().int().positive(),
  total_ram_gb: z.coerce.number().int().positive(),
  total_disk_gb: z.coerce.number().int().positive(),
}).strict();

export const updateHostSchema = z.object({
  status: z.enum(['active', 'maintenance', 'retired']).optional(),
  total_vcpu: z.coerce.number().int().positive().optional(),
  total_ram_gb: z.coerce.number().int().positive().optional(),
  total_disk_gb: z.coerce.number().int().positive().optional(),
}).strict();

export const createRegionSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(60),
  country: z.string().trim().min(2).max(60),
}).strict();

export const updateRegionSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  country: z.string().trim().min(2).max(60).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict();

export const createInstanceTypeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  family: z.enum(['general', 'compute', 'memory']).default('general'),
  vcpu: z.coerce.number().int().positive(),
  ram_gb: z.coerce.number().int().positive(),
  disk_gb: z.coerce.number().int().positive(),
}).strict();

export const updateInstanceTypeSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  family: z.enum(['general', 'compute', 'memory']).optional(),
  vcpu: z.coerce.number().int().positive().optional(),
  ram_gb: z.coerce.number().int().positive().optional(),
  disk_gb: z.coerce.number().int().positive().optional(),
  active: z.boolean().optional(),
}).strict();

// ==========================================
// ADMIN
// ==========================================
export const simulateUsageSchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
}).strict();

export const perfRunSchema = z.object({
  queryId: z.enum(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10']),
}).strict();
