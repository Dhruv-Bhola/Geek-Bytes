const { prisma } = require('../config/database');
const {
  HTTP_STATUS,
  HttpError,
  sendSuccess,
  handleAsync,
} = require('../utils/responseHelper');

/**
 * GET /api/v1/dashboard/summary
 *
 * Dashboard data for the authenticated user.
 *
 * Admin:
 *   System-wide information.
 *
 * Other users:
 *   Only information related to their actively assigned cases.
 */
exports.getDashboardSummary = handleAsync(async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!userId) {
    throw new HttpError(
      HTTP_STATUS.UNAUTHORIZED,
      'Authentication required'
    );
  }

  const isAdmin = role === 'admin';

  // -------------------------------------------------------------------------
  // 1. FIND CASES VISIBLE TO USER
  // -------------------------------------------------------------------------

  let caseIds = [];

  if (!isAdmin) {
    const assignments = await prisma.caseAssignment.findMany({
      where: {
        userId,
        status: 'active',
      },
      select: {
        caseId: true,
      },
    });

    caseIds = assignments.map((assignment) => assignment.caseId);
  }

  const caseWhere = isAdmin
    ? {}
    : {
        id: {
          in: caseIds,
        },
      };

  const documentWhere = isAdmin
    ? {}
    : {
        caseId: {
          in: caseIds,
        },
      };

  const alertWhere = isAdmin
    ? {}
    : {
        caseId: {
          in: caseIds,
        },
      };

  // -------------------------------------------------------------------------
  // 2. MAIN STATISTICS
  // -------------------------------------------------------------------------

  const [
    totalDocuments,
    activeCases,
    securityAlerts,
    integrityIssues,
  ] = await Promise.all([
    // Total documents visible to this user.
    prisma.document.count({
      where: documentWhere,
    }),

    // Active/in-progress cases.
    prisma.case.count({
      where: {
        ...caseWhere,
        status: {
          in: [
            'open',
            'under_investigation',
            'chargesheet_filed',
          ],
        },
      },
    }),

    // Unresolved security alerts.
    prisma.securityAlert.count({
      where: {
        ...alertWhere,
        status: {
          not: 'resolved',
        },
      },
    }),

    // Documents whose integrity currently has a mismatch.
    prisma.document.count({
      where: {
        ...documentWhere,
        integrityStatus: 'tampered',
      },
    }),
  ]);

  // -------------------------------------------------------------------------
  // 3. RECENT DOCUMENT ACTIVITY
  // -------------------------------------------------------------------------
  //
  // IMPORTANT:
  // Do NOT include login/authentication/system events here.
  //
  // Only actual document activity belongs in this section.
  // -------------------------------------------------------------------------

  const documentActions = [
    'document_uploaded',
    'document_viewed',
    'document_downloaded',
    'document_updated',
    'document_verified',
    'document_transferred',
  ];

  const recentAuditEvents = await prisma.auditEvent.findMany({
    where: {
      ...buildAuditWhere(isAdmin, caseIds),

      action: {
        in: documentActions,
      },

      documentId: {
        not: null,
      },
    },

    orderBy: {
      timestamp: 'desc',
    },

    take: 8,

    include: {
      user: {
        select: {
          fullName: true,
          customUserId: true,
        },
      },

      document: {
        select: {
          id: true,
          documentId: true,
          title: true,
        },
      },
    },
  });

  const recentActivity = recentAuditEvents.map((event) => ({
    id: event.id,

    actor:
      event.user?.fullName ||
      event.user?.customUserId ||
      'System',

    action: formatAuditAction(event.action),

    documentName:
      event.document?.title ||
      event.document?.documentId ||
      'Document',

    timestamp: event.timestamp.toISOString(),
  }));

  // -------------------------------------------------------------------------
  // 4. LAST 7 DAYS ACTIVITY
  // -------------------------------------------------------------------------

  const startDate = new Date();

  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 6);

  const weeklyEvents = await prisma.auditEvent.findMany({
    where: {
      ...buildAuditWhere(isAdmin, caseIds),

      timestamp: {
        gte: startDate,
      },

      action: {
        in: [
          'document_uploaded',
          'document_viewed',
        ],
      },

      documentId: {
        not: null,
      },
    },

    select: {
      action: true,
      timestamp: true,
    },

    orderBy: {
      timestamp: 'asc',
    },
  });

  const weeklyActivity = buildWeeklyActivity(
    weeklyEvents
  );

  // -------------------------------------------------------------------------
  // 5. SECURITY COMPONENT STATUS
  // -------------------------------------------------------------------------
  //
  // These are capability/status indicators, not alert severity.
  //
  // Encryption:
  //   Consider encryption active when encrypted document versions exist,
  //   or the encryption configuration is present.
  //
  // TEE:
  //   Active when TEE mode is configured.
  //
  // Blockchain:
  //   Active when blockchain configuration exists OR blockchain records
  //   already exist.
  //
  // Integrity:
  //   Active when documents have SHA-256 hashes / versions.
  //
  // Access Control:
  //   Active when the authentication/RBAC system is operating.
  // -------------------------------------------------------------------------

  const [
    encryptedVersions,
    hashedVersions,
    blockchainEvents,
    permissionCount,
  ] = await Promise.all([
prisma.documentVersion.count({
  where: isAdmin
    ? {}
    : {
        document: {
          caseId: {
            in: caseIds,
          },
        },
      },
}),

    prisma.auditEvent.count({
      where: {
        ...buildAuditWhere(isAdmin, caseIds),
        blockchainTxHash: {
          not: null,
        },
      },
    }),

    isAdmin
      ? prisma.documentPermission.count()
      : prisma.documentPermission.count({
          where: {
            userId,
            OR: [
              {
                expiresAt: null,
              },
              {
                expiresAt: {
                  gt: new Date(),
                },
              },
            ],
          },
        }),
  ]);

  const encryptionConfigured =
    Boolean(
      process.env.ENCRYPTION_KEY ||
      process.env.FILE_ENCRYPTION_KEY ||
      process.env.AES_ENCRYPTION_KEY
    );

  const teeConfigured =
    Boolean(
      process.env.TEE_MODE
    );

  const blockchainConfigured =
    Boolean(
      process.env.BLOCKCHAIN_RPC_URL &&
      process.env.CONTRACT_ADDRESS &&
      process.env.RELAYER_PRIVATE_KEY
    );

  const systemSecurity = {
    encryption:
      encryptedVersions > 0 ||
      encryptionConfigured,

    teeSecurity:
      teeConfigured,

    blockchainLedger:
      blockchainConfigured ||
      blockchainEvents > 0,

    integrityMonitoring:
      hashedVersions > 0,

    accessControl:
      true,
  };

  // -------------------------------------------------------------------------
  // 6. RETURN DASHBOARD RESPONSE
  // -------------------------------------------------------------------------

  return sendSuccess(res, {
    totalDocuments,
    activeCases,
    securityAlerts,
    integrityIssues,
    recentActivity,
    weeklyActivity,
    systemSecurity,
  });
});

