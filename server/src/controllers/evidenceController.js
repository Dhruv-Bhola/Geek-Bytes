const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const teeService = require("../services/teeService");
const { prisma } = require('../config/database');
const cryptoService = require('../services/cryptoService');
const blockchain = require('../services/blockchainService');

const {
  HTTP_STATUS,
  HttpError,
  sendSuccess,
  handleAsync,
} = require('../utils/responseHelper');

const DATA_ROOT = path.join(__dirname, '..', '..', 'data');
const STAGING_ROOT = path.join(DATA_ROOT, 'staging');
const ENCRYPTED_ROOT = path.join(DATA_ROOT, 'encrypted');

const DEFAULT_SENSITIVITY = 'confidential';

const ONCHAIN_ACTIONS = {
  uploaded: blockchain.ACTIONS.UPLOADED,
  verified: blockchain.ACTIONS.VERIFIED,
  accessed: blockchain.ACTIONS.ACCESSED,
  transferred: blockchain.ACTIONS.TRANSFERRED,
};

const DOCUMENT_ACTIONS = [
  'view',
  'download',
  'upload',
  'update',
  'transfer',
  'verify',
];

const CUSTODY_ACTIONS = [
  'uploaded',
  'verified',
  'accessed',
  'received',
  'transferred',
  'analysis_completed',
  'report_generated',
];

function ensureDirs() {
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  fs.mkdirSync(ENCRYPTED_ROOT, { recursive: true });
}

