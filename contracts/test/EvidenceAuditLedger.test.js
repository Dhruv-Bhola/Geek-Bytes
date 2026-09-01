/**
 * EvidenceAuditLedger — Security & Immutability Test Suite
 * --------------------------------------------------------
 * Complements EvidenceLedger.test.js with adversarial security assertions:
 *
 *   1. Non-modifiable / append-only audit log
 *        - Historical records can NEVER be overwritten or deleted, even by the
 *          contract owner / a relayer. Recording a new event for an evidence id
 *          appends to the history; index 0 is immutable for the life of the log.
 *        - The contract exposes no write function that mutates past records.
 *
 *   2. Relayer access restriction
 *        - Only authorized relayers may append audit records. A revoked relayer
 *          or an arbitrary caller is rejected with revert.
 *
 *   3. Cryptographic verification
 *        - verifyHash returns true for a genuine digest, false for an altered
 *          digest and for unknown evidence.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("crypto");

function sha256Of(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function deployLedger() {
  const [owner, relayer, other] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("EvidenceAuditLedger");
  const ledger = await Factory.deploy();
  await ledger.waitForDeployment();
  await ledger.addRelayer(relayer.address);
  return { ledger, owner, relayer, other };
}

describe("EvidenceAuditLedger (Security & Immutability)", function () {
  const EID = "E-777";
  const H1 = sha256Of("original-evidence-v1");

  describe("1. Non-modifiable append-only audit log", function () {
    it("recording a new event appends and never overwrites history[0]", async function () {
      const { ledger, relayer } = await deployLedger();

      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");
      const H2 = sha256Of("original-evidence-v2");

      // Relayer attempts to "correct" history for the same evidence.
      await ledger.connect(relayer).recordEvent(EID, H2, "VERIFIED");

      // The log now has two entries; the first is untouched.
      expect(await ledger.eventCount(EID)).to.equal(2);
      const rec0 = await ledger.getRecord(EID, 0);
      expect(rec0.sha256Hash).to.equal(H1);
      expect(rec0.action).to.equal("UPLOADED");

      const rec1 = await ledger.getRecord(EID, 1);
      expect(rec1.sha256Hash).to.equal(H2);
      expect(rec1.action).to.equal("VERIFIED");
    });

    it("owner cannot remove or mutate an existing audit record", async function () {
      const { ledger, relayer, owner } = await deployLedger();
      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");

      // The ledger exposes NO delete/rewrite entrypoint. Any attempt to
      // "erase" history must therefore be impossible — the only write path is
      // append via recordEvent, guarded by the relayer whitelist even for the
      // owner (owner is a relayer but still cannot rewrite past indices).
      await expect(
        ledger.connect(owner).recordEvent(EID, sha256Of("forged"), "VERIFIED")
      ).to.not.be.reverted;

      // Appending is allowed, but index 0 still holds the original hash.
      const rec0 = await ledger.getRecord(EID, 0);
      expect(rec0.sha256Hash).to.equal(H1);
      expect(rec0.action).to.equal("UPLOADED");

      // No delete function is available on the contract interface.
      const deleteFn = ledger.interface.fragments.find(
        (f) => f.type === "function" && /delete|clear|overwrite|remove.*record|reset/i.test(f.name)
      );
      expect(deleteFn).to.be.undefined;
    });

    it("history count grows monotonically with appends", async function () {
      const { ledger, relayer } = await deployLedger();
      for (let i = 0; i < 4; i++) {
        await ledger.connect(relayer).recordEvent(EID, H1, "ACCESSED");
      }
      const [valid, count] = await ledger.verifyHash(EID, H1);
      expect(valid).to.be.true;
      expect(count).to.equal(4);
      // Immutable ordering: every slot holds the same action in this trace.
      expect((await ledger.getRecord(EID, 0)).action).to.equal("ACCESSED");
      expect((await ledger.getRecord(EID, 3)).action).to.equal("ACCESSED");
    });
  });

  describe("2. Relayer access restriction", function () {
    it("rejects an unauthorized caller attempting to record an event", async function () {
      const { ledger, other } = await deployLedger();
      await expect(
        ledger.connect(other).recordEvent(EID, H1, "UPLOADED")
      ).to.be.revertedWith("EvidenceAuditLedger: caller is not an authorized relayer");
    });

    it("a revoked relayer can no longer append audit records", async function () {
      const { ledger, relayer, owner } = await deployLedger();
      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");

      await ledger.connect(owner).removeRelayer(relayer.address);
      expect(await ledger.authorizedRelayers(relayer.address)).to.be.false;

      await expect(
        ledger.connect(relayer).recordEvent(EID, H1, "VERIFIED")
      ).to.be.revertedWith("EvidenceAuditLedger: caller is not an authorized relayer");
    });

    it("owner cannot revoke management from a non-owner", async function () {
      const { ledger, other, relayer } = await deployLedger();
      await expect(
        ledger.connect(other).addRelayer(relayer.address)
      ).to.be.revertedWith("EvidenceAuditLedger: only owner");
    });
  });

  describe("3. Cryptographic hash verification", function () {
    let ledger, relayer;
    beforeEach(async function () {
      ({ ledger, relayer } = await deployLedger());
    });

    it("returns true for the genuine anchored digest", async function () {
      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");
      const [valid] = await ledger.verifyHash(EID, H1);
      expect(valid).to.be.true;
    });

    it("returns false for an altered (tampered) digest", async function () {
      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");
      const tampered = sha256Of("tampered-evidence");
      const [valid] = await ledger.verifyHash(EID, tampered);
      expect(valid).to.be.false;
    });

    it("verifies against the LATEST record, not a stale one", async function () {
      await ledger.connect(relayer).recordEvent(EID, H1, "UPLOADED");
      const H2 = sha256Of("evidence-v2");
      await ledger.connect(relayer).recordEvent(EID, H2, "VERIFIED");

      // Latest hash matches; the stale hash no longer verifies.
      expect((await ledger.verifyHash(EID, H2))[0]).to.be.true;
      expect((await ledger.verifyHash(EID, H1))[0]).to.be.false;
    });

    it("returns false for an unknown evidence id", async function () {
      const [valid, count] = await ledger.verifyHash("UNKNOWN-1", H1);
      expect(valid).to.be.false;
      expect(count).to.equal(0);
    });
  });
});
