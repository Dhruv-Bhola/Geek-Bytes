const crypto = require('crypto');
const fs = require('fs');
const { Transform } = require('stream');

const SHA256_ALGO = 'sha256';
const CIPHER_ALGO = 'aes-256-gcm'; // authenticated encryption
const IV_LENGTH = 16; // bytes
const AUTH_TAG_LENGTH = 16; // bytes

/**
 * Derive a 32-byte AES-256 key from the configured hex key or a default.
 * The key is 64 hex chars = 32 bytes.
 */
function getAesKey(key = process.env.AES_256_KEY) {
  const hex = String(key || '');
  if (hex.length === 64 && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  // Fallback: SHA-256 the provided string to a stable 32-byte key.
  return crypto.createHash('sha256').update(hex || 'dms-dev-key').digest();
}

// ==========================================================================
// DETERMINISTIC SHA-256
// ==========================================================================

/**
 * SHA-256 of a Buffer (string input supported).
 * Returns the 64-character lowercase hex digest.
 */
function sha256(data) {
  const input = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  return crypto.createHash(SHA256_ALGO).update(input).digest('hex');
}

/**
 * Streaming SHA-256 of a file on disk. Handles arbitrarily large files
 * without loading them fully into memory.
 */
async function sha256File(filePath) {
  const hash = crypto.createHash(SHA256_ALGO);
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

/**
 * Compute the SHA-256 of a stream of Buffers.
 */
function sha256FromStream(inputStream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(SHA256_ALGO);
    inputStream.on('data', (chunk) => hash.update(chunk));
    inputStream.on('end', () => resolve(hash.digest('hex')));
    inputStream.on('error', reject);
  });
}

// ==========================================================================
// AES-256-GCM ENCRYPTION (authenticated)
// ==========================================================================

/**
 * Encrypt a Buffer with AES-256-GCM. Returns ciphertext, IV, and auth tag.
 * Stores the IV/tag as hex so they can be persisted alongside the record.
 */
function encryptBuffer(plaintext, key = process.env.AES_256_KEY) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, getAesKey(key), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt a Buffer encrypted with encryptBuffer. Throws on tamper
 * (GCM authenticates the ciphertext and will reject modifications).
 */
function decryptBuffer({ ciphertext, iv, authTag }, key = process.env.AES_256_KEY) {
  const decipher = crypto.createDecipheriv(
    CIPHER_ALGO,
    getAesKey(key),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a file on disk in-place to a new encrypted target file and return
 * the { iv, authTag } used, writing the ciphertext to `destPath`.
 */
async function encryptFileToDisk(sourcePath, destPath, key = process.env.AES_256_KEY) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, getAesKey(key), iv);

  const outStream = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    fs.createReadStream(sourcePath)
      .pipe(cipher)
      .pipe(outStream)
      .on('finish', resolve)
      .on('error', reject);
  });
  outStream.close();

  return {
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Return a readable Transform stream that decrypts ciphertext input
 * using the supplied IV and auth tag. Use with pipes to serve files.
 */
function createDecryptStream({ iv, authTag }, key = process.env.AES_256_KEY) {
  const decipher = crypto.createDecipheriv(
    CIPHER_ALGO,
    getAesKey(key),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return decipher; // decipher is a Transform stream
}

module.exports = {
  SHA256_ALGO,
  CIPHER_ALGO,
  sha256,
  sha256File,
  sha256FromStream,
  encryptBuffer,
  decryptBuffer,
  encryptFileToDisk,
  createDecryptStream,
  getAesKey,
};
