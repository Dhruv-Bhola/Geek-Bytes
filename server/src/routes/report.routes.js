const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Read-only access for legal/judiciary; officers generate reports.
// Victims never access internal final reports -> enforced access control.
router.get(
  '/case/:caseId',
  requireRoles('police', 'investigator', 'forensic', 'lawyer', 'judge', 'admin'),
  reportController.getReports
);

// Generation is restricted to police/investigator handlers
router.post(
  '/',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  reportController.generateReport
);

// Digital signing is a lawyer/judge action
router.patch(
  '/:id/sign',
  requireRoles('lawyer', 'judge', 'admin'),
  reportController.signReport
);

module.exports = router;
