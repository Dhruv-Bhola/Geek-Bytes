const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

let RPC_URL =
  process.env.BLOCKCHAIN_RPC_URL ||
  'http://127.0.0.1:8545';

let CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS;

let PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY;

let provider;
let wallet;
let contract;
let initialized = false;

const CONTRACT_ARTIFACT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'contracts',
  'artifacts',
  'contracts',
  'EvidenceAuditLedger.sol',
  'EvidenceAuditLedger.json'
);

const SERVER_ENV = path.join(
  __dirname,
  '..',
  '..',
  '.env'
);

const ACTIONS = Object.freeze({
  UPLOADED: 'UPLOADED',
  VERIFIED: 'VERIFIED',
  ACCESSED: 'ACCESSED',
  TRANSFERRED: 'TRANSFERRED',
});

/**
 * Reload blockchain-related environment variables.
 */
function reloadEnv() {
  try {
    require('dotenv').config({
      path: SERVER_ENV,
      override: false,
    });
  } catch (_) {
    // dotenv may already be loaded by server bootstrap.
  }

  RPC_URL =
    process.env.BLOCKCHAIN_RPC_URL ||
    'http://127.0.0.1:8545';

  CONTRACT_ADDRESS =
    process.env.CONTRACT_ADDRESS;

  PRIVATE_KEY =
    process.env.RELAYER_PRIVATE_KEY;
}

/**
 * Reset blockchain connection state.
 */
function resetRelayerState(opts = {}) {
  if (opts.reloadEnv !== false) {
    reloadEnv();
  }

  provider = undefined;
  wallet = undefined;
  contract = undefined;
  initialized = false;

  console.info(
    '[blockchainService] relayer state reset; fresh provider on next use'
  );

  return getContractAddress();
}

/**
 * Return configured contract address.
 */
function getContractAddress() {
  return CONTRACT_ADDRESS || null;
}

/**
 * Load compiled contract ABI.
 */
function loadArtifact() {
  if (!fs.existsSync(CONTRACT_ARTIFACT)) {
    throw new Error(
      'EvidenceAuditLedger artifact not found. ' +
      'Run "npx hardhat compile" inside the contracts folder.'
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        CONTRACT_ARTIFACT,
        'utf8'
      )
    );
  } catch (error) {
    throw new Error(
      `Unable to read EvidenceAuditLedger artifact: ${error.message}`
    );
  }
}

/**
 * Lazily initialize provider, relayer wallet and contract.
 */
function ensureInitialized() {
  if (
    initialized &&
    provider &&
    wallet &&
    contract
  ) {
    return;
  }

  reloadEnv();

  if (!RPC_URL) {
    throw new Error(
      'BLOCKCHAIN_RPC_URL is not configured.'
    );
  }

  if (!PRIVATE_KEY) {
    throw new Error(
      'RELAYER_PRIVATE_KEY is not configured.'
    );
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'CONTRACT_ADDRESS is not configured.'
    );
  }

  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(
      `Invalid CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`
    );
  }

  const artifact = loadArtifact();

  provider = new ethers.JsonRpcProvider(RPC_URL);

  wallet = new ethers.Wallet(
    PRIVATE_KEY,
    provider
  );

  contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    artifact.abi,
    wallet
  );

  initialized = true;

  console.info(
    '[blockchainService] relayer initialized'
  );

  console.info(
    `[blockchainService] RPC: ${RPC_URL}`
  );

  console.info(
    `[blockchainService] contract: ${CONTRACT_ADDRESS}`
  );

  console.info(
    `[blockchainService] relayer: ${wallet.address}`
  );
}

/**
 * Check blockchain connectivity.
 */
async function verifyBlockchainConnection() {
  ensureInitialized();

  try {
    const network =
      await provider.getNetwork();

    return {
      chainId:
        network.chainId.toString(),
      name:
        network.name,
    };
  } catch (error) {
    throw new Error(
      `Blockchain RPC is unreachable at ${RPC_URL}: ${error.message}`
    );
  }
}

/**
 * Verify that contract bytecode exists at the configured address.
 */
async function verifyContractDeployment() {
  ensureInitialized();

  const code =
    await provider.getCode(
      CONTRACT_ADDRESS
    );

  if (
    !code ||
    code === '0x'
  ) {
    throw new Error(
      `No EvidenceAuditLedger contract deployed at ${CONTRACT_ADDRESS}.`
    );
  }

  return {
    address:
      CONTRACT_ADDRESS,
    deployed:
      true,
  };
}

/**
 * Verify that the backend relayer is authorized.
 */
