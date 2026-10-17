export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        msg: 'You do not have permission for this action',
      });
    }
    next();
  };
}

export function requireOwner(req, res, next) {
  if (req.user?.role === 'customer' && req.user?.member_role !== 'owner') {
    return res.status(403).json({
      code: 'FORBIDDEN',
      msg: 'Only the organization owner can perform this action',
    });
  }
  next();
}

/**
 * tenantGuard ensures customers can only access their own organization's resources.
 * If another tenant's org_id is requested, returns 404 (not 403) to prevent tenant enumeration.
 */
export function tenantGuard(paramName = 'id') {
  return (req, res, next) => {
    if (req.user?.role === 'customer') {
      const requestedOrgId = Number(req.params[paramName]);
      if (requestedOrgId && requestedOrgId !== Number(req.user.org_id)) {
        return res.status(404).json({
          code: 'NOT_FOUND',
          msg: 'Resource not found',
        });
      }
    }
    next();
  };
}

export default {
  requireRole,
  requireOwner,
  tenantGuard,
};
