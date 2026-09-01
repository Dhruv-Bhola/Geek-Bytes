const { body, param, query, validationResult } = require('express-validator');

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

const complaintValidation = [
  body('victimName').trim().notEmpty().withMessage('Victim name is required'),
  body('contactNumber').trim().notEmpty().withMessage('Contact number is required'),
  body('incidentDate').optional().isISO8601().withMessage('Incident date must be ISO-8601'),
  body('platform').trim().notEmpty().withMessage('Platform is required'),
  body('crimeDescription').trim().isLength({ min: 20 }).withMessage('Crime description must be at least 20 characters'),
  body('location').optional().trim(),
  body('additionalDetails').optional().trim(),
  validate,
];

const evidenceUploadValidation = [
  body('caseId').trim().notEmpty().withMessage('Case ID is required'),
  body('title').trim().notEmpty().withMessage('Evidence title is required'),
  body('evidenceType').isIn([
    'document', 'image', 'video', 'audio', 'screenshot', 'social_media',
    'device_extraction', 'financial_record', 'other',
  ]).withMessage('Invalid evidence type'),
  validate,
];

const caseUpdateValidation = [
  param('id').trim().notEmpty(),
  body('status').optional().isIn([
    'open', 'under_investigation', 'chargesheet_filed', 'court_disposed',
  ]).withMessage('Invalid case status'),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  validate,
];

/**
 * Registration validation for the auth routes.
 * @param {string[]} roles allowed role enum values
 */
function roleValidation(roles) {
  return [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().isIn(roles).withMessage(`Role must be one of: ${roles.join(', ')}`),
    validate,
  ];
}

const loginValidation = [
  body('identifier').optional().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

module.exports = {
  validate,
  roleValidation,
  loginValidation,
  complaintValidation,
  evidenceUploadValidation,
  caseUpdateValidation,
};
