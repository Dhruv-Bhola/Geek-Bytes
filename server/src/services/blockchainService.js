const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

let RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
let PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

let provider;
let wallet;
let contract;
let initialized = false;

const CONTRACT_ARTIFACT = path.join(
  __dirname, '..', '..', '..', 'contracts', 'artifacts', 'contracts',
  'EvidenceAuditLedger.sol', 'EvidenceAuditLedger.json'
);

const ACTIONS = {
  UPLOADED: 'UPLOADED',
  VERIFIED: 'VERIFIED',
  ACCESSED: 'ACCESSED',
  TRANSFERRED: 'TRANSFERRED',
};

const SERVER_ENV = path.join(__dirname, '..', '..', '.env');

/**
 * Re-read server/.env so a redeployed CONTRACT_ADDRESS is picked up on the
 * next reset without a full process restart.
 */
function reloadEnv() {
  try {
    require('dotenv').config({ path: SERVER_ENV });
  } catch (_) {
    // dotenv optional; process env already set by server bootstrap
  }
  RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
  CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
}

/**
 * Drop all module singletons (provider/wallet/contract) so the next call
 * rebuilds a fresh connection (e.g. after a Hardhat node restart/redeploy).
 */
function resetRelayerState(opts = {}) {
  if (opts.reloadEnv !== false) reloadEnv();
  provider = undefined;
  wallet = undefined;
  contract = undefined;
  initialized = false;
  console.info('[blockchainService] relayer state reset; fresh provider on next use');
  return getContractAddress();
}

/**
 * Immutable audit ledger contract address (sec. 65B on-chain anchor).
 * Exposed so controllers/reports can surface the Section 65B certificate.
 */
function getContractAddress() {
  return CONTRACT_ADDRESS || null;
}

/**
 * Lazily initialize the relayer wallet + contract instance.
 * Safe to call multiple times.
 */
function ensureInitialized() {
  if (initialized) return;

  provider = new ethers.JsonRpcProvider(RPC_URL);

  if (!PRIVATE_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY is not configured');
  }
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  if (!CONTRACT_ADDRESS) {
    throw new Error('CONTRACT_ADDRESS is not configured');
  }

  if (!fs.existsSync(CONTRACT_ARTIFACT)) {
    throw new Error(
      'Contract artifact not found. Run `npx hardhat compile` in /contracts first.'
    );
  }

  const artifact = JSON.parse(fs.readFileSync(CONTRACT_ARTIFACT, 'utf8'));
  contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, wallet);

  initialized = true;
  console.info(`[blockchainService] relayer connected @ ${wallet.address}`);
}

/**
 * Append an immutable audit event for an evidence id.
 * @param {string} evidenceId  e.g. "E-042"
 * @param {string} sha256Hash  64-char hex digest
 * @param {string} action      one of ACTIONS.*
 * @returns tx receipt metadata
 */
async function recordEvent(evidenceId, sha256Hash, action = ACTIONS.UPLOADED) {
  ensureInitialized();

  const tx = await contract.recordEvent(evidenceId, sha256Hash, action);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockTimestamp: new Date().toISOString(),
    contractAddress: CONTRACT_ADDRESS,
    evidenceId,
    sha256Hash,
    action,
    status: 'ANCHORED',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verify a live hash on-chain against the latest recorded hash.
 * @returns { valid, historyCount, latestHash }
 */
async function verifyHash(evidenceId, currentHash) {
  ensureInitialized();

  // Guard against a stale/absent deployment: a restarted (in-memory) Hardhat
  // node has no runtime code at CONTRACT_ADDRESS, which would otherwise surface
  // as an obscure ethers decode error (value="0x", code=BAD_DATA).
  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (!code || code === '0x') {
    throw new Error(
      `EvidenceAuditLedger has no runtime code at ${CONTRACT_ADDRESS} - ` +
      'redeploy (npx hardhat run scripts/deploy.js --network localhost) then ' +
      'restart the API server'
    );
  }

  const [valid, historyCount] = await contract.verifyHash(evidenceId, currentHash);
  return {
    valid,
    historyCount: Number(historyCount),
    evidenceId,
    currentHash,
  };
}

/**
 * Resolve the recorded on-chain timestamp (UTC ISO) for an anchor block.
 * Used by the Section 65B certificate / courtroom report badge.
 */
async function getBlockInfo(blockNumber) {
  if (!provider) ensureInitialized();
  if (blockNumber == null) return null;
  const block = await provider.getBlock(Number(blockNumber));
  if (!block) return null;
  return {
    blockNumber: Number(block.number),
    timestamp: new Date(block.timestamp * 1000).toISOString(),
    blockHash: block.hash,
  };
}

/**
 * Fetch the full immutable audit history for an evidence id.
 */
async function getAuditHistory(evidenceId) {
  ensureInitialized();

  const records = await contract.getAuditHistory(evidenceId);
  return records.map((r) => ({
    evidenceId: r.evidenceId,
    sha256Hash: r.sha256Hash,
    action: r.action,
    actorAddress: r.actorAddress,
    timestamp: Number(r.timestamp),
  }));
}

/**
 * Check whether the relayer is authorized with the contract.
 */
async function isRelayerAuthorized() {
  ensureInitialized();
  return contract.authorizedRelayers(wallet.address);
}

/**
 * Return the relayer address (for custody actor records).
 */
function relayerAddress() {
  ensureInitialized();
  return wallet.address;
}

module.exports = {
  ACTIONS,
  recordEvent,
  verifyHash,
  getAuditHistory,
  isRelayerAuthorized,
  relayerAddress,
  getContractAddress,
  getBlockInfo,
  ensureInitialized,
  resetRelayerState,
};