function generateDocumentId() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DOC-${Date.now()}-${suffix}`;
}

function generateEvidenceId() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `E-${Date.now()}-${suffix}`;
}

function detectDocumentType(mimeType) {
  if (!mimeType) return 'other';

  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('word')) return 'word_document';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return 'spreadsheet';
  }

  return 'other';
}

function parseJson(value, fallback = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSensitivity(value) {
  const allowed = [
    'normal',
    'confidential',
    'highly_confidential',
    'restricted',
  ];

  return allowed.includes(value) ? value : DEFAULT_SENSITIVITY;
}

async function resolveCaseId(value) {
  if (!value) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'caseId is required'
    );
  }

  const caseRecord = await prisma.case.findFirst({
    where: {
      OR: [
        { id: value },
        { caseId: value },
      ],
    },
    select: {
      id: true,
      caseId: true,
    },
  });

  if (!caseRecord) {
    throw new HttpError(
      HTTP_STATUS.NOT_FOUND,
      'Case not found'
    );
  }

  return caseRecord;
}

async function assertCaseAssignment(caseId, userId, role) {
  if (role === 'admin') {
    return null;
  }

  const assignment = await prisma.caseAssignment.findFirst({
    where: {
      caseId,
      userId,
      status: 'active',
    },
  });

  if (!assignment) {
    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'You are not assigned to this case'
    );
  }

  return assignment;
}

async function getDocumentByIdentifier(identifier) {
  if (!identifier) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'Document ID is required'
    );
  }

  const document = await prisma.document.findFirst({
    where: {
      OR: [
        { id: identifier },
        { documentId: identifier },
      ],
    },
    include: {
      case: {
        select: {
          id: true,
          caseId: true,
          caseTitle: true,
        },
      },
      versions: {
        orderBy: {
          versionNumber: 'desc',
        },
      },
      createdBy: {
        select: {
          id: true,
          customUserId: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  if (!document) {
    throw new HttpError(
      HTTP_STATUS.NOT_FOUND,
      'Document not found'
    );
  }

  return document;
}

async function assertDocumentAccess(document, user, action) {
  if (user.role === 'admin') {
    return {
      assignment: null,
      permission: null,
    };
  }

  const assignment = await prisma.caseAssignment.findFirst({
    where: {
      caseId: document.caseId,
      userId: user.id,
      status: 'active',
    },
  });

  if (!assignment) {
    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'Document access denied'
    );
  }

  const permission = await prisma.documentPermission.findFirst({
    where: {
      documentId: document.id,
      userId: user.id,
      action,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (!permission) {
    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      `Document permission denied for action '${action}'`
    );
  }

  return {
    assignment,
    permission,
  };
}async function createAuditEvent({
  userId = null,
  caseId = null,
  documentId = null,
  versionId = null,
  action,
  sha256Hash = null,
  blockchainTxHash = null,
  blockchainBlock = null,
  metadata = null,
}) {
  return prisma.auditEvent.create({
    data: {
      userId,
      caseId,
      documentId,
      versionId,
      action,
      sha256Hash,
      blockchainTxHash,
      blockchainBlock:
        blockchainBlock !== null &&
        blockchainBlock !== undefined
          ? Number(blockchainBlock)
          : null,
      metadata,
    },
  });
}
async function createSecurityAlert({
  type,
  severity,
  message,
  documentId = null,
  caseId = null,
  userId = null,
  metadata = null,
}) {
  return prisma.securityAlert.create({
    data: {
      type,
      severity,
      message,
      documentId,
      caseId,
      userId,
      metadata,
    },
  });
}

async function ingestEncrypted(sourcePath, documentId) {
  const sha256Hash = await cryptoService.sha256File(sourcePath);

  const safeFileName = `${documentId}-${crypto.randomBytes(8).toString('hex')}.bin`;
  const destinationPath = path.join(
    ENCRYPTED_ROOT,
    safeFileName
  );

  const { iv, authTag } =
    await cryptoService.encryptFileToDisk(
      sourcePath,
      destinationPath
    );

  await fsp.unlink(sourcePath).catch(() => {});

  return {
    sha256Hash,
    iv,
    authTag,
    storagePath: destinationPath,
  };
}

function getLocalStoragePath(version) {
  if (!version || !version.storagePath) {
    return null;
  }

  const storedPath = version.storagePath;

  /*
   * Only permit files inside our encrypted storage directory.
   * This prevents a database path value from being used for
   * arbitrary filesystem access.
   */
  const resolved = path.resolve(
    storedPath.startsWith(path.sep) || /^[A-Za-z]:[\\/]/.test(storedPath)
      ? storedPath
      : path.join(ENCRYPTED_ROOT, path.basename(storedPath))
  );

  const encryptedRoot = path.resolve(ENCRYPTED_ROOT);

  if (
    resolved !== encryptedRoot &&
    !resolved.startsWith(`${encryptedRoot}${path.sep}`)
  ) {
    throw new HttpError(
      HTTP_STATUS.FORBIDDEN,
      'Invalid document storage path'
    );
  }

  return resolved;
}

async function createDefaultUploaderPermissions(
  documentId,
  userId
) {
  const actions = [
    'view',
    'download',
    'upload',
    'update',
    'verify',
  ];

  await prisma.$transaction(
    actions.map((action) =>
      prisma.documentPermission.upsert({
        where: {
          documentId_userId_action: {
            documentId,
            userId,
            action,
          },
        },
        update: {
          expiresAt: null,
        },
        create: {
          documentId,
          userId,
          action,
          grantedById: userId,
          expiresAt: null,
        },
      })
    )
  );
}

/**
 * Create the first document version and secure the uploaded artifact.
 */
async function createDocumentFromUpload(req) {
  if (!req.file) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'No file uploaded'
    );
  }

  const {
    caseId,
    title,
    documentType,
    sensitivity,
    description,
    metadata,
  } = req.body;

  const caseRecord = await resolveCaseId(caseId);

  await assertCaseAssignment(
    caseRecord.id,
    req.user.id,
    req.user.role
  );

  const finalDocumentType =
    documentType ||
    detectDocumentType(req.file.mimetype);

  const finalTitle =
    title ||
    req.file.originalname ||
    'Untitled Document';

  const finalSensitivity =
    normalizeSensitivity(sensitivity);

  const parsedMetadata =
    parseJson(metadata, {});

  const documentId = generateDocumentId();
  const sourcePath = req.file.path;

  let encryptedArtifact;

  try {
    encryptedArtifact = await ingestEncrypted(
      sourcePath,
      documentId
    );
  } catch (err) {
    await fsp.unlink(sourcePath).catch(() => {});
    throw err;
  }

  const document = await prisma.document.create({
    data: {
      documentId,
      caseId: caseRecord.id,
      title: finalTitle,
      documentType: finalDocumentType,
      sensitivity: finalSensitivity,
      description: description || null,
      currentVersion: 1,
      integrityStatus: 'pending',
      createdById: req.user.id,
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: BigInt(req.file.size),
      storagePath: encryptedArtifact.storagePath,
      sha256Hash: encryptedArtifact.sha256Hash,
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        iv: encryptedArtifact.iv,
        authTag: encryptedArtifact.authTag,
        metadata: parsedMetadata,
      },
      uploadedById: req.user.id,
    },
  });

  await createDefaultUploaderPermissions(
    document.id,
    req.user.id
  );

  await createAuditEvent({
    userId: req.user.id,
    caseId: document.caseId,
    documentId: document.id,
    versionId: version.id,
    action: 'document_uploaded',
    sha256Hash: version.sha256Hash,
    metadata: {
      documentId: document.documentId,
      versionNumber: version.versionNumber,
      originalFileName: version.originalFileName,
      mimeType: version.mimeType,
      fileSize: req.file.size,
    },
  });

  let blockchainAnchor = null;

  try {
    blockchainAnchor = await blockchain.recordEvent(
      document.documentId,
      version.sha256Hash,
      blockchain.ACTIONS.UPLOADED
    );

    await createAuditEvent({
      userId: req.user.id,
      caseId: document.caseId,
      documentId: document.id,
      versionId: version.id,
      action: 'document_uploaded',
      sha256Hash: version.sha256Hash,
      metadata: {
        blockchain: 'anchored',
        blockchainTxHash: blockchainAnchor.txHash,
        blockchainBlock: blockchainAnchor.blockNumber,
      },
    });
  } catch (err) {
    console.warn(
      `[document] blockchain upload anchor failed: ${err.message}`
    );

    await createSecurityAlert({
      type: 'blockchain_failure',
      severity: 'medium',
      message:
        'Blockchain anchor failed for document upload',
      documentId: document.id,
      caseId: document.caseId,
      userId: req.user.id,
      metadata: {
        documentId: document.documentId,
        versionId: version.id,
        error: err.message,
      },
    });
  }

  return {
    document,
    version,
    blockchainAnchor,
  };
}

/**
 * Upload a new secure document.
 *
 * Kept under the old controller name so the existing
 * routes can be migrated without breaking imports.
 */
exports.uploadPoliceEvidence = handleAsync(
  async (req, res) => {
    const result = await createDocumentFromUpload(req);

    return sendSuccess(
      res,
      {
        document: {
          documentId: result.document.documentId,
          id: result.document.id,
          title: result.document.title,
          documentType: result.document.documentType,
          sensitivity: result.document.sensitivity,
          caseId: result.document.caseId,
          integrityStatus:
            result.document.integrityStatus,
          currentVersion:
            result.document.currentVersion,
        },
        version: {
          id: result.version.id,
          versionNumber: result.version.versionNumber,
          originalFileName:
            result.version.originalFileName,
          mimeType: result.version.mimeType,
          fileSize: result.version.fileSize.toString(),
          sha256Hash: result.version.sha256Hash,
        },
        blockchain: result.blockchainAnchor
          ? {
              status: 'ANCHORED',
              txHash:
                result.blockchainAnchor.txHash,
              blockNumber:
                result.blockchainAnchor.blockNumber,
            }
          : {
              status: 'PENDING',
            },
      },
      HTTP_STATUS.CREATED
    );
  }
);

/**
 * Victim upload is retained for compatibility.
 *
 * Secure DMS itself does not give victims broad document access.
 * The route layer should eventually be migrated to the new
 * document policy.
 */
exports.uploadVictimEvidence = handleAsync(
  async (req, res) => {
    const result = await createDocumentFromUpload(req);

    return sendSuccess(
      res,
      {
        document: {
          documentId: result.document.documentId,
          id: result.document.id,
          title: result.document.title,
          documentType: result.document.documentType,
          sensitivity: result.document.sensitivity,
          caseId: result.document.caseId,
        },
        version: {
          id: result.version.id,
          versionNumber: result.version.versionNumber,
          sha256Hash: result.version.sha256Hash,
        },
      },
      HTTP_STATUS.CREATED
    );
  }
);

/**
 * Preserve a social-media artifact as a document.
 *
 * Metadata-only preservation is supported. If a snapshot file
 * is attached, it is encrypted exactly like a normal document.
 */
exports.preserveSocialEvidence = handleAsync(
  async (req, res) => {
    const {
      caseId,
      platform,
      sourceUrl,
      capturedAt,
      caption,
      author,
      engagement,
      title,
      sensitivity,
    } = req.body;

    if (!platform) {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        'platform is required'
      );
    }

    const caseRecord = await resolveCaseId(caseId);

    await assertCaseAssignment(
      caseRecord.id,
      req.user.id,
      req.user.role
    );

    const documentId = generateDocumentId();

    let snapshot = null;

    if (req.file && req.file.path) {
      snapshot = await ingestEncrypted(
        req.file.path,
        documentId
      );
    }

    const captureTime =
      capturedAt || new Date().toISOString();

    const socialMetadata = {
      platform,
      sourceUrl: sourceUrl || null,
      capturedAt: captureTime,
      caption: caption || null,
      author: author || null,
      engagement: engagement || null,
    };

    const fallbackHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify(socialMetadata)
      )
      .digest('hex');

    const document = await prisma.document.create({
      data: {
        documentId,
        caseId: caseRecord.id,
        title:
          title ||
          `Social Media Capture - ${platform}`,
        documentType: 'social_media',
        sensitivity:
          normalizeSensitivity(sensitivity),
        description:
          `Preserved social-media artifact from ${platform}`,
        currentVersion: 1,
        integrityStatus: 'pending',
        createdById: req.user.id,
      },
    });

    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        originalFileName:
          req.file?.originalname ||
          `${platform}-metadata.json`,
        mimeType:
          req.file?.mimetype ||
          'application/json',
        fileSize: BigInt(
          req.file?.size || Buffer.byteLength(
            JSON.stringify(socialMetadata)
          )
        ),
        storagePath:
          snapshot?.storagePath ||
          `social://${platform}`,
        sha256Hash:
          snapshot?.sha256Hash ||
          fallbackHash,
        encryptionMetadata: snapshot
          ? {
              algorithm: 'AES-256-GCM',
              iv: snapshot.iv,
              authTag: snapshot.authTag,
              social: socialMetadata,
            }
          : {
              social: socialMetadata,
            },
        uploadedById: req.user.id,
      },
    });

    await prisma.document.update({
      where: { id: document.id },
      data: {
        integrityStatus: 'verified',
      },
    });

    await createDefaultUploaderPermissions(
      document.id,
      req.user.id
    );

    await createAuditEvent({
      userId: req.user.id,
      caseId: document.caseId,
      documentId: document.id,
      versionId: version.id,
      action: 'document_uploaded',
      sha256Hash: version.sha256Hash,
      metadata: {
        type: 'social_media_preservation',
        social: socialMetadata,
      },
    });

    let blockchainAnchor = null;

    try {
      blockchainAnchor =
        await blockchain.recordEvent(
          document.documentId,
          version.sha256Hash,
          blockchain.ACTIONS.UPLOADED
        );
    } catch (err) {
      console.warn(
        `[document] social blockchain anchor failed: ${err.message}`
      );

      await createSecurityAlert({
        type: 'blockchain_failure',
        severity: 'medium',
        message:
          'Blockchain anchor failed for social-media document',
        documentId: document.id,
        caseId: document.caseId,
        userId: req.user.id,
        metadata: {
          error: err.message,
        },
      });
    }

    return sendSuccess(
      res,
      {
        document,
        version: {
          ...version,
          fileSize: version.fileSize.toString(),
        },
        blockchain: blockchainAnchor
          ? {
              status: 'ANCHORED',
              txHash: blockchainAnchor.txHash,
              blockNumber:
                blockchainAnchor.blockNumber,
            }
          : {
              status: 'PENDING',
            },
      },
      HTTP_STATUS.CREATED
    );
  }
);

