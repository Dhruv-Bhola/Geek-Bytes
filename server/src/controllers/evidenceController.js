const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const crypto = require('crypto');

const { prisma } = require('../config/database');
const cryptoService = require('../services/cryptoService');
const blockchain = require('../services/blockchainService');
const { HTTP_STATUS, HttpError, sendSuccess, handleAsync } = require('../utils/responseHelper');

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const DATA_ROOT = path.join(__dirname, '..', '..', 'data');
const STAGING_ROOT = path.join(DATA_ROOT, 'staging');      // raw incoming chunks
const ENCRYPTED_ROOT = path.join(DATA_ROOT, 'encrypted');  // AES-256 encrypted at rest

function ensureDirs() {
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  fs.mkdirSync(ENCRYPTED_ROOT, { recursive: true });
}

// evidence metadata fields parsed from the evidence.metadata JSONB
function readMetaString(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

function generateEvidenceId() {
  return `E-${String(Math.floor(1 + Math.random() * 9000)).padStart(3, '0')}`;
}

// Resolve an incoming business/display ID (e.g. CC-10482, CYB-1042) to the
// actual database primary-key UUID required by the Prisma relation fields.
// If the value is not a known business ID format, it is returned unchanged so
// callers can pass a plain UUID directly.
async function resolveBusinessId(prisma, model, value) {
  if (!value) return value;
  if (typeof value !== 'string') return value;
  if (model === 'complaint' && /^CC-\d+$/i.test(value)) {
    const row = await prisma.complaint.findUnique({
      where: { complaintId: value.toUpperCase() },
      select: { id: true },
    });
    if (row) return row.id;
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, `Unknown complaint reference: ${value}`);
  }
  if (model === 'case' && /^CYB-\d+$/i.test(value)) {
    const row = await prisma.case.findUnique({
      where: { caseId: value.toUpperCase() },
      select: { id: true },
    });
    if (row) return row.id;
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, `Unknown case reference: ${value}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Shared pipeline: SHA-256 + AES-256 encrypt a source file to encrypted store.
// Source is streamed so arbitrarily large (video/CCTV) files are supported.
// ---------------------------------------------------------------------------
async function ingestEncrypted(sourcePath, evidenceId) {
  // 1. Deterministic SHA-256 digest (streamed, pre-encryption)
  const sha256Hash = await cryptoService.sha256File(sourcePath);

  // 2. Encrypt to store (AES-256-GCM, streamed)
  const destPath = path.join(ENCRYPTED_ROOT, `${evidenceId}.bin`);
  const { iv, authTag } = await cryptoService.encryptFileToDisk(sourcePath, destPath);

  // 3. Clean the raw temp source
  await fsp.unlink(sourcePath).catch(() => {});

  return { sha256Hash, iv, authTag, storagePath: destPath };
}

async function handleSingleUpload(req, res, sourceType) {
  if (!req.file) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'No file uploaded');
  }

  const { complaintId, caseId, evidenceType, integrityStatus } = req.body;
  if (!complaintId) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'complaintId is required');
  }

  // Map business IDs (CC-XXXX / CYB-XXXX) to their DB primary-key UUIDs so the
  // Prisma FK columns reference real complaint/case rows instead of the display IDs.
  const resolvedComplaintId = await resolveBusinessId(prisma, 'complaint', complaintId);
  const resolvedCaseId = caseId
    ? await resolveBusinessId(prisma, 'case', caseId)
    : null;

  const metadata = readMetaString(req.body.metadata) || {};
  const evidenceId = generateEvidenceId();
  const sourcePath = req.file.path;

  // Possibly the police/victim upload flow wants a rawFile/evidence type default
  const resolvedType = evidenceType || detectTypeByMime(req.file.mimetype);

  const { sha256Hash, iv, authTag, storagePath } = await ingestEncrypted(
    sourcePath,
    evidenceId
  );

  // Persist DB record
  const evidence = await prisma.evidence.create({
    data: {
      evidenceId,
      caseId: resolvedCaseId || null,
      complaintId: resolvedComplaintId,
      uploadedById: req.user.id,
      sourceType,
      evidenceType: resolvedType,
      fileUrl: storagePath.replace(/\\/g, '/'),
      sha256Hash,
      blockchainTxHash: null,
      integrityStatus: integrityStatus || 'pending',
      metadata: {
        ...metadata,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        encryption: 'AES-256-GCM',
        aesIv: iv,
        aesAuthTag: authTag,
      },
    },
  });

  // Chain-of-custody entry
  await prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'uploaded',
      recordedSha256Hash: sha256Hash,
      remarks: `Evidence uploaded by ${req.user.customUserId}`,
    },
  });

  // Anchor on-chain (record UPLOADED). Best-effort; never fails the upload.
  let anchor = null;
  try {
    anchor = await blockchain.recordEvent(evidenceId, sha256Hash, blockchain.ACTIONS.UPLOADED);
    await prisma.evidence.update({
      where: { id: evidence.id },
      data: {
        blockchainTxHash: anchor.txHash,
        blockchainBlock: anchor.blockNumber,
        blockchainStatus: 'ANCHORED',
      },
    });
    evidence.blockchainTxHash = anchor.txHash;
    evidence.blockchainBlock = anchor.blockNumber;
    evidence.blockchainStatus = 'ANCHORED';
  } catch (err) {
    console.warn(`[evidence] chain anchor skipped for ${evidenceId}: ${err.message}`);
  }

  return sendSuccess(
    res,
    {
      evidence: {
        evidenceId,
        complaintId,
        sha256Hash,
        integrityStatus: evidence.integrityStatus,
        blockchainTxHash: evidence.blockchainTxHash,
        blockchainBlock: evidence.blockchainBlock || null,
        blockchainStatus: evidence.blockchainStatus || null,
        contractAddress: blockchain.getContractAddress(),
      },
      anchored: Boolean(anchor),
      onChainStatus: anchor ? 'ANCHORED' : 'PENDING',
      txHash: anchor ? anchor.txHash : null,
      txBlock: anchor ? anchor.blockNumber : null,
      contractAddress: blockchain.getContractAddress(),
      txTimestamp: anchor ? anchor.blockTimestamp : null,
    },
    HTTP_STATUS.CREATED
  );
}

/**
 * Upload victim evidence (screenshots, PDFs, images, chat exports, audio).
 * SourceType = victim. Single file via Multer, mounted under /evidence/victim.
 */
exports.uploadVictimEvidence = handleAsync((req, res) =>
  handleSingleUpload(req, res, 'victim')
);

/**
 * Upload police/forensic evidence (heavy CCTV/video up to 5GB).
 * Mounted under /evidence/police. Multer streams to disk, our pipeline
 * hashes + encrypts via streams (memory-safe for huge files).
 */
exports.uploadPoliceEvidence = handleAsync((req, res) =>
  handleSingleUpload(req, res, 'police')
);

/**
 * Social media preservation: capture platform metadata, post URLs, UTC
 * timestamps, and an optional frozen snapshot (single image). SourceType police
 * (preservation is an official action) but evidenceType defaults to screenshot.
 */
exports.preserveSocialEvidence = handleAsync(async (req, res) => {
  const {
    complaintId,
    caseId,
    platform,
    sourceUrl,
    capturedAt,        // optional ISO string; defaults to now (UTC)
    caption,
    author,
    engagement,
    evidenceType = 'screenshot',
  } = req.body;

  if (!complaintId) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'complaintId is required');
  }
  if (!platform) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'platform is required');
  }

  const evidenceId = generateEvidenceId();

  // A snapshot file is optional; if present, encrypt it as the physical artifact.
  let snapshot = null;
  if (req.file && req.file.path) {
    snapshot = await ingestEncrypted(req.file.path, evidenceId);
  }

  const metadata = {
    social: {
      platform,
      sourceUrl,
      capturedAt: capturedAt || new Date().toISOString(),
      caption: caption || null,
      author: author || null,
      engagement: engagement || null,
    },
    ...(snapshot ? { aesIv: snapshot.iv, aesAuthTag: snapshot.authTag, fileSize: req.file.size } : {}),
  };

  const evidence = await prisma.evidence.create({
    data: {
      evidenceId,
      caseId: caseId || null,
      complaintId,
      uploadedById: req.user.id,
      sourceType: 'police',
      evidenceType,
      fileUrl: snapshot ? snapshot.storagePath.replace(/\\/g, '/') : `social://${platform}`,
      sha256Hash: snapshot ? snapshot.sha256Hash : cryptoService.sha256(
        `${platform}:${sourceUrl}:${metadata.social.capturedAt}`
      ),
      integrityStatus: 'verified',
      metadata,
    },
  });

  await prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'verified',
      recordedSha256Hash: evidence.sha256Hash,
      remarks: `Social evidence frozen from ${platform}@${metadata.social.capturedAt}`,
    },
  });

  try {
    const anchor = await blockchain.recordEvent(
      evidence.evidenceId,
      evidence.sha256Hash,
      blockchain.ACTIONS.VERIFIED
    );
    await prisma.evidence.update({
      where: { id: evidence.id },
      data: { blockchainTxHash: anchor.txHash },
    });
    return sendSuccess(
      res,
      { evidence: { ...evidence, blockchainTxHash: anchor.txHash } },
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    console.warn(`[evidence] social chain anchor skipped: ${err.message}`);
    return sendSuccess(res, { evidence }, HTTP_STATUS.CREATED);
  }
});