async function verifyRelayerAuthorization() {
  ensureInitialized();

  if (
    typeof contract.authorizedRelayers !==
    'function'
  ) {
    throw new Error(
      'EvidenceAuditLedger ABI does not contain authorizedRelayers().'
    );
  }

  const authorized =
    await contract.authorizedRelayers(
      wallet.address
    );

  if (!authorized) {
    throw new Error(
      `Relayer ${wallet.address} is not authorized by EvidenceAuditLedger.`
    );
  }

  return true;
}

/**
 * Run complete blockchain preflight checks.
 */
async function blockchainPreflight() {
  const network =
    await verifyBlockchainConnection();

  await verifyContractDeployment();

  await verifyRelayerAuthorization();

  return network;
}

/**
 * Validate evidence ID.
 *
 * IMPORTANT:
 * EvidenceAuditLedger expects string,
 * so this remains a normal string.
 */
function validateEvidenceId(
  evidenceId
) {
  if (
    evidenceId === undefined ||
    evidenceId === null ||
    String(evidenceId).trim() === ''
  ) {
    throw new Error(
      'Blockchain evidenceId is required.'
    );
  }

  return String(evidenceId).trim();
}

/**
 * Validate SHA-256 hash.
 *
 * IMPORTANT:
 * EvidenceAuditLedger expects string,
 * not bytes32.
 */
function validateSha256Hash(
  sha256Hash
) {
  if (
    sha256Hash === undefined ||
    sha256Hash === null ||
    String(sha256Hash).trim() === ''
  ) {
    throw new Error(
      'Blockchain SHA-256 hash is required.'
    );
  }

  const value =
    String(sha256Hash)
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(value)
  ) {
    throw new Error(
      `Invalid SHA-256 hash. Expected 64 hexadecimal characters, received "${value}".`
    );
  }

  return value;
}

/**
 * Validate supported blockchain action.
 */
function validateAction(action) {
  if (
    !Object.values(ACTIONS).includes(
      action
    )
  ) {
    throw new Error(
      `Unsupported blockchain action "${action}". ` +
        `Allowed actions: ${Object.values(
          ACTIONS
        ).join(', ')}`
    );
  }

  return action;
}

/**
 * Append immutable audit event to blockchain.
 *
 * Solidity signature:
 *
 * recordEvent(
 *   string calldata _evidenceId,
 *   string calldata _sha256Hash,
 *   string calldata _action
 * )
 */
async function recordEvent(
  evidenceId,
  sha256Hash,
  action = ACTIONS.UPLOADED
) {
  const validEvidenceId =
    validateEvidenceId(
      evidenceId
    );

  const validHash =
    validateSha256Hash(
      sha256Hash
    );

  const validAction =
    validateAction(
      action
    );

  try {
    await blockchainPreflight();

    console.info(
      `[blockchainService] recording ${validAction} for ${validEvidenceId}`
    );

    console.info(
      `[blockchainService] document ID: ${validEvidenceId}`
    );

    console.info(
      `[blockchainService] SHA-256: ${validHash}`
    );

    /*
     * IMPORTANT:
     * The Solidity contract expects STRING values.
     *
     * Do NOT use:
     * ethers.encodeBytes32String(...)
     *
     * Do NOT prepend:
     * 0x
     */
    const tx =
      await contract.recordEvent(
        validEvidenceId,
        validHash,
        validAction
      );

    console.info(
      `[blockchainService] transaction submitted: ${tx.hash}`
    );

    const receipt =
      await tx.wait();

    if (!receipt) {
      throw new Error(
        'Blockchain transaction completed without a receipt.'
      );
    }

    const blockNumber =
      receipt.blockNumber;

    const txHash =
      tx.hash;

    let blockTimestamp =
      new Date().toISOString();

    let blockHash =
      null;

    try {
      const block =
        await provider.getBlock(
          blockNumber
        );

      if (block) {
        blockTimestamp =
          new Date(
            block.timestamp * 1000
          ).toISOString();

        blockHash =
          block.hash || null;
      }
    } catch (blockError) {
      console.warn(
        `[blockchainService] unable to read block ${blockNumber}: ${blockError.message}`
      );
    }

    console.info(
      `[blockchainService] ${validAction} anchored successfully`
    );

    console.info(
      `[blockchainService] block: ${blockNumber}`
    );

    console.info(
      `[blockchainService] tx: ${txHash}`
    );

    return {
      txHash,
      blockNumber,
      blockTimestamp,
      blockHash,
      contractAddress:
        CONTRACT_ADDRESS,
      evidenceId:
        validEvidenceId,
      sha256Hash:
        validHash,
      action:
        validAction,
      status:
        'ANCHORED',
      timestamp:
        new Date().toISOString(),
    };
  } catch (error) {
    resetRelayerState();

    const message =
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      'Unknown blockchain error';

    throw new Error(
      `Blockchain anchor failed for ${validEvidenceId}: ${message}`
    );
  }
}

