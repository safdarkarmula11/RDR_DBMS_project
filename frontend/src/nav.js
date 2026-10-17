import {
  LayoutDashboard,
  Server,
  HardDrive,
  Camera,
  Globe,
  Receipt,
  Activity,
  LifeBuoy,
  Users,
  Cpu,
  Tag,
  FileText,
  CheckSquare,
  Zap,
  BarChart3,
  PlayCircle,
  PieChart,
  FilePlus,
  Clock,
  CreditCard,
  TrendingUp,
  Inbox,
  UserCheck,
  Building2,
  AlertOctagon
} from 'lucide-react';

export const NAV = {
  customer: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/instances', label: 'Instances', icon: Server },
    { to: '/volumes', label: 'Volumes', icon: HardDrive },
    { to: '/snapshots', label: 'Snapshots', icon: Camera },
    { to: '/network', label: 'Network & DNS', icon: Globe },
    { to: '/invoices', label: 'Invoices', icon: Receipt },
    { to: '/usage', label: 'Usage', icon: Activity },
    { to: '/tickets', label: 'Tickets', icon: LifeBuoy },
    { to: '/team', label: 'Team & API Keys', icon: Users },
  ],
  super_admin: [
    { to: '/admin/capacity', label: 'Capacity', icon: Cpu },
    { to: '/admin/hosts', label: 'Hosts & Regions', icon: Server },
    { to: '/admin/pricing', label: 'Pricing Editor', icon: Tag },
    { to: '/admin/audit', label: 'Audit Log', icon: FileText },
    { to: '/admin/consistency', label: 'Consistency', icon: CheckSquare },
    { to: '/admin/perf', label: 'Perf Lab', icon: Zap },
    { to: '/admin/reports', label: 'Reports (R1-R20)', icon: BarChart3 },
    { to: '/admin/simulator', label: 'Simulator', icon: PlayCircle },
  ],
  billing: [
    { to: '/billing', label: 'Billing Overview', icon: PieChart },
    { to: '/billing/invoices', label: 'All Invoices', icon: Receipt },
    { to: '/billing/generate', label: 'Generate Invoices', icon: FilePlus },
    { to: '/billing/aging', label: 'Aging Report', icon: Clock },
    { to: '/billing/credits', label: 'Credits & Refunds', icon: CreditCard },
    { to: '/billing/revenue', label: 'Revenue Analytics', icon: TrendingUp },
  ],
  support: [
    { to: '/support/queue', label: 'Ticket Queue', icon: Inbox },
    { to: '/support/my-tickets', label: 'My Tickets', icon: UserCheck },
    { to: '/support/customers', label: 'Customers', icon: Building2 },
    { to: '/support/sla', label: 'SLA Board', icon: AlertOctagon },
  ],
};

export const HOME = {
  customer: '/',
  super_admin: '/admin/capacity',
  billing: '/billing',
  support: '/support/queue',
};