/**
 * Verify the current document version.
 *
 * Verification:
 *
 *   stored plaintext hash
 *         ==
 *   live decrypted plaintext hash
 *         ==
 *   latest blockchain hash
 */
exports.verifyEvidence = handleAsync(
  async (req, res) => {
    const identifier =
      req.params.documentId ||
      req.params.evidenceId ||
      req.params.id;

    const document =
      await getDocumentByIdentifier(
        identifier
      );

    await assertDocumentAccess(
      document,
      req.user,
      'verify'
    );

    const version =
      document.versions[0];

    if (!version) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'Document version not found'
      );
    }

    const encryption =
      version.encryptionMetadata || {};

    const storagePath =
      getLocalStoragePath(
        version
      );

    let liveHash = null;
    let decryptFailed = false;
    let physicalFileUnavailable =
      false;

    /*
     * Recalculate SHA-256 from the decrypted
     * physical document.
     */
    if (
      encryption.iv &&
      encryption.authTag &&
      storagePath &&
      fs.existsSync(storagePath)
    ) {
      try {
  const teeResult = await teeService.execute(
    {
      userId: req.user.id,
      role: req.user.role,
      caseId: document.caseId,
      documentId: document.documentId,
      action: "verify",
    },
    "document_integrity_verification",
    async () => {
      return hashDecryptedStream(
        storagePath,
        encryption.iv,
        encryption.authTag
      );
    }
  );

  liveHash = teeResult.result;
} catch (err) {
  console.error(
    "[TEE] Document integrity verification failed:",
    err.message
  );

  decryptFailed = true;
}
    } else {
      physicalFileUnavailable =
        true;
    }

    /*
     * Local integrity check.
     */
    const localMatch =
      liveHash !== null
        ? liveHash === version.sha256Hash
        : null;

    /*
     * Blockchain verification.
     *
     * historyCount === 0 means this document
     * has no record on the currently running
     * blockchain. This is NOT automatically
     * considered tampered.
     */
    let onchain = {
      available: false,
      valid: null,
      historyCount: 0,
      anchored: false,
      status: 'UNAVAILABLE',
    };

 try {
  const teeResult = await teeService.execute(
    {
      userId: req.user.id,
      role: req.user.role,
      caseId: document.caseId,
      documentId: document.documentId,
      action: "verify",
    },
    "blockchain_integrity_verification",
    async () => {
      return blockchain.verifyHash(
        document.documentId,
        liveHash || version.sha256Hash
      );
    }
  );

  const blockchainResult = teeResult.result;

  const historyCount = Number(
    blockchainResult.historyCount || 0
  );

  onchain = {
    available: true,

    contractAddress:
      blockchain.getContractAddress(),

    valid:
      blockchainResult.valid,

    historyCount,

    anchored:
      historyCount > 0,

    evidenceId:
      blockchainResult.evidenceId,

    currentHash:
      blockchainResult.currentHash,
  };

  /*
   * A missing on-chain record is different
   * from an on-chain hash mismatch.
   */
  if (historyCount === 0) {
    onchain.status = "NOT_ANCHORED";
  } else if (
    blockchainResult.valid === true
  ) {
    onchain.status = "VERIFIED";
  } else {
    onchain.status = "MISMATCH";
  }
} catch (err) {
  onchain = {
    available: false,
    valid: null,
    historyCount: 0,
    anchored: false,
    status: "UNAVAILABLE",
    error: err.message,
  };
}

    /*
     * The physical document must match the
     * stored SHA-256 hash.
     *
     * If blockchain history does not exist yet,
     * we establish it below.
     */
    const integrityPassed =
      localMatch === true &&
      (
        onchain.valid === null ||
        onchain.valid === true ||
        onchain.historyCount === 0
      );

    /*
     * =========================================================
     * VERIFIED
     * =========================================================
     */
    if (integrityPassed) {
      await prisma.document.update({
        where: {
          id: document.id,
        },
        data: {
          integrityStatus:
            'verified',
        },
      });

      /*
       * Blockchain anchor is performed BEFORE
       * creating the PostgreSQL audit event so
       * txHash and blockNumber can be persisted.
       */
      let blockchainAnchor = null;

      try {
        /*
         * Existing documents may not exist on the
         * fresh Hardhat blockchain.
         *
         * Establish a baseline first.
         */
        if (
          onchain.historyCount === 0
        ) {
          const uploadAnchor =
            await blockchain.recordEvent(
              document.documentId,
              version.sha256Hash,
              blockchain.ACTIONS.UPLOADED
            );

          const verificationAnchor =
            await blockchain.recordEvent(
              document.documentId,
              version.sha256Hash,
              blockchain.ACTIONS.VERIFIED
            );

          blockchainAnchor = {
            ...verificationAnchor,

            initialAnchor:
              uploadAnchor,
          };

          console.info(
            `[document] blockchain baseline created for ${document.documentId}`
          );
        } else {
          /*
           * Existing blockchain history.
           */
          blockchainAnchor =
            await blockchain.recordEvent(
              document.documentId,
              version.sha256Hash,
              blockchain.ACTIONS.VERIFIED
            );
        }
      } catch (err) {
        console.warn(
          `[document] verification anchor failed: ${err.message}`
        );

        /*
         * Local integrity is still valid even if
         * blockchain anchoring temporarily fails.
         */
        await createSecurityAlert({
          type:
            'blockchain_failure',

          severity:
            'medium',

          message:
            'Blockchain anchor failed during document verification',

          documentId:
            document.id,

          caseId:
            document.caseId,

          userId:
            req.user.id,

          metadata: {
            documentId:
              document.documentId,

            versionId:
              version.id,

            error:
              err.message,
          },
        });
      }

      /*
       * NOW create the audit event with the
       * actual blockchain transaction details.
       */
      await createAuditEvent({
        userId:
          req.user.id,

        caseId:
          document.caseId,

        documentId:
          document.id,

        versionId:
          version.id,

        action:
          'document_verified',

        sha256Hash:
          version.sha256Hash,

        blockchainTxHash:
          blockchainAnchor?.txHash ||
          null,

        blockchainBlock:
          blockchainAnchor?.blockNumber ??
          null,

        metadata: {
          liveHash,

          localMatch,

          onchainMatch:
            onchain.valid,

          blockchainStatus:
            blockchainAnchor
              ? 'anchored'
              : 'pending',

          blockchainHistoryCount:
            onchain.historyCount,

          blockchainContract:
            blockchain.getContractAddress(),

          /*
           * Preserve the initial UPLOADED
           * anchor when one was created.
           */
          blockchainInitialTxHash:
            blockchainAnchor
              ?.initialAnchor
              ?.txHash ||
            null,

          blockchainInitialBlock:
            blockchainAnchor
              ?.initialAnchor
              ?.blockNumber ??
            null,
        },
      });

      return sendSuccess(
        res,
        {
          status:
            'VERIFIED',

          documentId:
            document.documentId,

          versionNumber:
            version.versionNumber,

          sha256Hash:
            version.sha256Hash,

          liveHash,

          localMatch,

          onchain,

          blockchainAnchor:
            blockchainAnchor
              ? {
                  status:
                    'ANCHORED',

                  txHash:
                    blockchainAnchor.txHash,

                  blockNumber:
                    blockchainAnchor.blockNumber,

                  initialAnchor:
                    blockchainAnchor
                      .initialAnchor
                      ? {
                          status:
                            'ANCHORED',

                          txHash:
                            blockchainAnchor
                              .initialAnchor
                              .txHash,

                          blockNumber:
                            blockchainAnchor
                              .initialAnchor
                              .blockNumber,
                        }
                      : null,
                }
              : {
                  status:
                    'PENDING',
                },
        }
      );
    }

    /*
     * =========================================================
     * INTEGRITY FAILURE
     * =========================================================
     */

    let mismatchReason =
      'UNKNOWN';

    if (
      localMatch === false
    ) {
      mismatchReason =
        'LOCAL_HASH_MISMATCH';
    } else if (
      onchain.valid === false &&
      onchain.historyCount > 0
    ) {
      mismatchReason =
        'ONCHAIN_HASH_MISMATCH';
    } else if (
      decryptFailed
    ) {
      mismatchReason =
        'DECRYPTION_FAILED';
    } else if (
      physicalFileUnavailable
    ) {
      mismatchReason =
        'PHYSICAL_FILE_UNAVAILABLE';
    } else if (
      onchain.status ===
      'UNAVAILABLE'
    ) {
      mismatchReason =
        'BLOCKCHAIN_UNAVAILABLE';
    }

    await prisma.document.update({
      where: {
        id: document.id,
      },
      data: {
        integrityStatus:
          'tampered',
      },
    });

    await createAuditEvent({
      userId:
        req.user.id,

      caseId:
        document.caseId,

      documentId:
        document.id,

      versionId:
        version.id,

      action:
        'document_verified',

      sha256Hash:
        version.sha256Hash,

      metadata: {
        result:
          'tampered',

        reason:
          mismatchReason,

        liveHash,

        localMatch,

        onchainMatch:
          onchain.valid,

        blockchainHistoryCount:
          onchain.historyCount,

        blockchainStatus:
          onchain.status,
      },
    });

    await createSecurityAlert({
      type:
        'integrity_mismatch',

      severity:
        'critical',

      message:
        `Document integrity mismatch detected: ${mismatchReason}`,

      documentId:
        document.id,

      caseId:
        document.caseId,

      userId:
        req.user.id,

      metadata: {
        documentId:
          document.documentId,

        versionId:
          version.id,

        storedHash:
          version.sha256Hash,

        liveHash,

        reason:
          mismatchReason,

        blockchainHistoryCount:
          onchain.historyCount,
      },
    });

    return res
      .status(
        HTTP_STATUS.CONFLICT
      )
      .json({
        success:
          false,

        data:
          null,

        status:
          'TAMPERED',

        alert:
          'INTEGRITY_ALERT',

        reason:
          mismatchReason,

        documentId:
          document.documentId,

        versionNumber:
          version.versionNumber,

        storedHash:
          version.sha256Hash,

        liveHash,

        onchain,

        timestamp:
          new Date().toISOString(),
      });
  }
);
/**
 * Download/decrypt a document only after an integrity check.
 */
