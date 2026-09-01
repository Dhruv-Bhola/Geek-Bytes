const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

/**
 * Role-Based Access Control policy matrix.
 *
 * Each role maps to a set of domain actions. `*` grants full access.
 */
const RBAC_ROLES = {
  victim: [
    'complaint:create_own',
    'complaint:read_own',
    'complaint:update_own',
    'evidence:upload_own',
    'evidence:read_own',
    'case:read_status_own',
  ],
  police: [
    'case:read_assigned',
    'case:write',
    'evidence:upload',
    'evidence:read',
    'evidence:verify',
    'custody:read',
    'custody:write',
  ],
  investigator: [
    'case:read_assigned',
    'evidence:upload',
    'evidence:read',
    'evidence:verify',
    'custody:read',
    'custody:write',
  ],
  // forensic is an alias of investigator (Digital Forensics Lab).
  forensic: [
    'case:read_assigned',
    'evidence:upload',
    'evidence:read',
    'evidence:verify',
    'custody:read',
    'custody:write',
  ],
  lawyer: [
    'report:read',
    'evidence:read_verified',
    'custody:read',
  ],
  judge: [
    'report:read',
    'evidence:read_verified',
    'custody:read',
    'audit:read',
  ],
  admin: ['*'],
};

/**
 * Extract and verify the Bearer JWT from the Authorization header,
 * then load the fresh user row and attach it to req.user.
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || 'dms',
    });

    const user = await prisma.user.findUnique({
      where: { id: decoded.id || decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Bind the authoritative, DB-fresh identity (ignore stale token claims).
    req.user = {
      id: user.id,
      customUserId: user.customUserId,
      fullName: user.fullName,
      role: user.role,
      jurisdiction: user.jurisdictionCell || null,
    };
    req.token = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * RBAC gatekeeper. Usage: requireRoles('police', 'investigator')
 * Enforces the policy matrix in RBAC_ROLES.
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      detail: `Role '${req.user.role}' is not permitted for this resource`,
      allowed_roles: allowedRoles,
    });
  };
}

/**
 * Action-based authorization. Usage: authorize('evidence:read', 'evidence:read_own')
 * Checks the logged-in role's permitted actions.
 */
function authorize(...allowedActions) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleActions = RBAC_ROLES[req.user.role] || [];
    const isAdmin = roleActions.includes('*');

    if (isAdmin) return next();

    const permitted = allowedActions.some((action) => roleActions.includes(action));
    if (!permitted) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedActions,
        current_role: req.user.role,
      });
    }
    next();
  };
}

module.exports = { verifyToken, requireRoles, authorize, RBAC_ROLES };
