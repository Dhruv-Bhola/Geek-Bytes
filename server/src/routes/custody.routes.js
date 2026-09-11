const express = require('express');

const router = express.Router();

const {
  verifyToken,
  authorize,
  requireDocumentPermission,
} = require('../middleware/authMiddleware');

const evidenceCtrl = require('../controllers/evidenceController');

// All custody routes require authentication.
router.use(verifyToken);

/**
 * POST /custody/log
 *
 * Append a custody event for a document.
 *
 * The controller receives documentId in the request body.
 * Write access is limited to users who have the custody:write
 * capability and permission on the document.
 */
router.post(
  '/log',
  authorize('custody:write'),
  requireDocumentPermission('update'),
  evidenceCtrl.logCustody
);

/**
 * GET /custody/:documentId
 *
 * Return the chronological chain-of-custody timeline.
 */
router.get(
  '/:documentId',
  authorize('custody:read'),
  requireDocumentPermission('view'),
  evidenceCtrl.getCustodyTimeline
);

module.exports = router;