exports.downloadEvidence = handleAsync(
  async (req, res) => {
    const identifier =
      req.params.documentId ||
      req.params.evidenceId ||
      req.params.id;

    const document =
      await getDocumentByIdentifier(identifier);

    await assertDocumentAccess(
      document,
      req.user,
      'download'
    );

    const version = document.versions[0];

    if (!version) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'Document version not found'
      );
    }

    /*
     * Do not deliver a document that is known to be tampered.
     */
    if (document.integrityStatus === 'tampered') {
      throw new HttpError(
        HTTP_STATUS.CONFLICT,
        'Document integrity verification failed'
      );
    }

    const encryption =
      version.encryptionMetadata || {};

    if (!encryption.iv || !encryption.authTag) {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        'Document encryption metadata is missing'
      );
    }

    const storagePath =
      getLocalStoragePath(version);

    if (!storagePath || !fs.existsSync(storagePath)) {
      throw new HttpError(
        HTTP_STATUS.NOT_FOUND,
        'Physical document unavailable'
      );
    }

    /*
     * Integrity check before delivery.
     */
    const liveHash =
      await hashDecryptedStream(
        storagePath,
        encryption.iv,
        encryption.authTag
      );

    if (liveHash !== version.sha256Hash) {
      await prisma.document.update({
        where: { id: document.id },
        data: {
          integrityStatus: 'tampered',
        },
      });

      await createSecurityAlert({
        type: 'integrity_mismatch',
        severity: 'critical',
        message:
          'Document modification detected during download',
        documentId: document.id,
        caseId: document.caseId,
        userId: req.user.id,
        metadata: {
          expectedHash: version.sha256Hash,
          liveHash,
          versionId: version.id,
        },
      });

      await createAuditEvent({
        userId: req.user.id,
        caseId: document.caseId,
        documentId: document.id,
        versionId: version.id,
        action: 'access_denied',
        sha256Hash: version.sha256Hash,
        metadata: {
          reason: 'LOCAL_HASH_MISMATCH_DURING_DOWNLOAD',
          liveHash,
        },
      });

      throw new HttpError(
        HTTP_STATUS.CONFLICT,
        'Document integrity check failed. Access blocked.'
      );
    }

    /*
     * Mark verified because the physical artifact and stored
     * cryptographic fingerprint agree.
     */
    await prisma.document.update({
      where: { id: document.id },
      data: {
        integrityStatus: 'verified',
      },
    });

    await createAuditEvent({
      userId: req.user.id,
      caseId: document.caseId,
      documentId: document.id,
      versionId: version.id,
      action: 'document_downloaded',
      sha256Hash: version.sha256Hash,
      metadata: {
        originalFileName:
          version.originalFileName,
      },
    });

    let blockchainAnchor = null;

    try {
      blockchainAnchor =
        await blockchain.recordEvent(
          document.documentId,
          version.sha256Hash,
          blockchain.ACTIONS.ACCESSED
        );
    } catch (err) {
      console.warn(
        `[document] access blockchain anchor failed: ${err.message}`
      );
    }

    const decrypt =
      cryptoService.createDecryptStream({
        iv: encryption.iv,
        authTag: encryption.authTag,
      });

    res.setHeader(
      'Content-Type',
      version.mimeType ||
        'application/octet-stream'
    );

    const safeName = (
      version.originalFileName ||
      document.documentId
    ).replace(/["\r\n]/g, '_');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`
    );

    /*
     * If decryption fails halfway through streaming, terminate the
     * response rather than returning corrupted plaintext silently.
     */
    const source = fs.createReadStream(storagePath);

    source.on('error', (err) => {
      console.error(
        '[document] storage read error:',
        err.message
      );

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Unable to read document',
        });
      } else {
        res.destroy(err);
      }
    });

    decrypt.on('error', (err) => {
      console.error(
        '[document] decryption error:',
        err.message
      );

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Document decryption failed',
        });
      } else {
        res.destroy(err);
      }
    });

    source.pipe(decrypt).pipe(res);

    /*
     * blockchainAnchor is intentionally not sent in the download
     * body because this endpoint streams the actual file.
     */
    void blockchainAnchor;
  }
);

