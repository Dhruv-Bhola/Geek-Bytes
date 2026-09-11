const { prisma } = require('../config/database');

const {
  HTTP_STATUS,
  sendSuccess,
  handleAsync,
} = require('../utils/responseHelper');

/**
 * ============================================================================
 * AUDIT CONTROLLER
 * ============================================================================
 *
 * Returns the Secure DMS audit ledger from PostgreSQL.
 *
 * Normal users:
 *   - only events belonging to actively assigned cases
 *
 * Admin:
 *   - all audit events
 *
 * The endpoint returns metadata only.
 * Actual document files are never returned.
 * ============================================================================
 */

/**
 * Convert an audit action into the frontend ledger state.
 *
 * Frontend supports:
 *   verified
 *   pending
 *   flagged
 */
function getLedgerStatus(event) {
  const action = String(
    event?.action ?? ''
  )
    .trim()
    .toLowerCase();

  /*
   * Security failures.
   */
  if (
    action === 'access_denied' ||
    action === 'integrity_mismatch' ||
    action === 'document_tampered'
  ) {
    return 'flagged';
  }

  /*
   * Successful document lifecycle events.
   */
  if (
    action === 'document_uploaded' ||
    action === 'document_verified' ||
    action === 'document_viewed' ||
    action === 'document_downloaded' ||
    action === 'document_transferred' ||
    action === 'document_received' ||
    action === 'version_created'
  ) {
    return 'verified';
  }

  /*
   * Authentication/system events.
   */
  return 'pending';
}

/**
 * Safely extract blockchain information from metadata.
 */
function getMetadataObject(metadata) {
  if (
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata)
  ) {
    return metadata;
  }

  return {};
}

exports.getAuditEvents = handleAsync(
  async (req, res) => {
    const user = req.user;

    /**
     * ========================================================================
     * AUTHORIZATION
     * ========================================================================
     */

    let where = {};

    if (user.role !== 'admin') {
      const assignments =
        await prisma.caseAssignment.findMany({
          where: {
            userId: user.id,
            status: 'active',
          },

          select: {
            caseId: true,
          },
        });

      const caseIds =
        assignments.map(
          (assignment) =>
            assignment.caseId
        );

      if (caseIds.length === 0) {
        return sendSuccess(
          res,
          {
            events: [],
            total: 0,
          },
          HTTP_STATUS.OK
        );
      }

      where = {
        caseId: {
          in: caseIds,
        },
      };
    }

    /**
     * ========================================================================
     * DATABASE QUERY
     * ========================================================================
     */

    const events =
      await prisma.auditEvent.findMany({
        where,

        orderBy: {
          timestamp: 'desc',
        },

        take: 500,

        include: {
          user: {
            select: {
              id: true,
              customUserId: true,
              fullName: true,
              role: true,
            },
          },

          case: {
            select: {
              id: true,
              caseId: true,
              caseTitle: true,
            },
          },

          document: {
            select: {
              id: true,
              documentId: true,
              title: true,

              /*
               * IMPORTANT:
               * If an older AuditEvent doesn't have sha256Hash populated,
               * use the latest document version as a fallback.
               */
              versions: {
                orderBy: {
                  versionNumber: 'desc',
                },

                take: 1,

                select: {
                  id: true,
                  versionNumber: true,
                  sha256Hash: true,
                  originalFileName: true,
                },
              },
            },
          },

          version: {
            select: {
              id: true,
              versionNumber: true,
              sha256Hash: true,
              originalFileName: true,
            },
          },
        },
      });

    /**
     * ========================================================================
     * TRANSFORM EVENTS
     * ========================================================================
     */

    const sanitizedEvents =
      events.map(
        (event) => {
          const metadata =
            getMetadataObject(
              event.metadata
            );

          /*
           * Hash resolution priority:
           *
           * 1. AuditEvent.sha256Hash
           * 2. Linked DocumentVersion.sha256Hash
           * 3. Latest DocumentVersion.sha256Hash
           * 4. Metadata hash
           */
          const documentHash =
            event.sha256Hash ??
            event.version?.sha256Hash ??
            event.document?.versions?.[0]
              ?.sha256Hash ??
            metadata.sha256Hash ??
            metadata.storedHash ??
            '';

          /*
           * Blockchain information may be stored either in dedicated
           * columns or inside event metadata.
           */
          const blockchainTxHash =
            event.blockchainTxHash ??
            metadata.blockchainTxHash ??
            null;

          const blockchainBlock =
            event.blockchainBlock ??
            metadata.blockchainBlock ??
            null;

          const ledgerStatus =
            getLedgerStatus(
              event
            );

          return {
            /**
             * Event
             */
            id:
              event.id,

            timestamp:
              event.timestamp,

            action:
              event.action,

            ledgerStatus,

            /**
             * User
             */
            userId:
              event.userId,

            user: {
              id:
                event.user?.id ??
                null,

              customUserId:
                event.user
                  ?.customUserId ??
                null,

              fullName:
                event.user
                  ?.fullName ??
                'System',

              role:
                event.user
                  ?.role ??
                null,
            },

            userName:
              event.user
                ?.fullName ??
              event.user
                ?.customUserId ??
              'System',

/**
 * Case
 *
 * IMPORTANT:
 * The frontend case pages use the public case ID
 * such as "CYB-1042", while AuditEvent.caseId
 * stores the internal database UUID.
 *
 * Return the public case ID as `caseId` so the
 * frontend can correctly match Activity records.
 */
caseId:
  event.case?.caseId ??
  event.caseId ??
  '',

case: event.case
  ? {
      id:
        event.case.id,

      caseId:
        event.case.caseId,

      title:
        event.case.caseTitle,
    }
  : null,

caseNumber:
  event.case?.caseId ??
  event.caseId ??
  '',
            /**
             * Document
             */
            documentId:
              event.documentId,

            document:
              event.document
                ? {
                    id:
                      event.document
                        .id,

                    documentId:
                      event.document
                        .documentId,

                    title:
                      event.document
                        .title,
                  }
                : null,

            documentName:
              event.document
                ?.title ??
              event.documentId ??
              'System Event',

            /**
             * Version
             */
            versionId:
              event.versionId,

            versionNumber:
              event.version
                ?.versionNumber ??
              event.document
                ?.versions?.[0]
                ?.versionNumber ??
              null,

            /**
             * Cryptographic integrity
             */
            sha256Hash:
              documentHash,

            documentHash:
              documentHash,

            /**
             * Blockchain
             */
            blockchainTxHash,

            blockchainBlock,

            blockchainRecorded:
              Boolean(
                blockchainTxHash ||
                blockchainBlock
              ),

            /**
             * Additional metadata
             */
            metadata,
          };
        }
      );

    /**
     * ========================================================================
     * RESPONSE
     * ========================================================================
     */

    return sendSuccess(
      res,
      {
        events:
          sanitizedEvents,

        total:
          sanitizedEvents.length,
      },
      HTTP_STATUS.OK
    );
  }
);