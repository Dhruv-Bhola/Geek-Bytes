const express = require('express');

const {
  verifyToken,
} = require('../middleware/authMiddleware');

const {
  getAuditEvents,
} = require('../controllers/audit.controller');

const router = express.Router();

/**
 * GET /api/v1/audit
 *
 * Returns the authenticated user's authorized audit events.
 *
 * Admin:
 *   Can view all audit events.
 *
 * Normal users:
 *   Can view audit events associated with cases they are actively
 *   assigned to.
 */
router.get(
  '/',
  verifyToken,
  getAuditEvents
);

module.exports = router;