import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Database,
  Search,
  Sparkles,
  Maximize2,
  Minimize2,
  RotateCcw,
  Plus,
  HelpCircle,
  Layers,
  ArrowRight
} from 'lucide-react';
import '../../styles/erDiagram.css';

// Dimensions and constants
const TABLE_WIDTH = 200;
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 40;

// Relationship categories with color tokens
const RELATION_TYPES = {
  one: { label: 'One to one', color: '#4F46E5' },
  many: { label: 'One to many', color: '#059669' },
  junction: { label: 'Many to many (via junction)', color: '#EA580C' },
  self: { label: 'Self reference', color: '#D97706' },
};

// Initial Database Schema and Realistic Sample Data
const INITIAL_TABLES = {
  account_tiers: {
    x: 40,
    y: 50,
    c: '#CFC8FF',
    cols: [
      ['tier_id', 'int', 'pk'],
      ['name', 'varchar(40)', 'uq'],
      ['max_instances', 'int'],
      ['max_storage_gb', 'int'],
      ['discount_pct', 'decimal(4,2)']
    ],
    rows: [
      [1, 'Free', 2, 50, '0.00'],
      [2, 'Starter', 10, 500, '0.00'],
      [3, 'Business', 50, 5000, '5.00'],
      [4, 'Enterprise', 500, 100000, '15.00']
    ]
  },
  organizations: {
    x: 40,
    y: 310,
    c: '#BDEBDD',
    cols: [
      ['org_id', 'int', 'pk'],
      ['name', 'varchar(120)', 'uq'],
      ['tier_id', 'int', 'fk'],
      ['parent_org_id', 'int', 'fk'],
      ['status', 'enum'],
      ['credit_balance', 'decimal(12,2)'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 'NimbusHost Internal', 4, null, 'active', '5000.00', '2026-01-01'],
      [2, 'Acme Robotics', 2, null, 'active', '450.00', '2026-02-15'],
      [3, 'Acme Labs (Sub)', 2, 2, 'active', '120.00', '2026-03-01'],
      [4, 'Vertex Cloud Labs', 3, null, 'active', '1200.00', '2026-02-20']
    ]
  },
  users: {
    x: 320,
    y: 50,
    c: '#C9F2C7',
    cols: [
      ['user_id', 'int', 'pk'],
      ['email', 'varchar(150)', 'uq'],
      ['password_hash', 'varchar(255)'],
      ['full_name', 'varchar(100)'],
      ['system_role', 'enum'],
      ['status', 'enum'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 'admin@nimbushost.internal', 'argon2$...', 'Super Administrator', 'super_admin', 'active', '2026-01-01'],
      [2, 'suyash@acme.com', 'argon2$...', 'Suyash Naik', 'customer', 'active', '2026-02-15'],
      [3, 'billing@nimbushost.com', 'argon2$...', 'Billing Lead', 'billing', 'active', '2026-01-05'],
      [4, 'support@nimbushost.com', 'argon2$...', 'Tier 2 Agent', 'support', 'active', '2026-01-05']
    ]
  },
  org_members: {
    x: 320,
    y: 370,
    c: '#FFD9B8',
    cols: [
      ['org_id', 'int', 'fk'],
      ['user_id', 'int', 'fk'],
      ['member_role', 'enum'],
      ['joined_at', 'timestamp']
    ],
    rows: [
      [1, 1, 'owner', '2026-01-01'],
      [2, 2, 'owner', '2026-02-15'],
      [3, 2, 'member', '2026-03-01']
    ]
  },
  api_keys: {
    x: 40,
    y: 650,
    c: '#FFF0A8',
    cols: [
      ['key_id', 'int', 'pk'],
      ['user_id', 'int', 'fk'],
      ['key_hash', 'varchar(64)', 'uq'],
      ['label', 'varchar(100)'],
      ['revoked', 'boolean'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 2, 'sha256$8f14...', 'CI/CD GitHub Actions', 0, '2026-02-16'],
      [2, 2, 'sha256$3b91...', 'Terraform Production', 0, '2026-03-10']
    ]
  },
  refresh_tokens: {
    x: 320,
    y: 650,
    c: '#E4D3FF',
    cols: [
      ['token_id', 'bigint', 'pk'],
      ['user_id', 'int', 'fk'],
      ['token_hash', 'varchar(64)', 'uq'],
      ['family_id', 'varchar(36)'],
      ['expires_at', 'timestamp']
    ],
    rows: [
      [1, 1, 'hash_99a8...', 'f81d4fae-7dec-11d0', '2026-11-01'],
      [2, 2, 'hash_b2c4...', '7b1c4e20-7dec-11d0', '2026-11-01']
    ]
  },
  regions: {
    x: 600,
    y: 50,
    c: '#BFE0FF',
    cols: [
      ['region_id', 'int', 'pk'],
      ['code', 'varchar(20)', 'uq'],
      ['name', 'varchar(60)'],
      ['country', 'varchar(60)'],
      ['status', 'enum']
    ],
    rows: [
      [1, 'ap-south-1', 'Mumbai', 'India', 'active'],
      [2, 'eu-west-1', 'Dublin', 'Ireland', 'active'],
      [3, 'us-east-1', 'N. Virginia', 'United States', 'active']
    ]
  },
  hosts: {
    x: 600,
    y: 310,
    c: '#BFE0FF',
    cols: [
      ['host_id', 'int', 'pk'],
      ['region_id', 'int', 'fk'],
      ['hostname', 'varchar(60)', 'uq'],
      ['total_vcpu', 'int'],
      ['total_ram_gb', 'int'],
      ['total_disk_gb', 'int'],
      ['used_vcpu', 'int'],
      ['status', 'enum']
    ],
    rows: [
      [1, 1, 'mum-h01', 64, 256, 4000, 28, 'active'],
      [2, 1, 'mum-h02', 64, 256, 4000, 24, 'active'],
      [3, 2, 'dub-h01', 64, 256, 4000, 16, 'active'],
      [4, 3, 'iad-h01', 128, 512, 8000, 48, 'active']
    ]
  },
  instance_types: {
    x: 870,
    y: 50,
    c: '#FFD3E2',
    cols: [
      ['type_id', 'int', 'pk'],
      ['name', 'varchar(40)', 'uq'],
      ['family', 'enum'],
      ['vcpu', 'int'],
      ['ram_gb', 'int'],
      ['disk_gb', 'int'],
      ['active', 'boolean']
    ],
    rows: [
      [1, 'nano', 'general', 1, 1, 10, 1],
      [2, 'micro', 'general', 1, 2, 20, 1],
      [3, 'small', 'general', 2, 4, 40, 1],
      [4, 'medium', 'general', 2, 8, 80, 1],
      [5, 'large', 'general', 4, 16, 160, 1],
      [6, 'xlarge', 'general', 8, 32, 320, 1]
    ]
  },
  pricing: {
    x: 870,
    y: 350,
    c: '#FFF0A8',
    cols: [
      ['price_id', 'int', 'pk'],
      ['type_id', 'int', 'fk'],
      ['price_per_hour', 'decimal(8,4)'],
      ['valid_from', 'date'],
      ['valid_to', 'date']
    ],
    rows: [
      [1, 1, '0.0060', '2026-01-01', null],
      [2, 2, '0.0110', '2026-01-01', null],
      [3, 3, '0.0210', '2026-07-01', null],
      [4, 4, '0.0420', '2026-07-01', null],
      [5, 5, '0.0840', '2026-01-01', null]
    ]
  },
  images: {
    x: 870,
    y: 640,
    c: '#CFC8FF',
    cols: [
      ['image_id', 'int', 'pk'],
      ['name', 'varchar(60)'],
      ['os_family', 'enum'],
      ['version', 'varchar(20)'],
      ['min_disk_gb', 'int']
    ],
    rows: [
      [1, 'Ubuntu', 'linux', '22.04', 10],
      [2, 'Ubuntu', 'linux', '24.04', 10],
      [3, 'Debian', 'linux', '12', 10],
      [4, 'Alpine Linux', 'linux', '3.19', 5],
      [5, 'Windows Server', 'windows', '2022', 40]
    ]
  },
  instances: {
    x: 1140,
    y: 200,
    c: '#BDEBDD',
    cols: [
      ['instance_id', 'int', 'pk'],
      ['org_id', 'int', 'fk'],
      ['host_id', 'int', 'fk'],
      ['type_id', 'int', 'fk'],
      ['image_id', 'int', 'fk'],
      ['name', 'varchar(40)'],
      ['status', 'enum'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 2, 1, 3, 2, 'prod-api-server', 'running', '2026-09-01'],
      [2, 2, 1, 4, 1, 'prod-db-primary', 'running', '2026-09-01'],
      [3, 2, 2, 2, 4, 'cache-redis-01', 'stopped', '2026-10-05'],
      [4, 4, 3, 5, 2, 'analytics-worker', 'running', '2026-09-15']
    ]
  },
  ip_addresses: {
    x: 1140,
    y: 620,
    c: '#FFD9B8',
    cols: [
      ['ip_id', 'int', 'pk'],
      ['region_id', 'int', 'fk'],
      ['ip_address', 'varchar(15)', 'uq'],
      ['instance_id', 'int', 'fk'],
      ['allocated_at', 'timestamp']
    ],
    rows: [
      [1, 1, '203.0.113.12', 1, '2026-09-01'],
      [2, 1, '203.0.113.15', 2, '2026-09-01'],
      [3, 2, '198.51.100.22', 4, '2026-09-15'],
      [4, 1, '203.0.113.88', null, null]
    ]
  },
  volumes: {
    x: 1410,
    y: 160,
    c: '#C9F2C7',
    cols: [
      ['volume_id', 'int', 'pk'],
      ['org_id', 'int', 'fk'],
      ['region_id', 'int', 'fk'],
      ['instance_id', 'int', 'fk'],
      ['name', 'varchar(40)'],
      ['size_gb', 'int'],
      ['vol_type', 'enum'],
      ['status', 'enum']
    ],
    rows: [
      [1, 2, 1, 1, 'vol-prod-root', 50, 'ssd', 'attached'],
      [2, 2, 1, 2, 'vol-prod-data', 200, 'ssd', 'attached'],
      [3, 2, 1, null, 'vol-backup-cold', 100, 'hdd', 'available']
    ]
  },
  snapshots: {
    x: 1670,
    y: 160,
    c: '#E4D3FF',
    cols: [
      ['snapshot_id', 'int', 'pk'],
      ['volume_id', 'int', 'fk'],
      ['name', 'varchar(40)'],
      ['size_gb', 'int'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 2, 'snap-2026-10-01', 200, '2026-10-01'],
      [2, 2, 'snap-2026-10-15', 200, '2026-10-15']
    ]
  },
  domains: {
    x: 1140,
    y: 860,
    c: '#FFF0A8',
    cols: [
      ['domain_id', 'int', 'pk'],
      ['org_id', 'int', 'fk'],
      ['name', 'varchar(100)', 'uq'],
      ['registered_on', 'date'],
      ['expires_on', 'date'],
      ['auto_renew', 'boolean']
    ],
    rows: [
      [1, 2, 'acmerobotics.io', '2025-05-10', '2027-05-10', 1],
      [2, 4, 'vertexcloud.dev', '2026-01-20', '2027-01-20', 1]
    ]
  },
  dns_records: {
    x: 1410,
    y: 860,
    c: '#BFE0FF',
    cols: [
      ['record_id', 'int', 'pk'],
      ['domain_id', 'int', 'fk'],
      ['rtype', 'enum'],
      ['name', 'varchar(63)'],
      ['value', 'varchar(255)'],
      ['ttl', 'int']
    ],
    rows: [
      [1, 1, 'A', '@', '203.0.113.12', 3600],
      [2, 1, 'CNAME', 'api', 'acmerobotics.io', 3600],
      [3, 1, 'MX', '@', 'mail.acmerobotics.io', 7200]
    ]
  },
  invoices: {
    x: 1410,
    y: 480,
    c: '#FFD3E2',
    cols: [
      ['invoice_id', 'int', 'pk'],
      ['org_id', 'int', 'fk'],
      ['period_start', 'date'],
      ['period_end', 'date'],
      ['subtotal', 'decimal(12,2)'],
      ['total', 'decimal(12,2)'],
      ['status', 'enum'],
      ['due_date', 'date']
    ],
    rows: [
      [101, 2, '2026-08-01', '2026-08-31', '142.50', '142.50', 'paid', '2026-09-15'],
      [102, 2, '2026-09-01', '2026-09-30', '168.00', '168.00', 'paid', '2026-10-15'],
      [103, 2, '2026-10-01', '2026-10-31', '155.20', '155.20', 'issued', '2026-11-15']
    ]
  },
  invoice_items: {
    x: 1670,
    y: 480,
    c: '#CFC8FF',
    cols: [
      ['item_id', 'int', 'pk'],
      ['invoice_id', 'int', 'fk'],
      ['instance_id', 'int', 'fk'],
      ['description', 'varchar(255)'],
      ['quantity', 'decimal(10,3)'],
      ['unit_price', 'decimal(8,4)'],
      ['amount', 'decimal(12,2)']
    ],
    rows: [
      [1, 102, 1, 'Instance prod-api-server (720 hrs)', '720.000', '0.0210', '15.12'],
      [2, 102, 2, 'Instance prod-db-primary (720 hrs)', '720.000', '0.0420', '30.24'],
      [3, 102, null, 'SSD Storage Volume 200GB', '200.000', '0.1000', '20.00']
    ]
  },
  payments: {
    x: 1670,
    y: 780,
    c: '#BDEBDD',
    cols: [
      ['payment_id', 'int', 'pk'],
      ['invoice_id', 'int', 'fk'],
      ['amount', 'decimal(12,2)'],
      ['method', 'enum'],
      ['txn_ref', 'varchar(100)', 'uq'],
      ['paid_at', 'timestamp']
    ],
    rows: [
      [1, 101, '142.50', 'card', 'txn_stripe_9921', '2026-09-10'],
      [2, 102, '168.00', 'netbanking', 'txn_hdfc_4820', '2026-10-12']
    ]
  },
  tickets: {
    x: 1930,
    y: 160,
    c: '#FFD9B8',
    cols: [
      ['ticket_id', 'int', 'pk'],
      ['org_id', 'int', 'fk'],
      ['created_by', 'int', 'fk'],
      ['assigned_to', 'int', 'fk'],
      ['subject', 'varchar(200)'],
      ['priority', 'enum'],
      ['status', 'enum'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 2, 2, 4, 'Public IP reverse DNS PTR record request', 'medium', 'resolved', '2026-09-12'],
      [2, 2, 2, 4, 'Increase quota for NVMe attached volumes', 'high', 'in_progress', '2026-10-18']
    ]
  },
  ticket_messages: {
    x: 1930,
    y: 560,
    c: '#C9F2C7',
    cols: [
      ['message_id', 'int', 'pk'],
      ['ticket_id', 'int', 'fk'],
      ['sender_id', 'int', 'fk'],
      ['body', 'text'],
      ['created_at', 'timestamp']
    ],
    rows: [
      [1, 1, 2, 'Could you please set ptr ptr.acmerobotics.io for 203.0.113.12?', '2026-09-12 10:14'],
      [2, 1, 4, 'PTR record has been configured on the gateway zone.', '2026-09-12 11:02'],
      [3, 2, 2, 'We need to bump from 500GB to 1TB for database expansion.', '2026-10-18 14:22']
    ]
  }
};