/**
 * Manually append a custody event to the legacy custody log.
 *
 * Kept temporarily for compatibility with the existing custody routes.
 */
exports.logCustody = handleAsync(
  async (req, res) => {
    const {
      documentId,
      evidenceId,
      action,
      remarks,
    } = req.body;

    /*
     * New API expects documentId.
     * Legacy evidenceId is resolved only when necessary.
     */
    let document;

    if (documentId) {
      document =
        await getDocumentByIdentifier(documentId);
    } else if (evidenceId) {
      /*
       * Legacy evidence remains supported while the migration
       * is in progress.
       */
      const evidence =
        await prisma.evidence.findUnique({
          where: { evidenceId },
          select: {
            id: true,
            caseId: true,
            sha256Hash: true,
          },
        });

      if (!evidence) {
        throw new HttpError(
          HTTP_STATUS.NOT_FOUND,
          'Evidence not found'
        );
      }

      const entry =
        await prisma.custodyLog.create({
          data: {
            evidenceId: evidence.id,
            actorId: req.user.id,
            actorRole: req.user.role,
            action,
            recordedSha256Hash:
              evidence.sha256Hash,
            remarks,
          },
          include: {
            actor: {
              select: {
                id: true,
                customUserId: true,
                fullName: true,
                role: true,
              },
            },
          },
        });

      return sendSuccess(
        res,
        { entry, legacy: true },
        HTTP_STATUS.CREATED
      );
    } else {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        'documentId is required'
      );
    }

    if (!DOCUMENT_ACTIONS.includes(
      action
    ) &&
      !CUSTODY_ACTIONS.includes(action)
    ) {
      throw new HttpError(
        HTTP_STATUS.BAD_REQUEST,
        `Invalid custody action. Allowed values: ${[
          ...DOCUMENT_ACTIONS,
          ...CUSTODY_ACTIONS,
        ].join(', ')}`
      );
    }

    if (req.user.role !== 'admin') {
      await assertDocumentAccess(
        document,
        req.user,
        'view'
      );
    }

    const version = document.versions[0];

    await createAuditEvent({
      userId: req.user.id,
      caseId: document.caseId,
      documentId: document.id,
      versionId: version?.id || null,
      action:
        action === 'uploaded'
          ? 'document_uploaded'
          : action === 'verified'
            ? 'document_verified'
            : action === 'transferred'
              ? 'document_transferred'
              : action === 'accessed'
                ? 'document_viewed'
                : 'document_viewed',
      sha256Hash:
        version?.sha256Hash || null,
      metadata: {
        custodyAction: action,
        remarks: remarks || null,
      },
    });

    let anchor = null;

    if (ONCHAIN_ACTIONS[action]) {
      try {
        anchor =
          await blockchain.recordEvent(
            document.documentId,
            version.sha256Hash,
            ONCHAIN_ACTIONS[action]
          );
      } catch (err) {
        console.warn(
          `[custody] blockchain anchor skipped: ${err.message}`
        );
      }
    }

    return sendSuccess(
      res,
      {
        documentId: document.documentId,
        action,
        remarks: remarks || null,
        blockchain: anchor
          ? {
              status: 'ANCHORED',
              txHash: anchor.txHash,
              blockNumber: anchor.blockNumber,
            }
          : {
              status: 'PENDING',
            },
      },
      HTTP_STATUS.CREATED
    );
  }
);