/**
 * Verify current hash against blockchain history.
 *
 * Solidity signature:
 *
 * verifyHash(
 *   string calldata _evidenceId,
 *   string calldata _currentHash
 * )
 */
async function verifyHash(
  evidenceId,
  currentHash
) {
  const validEvidenceId =
    validateEvidenceId(
      evidenceId
    );

  const validHash =
    validateSha256Hash(
      currentHash
    );

  await blockchainPreflight();

  const [
    valid,
    historyCount,
  ] =
    await contract.verifyHash(
      validEvidenceId,
      validHash
    );

  return {
    valid,
    historyCount:
      Number(historyCount),
    evidenceId:
      validEvidenceId,
    currentHash:
      validHash,
  };
}

/**
 * Fetch complete blockchain audit history.
 *
 * Solidity signature:
 *
 * getAuditHistory(
 *   string calldata _evidenceId
 * )
 */
async function getAuditHistory(
  evidenceId
) {
  const validEvidenceId =
    validateEvidenceId(
      evidenceId
    );

  await blockchainPreflight();

  const records =
    await contract.getAuditHistory(
      validEvidenceId
    );

  return records.map(
    (record) => ({
      evidenceId:
        record.evidenceId,

      sha256Hash:
        record.sha256Hash,

      action:
        record.action,

      actorAddress:
        record.actorAddress,

      timestamp:
        Number(
          record.timestamp
        ),
    })
  );
}

/**
 * Fetch one blockchain audit record.
 *
 * Solidity signature:
 *
 * getRecord(
 *   string calldata _evidenceId,
 *   uint256 _index
 * )
 */
async function getRecord(
  evidenceId,
  index
) {
  const validEvidenceId =
    validateEvidenceId(
      evidenceId
    );

  if (
    index === undefined ||
    index === null ||
    Number.isNaN(
      Number(index)
    )
  ) {
    throw new Error(
      'Blockchain record index is required.'
    );
  }

  await blockchainPreflight();

  const record =
    await contract.getRecord(
      validEvidenceId,
      Number(index)
    );

  return {
    evidenceId:
      record.evidenceId,

    sha256Hash:
      record.sha256Hash,

    action:
      record.action,

    actorAddress:
      record.actorAddress,

    timestamp:
      Number(
        record.timestamp
      ),
  };
}

/**
 * Return blockchain event count.
 *
 * Solidity signature:
 *
 * eventCount(
 *   string calldata _evidenceId
 * )
 */
async function getEventCount(
  evidenceId
) {
  const validEvidenceId =
    validateEvidenceId(
      evidenceId
    );

  await blockchainPreflight();

  const count =
    await contract.eventCount(
      validEvidenceId
    );

  return Number(count);
}

/**
 * Check whether relayer is authorized.
 */
async function isRelayerAuthorized() {
  ensureInitialized();

  await verifyContractDeployment();

  if (
    typeof contract.authorizedRelayers !==
    'function'
  ) {
    return false;
  }

  return contract.authorizedRelayers(
    wallet.address
  );
}

/**
 * Return relayer wallet address.
 */
function relayerAddress() {
  ensureInitialized();

  return wallet.address;
}

/**
 * Get information about a blockchain block.
 *
 * Kept as a small utility because some existing code may import it.
 */
async function getBlockInfo(
  blockNumber
) {
  ensureInitialized();

  if (
    blockNumber === undefined ||
    blockNumber === null
  ) {
    throw new Error(
      'Block number is required.'
    );
  }

  const block =
    await provider.getBlock(
      Number(blockNumber)
    );

  if (!block) {
    return null;
  }

  return {
    number:
      block.number,
    hash:
      block.hash || null,
    timestamp:
      block.timestamp,
    date:
      new Date(
        block.timestamp * 1000
      ).toISOString(),
    parentHash:
      block.parentHash || null,
  };
}

module.exports = {
  ACTIONS,

  recordEvent,

  verifyHash,

  getAuditHistory,

  getRecord,

  getEventCount,

  isRelayerAuthorized,

  relayerAddress,

  getContractAddress,

  getBlockInfo,

  ensureInitialized,

  resetRelayerState,

  verifyBlockchainConnection,

  verifyContractDeployment,

  verifyRelayerAuthorization,

  blockchainPreflight,

  validateEvidenceId,

  validateSha256Hash,

  validateAction,
};