// ---------------------------------------------------------------------------
// Verify: liveHash === storedHash === onChainHash
// ---------------------------------------------------------------------------
exports.verifyEvidence = handleAsync(async (req, res) => {
  const { evidenceId } = req.params;

  const evidence = await prisma.evidence.findUnique({ where: { evidenceId } });
  if (!evidence) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Evidence not found');
  }

  // 1. Recalculate live SHA-256 over the stored ciphertext? NO — we hash the
  //    ORIGINAL plaintext. We store only ciphertext, so re-hashing ciphertext
  //    yields a different digest. Therefore, to compare against the original
  //    hash we must decrypt then re-hash. We do this streamed for large files.
  const meta = evidence.metadata || {};
  let liveHash = null;
  let decryptFailed = false;
  if (evidence.sha256Hash && meta.aesIv && meta.aesAuthTag) {
    try {
      // Resolve the on-disk encrypted artifact. fileUrl for local uploads is a
      // full absolute path (e.g. C:/.../server/data/encrypted/E-XXX.bin), so use
      // it directly. For a bare filename, join onto ENCRYPTED_ROOT.
      const rawUrl = evidence.fileUrl || '';
      let storagePath;
      if (rawUrl.startsWith('/') || rawUrl.includes(':') || /^[A-Za-z]:[\\/]/.test(rawUrl)) {
        storagePath = rawUrl;
      } else {
        storagePath = path.join(ENCRYPTED_ROOT, rawUrl.replace(/^.*[/\\]/, ''));
      }
      // This path may not exist if stored in S3; guard file presence.
      if (fs.existsSync(storagePath)) {
        liveHash = await hashDecryptedStream(
          storagePath,
          meta.aesIv,
          meta.aesAuthTag
        );
      } else {
        liveHash = null;
      }
    } catch (err) {
      decryptFailed = true;
    }
  }

  // 2. On-chain verification (compare current hash against latest record)
  let onchain = { available: false, valid: null, historyCount: 0 };
  try {
    const result = await blockchain.verifyHash(evidenceId, liveHash || evidence.sha256Hash);
    onchain = {
      available: true,
      contractAddress: blockchain.getContractAddress(),
      ...result,
    };
  } catch (err) {
    onchain = { available: false, error: err.message };
  }

  // local compare: liveHash === stored sha256Hash
  const localMatch = liveHash ? liveHash === evidence.sha256Hash : (liveHash === null ? null : false);
  const onchainMatch = onchain.valid;
  // Require on-chain confirmation only when the chain is actually reachable.
  // If the blockchain/relayer is unavailable, fall back to the authoritative
  // local hash comparison so genuine evidence is not falsely flagged.
  const allMatch =
    localMatch === true &&
    (onchain.available === false || onchainMatch === true);

  if (allMatch) {
    // integrity confirmed
    await prisma.evidence.update({
      where: { id: evidence.id },
      data: { integrityStatus: 'verified' },
    });
    await prisma.custodyLog.create({
      data: {
        evidenceId: evidence.id,
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'verified',
        recordedSha256Hash: evidence.sha256Hash,
        remarks: 'Integrity verification passed (local + on-chain)',
      },
    });
    return sendSuccess(res, {
      status: 'VERIFIED',
      evidenceId,
      sha256Hash: evidence.sha256Hash,
      liveHash,
      onchain,
    });
  }

  // Mismatch -> mark tampered + log INTEGRITY_ALERT + custody
  let mismatchReason = 'unknown';
  if (localMatch === false) mismatchReason = 'LOCAL_HASH_MISMATCH';
  else if (onchainMatch === false) mismatchReason = 'ONCHAIN_HASH_MISMATCH';
  else if (decryptFailed) mismatchReason = 'DECRYPTION_FAILED';
  else if (liveHash === null) mismatchReason = 'PHYSICAL_FILE_UNAVAILABLE';

  await prisma.evidence.update({
    where: { id: evidence.id },
    data: { integrityStatus: 'tampered' },
  });
  await prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'verified',
      recordedSha256Hash: evidence.sha256Hash,
      remarks: `INTEGRITY_ALERT: ${mismatchReason}`,
    },
  });

  // Business result (409) — the frontend inspects `status: 'TAMPERED'`,
  // so we keep this shape intact while still carrying the standard envelope.
  return res.status(HTTP_STATUS.CONFLICT).json({
    success: false,
    data: null,
    status: 'TAMPERED',
    alert: 'INTEGRITY_ALERT',
    reason: mismatchReason,
    evidenceId,
    storedHash: evidence.sha256Hash,
    liveHash,
    onchain,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Stream-decrypt a stored ciphertext file, hashing the recovered plaintext.
 */
function hashDecryptedStream(filePath, ivHex, authTagHex) {
  return new Promise((resolve, reject) => {
    const decrypt = cryptoService.createDecryptStream({ iv: ivHex, authTag: authTagHex });
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .pipe(decrypt)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/**
 * Stream a decrypted file to the client, restricted to authorized roles
 * (enforced at the route layer).
 */
exports.downloadEvidence = handleAsync(async (req, res) => {
  const { evidenceId } = req.params;
  const evidence = await prisma.evidence.findUnique({ where: { evidenceId } });
  if (!evidence) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Evidence not found');
  }

  const meta = evidence.metadata || {};
  if (!meta.aesIv || !meta.aesAuthTag) {
    throw new HttpError(HTTP_STATUS.BAD_REQUEST, 'Evidence is not encrypted or metadata missing');
  }

  const storagePath = localStoragePath(evidence);
  if (!fs.existsSync(storagePath)) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Physical file unavailable');
  }

  const decrypt = cryptoService.createDecryptStream({
    iv: meta.aesIv,
    authTag: meta.aesAuthTag,
  });

  // record ACCESSED custody event (best-effort, non-blocking)
  prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'accessed',
      recordedSha256Hash: evidence.sha256Hash,
      remarks: `File accessed by ${req.user.customUserId}`,
    },
  }).catch(() => {});

  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${meta.originalName || evidence.evidenceId}"`
  );

  fs.createReadStream(storagePath).pipe(decrypt).pipe(res);
});

