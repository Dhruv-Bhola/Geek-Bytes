const { prisma } = require('../config/database');
const { HTTP_STATUS, HttpError, sendSuccess, handleAsync } = require('../utils/responseHelper');

function generateComplaintId() {
  return `CC-${Math.floor(10000 + Math.random() * 89999)}`;
}

function generateCaseId() {
  return `CYB-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * POST /cases/complaints -> create a complaint (victim own)
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
    aiPredictedCategory,
    aiConfidence,
    severity,
  } = req.body;

  // Victims can only file for themselves unless admin
  const ownerId = req.user.role === 'admin' && victimId ? victimId : req.user.id;

  const complaint = await prisma.complaint.create({
    data: {
      complaintId: generateComplaintId(),
      victimId: ownerId,
      victimName: victimName || req.user.fullName,
      contactNumber,
      incidentDate: incidentDate ? new Date(incidentDate) : new Date(),
      platform,
      crimeDescription,
      location,
      additionalDetails,
      aiPredictedCategory: aiPredictedCategory || '',
      aiConfidence: aiConfidence || 0.0,
      severity: severity || 'medium',
      status: 'submitted',
    },
  });

  return sendSuccess(res, { complaint }, HTTP_STATUS.CREATED);
});

/**
 * GET /cases/complaints -> officers see all; victims read scoped at getOwn
 */
exports.getComplaints = handleAsync(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.assignedCell) where.assignedCell = req.query.assignedCell;

  const complaints = await prisma.complaint.findMany({
    where,
    include: {
      victim: { select: { id: true, customUserId: true, fullName: true } },
      cases: { select: { id: true, caseId: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return sendSuccess(res, { complaints });
});

/**
 * Victims read their own complaints (R/W own).
 */
exports.getOwnComplaints = handleAsync(async (req, res) => {
  const complaints = await prisma.complaint.findMany({
    where: { victimId: req.user.id },
    include: {
      cases: { select: { id: true, caseId: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return sendSuccess(res, { complaints });
});

/**
 * POST /cases -> create a case from a classified complaint
 */
exports.createCase = handleAsync(async (req, res) => {
  const { complaintId, caseTitle, assignedOfficerId, riskScore } = req.body;

  if (!complaintId) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'complaintId is required');
  }

  const caseRecord = await prisma.case.create({
    data: {
      caseId: generateCaseId(),
      complaintId,
      assignedOfficerId: assignedOfficerId || req.user.id,
      caseTitle: caseTitle || 'Cybercrime Investigation',
      riskScore: riskScore || 0.0,
      status: 'open',
    },
  });

  // Advance the complaint to case_created
  await prisma.complaint.update({
    where: { id: complaintId },
    data: { status: 'case_created' },
  });

  return sendSuccess(res, { case: caseRecord }, HTTP_STATUS.CREATED);
});

/**
 * GET /cases -> officers see assigned; others read-only (legal/judge verified).
 */
exports.getCases = handleAsync(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (['police', 'investigator', 'forensic'].includes(req.user.role) && req.query.mine === 'true') {
    where.assignedOfficerId = req.user.id;
  }

  const cases = await prisma.case.findMany({
    where,
    include: {
      complaint: {
        select: {
          complaintId: true,
          aiPredictedCategory: true,
          severity: true,
          platform: true,
        },
      },
      assignedOfficer: {
        select: { id: true, customUserId: true, fullName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return sendSuccess(res, { cases });
});

/**
 * GET /cases/:id -> officers full detail; victims status-only snapshot.
 */
exports.getCaseById = handleAsync(async (req, res) => {
  const { id } = req.params;

  // Victim: only status snapshot (blocked from officer notes/forensic detail)
  if (req.user.role === 'victim') {
    const ownCase = await prisma.case.findFirst({
      where: {
        id,
        complaint: { victimId: req.user.id },
      },
      select: {
        caseId: true,
        caseTitle: true,
        status: true,
        riskScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!ownCase) {
      throw new HttpError(HTTP_STATUS.FORBIDDEN, 'Access denied');
    }
    return sendSuccess(res, { case: ownCase });
  }

  // Officers / legal / judge: full read
  const caseRecord = await prisma.case.findUnique({
    where: { id },
    include: {
      complaint: true,
      assignedOfficer: {
        select: { id: true, customUserId: true, fullName: true, badgeNumber: true },
      },
      evidence: {
        select: {
          id: true, evidenceId: true, evidenceType: true, sourceType: true,
          sha256Hash: true, integrityStatus: true, blockchainTxHash: true, createdAt: true,
        },
      },
    },
  });

  if (!caseRecord) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Case not found');
  }

  return sendSuccess(res, { case: caseRecord });
});

/**
 * PATCH /cases/:id -> update status/risk.
 */
exports.updateCase = handleAsync(async (req, res) => {
  const { id } = req.params;
  const { status, riskScore } = req.body;
  const caseId = req.body.case_id || req.body.caseId;

  // Officers may only update cases assigned to them
  const target = await prisma.case.findUnique({ where: { id } });
  if (!target) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Case not found');
  }

  if (
    ['police', 'investigator', 'forensic'].includes(req.user.role) &&
    target.assignedOfficerId !== req.user.id
  ) {
    throw new HttpError(HTTP_STATUS.FORBIDDEN, 'Not the assigned officer');
  }

  const caseRecord = await prisma.case.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(typeof riskScore === 'number' && { riskScore }),
      ...(caseId && { caseId }),
    },
  });

  return sendSuccess(res, { case: caseRecord });
});