/**
 * Get document custody/audit timeline.
 *
 * New DMS data is read from AuditEvent.
 */
exports.getCustodyTimeline = handleAsync(
  async (req, res) => {
    const identifier =
      req.params.documentId ||
      req.params.evidenceId ||
      req.params.id;

    const document =
      await getDocumentByIdentifier(identifier);

    await assertDocumentAccess(
      document,
      req.user,
      'view'
    );

    const events =
      await prisma.auditEvent.findMany({
        where: {
          documentId: document.id,
        },
        orderBy: {
          timestamp: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              customUserId: true,
              fullName: true,
              role: true,
            },
          },
        },
      });

    return sendSuccess(res, {
      documentId: document.documentId,
      timeline: events,
    });
  }
);

/**
 * List secure documents for a case.
 */
exports.getCaseEvidence = handleAsync(
  async (req, res) => {
    const caseRecord =
      await resolveCaseId(
        req.params.caseId
      );

    await assertCaseAssignment(
      caseRecord.id,
      req.user.id,
      req.user.role
    );

  const documents =
  await prisma.document.findMany({
    where: {
      caseId: caseRecord.id,

      // Admin can see all documents.
      // Other users only see documents for which
      // they currently have VIEW permission.
      ...(req.user.role === 'admin'
        ? {}
        : {
            permissions: {
              some: {
                userId: req.user.id,
                action: 'view',
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: new Date() } },
                ],
              },
            },
          }),
    },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          documentId: true,
          title: true,
          documentType: true,
          sensitivity: true,
          description: true,
          currentVersion: true,
          integrityStatus: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: {
              id: true,
              customUserId: true,
              fullName: true,
              role: true,
            },
          },
          versions: {
            orderBy: {
              versionNumber: 'desc',
            },
            take: 1,
            select: {
              versionNumber: true,
              originalFileName: true,
              mimeType: true,
              fileSize: true,
              sha256Hash: true,
              createdAt: true,
            },
          },
        },
      });

    const sanitizedDocuments =
      documents.map((document) => ({
        ...document,
        versions: document.versions.map(
          (version) => ({
            ...version,
            fileSize:
              version.fileSize.toString(),
          })
        ),
      }));

    return sendSuccess(res, {
      case: caseRecord.caseId,
      documents: sanitizedDocuments,
    });
  }
);

