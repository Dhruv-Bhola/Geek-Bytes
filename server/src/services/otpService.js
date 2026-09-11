const crypto = require('crypto');
const axios = require('axios');

const FAST2SMS_URL =
  'https://www.fast2sms.com/dev/bulkV2';

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

/*
 * Demo mode:
 *
 * true  -> generate OTP locally and show it in the server console.
 * false -> send OTP through Fast2SMS Quick SMS.
 *
 * Keep this TRUE during development so repeated testing
 * does not consume SMS balance.
 */
const DEMO_MODE =
  String(process.env.MFA_DEMO_MODE || 'true')
    .toLowerCase() === 'true';

/*
 * Demo-only in-memory OTP store.
 *
 * For production, use Redis or a database.
 */
const otpStore = new Map();

/**
 * Generate a cryptographically random 6-digit OTP.
 */
function generateOtp() {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

/**
 * Store only a SHA-256 hash of the OTP.
 */
function hashOtp(otp) {
  return crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');
}

/**
 * Send an OTP.
 */
async function sendOtp(phone) {
  if (
    !phone ||
    !/^\d{10}$/.test(phone)
  ) {
    throw new Error(
      'Invalid Indian mobile number'
    );
  }

  const otp = generateOtp();

  const expiresAt =
    Date.now() +
    OTP_EXPIRY_MINUTES *
      60 *
      1000;

  /*
   * Store only the hash.
   */
  otpStore.set(phone, {
    otpHash: hashOtp(otp),
    expiresAt,
    attempts: 0,
  });

  /*
   * ----------------------------------------------------------
   * DEMO MODE
   * ----------------------------------------------------------
   *
   * No Fast2SMS request is made.
   * This prevents wasting SMS credits during development.
   */
  if (DEMO_MODE) {
    console.log(
      `[DEMO MFA] OTP for ${phone}: ${otp}`
    );

    console.log(
      `[DEMO MFA] OTP expires in ${OTP_EXPIRY_MINUTES} minutes`
    );

    return {
      success: true,
      demoMode: true,
      expiresIn:
        OTP_EXPIRY_MINUTES * 60,
    };
  }

  /*
   * ----------------------------------------------------------
   * PRODUCTION / REAL SMS MODE
   * ----------------------------------------------------------
   */

  const apiKey =
    process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    otpStore.delete(phone);

    throw new Error(
      'FAST2SMS_API_KEY is not configured'
    );
  }

  try {
    const response =
      await axios.post(
        FAST2SMS_URL,
        {
          route: 'q',

          message:
            `Your Secure DMS verification OTP is ${otp}. ` +
            `It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,

          numbers: phone,
        },
        {
          headers: {
            Authorization: apiKey,
            'Content-Type':
              'application/json',
          },

          timeout: 10000,
        }
      );

    if (
      !response.data ||
      response.data.return !== true
    ) {
      otpStore.delete(phone);

      throw new Error(
        response.data?.message ||
          'Fast2SMS failed to send OTP'
      );
    }

    console.log(
      `OTP sent successfully to ${phone}`
    );

    return {
      success: true,
      demoMode: false,
      expiresIn:
        OTP_EXPIRY_MINUTES * 60,
    };
  } catch (error) {
    otpStore.delete(phone);

    if (error.response) {
      console.error(
        'Fast2SMS error:',
        error.response.data
      );
    } else {
      console.error(
        'Fast2SMS OTP send failed:',
        error.message
      );
    }

    throw new Error(
      'Unable to send OTP. Please try again.'
    );
  }
}

/**
 * Verify a previously generated OTP.
 */
function verifyOtp(
  phone,
  otp
) {
  if (!phone || !otp) {
    return {
      success: false,
      message:
        'Phone number and OTP are required',
    };
  }

  const record =
    otpStore.get(phone);

  if (!record) {
    return {
      success: false,
      message:
        'OTP not found or expired',
    };
  }

  /*
   * Check expiry.
   */
  if (
    Date.now() >
    record.expiresAt
  ) {
    otpStore.delete(phone);

    return {
      success: false,
      message:
        'OTP has expired',
    };
  }

  /*
   * Prevent unlimited attempts.
   */
  if (
    record.attempts >=
    OTP_MAX_ATTEMPTS
  ) {
    otpStore.delete(phone);

    return {
      success: false,
      message:
        'Maximum OTP attempts exceeded',
    };
  }

  record.attempts += 1;

  const submittedHash =
    hashOtp(String(otp));

  if (
    submittedHash !==
    record.otpHash
  ) {
    return {
      success: false,
      message: 'Invalid OTP',
    };
  }

  /*
   * OTP is single-use.
   */
  otpStore.delete(phone);

  return {
    success: true,
    message:
      'OTP verified successfully',
  };
}

/**
 * Remove an OTP challenge.
 */
function clearOtp(phone) {
  otpStore.delete(phone);
}

module.exports = {
  sendOtp,
  verifyOtp,
  clearOtp,
};