const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/evidenceController');
const {
  verifyToken,
  requireRoles,
} = require('../middleware/authMiddleware');
const {
  victimUpload,
  policeUpload,
  socialUpload,
} = require('../services/storage');

// All evidence and custody routes require authentication.
router.use(verifyToken);

// ---------------------------------------------------------------------------
// List evidence for a case (vault loader). Declared before the dynamic
// `:evidenceId/...` routes so `case/:caseId` is never captured by them.
// ---------------------------------------------------------------------------
router.get(
  '/case/:caseId',
  requireRoles('police', 'investigator', 'forensic', 'lawyer', 'judge', 'admin'),
  ctrl.getCaseEvidence
);

// ---------------------------------------------------------------------------
// Victim uploads: screenshots, PDFs, images, chat exports, audio (<= 50MB)
// ---------------------------------------------------------------------------
router.post(
  '/victim',
  requireRoles('victim', 'admin'),
  victimUpload.single('file'),
  ctrl.uploadVictimEvidence
);

// ---------------------------------------------------------------------------
// Police/forensic uploads: heavy CCTV/video (<= 5GB, streamed)
// ---------------------------------------------------------------------------
router.post(
  '/police',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  policeUpload.single('file'),
  ctrl.uploadPoliceEvidence
);

// ---------------------------------------------------------------------------
// Social media preservation (optional snapshot file)
// ---------------------------------------------------------------------------
router.post(
  '/social-preserve',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  socialUpload.single('snapshot'),
  ctrl.preserveSocialEvidence
);

// ---------------------------------------------------------------------------
// Integrity verification: liveHash === storedHash === onChainHash
// ---------------------------------------------------------------------------
router.get(
  '/:evidenceId/verify',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  ctrl.verifyEvidence
);

// ---------------------------------------------------------------------------
// Decrypted streaming download (Police, Investigator, Judge)
// ---------------------------------------------------------------------------
router.get(
  '/:evidenceId/download',
  requireRoles('police', 'investigator', 'forensic', 'judge', 'admin'),
  ctrl.downloadEvidence
);

module.exports = router;
