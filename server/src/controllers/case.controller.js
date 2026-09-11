const crypto = require('crypto');

const { prisma } = require('../config/database');
const {
  HTTP_STATUS,
  HttpError,
  sendSuccess,
  handleAsync,
} = require('../utils/responseHelper');

/**
 * ============================================================
 * ID GENERATORS
 * ============================================================
 */

function generateComplaintId() {
  return `CC-${crypto.randomInt(10000, 100000)}`;
}

function generateCaseId() {
  return `CYB-${crypto.randomInt(1000, 10000)}`;
}

/**
 * ============================================================
 * DOCUMENT SUMMARY
 * ============================================================
 *
 * The Secure DMS uses the Document model as the primary document
 * record. The older Evidence model is kept only for compatibility.
 *
 * We therefore calculate the case document summary from:
 *
 *     Case -> Document[]
 *
 * and group documents using their documentType.
 */

function buildDocumentSummary(documents = []) {
  const summary = {
    fir: 0,
    investigationReports: 0,
    witnessStatements: 0,
    forensicReports: 0,
    courtDocuments: 0,
    evidenceFiles: 0,
  };

  for (const document of documents) {
    const type = String(
      document?.documentType || ''
    )
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, '_');

    /*
     * FIR
     */
    if (
      type === 'fir' ||
      type === 'first_information_report' ||
      type.includes('fir')
    ) {
      summary.fir += 1;
      continue;
    }

    /*
     * Investigation reports
     */
    if (
      type === 'investigation_report' ||
      type === 'investigation_reports' ||
      type === 'investigation' ||
      type.includes('investigation_report')
    ) {
      summary.investigationReports += 1;
      continue;
    }

    /*
     * Witness statements
     */
    if (
      type === 'witness_statement' ||
      type === 'witness_statements' ||
      type === 'witness' ||
      type.includes('witness')
    ) {
      summary.witnessStatements += 1;
      continue;
    }

    /*
     * Forensic reports
     */
    if (
      type === 'forensic_report' ||
      type === 'forensic_reports' ||
      type === 'forensic' ||
      type.includes('forensic')
    ) {
      summary.forensicReports += 1;
      continue;
    }

    /*
     * Court documents
     */
    if (
      type === 'court_document' ||
      type === 'court_documents' ||
      type === 'court' ||
      type.includes('court') ||
      type.includes('chargesheet') ||
      type.includes('charge_sheet')
    ) {
      summary.courtDocuments += 1;
      continue;
    }

    /*
     * Evidence files
     */
    if (
      type === 'evidence' ||
      type === 'evidence_file' ||
      type === 'evidence_files' ||
      type.includes('evidence')
    ) {
      summary.evidenceFiles += 1;
      continue;
    }
  }

  return summary;
}

/**
 * ============================================================
 * ASSIGNMENT HELPERS
 * ============================================================
 */

function getInvestigatingOfficer(assignments = []) {
  const investigationAssignment =
    assignments.find(
      (assignment) =>
        assignment.assignedRole === 'investigator' ||
        assignment.user?.role === 'investigator'
    );

  const policeAssignment =
    assignments.find(
      (assignment) =>
        assignment.assignedRole === 'police' ||
        assignment.user?.role === 'police'
    );

  const forensicAssignment =
    assignments.find(
      (assignment) =>
        assignment.assignedRole === 'forensic' ||
        assignment.user?.role === 'forensic'
    );

  const officerAssignment =
    investigationAssignment ||
    policeAssignment ||
    forensicAssignment ||
    assignments[0] ||
    null;

  return officerAssignment?.user || null;
}

function mapInvestigatingOfficer(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    customUserId: user.customUserId,
    fullName: user.fullName,
    badgeNumber: user.badgeNumber,
    role: user.role,
  };
}

/**
 * ============================================================
 * COMPLAINTS
 * ============================================================
 */

/**
 * POST /cases/complaints
 *
 * Victims can create complaints for themselves.
 * Admin may create a complaint on behalf of a victim.
 */
