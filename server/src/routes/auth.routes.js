const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

const {
  verifyToken,
} = require('../middleware/authMiddleware');

const {
  roleValidation,
} = require('../middleware/validation');

const VALID_ROLES = [
  'police',
  'investigator',
  'forensic',
  'lawyer',
  'judge',
  'victim',
  'admin',
];

/*
 * Public authentication routes
 */

// Public registration remains disabled by the controller.
router.post(
  '/register',
  [
    ...roleValidation(VALID_ROLES),
  ],
  authController.register
);

// Step 1: identifier + password
router.post(
  '/login',
  authController.login
);

// Step 2: OTP verification
router.post(
  '/verify-mfa',
  authController.verifyMfa
);

// Refresh access/refresh tokens
router.post(
  '/refresh',
  authController.refreshToken
);

/*
 * Protected authentication routes
 */

router.get(
  '/me',
  verifyToken,
  authController.getMe
);

router.get(
  '/profile',
  verifyToken,
  authController.getMe
);

module.exports = router;