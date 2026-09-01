const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("crypto");

describe("EvidenceAuditLedger", function () {
  let ledger;
  let owner, relayer1, relayer2, unauthorized;

  const EVIDENCE_ID = "E-042";

  function sha256Of(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  beforeEach(async function () {
    [owner, relayer1, relayer2, unauthorized] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("EvidenceAuditLedger");
    ledger = await Factory.deploy();
    await ledger.waitForDeployment();

    await ledger.addRelayer(relayer1.address);
  });

  describe("Deployment & Relayer Management", function () {
    it("sets deployer as owner and default relayer", async function () {
      expect(await ledger.owner()).to.equal(owner.address);
      expect(await ledger.authorizedRelayers(owner.address)).to.be.true;
    });

    it("adds a relayer", async function () {
      await ledger.addRelayer(relayer2.address);
      expect(await ledger.authorizedRelayers(relayer2.address)).to.be.true;
    });

    it("removes a relayer", async function () {
      await ledger.removeRelayer(relayer1.address);
      expect(await ledger.authorizedRelayers(relayer1.address)).to.be.false;
    });

    it("rejects non-owner relayer management", async function () {
      await expect(
        ledger.connect(unauthorized).addRelayer(relayer2.address)
      ).to.be.revertedWith("EvidenceAuditLedger: only owner");
    });
  });

  describe("recordEvent", function () {
    it("records an event and emits EventRecorded", async function () {
      const h = sha256Of("file-content");
      await expect(ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "UPLOADED"))
        .to.emit(ledger, "EventRecorded")
        .withArgs(EVIDENCE_ID, h, "UPLOADED", relayer1.address, (t) => t > 0);
    });

    it("appends multiple events to the audit history", async function () {
      const h = sha256Of("file-content");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "UPLOADED");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "VERIFIED");

      const history = await ledger.getAuditHistory(EVIDENCE_ID);
      expect(history.length).to.equal(2);
      expect(history[0].action).to.equal("UPLOADED");
      expect(history[1].action).to.equal("VERIFIED");
      expect(history[1].actorAddress).to.equal(relayer1.address);
    });

    it("rejects unauthorized callers", async function () {
      const h = sha256Of("file-content");
      await expect(
        ledger.connect(unauthorized).recordEvent(EVIDENCE_ID, h, "UPLOADED")
      ).to.be.revertedWith("EvidenceAuditLedger: caller is not an authorized relayer");
    });

    it("rejects an invalid SHA-256", async function () {
      await expect(
        ledger.connect(relayer1).recordEvent(EVIDENCE_ID, "not-a-hash", "UPLOADED")
      ).to.be.revertedWith("EvidenceAuditLedger: invalid SHA-256 hash");
    });

    it("rejects an unsupported action", async function () {
      const h = sha256Of("file-content");
      await expect(
        ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "DELETED")
      ).to.be.revertedWith("EvidenceAuditLedger: unsupported action");
    });
  });

  describe("verifyHash", function () {
    it("returns true when hash matches the latest record", async function () {
      const h = sha256Of("original");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "UPLOADED");

      const [valid, count] = await ledger.verifyHash(EVIDENCE_ID, h);
      expect(valid).to.be.true;
      expect(count).to.equal(1);
    });

    it("returns false on tamper (hash mismatch)", async function () {
      const original = sha256Of("original");
      const tampered = sha256Of("tampered");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, original, "UPLOADED");

      const [valid] = await ledger.verifyHash(EVIDENCE_ID, tampered);
      expect(valid).to.be.false;
    });

    it("returns false for unknown evidence", async function () {
      const [valid, count] = await ledger.verifyHash("NONEXISTENT", "a".repeat(64));
      expect(valid).to.be.false;
      expect(count).to.equal(0);
    });
  });

  describe("History helpers", function () {
    it("returns event count", async function () {
      const h = sha256Of("f");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "UPLOADED");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "VERIFIED");
      expect(await ledger.eventCount(EVIDENCE_ID)).to.equal(2);
    });

    it("returns a record by index", async function () {
      const h = sha256Of("f");
      await ledger.connect(relayer1).recordEvent(EVIDENCE_ID, h, "UPLOADED");

      const rec = await ledger.getRecord(EVIDENCE_ID, 0);
      expect(rec.sha256Hash).to.equal(h);
      expect(rec.timestamp).to.be.gt(0);
    });
  });
});
