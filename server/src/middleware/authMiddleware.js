const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

/**
 * ============================================================
 * ROLE-BASED ACCESS CONTROL
 * ============================================================
 */

const RBAC_ROLES = {
  police: [
    'case:read_assigned',
    'case:write_assigned',
    'case:create',
    'case:update',
    'document:read',
    'document:upload',
    'document:update',
    'document:verify',
    'document:download',
    'custody:read',
    'custody:write',
    'audit:read_own',
    'emergency:request',
  ],

  investigator: [
    'case:read_assigned',
    'case:write_assigned',
    'case:create',
    'case:update',
    'document:read',
    'document:upload',
    'document:update',
    'document:verify',
    'document:download',
    'custody:read',
    'custody:write',
    'audit:read_own',
    'emergency:request',
  ],

  forensic: [
    'case:read_assigned',
    'case:write_assigned',
    'case:create',
    'case:update',
    'document:read',
    'document:upload',
    'document:update',
    'document:verify',
    'document:download',
    'custody:read',
    'custody:write',
    'audit:read_own',
    'emergency:request',
  ],

  lawyer: [
    'case:read_assigned',
    'document:read',
    'document:download',
    'custody:read',
    'audit:read_own',
    'emergency:request',
  ],

  judge: [
    'case:read_assigned',
    'document:read',
    'document:download',
    'custody:read',
    'audit:read',
    'emergency:request',
  ],

  victim: [],

  admin: ['*'],
};

/**
 * ============================================================
 * JWT AUTHENTICATION
 * ============================================================
 */

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER || 'dms',
      }
    );

    const userId = decoded.id || decoded.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token subject',
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists',
      });
    }

    // Disabled accounts immediately lose API access.
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled',
      });
    }

    // Locked accounts cannot use an existing token.
    if (
      user.lockedUntil &&
      user.lockedUntil > new Date()
    ) {
      return res.status(423).json({
        success: false,
        error: 'Account temporarily locked',
        lockedUntil: user.lockedUntil,
      });
    }

    // Always use fresh database identity for authorization.
    req.user = {
      id: user.id,
      customUserId: user.customUserId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      badgeNumber: user.badgeNumber,
      jurisdiction: user.jurisdictionCell || null,
      isActive: user.isActive,
    };

    req.token = decoded;

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    console.error(
      'Authentication middleware error:',
      err
    );

    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

/**
 * ============================================================
 * ROLE GATE
 * ============================================================
 */

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Access denied',
      detail: `Role '${req.user.role}' is not permitted for this resource`,
      allowed_roles: allowedRoles,
    });
  };
}

/**
 * ============================================================
 * ACTION-BASED AUTHORIZATION
 * ============================================================
 */

function authorize(...allowedActions) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const roleActions =
      RBAC_ROLES[req.user.role] || [];

    if (roleActions.includes('*')) {
      return next();
    }

    const permitted = allowedActions.some(
      (action) => roleActions.includes(action)
    );

    if (!permitted) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: allowedActions,
        current_role: req.user.role,
      });
    }

    return next();
  };
}

/**
 * ============================================================
 * CASE ASSIGNMENT AUTHORIZATION
 * ============================================================
 *
 * Security chain:
 *
 *   User → Role → Case Assignment
 *
 * The middleware accepts the case ID from:
 *
 *   req.params.caseId
 *   req.params.id
 *   req.body.caseId
 *   req.query.caseId
 */

function requireCaseAssignment(options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      // Admin bypasses case assignment restrictions.
      if (req.user.role === "admin") {
        return next();
      }

      const requestedCaseId =
        req.params.caseId ||
        req.params.id ||
        req.body.caseId ||
        req.query.caseId;

      if (!requestedCaseId) {
        return res.status(400).json({
          success: false,
          error: "Case ID is required",
        });
      }

      /*
       * The frontend may send either:
       *
       *   CYB-1042
       *
       * or the internal Case.id UUID.
       *
       * Resolve both forms to the real database Case.id.
       */
      const caseRecord =
        await prisma.case.findFirst({
          where: {
            OR: [
              {
                id: requestedCaseId,
              },
              {
                caseId: requestedCaseId,
              },
            ],
          },
          select: {
            id: true,
            caseId: true,
          },
        });

      if (!caseRecord) {
        return res.status(404).json({
          success: false,
          error: "Case not found",
        });
      }

      /*
       * Now check the assignment using the real
       * database UUID.
       */
      const assignment =
        await prisma.caseAssignment.findFirst({
          where: {
            caseId: caseRecord.id,
            userId: req.user.id,
            status: "active",

            ...(options.assignmentRole
              ? {
                  assignedRole:
                    options.assignmentRole,
                }
              : {}),
          },
        });

      if (!assignment) {
        return res.status(403).json({
          success: false,
          error: "Case access denied",
          detail:
            "User is not assigned to this case",
        });
      }

      /*
       * Make the resolved case available to
       * downstream controllers.
       */
      req.caseRecord = caseRecord;
      req.caseAssignment = assignment;

      return next();
    } catch (err) {
      console.error(
        "Case assignment authorization error:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to verify case assignment",
      });
    }
  };
}

/**
 * ============================================================
 * DOCUMENT-LEVEL AUTHORIZATION
 * ============================================================
 *
 * Security chain:
 *
 *   User
 *     ↓
 *   Role
 *     ↓
 *   Case Assignment
 *     ↓
 *   Document
 *     ↓
 *   Document Permission
 *     ↓
 *   Action
 */

function requireDocumentPermission(action) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Admin bypass.
      if (req.user.role === 'admin') {
        return next();
      }

      const documentId =
        req.params.documentId ||
        req.params.id ||
        req.body.documentId ||
        req.query.documentId;

      if (!documentId) {
        return res.status(400).json({
          success: false,
          error: 'Document ID is required',
        });
      }

const document =
  await prisma.document.findFirst({
    where: {
      OR: [
        { id: documentId },
        { documentId: documentId },
      ],
    },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      sensitivity: true,
    },
  });
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }


      // First verify case assignment.
      const assignment =
        await prisma.caseAssignment.findFirst({
          where: {
            caseId: document.caseId,
            userId: req.user.id,
            status: 'active',
          },
        });

      if (!assignment) {
        return res.status(403).json({
          success: false,
          error: 'Document access denied',
          detail:
            'User is not assigned to the document case',
        });
      }

      // Then verify explicit document permission.
      const permission =
        await prisma.documentPermission.findFirst({
          where: {
            documentId: document.id,
            userId: req.user.id,
            action,
          },
        });

      if (!permission) {
        return res.status(403).json({
          success: false,
          error: 'Document permission denied',
          required_action: action,
        });
      }

      // Enforce permission expiry.
      if (
        permission.expiresAt &&
        permission.expiresAt <= new Date()
      ) {
        return res.status(403).json({
          success: false,
          error: 'Document permission expired',
          required_action: action,
        });
      }

      req.document = document;
      req.documentPermission = permission;
      req.caseAssignment = assignment;

      return next();
    } catch (err) {
      console.error(
        'Document authorization error:',
        err
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to verify document permission',
      });
    }
  };
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  verifyToken,
  requireRoles,
  authorize,
  requireCaseAssignment,
  requireDocumentPermission,
  RBAC_ROLES,
};