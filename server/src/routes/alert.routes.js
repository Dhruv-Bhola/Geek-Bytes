const express = require('express');

const {
  verifyToken,
} = require('../middleware/authMiddleware');

const {
  getAlerts,
} = require('../controllers/alert.controller');

const router =
  express.Router();

/**
 * GET /api/v1/alerts
 */
router.get(
  '/',
  verifyToken,
  getAlerts
);

module.exports = router;