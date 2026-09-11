const express = require("express");

const {
  getDocumentPermissions,
  grantDocumentPermission,
  revokeDocumentPermission,
} = require("../controllers/documentPermission.controller");

const {
  verifyToken,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
 * GET
 * View all permissions for a document
 */
router.get(
  "/document/:documentId",
  verifyToken,
  getDocumentPermissions
);

/*
 * POST
 * Grant or update a permission
 */
router.post(
  "/document/:documentId",
  verifyToken,
  grantDocumentPermission
);

/*
 * DELETE
 * Revoke a permission
 */
router.delete(
  "/document/:documentId/:permissionId",
  verifyToken,
  revokeDocumentPermission
);

module.exports = router;