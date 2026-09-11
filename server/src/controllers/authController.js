const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const otpService = require('../services/otpService');

const { prisma } = require('../config/database');
const {
  HTTP_STATUS,
  HttpError,
  sendSuccess,
  handleAsync,
} = require('../utils/responseHelper');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function slugify(value = '') {
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
    admin: 'admin',
    victim: 'victim',
  };

  return prefixMap[role] || 'user';
}

async function generateCustomUserId(fullName, role) {
  const safeName = slugify(fullName);

  if (!safeName) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'A valid full name is required'
    );
  }

  const base = `${roleToPrefix(role)}_${safeName}`;

  const existing = await prisma.user.findUnique({
    where: {
      customUserId: base,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return base;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.floor(
      1000 + Math.random() * 9000
    );

    const candidate = `${base}_${suffix}`;

    const collision = await prisma.user.findUnique({
      where: {
        customUserId: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!collision) {
      return candidate;
    }
  }

  throw new HttpError(
    HTTP_STATUS.CONFLICT,
    'Unable to generate a unique user ID'
  );
}

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
      expiresIn:
        process.env.JWT_ACCESS_EXPIRY || '15m',
    }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      type: 'refresh',
    },
    process.env.JWT_SECRET,
    {
      issuer: process.env.JWT_ISSUER || 'dms',
      expiresIn:
        process.env.JWT_REFRESH_EXPIRY || '7d',
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
    isActive: user.isActive,
    mfaEnabled: Boolean(user.phone),
  };
}

async function recordAuthAudit({
  userId = null,
  action,
  metadata = {},
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        userId,
        action,
        metadata,
      },
    });
  } catch (err) {
    console.error(
      'Authentication audit logging failed:',
      err.message
    );
  }
}

function isAccountLocked(user) {
  return Boolean(
    user.lockedUntil &&
      user.lockedUntil.getTime() > Date.now()
  );
}

function normalizeIndianMobile(phone) {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, '');

  if (digits.length === 10) {
    return digits;
  }

  if (
    digits.length === 12 &&
    digits.startsWith('91')
  ) {
    return digits.slice(2);
  }

  return null;
}

/**
 * ============================================================
 * REGISTER
 * ============================================================
 *
 * Public registration remains disabled.
 */

exports.register = handleAsync(async () => {
  throw new HttpError(
    HTTP_STATUS.FORBIDDEN,
    'Public registration is disabled. User accounts must be provisioned by an administrator.'
  );
});

/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * Step 1:
 *   identifier + password
 *
 * Step 2:
 *   Fast2SMS Quick SMS OTP
 *
 * Tokens are issued only after successful OTP verification.
 */