/**
 * Get a single document's metadata and version history.
 */
exports.getDocument = handleAsync(
  async (req, res) => {
    const identifier =
      req.params.documentId ||
      req.params.id;

    const document =
      await getDocumentByIdentifier(identifier);

    await assertDocumentAccess(
      document,
      req.user,
      'view'
    );
const recentView = await prisma.auditEvent.findFirst({
  where: {
    userId: req.user.id,
    documentId: document.id,
    action: 'document_viewed',
    timestamp: {
      gte: new Date(Date.now() - 30 * 1000),
    },
  },
});

if (!recentView) {
  await createAuditEvent({
    userId: req.user.id,
    caseId: document.caseId,
    documentId: document.id,
    versionId: document.versions[0]?.id || null,
    action: 'document_viewed',
    sha256Hash: document.versions[0]?.sha256Hash || null,
    metadata: {
      source: 'document_view',
    },
  });
}
  let allowedActions = ['view'];

if (req.user.role === 'admin') {
  allowedActions = [
    'view',
    'download',
    'verify',
    'update',
  ];
} else {
  const permissions =
    await prisma.documentPermission.findMany({
      where: {
        documentId: document.id,
        userId: req.user.id,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: {
        action: true,
      },
    });

  allowedActions = Array.from(
    new Set([
      'view',
      ...permissions.map(
        (permission) => permission.action
      ),
    ])
  );
}

    const versions =
      document.versions.map(
        (version) => ({
          id: version.id,
          versionNumber:
            version.versionNumber,
          originalFileName:
            version.originalFileName,
          mimeType: version.mimeType,
          fileSize:
            version.fileSize.toString(),
          sha256Hash:
            version.sha256Hash,
          createdAt: version.createdAt,
          uploadedById:
            version.uploadedById,
        })
      );

    return sendSuccess(res, {
      document: {
        id: document.id,
        documentId: document.documentId,
        title: document.title,
        documentType:
          document.documentType,
        sensitivity: document.sensitivity,
        description:
          document.description,
        currentVersion:
          document.currentVersion,
        integrityStatus:
          document.integrityStatus,
        case: document.case,
        createdBy: document.createdBy,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        permissions: allowedActions,
      },
      versions,
    });
  }
);

/**
 * Helpers
 */
function hashDecryptedStream(
  filePath,
  ivHex,
  authTagHex
) {
  return new Promise((resolve, reject) => {
    const decrypt =
      cryptoService.createDecryptStream({
        iv: ivHex,
        authTag: authTagHex,
      });

    const hash =
      crypto.createHash('sha256');

    const source =
      fs.createReadStream(filePath);

    source.on('error', reject);
    decrypt.on('error', reject);

    decrypt.on('data', (chunk) => {
      hash.update(chunk);
    });

    decrypt.on('end', () => {
      resolve(hash.digest('hex'));
    });

    source.pipe(decrypt);
  });
}

ensureDirs();

/*
 * Kept for backwards compatibility with any existing
 * code importing these helpers.
 */
exports.generateEvidenceId =
  generateEvidenceId;

exports.generateDocumentId =
  generateDocumentId;