const express = require('express');
const router = express.Router();
const caseController = require('../controllers/case.controller');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');
const { complaintValidation, caseUpdateValidation } = require('../middleware/validation');

// All case routes require authentication
router.use(verifyToken);

// Victims: file complaints
router.post(
  '/complaints',
  requireRoles('victim'),
  complaintValidation,
  caseController.createComplaint
);

// Victims: read their own complaints (R/W own)
router.get(
  '/complaints/own',
  requireRoles('victim'),
  caseController.getOwnComplaints
);

// Police/Investigator/Admin: list & filter complaints
router.get(
  '/complaints',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  caseController.getComplaints
);

// Police/Investigator: create a case from a complaint
router.post(
  '/',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  caseController.createCase
);

// Victims read only their own case status via GET /cases/:id (scoped below).
// The aggregate case list is restricted to law-enforcement, legal, and admin
// roles so internal case/forensic data is never leaked to citizen tokens.
router.get(
  '/',
  requireRoles('police', 'investigator', 'forensic', 'lawyer', 'judge', 'admin'),
  caseController.getCases
);

// Officers: case detail (full); victims: status snapshot only
router.get('/:id', caseController.getCaseById);

// Officers: update assigned case
router.patch(
  '/:id',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  caseUpdateValidation,
  caseController.updateCase
);

module.exports = router;