exports.createComplaint = handleAsync(async (req, res) => {
  const {
    victimId,
    victimName,
    contactNumber,
    incidentDate,
    platform,
    crimeDescription,
    location,
    additionalDetails,
    severity,
  } = req.body;

  // A normal victim can only create their own complaint.
  const ownerId =
    req.user.role === 'admin' && victimId
      ? victimId
      : req.user.id;

  const complaint = await prisma.complaint.create({
    data: {
      complaintId: generateComplaintId(),
      victimId: ownerId,
      victimName:
        victimName || req.user.fullName,
      contactNumber,
      incidentDate: incidentDate
        ? new Date(incidentDate)
        : new Date(),
      platform,
      crimeDescription,
      location,
      additionalDetails,
      severity: severity || 'medium',
      status: 'submitted',
    },
  });

  return sendSuccess(
    res,
    { complaint },
    HTTP_STATUS.CREATED
  );
});

/**
 * GET /cases/complaints
 *
 * Operational users can review submitted complaints.
 *
 * Filters:
 *   ?status=submitted
 *   ?assignedCell=...
 */
exports.getComplaints = handleAsync(async (req, res) => {
  const where = {};

  if (req.query.status) {
    where.status = req.query.status;
  }

  if (req.query.assignedCell) {
    where.assignedCell =
      req.query.assignedCell;
  }

  const complaints =
    await prisma.complaint.findMany({
      where,

      include: {
        victim: {
          select: {
            id: true,
            customUserId: true,
            fullName: true,
          },
        },

        cases: {
          select: {
            id: true,
            caseId: true,
            status: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

  return sendSuccess(res, {
    complaints,
  });
});

/**
 * GET /cases/complaints/own
 *
 * Victims can only see their own complaints.
 */
exports.getOwnComplaints =
  handleAsync(async (req, res) => {
    const complaints =
      await prisma.complaint.findMany({
        where: {
          victimId: req.user.id,
        },

        include: {
          cases: {
            select: {
              id: true,
              caseId: true,
              status: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    return sendSuccess(res, {
      complaints,
    });
  });

/**
 * ============================================================
 * CASE CREATION
 * ============================================================
 */

/**
 * POST /cases
 *
 * Creates a case from an existing complaint.
 *
 * The creator becomes the initial case assignee unless
 * another officer is explicitly supplied by an admin.
 */
exports.createCase = handleAsync(async (req, res) => {
  const {
    complaintId,
    caseTitle,
    assignedOfficerId,
    riskScore,
  } = req.body;

  if (!complaintId) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'complaintId is required'
    );
  }

  const complaint =
    await prisma.complaint.findUnique({
      where: {
        id: complaintId,
      },
    });

  if (!complaint) {
    throw new HttpError(
      HTTP_STATUS.NOT_FOUND,
      'Complaint not found'
    );
  }

  // Prevent accidental duplicate case creation.
  const existingCase =
    await prisma.case.findFirst({
      where: {
        complaintId,
      },
    });

  if (existingCase) {
    throw new HttpError(
      HTTP_STATUS.CONFLICT,
      'A case already exists for this complaint'
    );
  }

  const targetOfficerId =
    assignedOfficerId || req.user.id;

  // Only an admin may assign another officer.
  if (
    assignedOfficerId &&
    assignedOfficerId !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'Only an admin can assign a case to another officer'
    );
  }

  const targetOfficer =
    await prisma.user.findUnique({
      where: {
        id: targetOfficerId,
      },

      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

  if (!targetOfficer) {
    throw new HttpError(
      HTTP_STATUS.NOT_FOUND,
      'Assigned officer not found'
    );
  }

  if (!targetOfficer.isActive) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'Assigned user is inactive'
    );
  }

  const allowedAssignmentRoles = [
    'police',
    'investigator',
    'forensic',
  ];

  if (
    req.user.role !== 'admin' &&
    !allowedAssignmentRoles.includes(
      targetOfficer.role
    )
  ) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'Case must be assigned to an operational investigation user'
    );
  }

  const caseRecord =
    await prisma.$transaction(
      async (tx) => {
        const createdCase =
          await tx.case.create({
            data: {
              caseId: generateCaseId(),
              complaintId,
              assignedOfficerId:
                targetOfficerId,
              caseTitle:
                caseTitle ||
                'Cybercrime Investigation',
              riskScore:
                typeof riskScore === 'number'
                  ? riskScore
                  : 0.0,
              status: 'open',
            },
          });

        /*
         * CaseAssignment is the source of truth
         * for case authorization.
         */
        await tx.caseAssignment.create({
          data: {
            caseId: createdCase.id,
            userId: targetOfficerId,
            assignedRole:
              targetOfficer.role,
            assignedBy: req.user.id,
            status: 'active',
          },
        });

        await tx.complaint.update({
          where: {
            id: complaintId,
          },

          data: {
            status: 'case_created',
          },
        });

        return createdCase;
      }
    );

  return sendSuccess(
    res,
    { case: caseRecord },
    HTTP_STATUS.CREATED
  );
});

/**
 * ============================================================
 * CASE LIST
 * ============================================================
 */

/**
 * GET /cases
 *
 * Admin:
 *   Can see all cases.
 *
 * Everyone else:
 *   Can see only cases for which they have
 *   an active CaseAssignment.
 */
exports.getCases = handleAsync(async (req, res) => {
  const where = {};

  if (req.query.status) {
    where.status = req.query.status;
  }

  /*
   * Non-admin users can only see cases for which
   * they have an ACTIVE CaseAssignment.
   */
  if (req.user.role !== 'admin') {
    const assignments =
      await prisma.caseAssignment.findMany({
        where: {
          userId: req.user.id,
          status: 'active',
        },

        select: {
          caseId: true,
        },
      });

    const assignedCaseIds =
      assignments.map(
        (assignment) => assignment.caseId
      );

    if (assignedCaseIds.length === 0) {
      return sendSuccess(res, {
        cases: [],
      });
    }

    where.id = {
      in: assignedCaseIds,
    };
  }

  const cases =
    await prisma.case.findMany({
      where,

      include: {
        complaint: {
          select: {
            complaintId: true,
            severity: true,
            platform: true,
          },
        },

        /*
         * Correct Prisma relation:
         *
         * Case -> assignments
         */
        assignments: {
          where: {
            status: 'active',
          },

          select: {
            id: true,
            userId: true,
            assignedRole: true,
            assignedAt: true,

            user: {
              select: {
                id: true,
                customUserId: true,
                fullName: true,
                role: true,
                badgeNumber: true,
              },
            },
          },
        },

        /*
         * Secure DMS documents.
         *
         * This is the data source for the
         * case document summary.
         */
        documents: {
          select: {
            id: true,
            documentId: true,
            title: true,
            documentType: true,
            currentVersion: true,
            integrityStatus: true,
            createdAt: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

  const mappedCases = cases.map(
    (caseRecord) => {
      const assignments =
        caseRecord.assignments || [];

      const investigatingOfficer =
        getInvestigatingOfficer(
          assignments
        );

      const documentSummary =
        buildDocumentSummary(
          caseRecord.documents || []
        );

      return {
        ...caseRecord,

        /*
         * Frontend-friendly investigating officer.
         */
        assignedOfficer:
          mapInvestigatingOfficer(
            investigatingOfficer
          ),

        investigatingOfficer:
          mapInvestigatingOfficer(
            investigatingOfficer
          ),

        /*
         * Keep compatibility with the
         * existing frontend.
         */
        caseAssignments: assignments,

        /*
         * Actual Prisma relation.
         */
        assignments,

        /*
         * Summary for Case list/detail UI.
         */
        documentSummary,
      };
    }
  );

  return sendSuccess(res, {
    cases: mappedCases,
  });
});

/**
 * ============================================================
 * CASE DETAIL
 * ============================================================
 */

/**
 * GET /cases/:id
 *
 * Accepts either:
 *
 *   internal Case UUID
 *
 * or:
 *
 *   public case ID such as CYB-1042
 */
exports.getCaseById =
  handleAsync(async (req, res) => {
    const {
      id: identifier,
    } = req.params;

    /**
     * ========================================================
     * VICTIM ACCESS
     * ========================================================
     */

    if (req.user.role === 'victim') {
      const ownCase =
        await prisma.case.findFirst({
          where: {
            OR: [
              {
                id: identifier,
              },
              {
                caseId: identifier,
              },
            ],

            complaint: {
              victimId: req.user.id,
            },
          },

          select: {
            id: true,
            caseId: true,
            caseTitle: true,
            status: true,
            riskScore: true,
            createdAt: true,
            updatedAt: true,
          },
        });

      if (!ownCase) {
        throw new HttpError(
          HTTP_STATUS.FORBIDDEN,
          'Access denied'
        );
      }

      return sendSuccess(res, {
        case: ownCase,
      });
    }

    /**
     * ========================================================
     * CASE LOOKUP
     * ========================================================
     *
     * Resolve BOTH:
     *
     *   internal UUID
     *   CYB-1042
     */
    const caseRecord =
      await prisma.case.findFirst({
        where: {
          OR: [
            {
              id: identifier,
            },
            {
              caseId: identifier,
            },
          ],
        },

        include: {
          complaint: true,

          /*
           * Current assignment relationship.
           */
          assignments: {
            where: {
              status: 'active',
            },

            select: {
              id: true,
              userId: true,
              assignedRole: true,
              assignedAt: true,
              assignedBy: true,

              user: {
                select: {
                  id: true,
                  customUserId: true,
                  fullName: true,
                  role: true,
                  badgeNumber: true,
                  email: true,
                },
              },
            },
          },

          /*
           * PRIMARY Secure DMS documents.
           *
           * These records are what we use to calculate
           * FIR / report / witness / forensic /
           * court / evidence counts.
           */
          documents: {
            select: {
              id: true,
              documentId: true,
              title: true,
              documentType: true,
              sensitivity: true,
              description: true,
              currentVersion: true,
              integrityStatus: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
            },

            orderBy: {
              createdAt: 'desc',
            },
          },

          /*
           * OLD compatibility Evidence relation.
           *
           * Keep this because older functionality
           * may still depend on it.
           */
          evidence: {
            select: {
              id: true,
              evidenceId: true,
              evidenceType: true,
              sourceType: true,
              sha256Hash: true,
              integrityStatus: true,
              blockchainTxHash: true,
              createdAt: true,
            },
          },
        },
      });

    if (!caseRecord) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'Case not found'
      );
    }

    /**
     * ========================================================
     * ACTIVE ASSIGNMENT
     * ========================================================
     */

    const assignments =
      caseRecord.assignments || [];

    const investigatingOfficer =
      getInvestigatingOfficer(
        assignments
      );

    /**
     * ========================================================
     * DOCUMENT SUMMARY
     * ========================================================
     *
     * IMPORTANT:
     *
     * Do NOT use caseRecord.evidence for this.
     *
     * The actual Secure DMS documents are in:
     *
     *     caseRecord.documents
     */
    const documentSummary =
      buildDocumentSummary(
        caseRecord.documents || []
      );

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     */

    const responseCase = {
      ...caseRecord,

      /*
       * Current active investigating officer.
       */
      assignedOfficer:
        mapInvestigatingOfficer(
          investigatingOfficer
        ),

      investigatingOfficer:
        mapInvestigatingOfficer(
          investigatingOfficer
        ),

      /*
       * Compatibility field for frontend.
       */
      caseAssignments: assignments,

      /*
       * Actual Prisma relation.
       */
      assignments,

      /*
       * Case-level document counts.
       */
      documentSummary,
    };

    return sendSuccess(res, {
      case: responseCase,
    });
  });

/**
 * ============================================================
 * CASE UPDATE
 * ============================================================
 */

/**
 * PATCH /cases/:id
 *
 * This endpoint currently expects the internal
 * Case.id UUID.
 */
exports.updateCase =
  handleAsync(async (req, res) => {
    const {
      id,
    } = req.params;

    const {
      status,
      riskScore,
      caseId: requestedCaseId,
      case_id: legacyCaseId,
    } = req.body;

    const targetCase =
      await prisma.case.findUnique({
        where: {
          id,
        },
      });

    if (!targetCase) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'Case not found'
      );
    }

    /**
     * Defense-in-depth:
     *
     * Non-admin users must have an
     * active assignment to this case.
     */
    if (req.user.role !== 'admin') {
      const assignment =
        await prisma.caseAssignment.findFirst({
          where: {
            caseId: id,
            userId: req.user.id,
            status: 'active',
          },
        });

      if (!assignment) {
        throw new HttpError(
          HTTP_STATUS.FORBIDDEN,
          'You are not assigned to this case'
        );
      }
    }

    const newCaseId =
      requestedCaseId || legacyCaseId;

    const caseRecord =
      await prisma.case.update({
        where: {
          id,
        },

        data: {
          ...(status && {
            status,
          }),

          ...(typeof riskScore ===
            'number' && {
            riskScore,
          }),

          ...(newCaseId && {
            caseId: newCaseId,
          }),
        },
      });

    return sendSuccess(res, {
      case: caseRecord,
    });
  });