exports.login = handleAsync(async (req, res) => {
  const identifier = (
    req.body.identifier ||
    req.body.email ||
    ''
  )
    .toLowerCase()
    .trim();

  const { password } = req.body;

  if (!identifier || !password) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'Identifier and password are required'
    );
  }

  const user =
    (await prisma.user.findUnique({
      where: {
        email: identifier,
      },
    })) ||
    (await prisma.user.findUnique({
      where: {
        customUserId: identifier,
      },
    }));

  /*
   * Do not reveal whether an account exists.
   */
  if (!user) {
    await recordAuthAudit({
      action: 'login_failed',
      metadata: {
        reason: 'unknown_identifier',
        identifier,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    throw new HttpError(
      HTTP_STATUS.UNAUTHORIZED,
      'Invalid credentials'
    );
  }

  if (!user.isActive) {
    await recordAuthAudit({
      userId: user.id,
      action: 'login_failed',
      metadata: {
        reason: 'account_disabled',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'Account is disabled'
    );
  }

  if (isAccountLocked(user)) {
    await recordAuthAudit({
      userId: user.id,
      action: 'login_failed',
      metadata: {
        reason: 'account_locked',
        lockedUntil: user.lockedUntil,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    throw new HttpError(
      423,
      'Account temporarily locked'
    );
  }

  const validPassword = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!validPassword) {
    const failedCount =
      (user.failedLoginCount || 0) + 1;

    const shouldLock =
      failedCount >=
      MAX_FAILED_LOGIN_ATTEMPTS;

    const lockedUntil = shouldLock
      ? new Date(
          Date.now() +
            LOCKOUT_MINUTES * 60 * 1000
        )
      : null;

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        failedLoginCount: failedCount,
        lockedUntil,
      },
    });

    await recordAuthAudit({
      userId: user.id,
      action: 'login_failed',
      metadata: {
        reason: 'invalid_password',
        failedLoginCount: failedCount,
        lockedUntil,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    if (shouldLock) {
      await recordAuthAudit({
        userId: user.id,
        action: 'login_failed',
        metadata: {
          reason:
            'account_locked_after_failed_attempts',
          failedLoginCount: failedCount,
          lockedUntil,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      throw new HttpError(
        423,
        'Too many failed login attempts. Account temporarily locked.'
      );
    }

    throw new HttpError(
      HTTP_STATUS.UNAUTHORIZED,
      'Invalid credentials'
    );
  }

  /*
   * Correct password:
   * reset failed-login counter.
   */
  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  /*
   * Fast2SMS Quick SMS requires a valid Indian mobile number.
   */
  const mobile = normalizeIndianMobile(
    user.phone
  );

  if (!mobile) {
    await recordAuthAudit({
      userId: user.id,
      action: 'login_failed',
      metadata: {
        reason: 'mfa_mobile_not_configured',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'MFA cannot be completed because no valid registered mobile number is configured.'
    );
  }

  /*
   * Generate and send OTP using Fast2SMS Quick SMS.
   */
  try {
    await otpService.sendOtp(mobile);
  } catch (err) {
    await recordAuthAudit({
      userId: user.id,
      action: 'login_failed',
      metadata: {
        reason: 'mfa_otp_send_failed',
        error: err.message,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    console.error(
      'Fast2SMS OTP send failed:',
      err.message
    );

    throw new HttpError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Unable to send OTP. Please try again.'
    );
  }

  await recordAuthAudit({
    userId: user.id,
    action: 'login_success',
    metadata: {
      stage: 'password_verified_otp_sent',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  /*
   * Do NOT return the user's full phone number.
   */
  const maskedMobile =
    `${mobile.slice(0, 2)}******${mobile.slice(-2)}`;

  return res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    data: null,
    error: 'OTP verification required',
    mfaRequired: true,
    otpSent: true,
    phone: maskedMobile,
    user: {
      id: user.id,
      customUserId: user.customUserId,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * ============================================================
 * VERIFY MFA
 * ============================================================
 *
 * POST /api/v1/auth/verify-mfa
 *
 * The access/refresh tokens are issued only after the server
 * verifies the OTP generated and stored by otpService.
 */

exports.verifyMfa = handleAsync(
  async (req, res) => {
    const identifier = (
      req.body.identifier ||
      req.body.email ||
      ''
    )
      .toLowerCase()
      .trim();

    const otp = String(
      req.body.otp || ''
    ).trim();

    if (!identifier || !otp) {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        'Identifier and OTP are required'
      );
    }

    if (!/^\d{6}$/.test(otp)) {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        'OTP must be a 6-digit number'
      );
    }

    const user =
      (await prisma.user.findUnique({
        where: {
          email: identifier,
        },
      })) ||
      (await prisma.user.findUnique({
        where: {
          customUserId: identifier,
        },
      }));

    if (!user) {
      await recordAuthAudit({
        action: 'login_failed',
        metadata: {
          reason: 'mfa_unknown_identifier',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        'Invalid OTP'
      );
    }

    if (!user.isActive) {
      throw new HttpError(
        HTTP_STATUS.FORBIDDEN,
        'Account is disabled'
      );
    }

    if (isAccountLocked(user)) {
      throw new HttpError(
        423,
        'Account temporarily locked'
      );
    }

    const mobile = normalizeIndianMobile(
      user.phone
    );

    if (!mobile) {
      throw new HttpError(
        HTTP_STATUS.FORBIDDEN,
        'No valid registered mobile number is configured for MFA'
      );
    }

    /*
     * Verify the OTP locally.
     * otpService stored only a SHA-256 hash + expiry.
     */
    let verification;

    try {
      verification = otpService.verifyOtp(
        mobile,
        otp
      );
    } catch (err) {
      await recordAuthAudit({
        userId: user.id,
        action: 'login_failed',
        metadata: {
          reason: 'mfa_verification_error',
          error: err.message,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      throw new HttpError(
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'Unable to verify OTP. Please try again.'
      );
    }

    if (!verification.success) {
      await recordAuthAudit({
        userId: user.id,
        action: 'login_failed',
        metadata: {
          reason: 'invalid_mfa',
          verificationMessage:
            verification.message,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        verification.message ||
          'Invalid or expired OTP'
      );
    }

    /*
     * MFA successfully completed.
     * Only now issue tokens.
     */
    const accessToken =
      signAccessToken(user);

    const refreshToken =
      signRefreshToken(user);

    await recordAuthAudit({
      userId: user.id,
      action: 'login_success',
      metadata: {
        authentication:
          'password+fast2sms_quick_sms_otp',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    return sendSuccess(res, {
      user: publicUser(user),
      accessToken,
      refreshToken,
    });
  }
);

/**
 * ============================================================
 * CURRENT USER
 * ============================================================
 */

exports.getMe = handleAsync(
  async (req, res) => {
    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },
      });

    if (!user) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'User not found'
      );
    }

    if (!user.isActive) {
      throw new HttpError(
        HTTP_STATUS.FORBIDDEN,
        'Account is disabled'
      );
    }

    return sendSuccess(res, {
      user: publicUser(user),
    });
  }
);

/**
 * ============================================================
 * REFRESH TOKEN
 * ============================================================
 */

exports.refreshToken = handleAsync(
  async (req, res) => {
    const {
      refreshToken: token,
    } = req.body;

    if (!token) {
      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        'Refresh token required'
      );
    }

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          issuer:
            process.env.JWT_ISSUER || 'dms',
        }
      );
    } catch (err) {
      if (
        err.name ===
        'TokenExpiredError'
      ) {
        throw new HttpError(
          HTTP_STATUS.UNAUTHORIZED,
          'Refresh token expired'
        );
      }

      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        'Invalid refresh token'
      );
    }

    if (decoded.type !== 'refresh') {
      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        'Invalid token type'
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: decoded.id,
        },
      });

    if (!user) {
      throw new HttpError(
        HTTP_STATUS.UNAUTHORIZED,
        'User not found'
      );
    }

    if (!user.isActive) {
      throw new HttpError(
        HTTP_STATUS.FORBIDDEN,
        'Account is disabled'
      );
    }

    if (isAccountLocked(user)) {
      throw new HttpError(
        423,
        'Account temporarily locked'
      );
    }

    const newAccessToken =
      signAccessToken(user);

    const newRefreshToken =
      signRefreshToken(user);

    await recordAuthAudit({
      userId: user.id,
      action: 'login_success',
      metadata: {
        event: 'token_refresh',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    return sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  }
);

exports.signAccessToken =
  signAccessToken;

exports.signRefreshToken =
  signRefreshToken;

exports.publicUser =
  publicUser;

exports.generateCustomUserId =
  generateCustomUserId;