// Initial Relationships array with plain English explanation
const INITIAL_RELATIONSHIPS = [
  {
    p: 'account_tiers',
    c: 'organizations',
    col: 'tier_id',
    k: 'many',
    opt: 0,
    s: 'An account tier defines instance and storage quotas for many organizations.'
  },
  {
    p: 'organizations',
    c: 'organizations',
    col: 'parent_org_id',
    k: 'self',
    opt: 1,
    s: 'An organization can optionally be a sub-account of a parent organization (hierarchical multi-tenancy).'
  },
  {
    p: 'organizations',
    c: 'org_members',
    col: 'org_id',
    k: 'junction',
    opt: 0,
    s: 'Organizations contain multiple user members through the org_members junction table.'
  },
  {
    p: 'users',
    c: 'org_members',
    col: 'user_id',
    k: 'junction',
    opt: 0,
    s: 'Users can belong to multiple customer organizations with distinct member roles (owner, member).'
  },
  {
    p: 'users',
    c: 'api_keys',
    col: 'user_id',
    k: 'many',
    opt: 0,
    s: 'A user can generate multiple API keys for automated CLI and Terraform automation.'
  },
  {
    p: 'users',
    c: 'refresh_tokens',
    col: 'user_id',
    k: 'many',
    opt: 0,
    s: 'A user maintains active session refresh tokens across browsers and CLI devices.'
  },
  {
    p: 'regions',
    c: 'hosts',
    col: 'region_id',
    k: 'many',
    opt: 0,
    s: 'Each physical cloud region houses multiple bare-metal hypervisor hosts.'
  },
  {
    p: 'regions',
    c: 'ip_addresses',
    col: 'region_id',
    k: 'many',
    opt: 0,
    s: 'Each cloud region owns a dedicated pool of public IPv4 addresses for instance binding.'
  },
  {
    p: 'instance_types',
    c: 'pricing',
    col: 'type_id',
    k: 'many',
    opt: 0,
    s: 'Instance types have hourly billing pricing schedules tracked across time.'
  },
  {
    p: 'hosts',
    c: 'instances',
    col: 'host_id',
    k: 'many',
    opt: 0,
    s: 'A hypervisor host provisions and runs multiple virtual compute instances.'
  },
  {
    p: 'organizations',
    c: 'instances',
    col: 'org_id',
    k: 'many',
    opt: 0,
    s: 'An organization provisions, operates, and owns multiple compute instances.'
  },
  {
    p: 'instance_types',
    c: 'instances',
    col: 'type_id',
    k: 'many',
    opt: 0,
    s: 'Each virtual instance is configured to a specific hardware instance type (vCPU, RAM, disk).'
  },
  {
    p: 'images',
    c: 'instances',
    col: 'image_id',
    k: 'many',
    opt: 0,
    s: 'Each compute instance boots from an operating system base image.'
  },
  {
    p: 'instances',
    c: 'ip_addresses',
    col: 'instance_id',
    k: 'one',
    opt: 1,
    s: 'An instance can be assigned a dedicated static public IPv4 address (1:1 allocation).'
  },
  {
    p: 'instances',
    c: 'volumes',
    col: 'instance_id',
    k: 'many',
    opt: 1,
    s: 'An instance can attach multiple high-performance SSD/HDD block storage volumes.'
  },
  {
    p: 'organizations',
    c: 'volumes',
    col: 'org_id',
    k: 'many',
    opt: 0,
    s: 'Storage volumes belong to customer organizations for quota management and billing.'
  },
  {
    p: 'regions',
    c: 'volumes',
    col: 'region_id',
    k: 'many',
    opt: 0,
    s: 'Block volumes are physically provisioned in the storage cluster of a specific region.'
  },
  {
    p: 'volumes',
    c: 'snapshots',
    col: 'volume_id',
    k: 'many',
    opt: 0,
    s: 'A volume can produce multiple point-in-time snapshot backups for disaster recovery.'
  },
  {
    p: 'organizations',
    c: 'domains',
    col: 'org_id',
    k: 'many',
    opt: 0,
    s: 'An organization registers and manages custom DNS domain names.'
  },
  {
    p: 'domains',
    c: 'dns_records',
    col: 'domain_id',
    k: 'many',
    opt: 0,
    s: 'A domain manages multiple DNS resource records (A, AAAA, CNAME, MX, TXT).'
  },
  {
    p: 'organizations',
    c: 'invoices',
    col: 'org_id',
    k: 'many',
    opt: 0,
    s: 'Monthly billing cycles issue itemized usage invoices to customer organizations.'
  },
  {
    p: 'invoices',
    c: 'invoice_items',
    col: 'invoice_id',
    k: 'many',
    opt: 0,
    s: 'An invoice breaks down compute hours, attached storage, and egress bandwidth.'
  },
  {
    p: 'instances',
    c: 'invoice_items',
    col: 'instance_id',
    k: 'many',
    opt: 1,
    s: 'Invoice line items can directly correlate to an individual running compute instance.'
  },
  {
    p: 'invoices',
    c: 'payments',
    col: 'invoice_id',
    k: 'many',
    opt: 0,
    s: 'Invoices receive settlement payments via Credit Card, UPI, Netbanking, or Account Credit.'
  },
  {
    p: 'organizations',
    c: 'tickets',
    col: 'org_id',
    k: 'many',
    opt: 0,
    s: 'Organizations open technical support and billing escalation tickets.'
  },
  {
    p: 'users',
    c: 'tickets',
    col: 'created_by',
    k: 'many',
    opt: 0,
    s: 'A customer or administrator user authors support tickets.'
  },
  {
    p: 'users',
    c: 'tickets',
    col: 'assigned_to',
    k: 'many',
    opt: 1,
    s: 'NimbusHost support engineers are assigned to investigate and resolve customer tickets.'
  },
  {
    p: 'tickets',
    c: 'ticket_messages',
    col: 'ticket_id',
    k: 'many',
    opt: 0,
    s: 'Support tickets maintain a sequential discussion thread of customer and agent replies.'
  },
  {
    p: 'users',
    c: 'ticket_messages',
    col: 'sender_id',
    k: 'many',
    opt: 0,
    s: 'Each ticket reply message is authored by a user (customer or support agent).'
  }
];

