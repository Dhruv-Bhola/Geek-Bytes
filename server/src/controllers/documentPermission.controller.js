const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * Find a document using either:
 * - PostgreSQL UUID: document.id
 * - Public document ID: document.documentId
 */
async function findDocument(documentIdentifier) {
  return prisma.document.findFirst({
    where: {
      OR: [
        {
          id: documentIdentifier,
        },
        {
          documentId: documentIdentifier,
        },
      ],
    },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      title: true,
      createdById: true,
    },
  });
}

/**
 * Check whether the current user can manage
 * permissions for a document.
 */
async function canManageDocumentPermissions(
  userId,
  userRole,
  document
) {
  if (userRole === "admin") {
    return true;
  }

  if (!document) {
    return false;
  }

  // Document creator can manage permissions.
  if (document.createdById === userId) {
    return true;
  }

  // User assigned to the document's case.
  const assignment =
    await prisma.caseAssignment.findFirst({
      where: {
        caseId: document.caseId,
        userId,
        status: "active",
      },
      select: {
        id: true,
      },
    });

  return Boolean(assignment);
}

/**
 * GET /api/v1/permissions/document/:documentId
 */
exports.getDocumentPermissions = async (
  req,
  res
) => {
  try {
    const {
      documentId: documentIdentifier,
    } = req.params;

    const document =
      await findDocument(documentIdentifier);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const canManage =
      await canManageDocumentPermissions(
        req.user.id,
        req.user.role,
        document
      );

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to view permissions for this document",
      });
    }

    const permissions =
      await prisma.documentPermission.findMany({
        where: {
          documentId: document.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user: {
            select: {
              id: true,
              customUserId: true,
              fullName: true,
              role: true,
              email: true,
              isActive: true,
            },
          },
        },
      });

    return res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error(
      "[document-permission] get error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load document permissions",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/permissions/document/:documentId
 */
exports.grantDocumentPermission = async (
  req,
  res
) => {
  try {
    const {
      documentId: documentIdentifier,
    } = req.params;

    const {
      userId,
      action,
      expiresAt = null,
    } = req.body;

    if (!userId || !action) {
      return res.status(400).json({
        success: false,
        message:
          "userId and action are required",
      });
    }

    const document =
      await findDocument(documentIdentifier);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const canManage =
      await canManageDocumentPermissions(
        req.user.id,
        req.user.role,
        document
      );

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to manage permissions for this document",
      });
    }

    const targetUser =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          fullName: true,
          role: true,
          isActive: true,
        },
      });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found",
      });
    }

    if (!targetUser.isActive) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot grant permission to an inactive user",
      });
    }

    // Target user must belong to the same case,
    // unless the target is an administrator.
    const targetAssignment =
      await prisma.caseAssignment.findFirst({
        where: {
          caseId: document.caseId,
          userId,
          status: "active",
        },
        select: {
          id: true,
        },
      });

    if (
      !targetAssignment &&
      targetUser.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "User must be assigned to the document's case",
      });
    }

    const permission =
      await prisma.documentPermission.upsert({
        where: {
          documentId_userId_action: {
            documentId: document.id,
            userId,
            action,
          },
        },

        update: {
          expiresAt: expiresAt
            ? new Date(expiresAt)
            : null,

          grantedById:
            req.user.id,
        },

        create: {
          documentId: document.id,
          userId,
          action,
          grantedById:
            req.user.id,

          expiresAt: expiresAt
            ? new Date(expiresAt)
            : null,
        },
      });

    await prisma.auditEvent.create({
      data: {
        userId: req.user.id,
        caseId: document.caseId,
        documentId: document.id,
        action: "document_updated",

        metadata: {
          targetUserId:
            userId,

          targetUserName:
            targetUser.fullName,

          permission:
            action,

          expiresAt:
            permission.expiresAt
              ? permission.expiresAt.toISOString()
              : null,
        },
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Document permission granted successfully",

      data: permission,
    });
  } catch (error) {
    console.error(
      "[document-permission] grant error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to grant document permission",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/permissions/document/:documentId/:permissionId
 */
exports.revokeDocumentPermission = async (
  req,
  res
) => {
  try {
    const {
      documentId: documentIdentifier,
      permissionId,
    } = req.params;

    const document =
      await findDocument(documentIdentifier);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const canManage =
      await canManageDocumentPermissions(
        req.user.id,
        req.user.role,
        document
      );

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to manage permissions for this document",
      });
    }

    const permission =
      await prisma.documentPermission.findFirst({
        where: {
          id: permissionId,
          documentId: document.id,
        },

        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

    if (!permission) {
      return res.status(404).json({
        success: false,
        message:
          "Document permission not found",
      });
    }

    await prisma.documentPermission.delete({
      where: {
        id: permissionId,
      },
    });

    await prisma.auditEvent.create({
      data: {
        userId: req.user.id,
        caseId: document.caseId,
        documentId: document.id,
        action: "document_updated",

        metadata: {
          targetUserId:
            permission.userId,

          targetUserName:
            permission.user?.fullName ??
            null,

          permission:
            permission.action,
        },
      },
    });

    return res.json({
      success: true,
      message:
        "Document permission revoked successfully",
    });
  } catch (error) {
    console.error(
      "[document-permission] revoke error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to revoke document permission",
      error: error.message,
    });
  }
};