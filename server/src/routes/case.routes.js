const express = require('express');

const router = express.Router();

const caseController = require('../controllers/case.controller');

const {
  verifyToken,
  requireRoles,
  authorize,
  requireCaseAssignment,
} = require('../middleware/authMiddleware');

const {
  complaintValidation,
  caseUpdateValidation,
} = require('../middleware/validation');

// All case routes require authentication.
router.use(verifyToken);

/**
 * ============================================================
 * COMPLAINTS
 * ============================================================
 */

// Victims: file complaints.
router.post(
  '/complaints',
  requireRoles('victim', 'admin'),
  complaintValidation,
  caseController.createComplaint
);

// Victims: read their own complaints.
router.get(
  '/complaints/own',
  requireRoles('victim', 'admin'),
  caseController.getOwnComplaints
);

// Police / Investigator / Forensic / Admin:
// list complaints available to their operational scope.
router.get(
  '/complaints',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  authorize('case:read_assigned'),
  caseController.getComplaints
);

/**
 * ============================================================
 * CASE CREATION
 * ============================================================
 */

// Authorized operational users create cases from complaints.
router.post(
  '/',
  requireRoles('police', 'investigator', 'forensic', 'admin'),
  authorize('case:create'),
  caseController.createCase
);

/**
 * ============================================================
 * CASE LIST
 * ============================================================
 *
 * Non-admin users must only receive cases within their
 * authorized operational scope.
 *
 * The controller should still filter the actual result set.
 */
router.get(
  '/',
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'lawyer',
    'judge',
    'admin'
  ),
  authorize('case:read_assigned'),
  caseController.getCases
);

/**
 * ============================================================
 * CASE DETAIL
 * ============================================================
 *
 * Victims are allowed to access their own case through the
 * controller's ownership check.
 *
 * Operational/legal users require an active case assignment.
 *
 * Admins are allowed through the authorization middleware.
 */
router.get(
  '/:id',
  requireRoles(
    'victim',
    'police',
    'investigator',
    'forensic',
    'lawyer',
    'judge',
    'admin'
  ),
  (req, res, next) => {
    if (req.user?.role === 'victim' || req.user?.role === 'admin') {
      return next();
    }

    return requireCaseAssignment()(req, res, next);
  },
  caseController.getCaseById
);

/**
 * ============================================================
 * CASE UPDATE
 * ============================================================
 *
 * A user must have both the appropriate capability and an
 * active assignment to the case.
 */
router.patch(
  '/:id',
  requireRoles(
    'police',
    'investigator',
    'forensic',
    'admin'
  ),
  authorize('case:update'),
  requireCaseAssignment(),
  caseUpdateValidation,
  caseController.updateCase
);

module.exports = router;