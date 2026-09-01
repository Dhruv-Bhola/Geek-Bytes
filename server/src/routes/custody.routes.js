const express = require('express');
const router = express.Router();
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');
const evidenceCtrl = require('../controllers/evidenceController');

// All custody routes require authentication.
router.use(verifyToken);

// POST /custody/log -> append an immutable custody step
router.post(
  '/log',
  requireRoles('police', 'investigator', 'forensic', 'judge', 'admin'),
  evidenceCtrl.logCustody
);

// GET /custody/:evidenceId -> chronological timeline (public E-XXX id)
router.get(
  '/:evidenceId',
  requireRoles('police', 'investigator', 'forensic', 'lawyer', 'judge', 'admin'),
  evidenceCtrl.getCustodyTimeline
);

module.exports = router;
