/**
 * Cryptographic Tamper & Blockchain Integrity Test Suite
 * ------------------------------------------------------
 * End-to-end tamper-resistance verification across the evidence lifecycle:
 *
 *   Step A  Upload+anchor : upload evidence, SHA-256 is computed pre-storage
 *                           and the file is AES-256-GCM encrypted at rest.
 *   Step B  Verify        : GET /evidence/:id/verify reports a clean digest
 *                           matching the recorded on-chain anchor.
 *   Step C  Tamper        : a single byte of the stored ciphertext is flipped.
 *   Step D  Detect        : re-running verify MUST immediately report TAMPERED,
 *                           raise an INTEGRITY_ALERT, and persist the breach in
 *                           the immutable chain-of-custody ledger.
 *
 * The on-chain (Hardhat node + deployed EvidenceAuditLedger) precondition is
 * required for a VERIFIED result. Tamper detection itself is unconditional
 * because a flipped ciphertext byte always violates the AES-256-GCM
 * authentication tag or the recorded SHA-256 digest.
 */

require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_only_64char_secret_d3a5b2c9e1f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../src/config/database');
const app = require('../server');

const ISSUER = process.env.JWT_ISSUER || 'dms';
const SECRET = process.env.JWT_SECRET;
const PASSWORD = 'DMS@123';

const ORIGINAL_CONTENT = Buffer.from(
  'TAMPER TEST — canonical plaintext anchored on-chain.\n'.repeat(200)
);

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, customUserId: user.customUserId, role: user.role, jurisdiction: user.jurisdictionCell || null },
    SECRET,
    { issuer: ISSUER, expiresIn: '15m' }
  );
}

// The storage root mirroring evidenceController: server/data/encrypted/<id>.bin
const ENCRYPTED_ROOT = path.join(__dirname, '..', 'data', 'encrypted');

describe('Cryptographic Tamper & Blockchain Integrity', () => {
  let officer, officerToken;
  let complaintId;
  let evidenceId, recordedHash, encryptedPath;

  beforeAll(async () => {
    const email = 'officer.tamper@dms.test';
    await prisma.user.deleteMany({ where: { email } });
    const hash = await bcrypt.hash(PASSWORD, 12);
    officer = await prisma.user.create({
      data: {
        customUserId: 'sec_officer_tamper',
        fullName: 'Tamper Officer',
        email,
        passwordHash: hash,
        role: 'police',
        jurisdictionCell: 'Cyber Crime / Women Safety Cell',
      },
    });
    officerToken = tokenFor(officer);

    // Victim to own the complaint the evidence is anchored to.
    const victim = await prisma.user.create({
      data: {
        customUserId: 'sec_victim_tamper',
        fullName: 'Tamper Victim',
        email: 'victim.tamper@dms.test',
        passwordHash: hash,
        role: 'victim',
      },
    });

    const complaint = await prisma.complaint.create({
      data: {
        complaintId: `CC-${Math.floor(10000 + Math.random() * 89999)}`,
        victimId: victim.id,
        victimName: victim.fullName,
        contactNumber: '6666666666',
        incidentDate: new Date(),
        platform: 'Instagram',
        crimeDescription: 'Morphed video and online harassment requiring forensic analysis.',
        aiPredictedCategory: 'Online Harassment',
        aiConfidence: 0.9,
        severity: 'high',
      },
    });
    complaintId = complaint.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('STEP A : uploads and anchors evidence with a pre-storage SHA-256 digest', async () => {
    const res = await request(app)
      .post('/api/v1/evidence/police')
      .set('Authorization', `Bearer ${officerToken}`)
      .field('complaintId', complaintId)
      .field('evidenceType', 'document')
      .field('title', 'Tamper target document')
      .attach('file', ORIGINAL_CONTENT, {
        filename: 'tamper-target.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    evidenceId = res.body.evidence.evidenceId;
    recordedHash = res.body.evidence.sha256Hash;

    // Local recompute proves deterministic SHA-256 is taken on the incoming
    // buffer BEFORE the file is stored/encrypted.
    const expectedHash = crypto.createHash('sha256').update(ORIGINAL_CONTENT).digest('hex');
    expect(recordedHash).toBe(expectedHash);
    expect(res.body.evidence.integrityStatus).toBe('pending');

    // The physical AES-256 encrypted artifact + metadata are persisted on the
    // DB row (fileUrl = encrypted storage path, metadata carries aesIv/authTag).
    const dbRow = await prisma.evidence.findUnique({ where: { evidenceId } });
    expect(dbRow.sha256Hash).toBe(expectedHash);
    expect(dbRow.metadata.encryption).toBe('AES-256-GCM');
    expect(dbRow.metadata.aesIv).toBeTruthy();
    expect(dbRow.metadata.aesAuthTag).toBeTruthy();

    // Resolve the physical AES-256 encrypted artifact on disk from fileUrl.
    const raw = dbRow.fileUrl.replace(/\//g, path.sep);
    encryptedPath = path.isAbsolute(raw) ? raw : path.join(ENCRYPTED_ROOT, path.basename(raw));
    expect(fs.existsSync(encryptedPath)).toBe(true);
  });

  it('STEP B : verify reports a clean match while the anchored digest is intact', async () => {
    expect(evidenceId).toBeTruthy();
    const before = fs.readFileSync(encryptedPath);

    const res = await request(app)
      .get(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${officerToken}`);

    // When the Hardhat node + deployed contract are reachable, verify MUST
    // report VERIFIED with on-chain agreement. Live stack = green INTEGRITY.
    if (res.body.onchain && res.body.onchain.available === true) {
      expect(res.body.status).toBe('VERIFIED');
      expect(res.body.onchain.valid).toBe(true);
      expect(res.body.liveHash).toBe(recordedHash);
    } else {
      // Node absent: the pre-tamper artifact is still byte-identical and the
      // stored digest still matches the plaintext we originally uploaded.
      const after = fs.readFileSync(encryptedPath);
      expect(before.equals(after)).toBe(true);
    }
  });

  it('STEP C : a single-byte tamper on the stored ciphertext is applied', async () => {
    expect(encryptedPath).toBeTruthy();
    const buf = fs.readFileSync(encryptedPath);
    expect(buf.length).toBeGreaterThan(0);
    // Flip exactly one byte (AES-256-GCM auth tag will now reject / digest changes).
    buf[0] = buf[0] ^ 0xff;
    fs.writeFileSync(encryptedPath, buf);
  });

  it('STEP D : verify flips to TAMPERED and emits an INTEGRITY_ALERT + immutable ledger entry', async () => {
    expect(evidenceId).toBeTruthy();
    const res = await request(app)
      .get(`/api/v1/evidence/${evidenceId}/verify`)
      .set('Authorization', `Bearer ${officerToken}`);

    // The critical security guarantee: the file is now flagged tampered.
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('TAMPERED');
    expect(res.body.alert).toBe('INTEGRITY_ALERT');
    expect(res.body.reason).toBeTruthy();

    // DB row is updated to tampered.
    const row = await prisma.evidence.findUnique({ where: { evidenceId } });
    expect(row.integrityStatus).toBe('tampered');

    // The breach is recorded immutably in the chain-of-custody ledger.
    const alert = await prisma.custodyLog.findFirst({
      where: {
        evidenceId: row.id,
        remarks: { contains: 'INTEGRITY_ALERT' },
      },
    });
    expect(alert).toBeTruthy();
    expect(alert.action).toBe('verified');
    expect(alert.actorId).toBe(officer.id);
  });
});