export default function ERDiagram() {
  const [tables, setTables] = useState(() => JSON.parse(JSON.stringify(INITIAL_TABLES)));
  const [relationships, setRelationships] = useState(() => [...INITIAL_RELATIONSHIPS]);
  const [disabledTypes, setDisabledTypes] = useState(() => new Set());
  const [selectedTable, setSelectedTable] = useState(null);
  const [hoveredRelIndex, setHoveredRelIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  // Modeling inputs in side panel
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('varchar(100)');
  const [linkTargetTable, setLinkTargetTable] = useState('');
  const [linkRelationKind, setLinkRelationKind] = useState('many');

  // New Table bar input
  const [newTableNameInput, setNewTableNameInput] = useState('');

  // Canvas references
  const canvasWrapRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const dragRef = useRef(null);
  const tooltipRef = useRef(null);

  // Store original home positions for "Tidy Up"
  const homePositions = useRef({});
  useEffect(() => {
    const hp = {};
    for (const key in INITIAL_TABLES) {
      hp[key] = [INITIAL_TABLES[key].x, INITIAL_TABLES[key].y];
    }
    homePositions.current = hp;
  }, []);

  // Show Toast helper
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2400);
  }, []);

  // Toggle relation type filter
  const toggleFilter = (typeKey) => {
    setDisabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) next.delete(typeKey);
      else next.add(typeKey);
      return next;
    });
  };

  // Helper to determine if a table is linked to selectedTable
  const isLinkedToSelected = useCallback((tableName) => {
    if (!selectedTable) return false;
    return relationships.some(
      (r) =>
        (r.p === tableName || r.c === tableName) &&
        (r.p === selectedTable || r.c === selectedTable)
    );
  }, [selectedTable, relationships]);

  // Center / Focus table
  const focusTable = useCallback((tableName) => {
    setSelectedTable(tableName);
    const target = tables[tableName];
    if (target && canvasWrapRef.current) {
      const wrap = canvasWrapRef.current;
      const targetX = target.x - wrap.clientWidth / 2 + TABLE_WIDTH / 2;
      const targetY = target.y - wrap.clientHeight / 2 + 100;
      wrap.scrollTo({
        left: Math.max(0, targetX),
        top: Math.max(0, targetY),
        behavior: 'smooth'
      });
    }
  }, [tables]);

  // Tidy Up Animation
  const handleTidyUp = () => {
    const startPositions = {};
    for (const key in tables) {
      startPositions[key] = [tables[key].x, tables[key].y];
    }
    const t0 = performance.now();
    const duration = 500;

    const animate = (now) => {
      const u = Math.min(1, (now - t0) / duration);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - u, 3);

      setTables((prev) => {
        const updated = { ...prev };
        for (const key in updated) {
          const home = homePositions.current[key] || [updated[key].x, updated[key].y];
          const start = startPositions[key] || [updated[key].x, updated[key].y];
          updated[key] = {
            ...updated[key],
            x: Math.round(start[0] + (home[0] - start[0]) * ease),
            y: Math.round(start[1] + (home[1] - start[1]) * ease)
          };
        }
        return updated;
      });

      if (u < 1) {
        requestAnimationFrame(animate);
      } else {
        showToast('All tables aligned to clean cluster layout');
      }
    };

    requestAnimationFrame(animate);
  };

  // Add Table
  const handleAddTable = () => {
    const cleanName = newTableNameInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 30);

    if (!cleanName) {
      showToast('Please enter a valid table name');
      return;
    }
    if (tables[cleanName]) {
      showToast(`Table '${cleanName}' already exists`);
      return;
    }

    const wrap = canvasWrapRef.current;
    const posX = Math.round((wrap?.scrollLeft || 0) + 60);
    const posY = Math.round((wrap?.scrollTop || 0) + 60);

    const newTbl = {
      x: posX,
      y: posY,
      c: '#FFE0F0',
      cols: [['id', 'int', 'pk']],
      rows: [[1], [2], [3]]
    };

    homePositions.current[cleanName] = [posX, posY];

    setTables((prev) => ({ ...prev, [cleanName]: newTbl }));
    setNewTableNameInput('');
    setSelectedTable(cleanName);
    showToast(`Created table '${cleanName}'. Add columns in side panel.`);
  };

  // Add Column inside selected table
  const handleAddColumn = () => {
    if (!selectedTable) return;
    const cleanName = newColName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 30);

    if (!cleanName) {
      showToast('Please enter a column name');
      return;
    }

    const currentTbl = tables[selectedTable];
    if (currentTbl.cols.some((c) => c[0] === cleanName)) {
      showToast(`Column '${cleanName}' already exists in ${selectedTable}`);
      return;
    }

    setTables((prev) => {
      const tbl = { ...prev[selectedTable] };
      tbl.cols = [...tbl.cols, [cleanName, newColType]];
      tbl.rows = tbl.rows.map((r) => [...r, null]);
      return { ...prev, [selectedTable]: tbl };
    });

    setNewColName('');
    showToast(`Added column '${cleanName}' to ${selectedTable}`);
  };

  // Connect Table
  const handleAddRelationship = () => {
    if (!selectedTable || !linkTargetTable) {
      showToast('Select a target table to link');
      return;
    }

    const fkCol = `${linkTargetTable.replace(/ies$/, 'y').replace(/s$/, '')}_id`;

    // Check if link already exists
    if (relationships.some((r) => r.c === selectedTable && r.col === fkCol)) {
      showToast(`Already linked through foreign key ${fkCol}`);
      return;
    }

    // Add FK column to selected table if missing
    setTables((prev) => {
      const tbl = { ...prev[selectedTable] };
      if (!tbl.cols.some((c) => c[0] === fkCol)) {
        tbl.cols = [...tbl.cols, [fkCol, 'int', 'fk']];
        tbl.rows = tbl.rows.map((r) => [...r, null]);
      }
      return { ...prev, [selectedTable]: tbl };
    });

    const newRel = {
      p: linkTargetTable,
      c: selectedTable,
      col: fkCol,
      k: linkRelationKind,
      opt: 1,
      s:
        linkRelationKind === 'one'
          ? `Each ${selectedTable} has a 1:1 relationship with ${linkTargetTable}.`
          : `Each ${selectedTable} belongs to a parent ${linkTargetTable}.`
    };

    setRelationships((prev) => [...prev, newRel]);
    showToast(`Linked ${selectedTable} to ${linkTargetTable}`);
  };

  // Drag handling
  const handlePointerDown = (e, tableName) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      tableName,
      startX: e.clientX,
      startY: e.clientY,
      initX: tables[tableName].x,
      initY: tables[tableName].y,
      moved: false
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const { tableName, startX, startY, initX, initY } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) + Math.abs(dy) > 4) {
      dragRef.current.moved = true;
    }

    const nextX = Math.max(0, Math.min(2200 - TABLE_WIDTH, initX + dx));
    const nextY = Math.max(0, Math.min(1100 - 60, initY + dy));

    setTables((prev) => ({
      ...prev,
      [tableName]: {
        ...prev[tableName],
        x: nextX,
        y: nextY
      }
    }));
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current) return;
    const { tableName, moved } = dragRef.current;
    dragRef.current = null;
    if (!moved) {
      setSelectedTable((prev) => (prev === tableName ? null : tableName));
    }
  };

  // Column coordinate resolver
  const getColPosition = useCallback((tName, colIndex, side) => {
    const tbl = tables[tName];
    if (!tbl) return [0, 0];
    const x = tbl.x + (side > 0 ? TABLE_WIDTH : 0);
    const y = tbl.y + HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    return [x, y];
  }, [tables]);

  // SVG Crow's foot / bar glyph generator
  const renderGlyph = (x, y, dir, type, optional) => {
    let pathData = '';
    if (type === 'foot') {
      pathData = `M${x + dir * 13} ${y}L${x} ${y - 8}M${x + dir * 13} ${y}L${x} ${y}M${x + dir * 13} ${y}L${x} ${y + 8}`;
    } else if (type === 'bar') {
      pathData = `M${x + dir * 11} ${y - 8}v16`;
    } else {
      // 'bars' (1 and only 1 on parent)
      pathData = `M${x + dir * 11} ${y - 8}v16M${x + dir * 17} ${y - 8}v16`;
    }

    return (
      <React.Fragment>
        <path className="glyph" d={pathData} />
        {optional ? (
          <circle
            cx={x + dir * (type === 'foot' ? 21 : 19)}
            cy={y}
            r={4.5}
            fill="var(--card)"
            strokeWidth={2}
          />
        ) : null}
      </React.Fragment>
    );
  };

  // Hover relationship tooltip
  const handleRelPointerOver = (e, index, rel) => {
    setHoveredRelIndex(index);
    if (tooltipRef.current) {
      tooltipRef.current.textContent = rel.s;
      tooltipRef.current.style.opacity = '1';
      tooltipRef.current.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
      tooltipRef.current.style.top = `${e.clientY + 18}px`;
    }
  };

  const handleRelPointerMove = (e) => {
    if (tooltipRef.current && tooltipRef.current.style.opacity === '1') {
      tooltipRef.current.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
      tooltipRef.current.style.top = `${e.clientY + 18}px`;
    }
  };

  const handleRelPointerOut = () => {
    setHoveredRelIndex(null);
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = '0';
    }
  };

  // Set default target for linking
  useEffect(() => {
    if (selectedTable) {
      const others = Object.keys(tables).filter((k) => k !== selectedTable);
      if (others.length && !others.includes(linkTargetTable)) {
        setLinkTargetTable(others[0]);
      }
    }
  }, [selectedTable, tables, linkTargetTable]);

  // Table matches query check
  const isMatchQuery = useCallback(
    (key) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (key.toLowerCase().includes(q)) return true;
      const t = tables[key];
      return t.cols.some((c) => c[0].toLowerCase().includes(q));
    },
    [searchQuery, tables]
  );

  return (
    <div className="erd-page">
      {/* ER Diagram Top Header */}
      <div className="erd-header">
        <div className="erd-title-group">
          <h1>
            <Database size={26} color="var(--brand)" />
            <span>NimbusHost Enterprise Database ER Diagram</span>
          </h1>
          <p className="erd-subtitle">
            Interactive relational schema blueprint. Drag table nodes to inspect architecture, click
            to reveal foreign keys & sample rows, or hover connection lines for plain-English descriptions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="erd-btn"
            onClick={handleTidyUp}
            title="Auto-align tables to default clusters"
          >
            <RotateCcw size={15} />
            <span>Tidy Up</span>
          </button>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="erd-toolbar">
        {/* Search */}
        <div className="erd-search-wrap">
          <Search size={15} className="erd-search-icon" />
          <input
            type="search"
            placeholder="Find a table or column (e.g. org_id, instance)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="erd-search-input"
          />
        </div>

        {/* Filter Chips */}
        <div className="erd-chips">
          {Object.entries(RELATION_TYPES).map(([key, info]) => {
            const isOff = disabledTypes.has(key);
            return (
              <button
                key={key}
                type="button"
                className="erd-chip"
                style={{ '--c': info.color }}
                aria-pressed={!isOff}
                onClick={() => toggleFilter(key)}
              >
                <i />
                <span>{info.label}</span>
              </button>
            );
          })}
        </div>

        {/* Show Labels Toggle */}
        <label className="erd-toggle-lbl">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          <span>Show labels</span>
        </label>

        {/* Add Table Quick input */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="New table name"
            value={newTableNameInput}
            onChange={(e) => setNewTableNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
            style={{
              height: 36,
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--line)',
              fontSize: 13,
              background: 'var(--bg-alt)',
              color: 'var(--ink)',
              width: 140
            }}
          />
          <button type="button" className="erd-btn erd-btn-brand" onClick={handleAddTable}>
            <Plus size={15} />
            <span>Add Table</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive Canvas + Inspection Side Panel */}
      <div className="erd-main">
        {/* Canvas Wrap */}
        <div className="erd-canvas-wrap" ref={canvasWrapRef}>
          <div className="erd-canvas">
            {/* SVG Relationship Lines Layer */}
            <svg className="erd-svg" width={2200} height={1100}>
              {relationships.map((r, i) => {
                if (disabledTypes.has(r.k)) return null;

                const P = tables[r.p];
                const C = tables[r.c];
                if (!P || !C) return null;

                const ci = C.cols.findIndex((col) => col[0] === r.col);
                const pi = Math.max(0, P.cols.findIndex((col) => col[2] === 'pk'));

                let sc = 1;
                let sp = 1;

                if (r.p !== r.c) {
                  const dx = C.x - P.x;
                  if (Math.abs(dx) >= 60) {
                    sc = dx < 0 ? 1 : -1;
                    sp = -sc;
                  }
                }

                const [x1, y1] = getColPosition(r.c, ci > -1 ? ci : 0, sc);
                const [x2, y2] = getColPosition(r.p, pi, sp);

                const L = r.p === r.c ? 90 : 70;
                const pathD = `M${x1} ${y1} C${x1 + sc * L} ${y1}, ${x2 + sp * L} ${y2}, ${x2} ${y2}`;

                const isConnectedToSel = selectedTable
                  ? r.p === selectedTable || r.c === selectedTable
                  : true;
                const isHovered = hoveredRelIndex === i;
                const opacity = isHovered || (hoveredRelIndex === null && isConnectedToSel) ? 1 : 0.12;

                const midX = (x1 + 3 * (x1 + sc * L) + 3 * (x2 + sp * L) + x2) / 8;
                const midY = (y1 + 3 * y1 + 3 * y2 + y2) / 8;
                const labText = r.k === 'one' ? '1:1' : r.k === 'self' ? 'Self' : '1:N';
                const strokeColor = RELATION_TYPES[r.k]?.color || '#4F46E5';

                return (
                  <g
                    key={`rel-${i}`}
                    className="erd-rel"
                    stroke={strokeColor}
                    style={{ opacity }}
                  >
                    <path
                      d={pathD}
                      strokeDasharray={r.k === 'self' ? '6 5' : undefined}
                      style={{ strokeWidth: isHovered ? 4 : 2.4 }}
                    />

                    {/* End glyphs */}
                    {renderGlyph(x1, y1, sc, r.k === 'one' ? 'bar' : 'foot', r.opt)}
                    {renderGlyph(x2, y2, sp, 'bars', 0)}

                    {/* Middle label badge */}
                    {showLabels && (
                      <g>
                        <rect
                          className="erd-lab"
                          x={midX - 17}
                          y={midY - 9}
                          width={34}
                          height={18}
                          rx={9}
                        />
                        <text x={midX} y={midY + 4}>
                          {labText}
                        </text>
                      </g>
                    )}

                    {/* Fat invisible path for easy hover targeting */}
                    <path
                      d={pathD}
                      stroke="transparent"
                      strokeWidth={18}
                      style={{ pointerEvents: 'stroke', cursor: 'help' }}
                      onPointerOver={(e) => handleRelPointerOver(e, i, r)}
                      onPointerMove={handleRelPointerMove}
                      onPointerOut={handleRelPointerOut}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Draggable Table Cards */}
            {Object.entries(tables).map(([tableName, tbl]) => {
              const isSel = selectedTable === tableName;
              const isMatch = isMatchQuery(tableName);
              const isLinked = isLinkedToSelected(tableName);
              const isDim = (selectedTable && !isSel && !isLinked) || (searchQuery && !isMatch);

              return (
                <div
                  key={tableName}
                  className={`erd-tbl ${isSel ? 'sel' : ''} ${isDim ? 'dim' : ''}`}
                  style={{ left: tbl.x, top: tbl.y }}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && focusTable(tableName)}
                >
                  {/* Table Header (Draggable handle) */}
                  <div
                    className="erd-tbl-head"
                    style={{ background: tbl.c }}
                    onPointerDown={(e) => handlePointerDown(e, tableName)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <span>{tableName}</span>
                    <small>{tbl.cols.length} cols</small>
                  </div>

                  {/* Table Rows (Columns) */}
                  <div>
                    {tbl.cols.map(([colName, colType, badge], idx) => (
                      <div
                        key={colName}
                        className="erd-tbl-row"
                        onClick={() => {
                          const relIdx = relationships.findIndex(
                            (x) => x.c === tableName && x.col === colName
                          );
                          if (relIdx > -1) {
                            setHoveredRelIndex(relIdx);
                            showToast(relationships[relIdx].s);
                            setTimeout(() => setHoveredRelIndex(null), 2500);
                          } else {
                            focusTable(tableName);
                          }
                        }}
                      >
                        <span className={`erd-badge ${badge || ''}`}>
                          {(badge || '').toUpperCase()}
                        </span>
                        <span className="erd-tbl-col-name">{colName}</span>
                        <span className="erd-tbl-col-type">{colType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Inspection Panel */}
        <aside className="erd-panel">
          {selectedTable ? (
            <React.Fragment>
              <div>
                <h2>{selectedTable}</h2>
                <div className="erd-panel-sub">
                  {tables[selectedTable].rows.length} sample rows ·{' '}
                  {tables[selectedTable].cols.length} columns
                </div>
              </div>

              {/* Connected Relationships */}
              <div>
                <h3>How it connects</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {relationships
                    .map((r, idx) => ({ r, idx }))
                    .filter(({ r }) => r.p === selectedTable || r.c === selectedTable)
                    .map(({ r, idx }) => {
                      const otherTable = r.p === selectedTable ? r.c : r.p;
                      const relType = RELATION_TYPES[r.k] || RELATION_TYPES.many;
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="erd-rel-btn"
                          style={{ '--c': relType.color }}
                          onMouseEnter={() => setHoveredRelIndex(idx)}
                          onMouseLeave={() => setHoveredRelIndex(null)}
                          onClick={() => focusTable(otherTable)}
                        >
                          <i />
                          <div className="erd-rel-btn-text">
                            <strong>
                              {relType.label} → {otherTable}
                            </strong>
                            <span>{r.s}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Sample Rows Preview */}
              <div>
                <h3>Sample Data Preview</h3>
                <div className="erd-sample-table-wrap" style={{ marginTop: 8 }}>
                  <table className="erd-sample-table">
                    <thead>
                      <tr>
                        {tables[selectedTable].cols.map(([colName]) => (
                          <th key={colName}>{colName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tables[selectedTable].rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {tables[selectedTable].cols.map((_, cIdx) => (
                            <td key={cIdx}>
                              {row[cIdx] === null || row[cIdx] === undefined ? '—' : String(row[cIdx])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Column Playground */}
              <div>
                <h3>Add a column</h3>
                <div className="erd-panel-row" style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="column_name"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                  />
                  <select
                    value={newColType}
                    onChange={(e) => setNewColType(e.target.value)}
                    style={{ maxWidth: 110 }}
                  >
                    <option value="varchar(100)">varchar</option>
                    <option value="int">int</option>
                    <option value="timestamp">timestamp</option>
                    <option value="boolean">boolean</option>
                    <option value="decimal(10,2)">decimal</option>
                    <option value="json">json</option>
                  </select>
                  <button
                    type="button"
                    className="erd-btn erd-btn-brand"
                    onClick={handleAddColumn}
                    style={{ height: 34, padding: '0 12px' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Connect to Another Table */}
              <div>
                <h3>Connect to another table</h3>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginTop: 8
                  }}
                >
                  <div className="erd-panel-row">
                    <select
                      value={linkTargetTable}
                      onChange={(e) => setLinkTargetTable(e.target.value)}
                    >
                      {Object.keys(tables)
                        .filter((k) => k !== selectedTable)
                        .map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                    </select>
                    <select
                      value={linkRelationKind}
                      onChange={(e) => setLinkRelationKind(e.target.value)}
                    >
                      <option value="many">Many of these belong to one of target (1:N)</option>
                      <option value="one">One-to-one dedicated link (1:1)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="erd-btn erd-btn-brand"
                    onClick={handleAddRelationship}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Create Relationship
                  </button>
                </div>
              </div>
            </React.Fragment>
          ) : (
            <div className="erd-panel-empty">
              <div className="erd-panel-empty-icon">🌱</div>
              <h2>Select any table</h2>
              <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                Click any table node on the canvas to inspect its schema columns, live foreign key
                connections, and sample database rows.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Floating Tooltip */}
      <div className="erd-tip" ref={tooltipRef} />

      {/* Floating Toast Notification */}
      <div className={`erd-toast ${toastMessage ? 'on' : ''}`}>{toastMessage}</div>
    </div>
  );
}

