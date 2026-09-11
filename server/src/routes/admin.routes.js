const express = require("express");

const {
  getUsers,
  createUser,
} = require("../controllers/admin.controller");

const {
  verifyToken,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All admin routes require authentication.
// The controller additionally verifies that the
// authenticated user has the admin role.

router.get(
  "/users",
  verifyToken,
  getUsers
);

router.post(
  "/users",
  verifyToken,
  createUser
);

module.exports = router;