const express = require('express');

const router = express.Router();

/*
 * ============================================================
 * FILE UPLOAD / MULTER
 * ============================================================
 */
const {
  documentUpload,
  victimUpload,
  policeUpload,
  socialUpload,
} = require('../services/storage');

/*
 * ============================================================
 * AUTHORIZATION
 * ============================================================
 */
const {
  verifyToken,
  requireRoles,
  authorize,
  requireCaseAssignment,
  requireDocumentPermission,
} = require('../middleware/authMiddleware');

/*
 * ============================================================
 * CONTROLLER
 * ============================================================
 */
const evidenceCtrl = require('../controllers/evidenceController');

/*
 * Every evidence/document endpoint requires authentication.
 */
router.use(verifyToken);

/*
 * ============================================================
 * CASE DOCUMENTS
 * ============================================================
 */

/**
 * GET /api/v1/evidence/case/:caseId
 *
 * List documents belonging to a case.
 *
 * Security:
 *   JWT
 *    ↓
 *   Role capability
 *    ↓
 *   Active case assignment
 */
router.get(
  '/case/:caseId',
  authorize('case:read_assigned'),
  requireCaseAssignment(),
  evidenceCtrl.getCaseEvidence
);

/*
 * ============================================================
 * DOCUMENT UPLOAD
 * ============================================================
 */

/**
 * POST /api/v1/evidence/documents/upload
 *
 * Primary Secure DMS document upload endpoint.
 *
 * multipart/form-data:
 *
 *   file
 *   caseId
 *   title
 *   documentType
 *   sensitivity
 *   description
 *   metadata
 *
 * Processing:
 *
 *   Multer staging
 *        ↓
 *   SHA-256
 *        ↓
 *   AES-256-GCM
 *        ↓
 *   Document
 *        ↓
 *   DocumentVersion
 *        ↓
 *   DocumentPermission
 *        ↓
 *   AuditEvent
 *        ↓
 *   Blockchain anchor
 */
router.post(
  '/documents/upload',
  documentUpload.single('file'),
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('document:upload'),
  evidenceCtrl.uploadPoliceEvidence
);

/**
 * POST /api/v1/evidence/upload/police
 *
 * Backwards-compatible police/forensic upload endpoint.
 */
router.post(
  '/upload/police',
  policeUpload.single('file'),
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('document:upload'),
  evidenceCtrl.uploadPoliceEvidence
);

/**
 * POST /api/v1/evidence/upload/victim
 *
 * Kept for compatibility with the previous system.
 */
router.post(
  '/upload/victim',
  victimUpload.single('file'),
  requireRoles(
    'victim',
    'admin'
  ),
  authorize('document:upload'),
  evidenceCtrl.uploadVictimEvidence
);

/**
 * POST /api/v1/evidence/preserve/social
 *
 * Social-media preservation.
 *
 * Snapshot file is optional.
 */
router.post(
  '/preserve/social',
  socialUpload.single('file'),
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('document:upload'),
  evidenceCtrl.preserveSocialEvidence
);

/*
 * ============================================================
 * SINGLE DOCUMENT
 * ============================================================
 */

/**
 * GET /api/v1/evidence/:documentId
 *
 * Get document metadata and version history.
 *
 * Security:
 *   1. Authentication
 *   2. Role capability
 *   3. Case assignment
 *   4. Explicit document VIEW permission
 */
router.get(
  '/:documentId',
  authorize('document:read'),
  requireDocumentPermission('view'),
  evidenceCtrl.getDocument
);

/**
 * POST /api/v1/evidence/:documentId/verify
 *
 * Verify:
 *
 *   Stored SHA-256
 *          =
 *   Live decrypted SHA-256
 *          =
 *   Blockchain hash
 *
 * On mismatch:
 *
 *   integrityStatus = tampered
 *   SecurityAlert created
 *   AuditEvent created
 *   Access can be blocked
 */
router.post(
  '/:documentId/verify',
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('document:verify'),
  requireDocumentPermission('verify'),
  evidenceCtrl.verifyEvidence
);

/**
 * GET /api/v1/evidence/:documentId/download
 *
 * Download only after:
 *
 *   Authorization
 *        +
 *   Case assignment
 *        +
 *   Document permission
 *        +
 *   Integrity verification
 */
router.get(
  '/:documentId/download',
  authorize('document:download'),
  requireDocumentPermission('download'),
  evidenceCtrl.downloadEvidence
);

/*
 * ============================================================
 * CUSTODY / AUDIT
 * ============================================================
 */

/**
 * POST /api/v1/evidence/custody
 *
 * Append a custody event.
 */
router.post(
  '/custody',
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('custody:write'),
  evidenceCtrl.logCustody
);

/**
 * GET /api/v1/evidence/:documentId/custody
 *
 * Retrieve document custody/audit timeline.
 */
router.get(
  '/:documentId/custody',
  authorize('custody:read'),
  requireDocumentPermission('view'),
  evidenceCtrl.getCustodyTimeline
);

module.exports = router;