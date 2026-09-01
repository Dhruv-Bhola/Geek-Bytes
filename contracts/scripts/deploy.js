const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deployment script for EvidenceAuditLedger.
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * On success the deployed CONTRACT_ADDRESS is written into server/.env so
 * blockchainService.js picks it up automatically.
 */

// Path to the API's environment file that blockchainService.js reads.
const SERVER_ENV = path.join(__dirname, "..", "..", "server", ".env");
const SERVER_ENV_EXAMPLE = path.join(__dirname, "..", "..", "server", ".env.example");

function persistContractAddress(address) {
  // If no .env exists yet, bootstrap it from .env.example.
  if (!fs.existsSync(SERVER_ENV) && fs.existsSync(SERVER_ENV_EXAMPLE)) {
    fs.copyFileSync(SERVER_ENV_EXAMPLE, SERVER_ENV);
    console.log(`Created server/.env from .env.example`);
  }

  if (!fs.existsSync(SERVER_ENV)) {
    console.warn(`!! server/.env missing — set CONTRACT_ADDRESS=${address} manually`);
    return;
  }

  const lines = fs.readFileSync(SERVER_ENV, "utf8").split(/\r?\n/);
  const out = [];
  let replaced = false;
  for (const line of lines) {
    if (/^CONTRACT_ADDRESS\s*=/.test(line)) {
      out.push(`CONTRACT_ADDRESS=${address}`);
      replaced = true;
    } else {
      out.push(line);
    }
  }
  if (!replaced) {
    out.push(`CONTRACT_ADDRESS=${address}`);
  }

  fs.writeFileSync(SERVER_ENV, out.join("\n") + "\n");
  if (replaced) {
    console.log(`Updated CONTRACT_ADDRESS in server/.env -> ${address}`);
  } else {
    console.log(`Appended CONTRACT_ADDRESS to server/.env -> ${address}`);
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const EvidenceAuditLedger = await hre.ethers.getContractFactory("EvidenceAuditLedger");
  const ledger = await EvidenceAuditLedger.deploy();
  await ledger.waitForDeployment();

  const address = await ledger.getAddress();
  const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("");
  console.log("===== EvidenceAuditLedger deployed =====");
  console.log(`Contract address : ${address}`);
  console.log(`Network          : ${hre.network.name}`);
  console.log(`Deployer         : ${deployer.address}`);
  console.log(`Deployer balance : ${hre.ethers.formatEther(deployerBalance)} ETH`);

  // The deployer is auto-authorized as a relayer by the constructor.
  console.log("\nDeployer is an authorized relayer (constructor default).");

  // Record the address into server/.env for the API relayer.
  persistContractAddress(address);

  // Verify on a public explorer (transparently skipped for local filesystem chains).
  await verifyContract(address);

  console.log("\nDeployment complete.");
  console.log("\nserver/.env -> CONTRACT_ADDRESS=" + address);

  return address;
}

async function verifyContract(address) {
  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    console.log("Skipping verification: local network");
    return;
  }
  await new Promise((r) => setTimeout(r, 30000)); // wait for propagation
  try {
    await hre.run("verify:verify", { address, constructorArguments: [] });
    console.log("Contract verified on block explorer");
  } catch (e) {
    console.log("Verification skipped/failed:", e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