// ---------------------------------------------------------------------------
// Custody tracking
// ---------------------------------------------------------------------------
exports.logCustody = handleAsync(async (req, res) => {
  const { evidenceId, action, remarks } = req.body;
  const evidence = await prisma.evidence.findUnique({
    where: { evidenceId },
    select: { id: true, sha256Hash: true },
  });
  if (!evidence) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Evidence not found');
  }

  const DB_ACTIONS = ['uploaded', 'verified', 'accessed', 'transferred',
    'received', 'analysis_completed', 'report_generated'];
  if (!DB_ACTIONS.includes(action)) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      `action must be one of ${DB_ACTIONS.join(', ')}`
    );
  }
  const ONCHAIN_MAP = {
    uploaded: blockchain.ACTIONS.UPLOADED,
    verified: blockchain.ACTIONS.VERIFIED,
    accessed: blockchain.ACTIONS.ACCESSED,
    transferred: blockchain.ACTIONS.TRANSFERRED,
  };

  const entry = await prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action,
      recordedSha256Hash: evidence.sha256Hash,
      remarks,
    },
    include: {
      actor: {
        select: { id: true, customUserId: true, fullName: true, role: true },
      },
    },
  });

  // Optionally anchor the custody action on-chain.
  try {
    const anchor = await blockchain.recordEvent(
      evidenceId,
      evidence.sha256Hash,
      ONCHAIN_MAP[action] || action
    );
    return sendSuccess(res, { entry, txHash: anchor.txHash }, HTTP_STATUS.CREATED);
  } catch (err) {
    console.warn(`[custody] chain anchor skipped: ${err.message}`);
    return sendSuccess(res, { entry, onchain: false }, HTTP_STATUS.CREATED);
  }
});

