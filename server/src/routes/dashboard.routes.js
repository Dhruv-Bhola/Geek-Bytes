const express = require('express');

const router = express.Router();

const dashboardController = require(
  '../controllers/dashboard.controller'
);

const {
  verifyToken,
} = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get(
  '/summary',
  dashboardController.getDashboardSummary
);

module.exports = router;