const { body, param, validationResult } = require('express-validator');

/**
 * ============================================================
 * COMMON VALIDATION HANDLER
 * ============================================================
 */

function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
        value: e.value,
      })),
    });
  }

  next();
}

/**
 * ============================================================
 * COMPLAINT VALIDATION
 * ============================================================
 */

const complaintValidation = [
  body('victimName')
    .trim()
    .notEmpty()
    .withMessage('Victim name is required'),

  body('contactNumber')
    .trim()
    .notEmpty()
    .withMessage('Contact number is required'),

  body('incidentDate')
    .optional()
    .isISO8601()
    .withMessage('Incident date must be ISO-8601'),

  body('platform')
    .trim()
    .notEmpty()
    .withMessage('Platform is required'),

  body('crimeDescription')
    .trim()
    .isLength({ min: 20 })
    .withMessage('Crime description must be at least 20 characters'),

  body('location')
    .optional()
    .trim(),

  body('additionalDetails')
    .optional()
    .trim(),

  validate,
];

/**
 * ============================================================
 * DOCUMENT UPLOAD VALIDATION
 * ============================================================
 *
 * Used by the new secure document upload flow.
 */

const documentUploadValidation = [
  body('caseId')
    .trim()
    .notEmpty()
    .withMessage('Case ID is required'),

  body('title')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Document title must be between 2 and 200 characters'),

  body('documentType')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Document type is required'),

  body('sensitivity')
    .optional()
    .isIn([
      'public',
      'internal',
      'confidential',
      'restricted',
      'secret',
    ])
    .withMessage('Invalid document sensitivity'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),

  validate,
];

/**
 * ============================================================
 * LEGACY EVIDENCE UPLOAD VALIDATION
 * ============================================================
 *
 * Kept for compatibility with the existing evidence API.
 */

const evidenceUploadValidation = [
  body('caseId')
    .trim()
    .notEmpty()
    .withMessage('Case ID is required'),

  body('title')
    .trim()
    .notEmpty()
    .withMessage('Evidence title is required'),

  body('evidenceType')
    .isIn([
      'document',
      'image',
      'video',
      'audio',
      'screenshot',
      'social_media',
      'device_extraction',
      'financial_record',
      'other',
    ])
    .withMessage('Invalid evidence type'),

  validate,
];

/**
 * ============================================================
 * DOCUMENT PARAMETER VALIDATION
 * ============================================================
 */

const documentIdValidation = [
  param('documentId')
    .trim()
    .notEmpty()
    .withMessage('Document ID is required'),

  validate,
];

const caseIdValidation = [
  param('caseId')
    .trim()
    .notEmpty()
    .withMessage('Case ID is required'),

  validate,
];

/**
 * ============================================================
 * CASE UPDATE VALIDATION
 * ============================================================
 */

const caseUpdateValidation = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Case ID is required'),

  body('status')
    .optional()
    .isIn([
      'open',
      'under_investigation',
      'chargesheet_filed',
      'court_disposed',
    ])
    .withMessage('Invalid case status'),

  body('severity')
    .optional()
    .isIn([
      'low',
      'medium',
      'high',
      'critical',
    ])
    .withMessage('Invalid case severity'),

  validate,
];

/**
 * ============================================================
 * CASE ASSIGNMENT VALIDATION
 * ============================================================
 */

const caseAssignmentValidation = [
  body('caseId')
    .trim()
    .notEmpty()
    .withMessage('Case ID is required'),

  body('userId')
    .trim()
    .notEmpty()
    .withMessage('User ID is required'),

  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('expiresAt must be a valid ISO-8601 date'),

  validate,
];

/**
 * ============================================================
 * DOCUMENT PERMISSION VALIDATION
 * ============================================================
 */

const documentPermissionValidation = [
  body('documentId')
    .trim()
    .notEmpty()
    .withMessage('Document ID is required'),

  body('userId')
    .trim()
    .notEmpty()
    .withMessage('User ID is required'),

  body('action')
    .isIn([
      'view',
      'download',
      'upload',
      'update',
      'transfer',
      'verify',
    ])
    .withMessage('Invalid document permission action'),

  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('expiresAt must be a valid ISO-8601 date'),

  validate,
];

/**
 * ============================================================
 * EMERGENCY ACCESS REQUEST VALIDATION
 * ============================================================
 */

const emergencyAccessValidation = [
  body('documentId')
    .trim()
    .notEmpty()
    .withMessage('Document ID is required'),

  body('reason')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage(
      'Emergency access reason must be between 10 and 2000 characters'
    ),

  body('durationMinutes')
    .isInt({ min: 1, max: 1440 })
    .withMessage(
      'Emergency access duration must be between 1 and 1440 minutes'
    ),

  validate,
];

/**
 * ============================================================
 * AUTHENTICATION VALIDATION
 * ============================================================
 */

/**
 * Registration validation for auth routes.
 *
 * The actual authorization policy is enforced by the controller;
 * this middleware only validates the shape of the request.
 */
function roleValidation(roles) {
  return [
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required'),

    body('email')
      .isEmail()
      .withMessage('Valid email required'),

    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),

    body('role')
      .optional()
      .isIn(roles)
      .withMessage(
        `Role must be one of: ${roles.join(', ')}`
      ),

    validate,
  ];
}

const loginValidation = [
  body('identifier')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Identifier cannot be empty'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Email must be valid'),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  validate,
];

/**
 * ============================================================
 * MFA VALIDATION
 * ============================================================
 */

const mfaValidation = [
  body('identifier')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Identifier cannot be empty'),

  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),

  validate,
];

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  validate,

  roleValidation,
  loginValidation,
  mfaValidation,

  complaintValidation,

  documentUploadValidation,
  documentIdValidation,
  caseIdValidation,

  evidenceUploadValidation,

  caseUpdateValidation,
  caseAssignmentValidation,
  documentPermissionValidation,
  emergencyAccessValidation,
};