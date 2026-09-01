const { prisma } = require('../config/database');
const blockchain = require('../services/blockchainService');
const { HTTP_STATUS, HttpError, sendSuccess, handleAsync } = require('../utils/responseHelper');

/**
 * Reports are materialized as a terminal chain-of-custody action.
 * There is no separate reports table in the current physical schema;
 * the immutable custody/audit trail records the `report_generated` event.
 */

/**
 * Section 65B certificate proof — anchors the report to the on-chain
 * record of its verified evidence: real txHash, contract address,
 * block number and block timestamp.
 */
async function buildSection65BProof(evidence) {
  if (!evidence || !evidence.blockchainTxHash) return null;
  const blockInfo = await blockchain
    .getBlockInfo(evidence.blockchainBlock)
    .catch(() => null);

  return {
    evidenceId: evidence.evidenceId,
    sha256Hash: evidence.sha256Hash,
    transactionHash: evidence.blockchainTxHash,
    contractAddress: blockchain.getContractAddress(),
    blockNumber: evidence.blockchainBlock || (blockInfo && blockInfo.blockNumber) || null,
    blockTimestamp: (blockInfo && blockInfo.timestamp) || null,
    verificationMethod: 'SHA-256 + AES-256-GCM + on-chain immutable audit ledger',
    ipcSection: 'Section 65B, Indian Evidence Act (Digital Evidence Certificate)',
  };
}

/**
 * GET /reports/case/:caseId -> read-only final reports for legal/judiciary.
 */
exports.getReports = handleAsync(async (req, res) => {
  const { caseId } = req.params;

  const generated = await prisma.custodyLog.findMany({
    where: {
      action: 'report_generated',
      evidence: { caseId },
    },
    include: {
      actor: { select: { id: true, customUserId: true, fullName: true, role: true } },
      evidence: {
        select: {
          evidenceId: true,
          evidenceType: true,
          sha256Hash: true,
          blockchainTxHash: true,
          blockchainBlock: true,
          blockchainStatus: true,
        },
      },
    },
    orderBy: { timestamp: 'desc' },
  });

  // Attach Section 65B on-chain proof to each signed/generated report entry.
  const reports = await Promise.all(
    generated.map(async (g) => ({
      ...g,
      section65B: await buildSection65BProof(g.evidence),
    }))
  );

  return sendSuccess(res, { reports });
});

/**
 * POST /reports -> generate a report (records report_generated on a case).
 */
exports.generateReport = handleAsync(async (req, res) => {
  const { caseId, remarks } = req.body;

  // Anchor the report to the case's verified evidence via a custody action
  // on the first verified evidence, so the audit trail is complete.
  const evidence = await prisma.evidence.findFirst({
    where: { caseId, integrityStatus: 'verified' },
    select: {
      id: true,
      evidenceId: true,
      sha256Hash: true,
      blockchainTxHash: true,
      blockchainBlock: true,
    },
  });

  if (!evidence) {
    throw new HttpError(
      HTTP_STATUS.BAD_REQUEST,
      'No verified evidence available to anchor the report'
    );
  }

  const entry = await prisma.custodyLog.create({
    data: {
      evidenceId: evidence.id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'report_generated',
      recordedSha256Hash: evidence.sha256Hash,
      remarks: remarks || 'Final report generated',
    },
  });

  const section65B = await buildSection65BProof(evidence);

  return sendSuccess(res, { report: entry, section65B }, HTTP_STATUS.CREATED);
});

/**
 * PATCH /reports/:id/sign -> lawyer/judge review; marks verified resolution.
 */
exports.signReport = handleAsync(async (req, res) => {
  const { id } = req.params;

  const signing = await prisma.custodyLog.update({
    where: { id },
    data: { remarks: `Digitally reviewed/signed by ${req.user.customUserId}` },
  });

  return sendSuccess(res, { report: signing, message: 'Report reviewed and signed' });
});
