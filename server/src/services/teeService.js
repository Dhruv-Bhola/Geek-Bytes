/**
 * ============================================================================
 * SECURE DMS - TRUSTED EXECUTION ENVIRONMENT SERVICE
 * ============================================================================
 *
 * Purpose:
 *   Provides a single security boundary for security-critical operations.
 *
 * Current provider:
 *   SOFTWARE_TEE
 *
 * Production upgrade path:
 *   OP-TEE / ARM TrustZone
 *   Intel SGX
 *   AMD SEV
 *
 * IMPORTANT:
 *   The current implementation is NOT hardware-backed TEE.
 *   It is a TEE abstraction using the Node.js process boundary and
 *   cryptographic primitives. This keeps the application architecture
 *   TEE-ready without making a false hardware-security claim.
 *
 * Responsibilities:
 *   - Security operation boundary
 *   - SHA-256 integrity operations
 *   - Context validation
 *   - Protected operation execution
 *   - TEE status reporting
 * ============================================================================
 */

"use strict";

const crypto = require("crypto");

/**
 * TEE provider mode.
 *
 * Default is software because local development machines normally
 * do not expose a hardware TEE.
 */
const TEE_MODE = String(
  process.env.TEE_MODE || "software"
).toLowerCase();

/**
 * Supported provider names.
 */
const PROVIDERS = {
  SOFTWARE: "software",
  OPTEE: "optee",
  SGX: "sgx",
};

/**
 * Return whether the current provider is hardware backed.
 *
 * Only explicitly configured hardware providers are considered
 * hardware-backed.
 */
function isHardwareBacked() {
  return (
    TEE_MODE === PROVIDERS.OPTEE ||
    TEE_MODE === PROVIDERS.SGX
  );
}

/**
 * Return the current TEE status.
 */
function getStatus() {
  return {
    enabled: true,

    mode: isHardwareBacked()
      ? "hardware"
      : "software",

    provider:
      TEE_MODE === PROVIDERS.OPTEE
        ? "OP-TEE"
        : TEE_MODE === PROVIDERS.SGX
          ? "Intel SGX"
          : "Software TEE",

    hardwareBacked:
      isHardwareBacked(),

    keyIsolation:
      isHardwareBacked(),

    cryptoIsolation:
      isHardwareBacked(),

    available:
      true,

    description: isHardwareBacked()
      ? "Hardware-backed trusted execution provider configured."
      : "TEE security boundary is active through the software provider. Hardware-backed isolation is not enabled on this host.",
  };
}

/**
 * Validate the security context before executing a protected operation.
 *
 * This does NOT replace backend RBAC.
 * Backend authorization remains the source of truth.
 */
function validateContext(context = {}) {
  const {
    userId,
    role,
    caseId,
    documentId,
    action,
  } = context;

  if (!userId) {
    throw new Error(
      "TEE validation failed: user context is missing."
    );
  }

  if (!role) {
    throw new Error(
      "TEE validation failed: user role is missing."
    );
  }

  if (!action) {
    throw new Error(
      "TEE validation failed: security action is missing."
    );
  }

  return {
    valid: true,
    userId: String(userId),
    role: String(role),
    caseId:
      caseId !== undefined &&
      caseId !== null
        ? String(caseId)
        : null,
    documentId:
      documentId !== undefined &&
      documentId !== null
        ? String(documentId)
        : null,
    action: String(action),
  };
}

/**
 * Execute a security-critical operation inside the TEE abstraction.
 *
 * The callback is deliberately kept small.
 * Large documents must NOT be loaded into a TEE abstraction.
 */
async function execute(
  context,
  operationName,
  operation
) {
  if (
    typeof operation !== "function"
  ) {
    throw new TypeError(
      "TEE operation must be a function."
    );
  }

  const validatedContext =
    validateContext(context);

  const startedAt = Date.now();

  try {
    const result =
      await operation();

    return {
      success: true,
      operation:
        String(operationName || "security_operation"),
      context: validatedContext,
      result,
      durationMs:
        Date.now() - startedAt,
      provider:
        getStatus().provider,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const teeError =
      new Error(
        `TEE operation failed: ${message}`
      );

    teeError.cause = error;

    throw teeError;
  }
}

/**
 * Calculate SHA-256 for a Buffer.
 *
 * Used for small cryptographic values.
 * Large files should continue using the existing streamed
 * crypto service.
 */
function sha256Buffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError(
      "TEE sha256Buffer expects a Buffer."
    );
  }

  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

/**
 * Calculate SHA-256 for a string.
 */
function sha256String(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

/**
 * Constant-time comparison for hexadecimal hashes.
 */
function compareHashes(
  expectedHash,
  currentHash
) {
  const expected =
    String(expectedHash || "")
      .trim()
      .toLowerCase();

  const current =
    String(currentHash || "")
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    !/^[a-f0-9]{64}$/.test(current)
  ) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(expected, "hex");

  const currentBuffer =
    Buffer.from(current, "hex");

  if (
    expectedBuffer.length !==
    currentBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    currentBuffer
  );
}

/**
 * Generate a cryptographically secure nonce.
 *
 * This is useful for operation correlation and secure
 * request identifiers.
 */
function generateOperationNonce() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

/**
 * Return a safe public representation of the TEE.
 *
 * Never expose cryptographic keys or secrets.
 */
function getPublicStatus() {
  const status = getStatus();

  return {
    enabled: status.enabled,
    mode: status.mode,
    provider: status.provider,
    hardwareBacked:
      status.hardwareBacked,
    available:
      status.available,
    description:
      status.description,
  };
}

module.exports = {
  PROVIDERS,

  getStatus,

  getPublicStatus,

  validateContext,

  execute,

  sha256Buffer,

  sha256String,

  compareHashes,

  generateOperationNonce,

  isHardwareBacked,
};