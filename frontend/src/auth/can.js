/**
 * Role & permission helper: can(user, action)
 * System staff have full rights within their domain.
 * Customer owners can launch, start, stop, resize, terminate, pay invoices, manage team.
 * Customer members can launch, start, and stop.
 */
const CUSTOMER_PERMISSIONS = {
  owner: [
    'launch',
    'start',
    'stop',
    'resize',
    'terminate',
    'manageVolumes',
    'manageSnapshots',
    'manageNetwork',
    'pay',
    'manageTeam',
    'manageApiKeys',
    'createTicket'
  ],
  member: [
    'launch',
    'start',
    'stop',
    'manageVolumes',
    'manageSnapshots',
    'createTicket'
  ]
};

export function can(user, action) {
  if (!user) return false;

  // System roles have elevated permissions in their respective domains
  if (user.role === 'super_admin') return true;

  if (user.role === 'billing') {
    return ['pay', 'viewInvoices', 'manageInvoices', 'manageCredits'].includes(action);
  }

  if (user.role === 'support') {
    return ['viewTickets', 'replyTicket', 'assignTicket', 'viewCustomers'].includes(action);
  }

  // Customer role uses member_role ('owner' vs 'member')
  const memberRole = user.member_role || user.memberRole || 'member';
  const permissions = CUSTOMER_PERMISSIONS[memberRole] || [];
  return permissions.includes(action);
}

export default can;

