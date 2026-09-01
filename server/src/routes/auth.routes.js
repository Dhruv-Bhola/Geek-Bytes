const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { roleValidation } = require('../middleware/validation');

const VALID_ROLES = ['police', 'investigator', 'forensic', 'lawyer', 'judge', 'victim', 'admin'];

// POST /register - create account, issue tokens
router.post('/register', [
  ...roleValidation(VALID_ROLES),
], authController.register);

// POST /login - authenticate by email or custom_user_id
router.post('/login', authController.login);

// POST /refresh - rotate tokens
router.post('/refresh', authController.refreshToken);

// GET /me - current profile (protected)
router.get('/me', verifyToken, authController.getMe);

// legacy alias: GET /profile
router.get('/profile', verifyToken, authController.getMe);

module.exports = router;