exports.getCustodyTimeline = handleAsync(async (req, res) => {
  const { evidenceId } = req.params;
  const evidence = await prisma.evidence.findUnique({
    where: { evidenceId },
    select: { id: true },
  });
  if (!evidence) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Evidence not found');
  }

  const timeline = await prisma.custodyLog.findMany({
    where: { evidenceId: evidence.id },
    orderBy: { timestamp: 'asc' },
    include: {
      actor: {
        select: { id: true, customUserId: true, fullName: true, role: true },
      },
    },
  });

  return sendSuccess(res, { evidenceId, timeline });
});

// ---------------------------------------------------------------------------
// List evidence for a case (evidence vault).
// Accepts either the internal UUID or the public `CYB-XXXX` case id.
// ---------------------------------------------------------------------------
exports.getCaseEvidence = handleAsync(async (req, res) => {
  const { caseId } = req.params;

  const caseRecord = await prisma.case.findFirst({
    where: {
      OR: [{ id: caseId }, { caseId }],
    },
    select: { id: true, caseId: true },
  });
  if (!caseRecord) {
    throw new HttpError(HTTP_STATUS.NOT_FOUND, 'Case not found');
  }

  const evidences = await prisma.evidence.findMany({
    where: { caseId: caseRecord.id },
    select: {
      evidenceId: true,
      evidenceType: true,
      sourceType: true,
      sha256Hash: true,
      integrityStatus: true,
      blockchainTxHash: true,
      blockchainBlock: true,
      blockchainStatus: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return sendSuccess(res, { case: caseRecord.caseId, evidences });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function detectTypeByMime(mime) {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'screenshot';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  return 'other';
}

function localStoragePath(evidence) {
  // fileUrl stored as relative path under ENCRYPTED_ROOT
  const base = evidence.fileUrl.startsWith('/') || evidence.fileUrl.includes(':\\')
    ? evidence.fileUrl
    : path.join(ENCRYPTED_ROOT, path.basename(evidence.fileUrl));
  return base;
}

ensureDirs();
