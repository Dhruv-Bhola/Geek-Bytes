const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');


/*
 * ============================================================
 * SECURE CRYPTOGRAPHY SERVICE
 * ============================================================
 *
 * Document security model:
 *
 *   Original file
 *        ↓
 *   SHA-256 hash
 *        ↓
 *   AES-256-GCM encryption
 *        ↓
 *   Encrypted storage
 *
 * The SHA-256 hash identifies the original plaintext.
 * AES-256-GCM provides confidentiality + authenticated
 * encryption for the stored artifact.
 *
 * IMPORTANT:
 * The AES key is supplied through AES_256_KEY.
 * There is NO insecure development/default key fallback.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/*
 * ============================================================
 * KEY MANAGEMENT
 * ============================================================
 *
 * Expected environment value:
 *
 * AES_256_KEY=<64 hexadecimal characters>
 *
 * Example generation:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getAesKey() {
  const configuredKey =
    process.env.AES_256_KEY;

  if (!configuredKey) {
    throw new Error(
      'AES_256_KEY is not configured. Refusing to use an insecure fallback key.'
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(configuredKey)) {
    throw new Error(
      'AES_256_KEY must contain hexadecimal characters only.'
    );
  }

  if (configuredKey.length !== KEY_LENGTH * 2) {
    throw new Error(
      `AES_256_KEY must be exactly ${KEY_LENGTH * 2} hexadecimal characters (32 bytes).`
    );
  }

  return Buffer.from(configuredKey, 'hex');
}

/*
 * ============================================================
 * SHA-256
 * ============================================================
 */

/**
 * SHA-256 for strings or Buffers.
 */
function sha256(data) {
  const hash = crypto.createHash('sha256');

  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(String(data), 'utf8');
  }

  return hash.digest('hex');
}

/**
 * Stream SHA-256 over a file.
 *
 * The original plaintext is hashed before encryption.
 * This keeps memory usage bounded for large CCTV/video files.
 */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('error', reject);

    stream.on('end', () => {
      try {
        resolve(hash.digest('hex'));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/*
 * ============================================================
 * BUFFER ENCRYPTION
 * ============================================================
 */

/**
 * Encrypt a Buffer using AES-256-GCM.
 *
 * Returns:
 *   encrypted
 *   iv
 *   authTag
 *
 * All binary crypto metadata is returned as hex strings.
 */
function encryptBuffer(data) {
  const key = getAesKey();

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv,
    {
      authTagLength: AUTH_TAG_LENGTH,
    }
  );

  const encrypted = Buffer.concat([
    cipher.update(
      Buffer.isBuffer(data)
        ? data
        : Buffer.from(String(data), 'utf8')
    ),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt a Buffer using AES-256-GCM.
 */
function decryptBuffer(
  encrypted,
  ivHex,
  authTagHex
) {
  const key = getAesKey();

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(
    authTagHex,
    'hex'
  );

  validateIvAndAuthTag(iv, authTag);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    iv,
    {
      authTagLength: AUTH_TAG_LENGTH,
    }
  );

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
}

/*
 * ============================================================
 * STREAMING FILE ENCRYPTION
 * ============================================================
 */

/**
 * Encrypt a file directly to disk using AES-256-GCM.
 *
 * This function:
 *
 *   - streams the source file
 *   - never loads the whole document into memory
 *   - generates a fresh IV for every file
 *   - writes encrypted output to destination
 *   - returns IV + authentication tag
 */
function encryptFileToDisk(sourcePath, destinationPath) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let outputCreated = false;

    const key = getAesKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
      ALGORITHM,
      key,
      iv,
      {
        authTagLength: AUTH_TAG_LENGTH,
      }
    );

    const input = fs.createReadStream(sourcePath);

    const output = fs.createWriteStream(
      destinationPath,
      {
        flags: 'wx',
      }
    );

    output.once('open', () => {
      outputCreated = true;
    });

    const fail = async (err) => {
      if (settled) return;

      settled = true;

      input.destroy();
      cipher.destroy();
      output.destroy();

      // Only remove the file if THIS operation created it.
      if (outputCreated) {
        await fsp
          .unlink(destinationPath)
          .catch(() => {});
      }

      reject(err);
    };

    input.on('error', fail);
    cipher.on('error', fail);
    output.on('error', fail);

    output.on('finish', () => {
      if (settled) return;

      try {
        const authTag = cipher.getAuthTag();

        if (authTag.length !== AUTH_TAG_LENGTH) {
          throw new Error(
            'Unexpected AES-GCM authentication tag length.'
          );
        }

        settled = true;

        resolve({
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex'),
        });
      } catch (err) {
        fail(err);
      }
    });

    input
      .pipe(cipher)
      .pipe(output);
  });
}

/*
 * ============================================================
 * STREAMING FILE DECRYPTION
 * ============================================================
 */

/**
 * Create an AES-256-GCM decrypt stream.
 *
 * Authentication metadata must be supplied by the caller:
 *
 *   {
 *     iv: "...",
 *     authTag: "..."
 *   }
 *
 * The final GCM authentication check occurs when the stream
 * reaches the end and decipher.final() executes.
 */
function createDecryptStream({
  iv,
  authTag,
}) {
  if (!iv || !authTag) {
    throw new Error(
      'IV and authentication tag are required for decryption.'
    );
  }

  const key = getAesKey();

  const ivBuffer = Buffer.from(
    iv,
    'hex'
  );

  const authTagBuffer = Buffer.from(
    authTag,
    'hex'
  );

  validateIvAndAuthTag(
    ivBuffer,
    authTagBuffer
  );

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    ivBuffer,
    {
      authTagLength: AUTH_TAG_LENGTH,
    }
  );

  decipher.setAuthTag(authTagBuffer);

  return decipher;
}

/*
 * ============================================================
 * VALIDATION
 * ============================================================
 */

function validateIvAndAuthTag(
  iv,
  authTag
) {
  if (
    !Buffer.isBuffer(iv) ||
    iv.length !== IV_LENGTH
  ) {
    throw new Error(
      `Invalid AES-GCM IV. Expected ${IV_LENGTH} bytes.`
    );
  }

  if (
    !Buffer.isBuffer(authTag) ||
    authTag.length !== AUTH_TAG_LENGTH
  ) {
    throw new Error(
      `Invalid AES-GCM authentication tag. Expected ${AUTH_TAG_LENGTH} bytes.`
    );
  }
}

/*
 * ============================================================
 * UTILITY
 * ============================================================
 */

/**
 * Securely check whether a path exists and is a regular file.
 */
async function fileExists(filePath) {
  try {
    const stats =
      await fsp.stat(filePath);

    return stats.isFile();
  } catch {
    return false;
  }
}

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  sha256,
  sha256File,

  encryptBuffer,
  decryptBuffer,

  encryptFileToDisk,
  createDecryptStream,

  getAesKey,
  fileExists,

  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
};