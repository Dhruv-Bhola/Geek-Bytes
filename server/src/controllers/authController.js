const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { HTTP_STATUS, HttpError, sendSuccess, handleAsync } = require('../utils/responseHelper');

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Normalize a role/custom-user prefix into a snake_case token id.
 * e.g. "Rahul Sharma" + role "police" -> "officer_rahul"
 */
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function roleToPrefix(role) {
  const prefixMap = {
    police: 'officer',
    investigator: 'forensic',
    forensic: 'forensic',
    lawyer: 'legal',
    judge: 'judge',
    victim: 'victim',
    admin: 'admin',
  };
  return prefixMap[role] || 'user';
}

/**
 * Generate a unique custom_user_id e.g. `officer_rahul`.
 * Falls back to `role_random` on any collision.
 */
async function generateCustomUserId(fullName, role) {
  const base = `${roleToPrefix(role)}_${slugify(fullName)}`;
  const existing = await prisma.user.findUnique({
    where: { customUserId: base },
    select: { id: true },
  });
  if (!existing) return base;

  let candidate;
  do {
    candidate = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const collision = await prisma.user.findUnique({
      where: { customUserId: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
  } while (candidate);
}

/**
 * Issue signed JWT access token containing
 * { id, customUserId, role, jurisdiction } per the RBAC contract.
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      customUserId: user.customUserId,
      role: user.role,
      jurisdiction: user.jurisdictionCell || null,
    },
    process.env.JWT_SECRET,
    {
      issuer: process.env.JWT_ISSUER || 'dms',
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_SECRET,
    {
      issuer: process.env.JWT_ISSUER || 'dms',
      expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
    }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    customUserId: user.customUserId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    badgeNumber: user.badgeNumber,
    jurisdictionCell: user.jurisdictionCell,
    mfaEnabled: Boolean(user.mfaSecret),
  };
}

/**
 * POST /api/v1/auth/register
 * Hash password (bcrypt, 12 rounds), generate custom ID, create user.
 */
exports.register = handleAsync(async (req, res) => {
  const {
    fullName,
    email,
    phone,
    password,
    role = 'victim',
    badgeNumber,
    jurisdictionCell,
  } = req.body;

  const emailNorm = (email || '').toLowerCase().trim();
  if (!emailNorm) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'Email is required');
  }

  const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (existing) {
    throw new HttpError(HTTP_STATUS.CONFLICT, 'Email already registered');
  }

  const customUserId = await generateCustomUserId(fullName, role);
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      customUserId,
      fullName,
      email: emailNorm,
      phone,
      passwordHash,
      role,
      badgeNumber,
      jurisdictionCell,
    },
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return sendSuccess(
    res,
    { user: publicUser(user), accessToken, refreshToken },
    HTTP_STATUS.CREATED
  );
});

/**
 * POST /api/v1/auth/login
 * Validate credentials, inspect MFA status, issue JWTs.
 */
exports.login = handleAsync(async (req, res) => {
  const identifier = (req.body.identifier || req.body.email || '').toLowerCase().trim();
  const { password } = req.body;

  if (!identifier || !password) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'Identifier and password are required');
  }

  // Support login via email OR custom_user_id
  const user =
    (await prisma.user.findUnique({ where: { email: identifier } })) ||
    (await prisma.user.findUnique({ where: { customUserId: identifier } }));

  if (!user) {
    throw new HttpError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
  }

  // MFA gate: if an MFA secret is configured, require a one-time code.
  // Token issuance is withheld until the code is verified via /auth/mfa/verify.
  if (user.mfaSecret) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      data: null,
      error: 'MFA required',
      mfaRequired: true,
      user: { id: user.id, customUserId: user.customUserId },
      timestamp: new Date().toISOString(),
    });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return sendSuccess(res, { user: publicUser(user), accessToken, refreshToken });
});

/**
 * GET /api/v1/auth/me
 * Return the current authenticated profile (guarded by verifyToken).
 */
exports.getMe = handleAsync(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });
  if (!user) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'User not found');
  }
  return sendSuccess(res, { user: publicUser(user) });
});

/**
 * POST /api/v1/auth/refresh
 * Rotate an expired access token using a valid refresh token.
 */
exports.refreshToken = handleAsync(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) {
    throw new HttpError(HTTP_STATUS.UNAUTHORIZED, 'Refresh token required');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    issuer: process.env.JWT_ISSUER || 'dms',
  });
  if (decoded.type !== 'refresh') {
    throw new HttpError(HTTP_STATUS.UNAUTHORIZED, 'Invalid token type');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    throw new HttpError(HTTP_STATUS.UNAUTHORIZED, 'User not found');
  }

  return sendSuccess(res, {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
});