// ============================================================================
// AUDIT VISIBILITY
// ============================================================================

/**
 * Build audit-event visibility filter.
 *
 * Admin:
 *   Everything.
 *
 * Normal user:
 *   Events belonging to their active assigned cases.
 */
function buildAuditWhere(isAdmin, caseIds) {
  if (isAdmin) {
    return {};
  }

  if (caseIds.length === 0) {
    return {
      id: {
        in: [],
      },
    };
  }

  return {
    OR: [
      {
        caseId: {
          in: caseIds,
        },
      },

      {
        document: {
          caseId: {
            in: caseIds,
          },
        },
      },
    ],
  };
}

// ============================================================================
// AUDIT ACTION LABELS
// ============================================================================

function formatAuditAction(action) {
  const labels = {
    document_uploaded: 'uploaded',
    document_viewed: 'viewed',
    document_downloaded: 'downloaded',
    document_updated: 'updated',
    document_verified: 'verified',
    document_transferred: 'transferred',
  };

  return (
    labels[action] ||
    String(action)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

// ============================================================================
// WEEKLY ACTIVITY
// ============================================================================

/**
 * Build activity for the previous 7 calendar days.
 *
 * Frontend expects:
 *
 * {
 *   day: string,
 *   uploads: number,
 *   views: number
 * }
 */
function buildWeeklyActivity(events) {
  const days = [];

  // Create seven calendar days.
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);

    days.push({
      date,
      day: date.toLocaleDateString('en-US', {
        weekday: 'short',
      }),
      uploads: 0,
      views: 0,
    });
  }

  // Count events by date and action.
  for (const event of events) {
    const eventDate = new Date(event.timestamp);

    const matchingDay = days.find(
      (day) =>
        day.date.getFullYear() ===
          eventDate.getFullYear() &&
        day.date.getMonth() ===
          eventDate.getMonth() &&
        day.date.getDate() ===
          eventDate.getDate()
    );

    if (!matchingDay) {
      continue;
    }

    if (event.action === 'document_uploaded') {
      matchingDay.uploads += 1;
    }

    if (event.action === 'document_viewed') {
      matchingDay.views += 1;
    }
  }

  return days.map((day) => ({
    day: day.day,
    uploads: day.uploads,
    views: day.views,
  }));
}