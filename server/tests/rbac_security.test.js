/**
 * Zero-Trust RBAC & Boundary Security Test Suite
 * -------------------------------------------------
 * Verifies the strict, zero-trust role-based access-control boundaries of the
 * Secure Evidence DMS REST API:
 *
 *   1. Unauthorized role escalation     -> victim token MUST get 403 on every
 *                                          law-enforcement/legal endpoint.
 *   2. Token tampering                  -> an altered JWT signature MUST yield
 *                                          401, never 200/403.
 *   3. Multi-tenant case boundary       -> an unassigned officer from cell A
 *                                          MUST be denied mutation of a sealed
 *                                          case assigned to an officer in cell B.
 *
 * Requires a reachable PostgreSQL database (DATABASE_URL) and the server JWT
 * secret. Victims see only status snapshots; they never reach internal,
 * forensic, custody, or report payloads.
 */

require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_only_64char_secret_d3a5b2c9e1f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../src/config/database');
const app = require('../server');

const ISSUER = process.env.JWT_ISSUER || 'dms';
const SECRET = process.env.JWT_SECRET;
const PASSWORD = 'DMS@123';

// Realistic jurisdictions used for the multi-tenant boundaries.
const CELL_A = 'Cyber Crime / Women Safety Cell';
const CELL_B = 'Cyber Crime Cell (Financial)';

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, customUserId: user.customUserId, role: user.role, jurisdiction: user.jurisdictionCell || null },
    SECRET,
    { issuer: ISSUER, expiresIn: '15m' }
  );
}

// Corrupt the trailing signature portion of an otherwise-valid token.
function tamperedToken(user) {
  const good = tokenFor(user);
  const [h, p, sig] = good.split('.');
  const flipped = Buffer.from(sig, 'base64url')
    .map((b, i) => (i === 0 ? b ^ 0x01 : b))
    .toString('base64url');
  return `${h}.${p}.${flipped}`;
}

describe('Zero-Trust RBAC & Boundary Security', () => {
  let victim, officerA, officerB, judge, forensicOfficer;
  let victimToken, victimTampered;
  let ownedByVictimCaseId;
  let sealedCaseIdB;
  let otherVictimsCaseId;

  beforeAll(async () => {
    // Idempotent cleanup, then create a clean test population.
    const emails = [
      'victim.boundary@dms.test',
      'officer.cella@dms.test',
      'officer.cellb@dms.test',
      'judge.boundary@dms.test',
      'other.victim@dms.test',
      'forensic.boundary@dms.test',
    ];
    await prisma.user.deleteMany({ where: { email: { in: emails } } });

    const hash = await bcrypt.hash(PASSWORD, 12);
    victim = await prisma.user.create({
      data: {
        customUserId: 'sec_victim_jane',
        fullName: 'Boundary Victim',
        email: emails[0],
        passwordHash: hash,
        role: 'victim',
      },
    });
    officerA = await prisma.user.create({
      data: {
        customUserId: 'sec_officer_cellA',
        fullName: 'Boundary Officer A',
        email: emails[1],
        passwordHash: hash,
        role: 'police',
        jurisdictionCell: CELL_A,
      },
    });
    officerB = await prisma.user.create({
      data: {
        customUserId: 'sec_officer_cellB',
        fullName: 'Boundary Officer B',
        email: emails[2],
        passwordHash: hash,
        role: 'police',
        jurisdictionCell: CELL_B,
      },
    });
    judge = await prisma.user.create({
      data: {
        customUserId: 'sec_judge_verma',
        fullName: 'Boundary Judge',
        email: emails[3],
        passwordHash: hash,
        role: 'judge',
      },
    });
    forensicOfficer = await prisma.user.create({
      data: {
        customUserId: 'sec_forensic_anil',
        fullName: 'Boundary Forensic Officer',
        email: emails[5],
        passwordHash: hash,
        role: 'forensic',
        jurisdictionCell: 'Digital Forensics Lab',
      },
    });

    // --- Victim owns a complaint + a case (status-boundary fixture) ---
    const victimComplaint = await prisma.complaint.create({
      data: {
        complaintId: `CC-${Math.floor(10000 + Math.random() * 89999)}`,
        victimId: victim.id,
        victimName: victim.fullName,
        contactNumber: '9999999999',
        incidentDate: new Date(),
        platform: 'Instagram',
        crimeDescription: 'Repeated online harassment and threats after account takeover.',
        aiPredictedCategory: 'Online Harassment',
        aiConfidence: 0.92,
        severity: 'high',
      },
    });
    const ownedCase = await prisma.case.create({
      data: {
        caseId: `CYB-${Math.floor(1000 + Math.random() * 9000)}`,
        complaintId: victimComplaint.id,
        assignedOfficerId: officerA.id,
        caseTitle: 'Boundary victim case',
        status: 'under_investigation',
      },
    });
    ownedByVictimCaseId = ownedCase.id;

    // --- A "sealed" case in jurisdiction B assigned to officerB ---
    const complaintB = await prisma.complaint.create({
      data: {
        complaintId: `CC-${Math.floor(10000 + Math.random() * 89999)}`,
        victimId: victim.id,
        victimName: victim.fullName,
        contactNumber: '8888888888',
        incidentDate: new Date(),
        platform: 'WhatsApp',
        crimeDescription: 'Financial fraud via a fake customer-care UPI call requesting an OTP.',
        aiPredictedCategory: 'Financial Fraud',
        aiConfidence: 0.88,
        severity: 'critical',
      },
    });
    const sealedCase = await prisma.case.create({
      data: {
        caseId: `CYB-${Math.floor(1000 + Math.random() * 9000)}`,
        complaintId: complaintB.id,
        assignedOfficerId: officerB.id,
        caseTitle: 'Sealed financial fraud (Cell B)',
        status: 'chargesheet_filed',
      },
    });
    sealedCaseIdB = sealedCase.id;

    // --- A second citizen owns a separate case (cross-citizen boundary) ---
    const otherVictim = await prisma.user.create({
      data: {
        customUserId: 'sec_victim_other',
        fullName: 'Other Citizen',
        email: emails[4],
        passwordHash: hash,
        role: 'victim',
      },
    });
    const otherComplaint = await prisma.complaint.create({
      data: {
        complaintId: `CC-${Math.floor(10000 + Math.random() * 89999)}`,
        victimId: otherVictim.id,
        victimName: otherVictim.fullName,
        contactNumber: '5555555555',
        incidentDate: new Date(),
        platform: 'Facebook',
        crimeDescription: 'Unauthorized access and private data exposure on a public forum.',
        aiPredictedCategory: 'Data Breach',
        aiConfidence: 0.7,
        severity: 'medium',
      },
    });
    const otherCase = await prisma.case.create({
      data: {
        caseId: `CYB-${Math.floor(1000 + Math.random() * 9000)}`,
        complaintId: otherComplaint.id,
        assignedOfficerId: officerA.id,
        caseTitle: 'Another citizen case',
        status: 'open',
      },
    });
    otherVictimsCaseId = otherCase.id;

    victimToken = tokenFor(victim);
    victimTampered = tamperedToken(victim);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Unauthorized Role Escalation (victim => law-enforcement surfaces)', () => {
    it('denies victim the aggregate internal case list (403)', async () => {
      const res = await request(app).get('/api/v1/cases').set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
      expect(res.body.allowed_roles).not.toBeUndefined();
    });

    it('denies victim the internal complaint list (403)', async () => {
      const res = await request(app)
        .get('/api/v1/cases/complaints')
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
    });

    it('denies victim the police/forensic evidence upload (403)', async () => {
      const res = await request(app)
        .post('/api/v1/evidence/police')
        .set('Authorization', `Bearer ${victimToken}`)
        .attach('file', Buffer.from('cctv-bytes'), 'cctv.mp4')
        .field('complaintId', '00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(403);
    });

    it('denies victim the forensic evidence vault (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/evidence/case/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
    });

    it('denies victim the internal custody ledger writes (403)', async () => {
      const res = await request(app)
        .post('/api/v1/custody/log')
        .set('Authorization', `Bearer ${victimToken}`)
        .send({ evidenceId: 'E-999', action: 'accessed', remarks: 'escalation attempt' });
      expect(res.status).toBe(403);
    });

    it('denies victim the internal custody timeline (403)', async () => {
      const res = await request(app)
        .get('/api/v1/custody/E-999')
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
    });

    it('denies victim the final investigation report (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/reports/case/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
    });

    it('denies victim access to a case owned by another citizen (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/cases/${otherVictimsCaseId}`)
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('2. Token Tampering & Boundary Integrity', () => {
    it('rejects a tampered JWT signature with 401 (never 200/403)', async () => {
      const res = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${victimTampered}`);
      expect(res.status).toBe(401);
    });

    it('rejects a token signed with a wrong secret', async () => {
      const evil = jwt.sign(
        { id: victim.id, customUserId: victim.customUserId, role: 'admin', jurisdiction: null },
        'attacker_forged_secret_that_does_not_match_server',
        { issuer: ISSUER, expiresIn: '15m' }
      );
      const res = await request(app)
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${evil}`);
      expect(res.status).toBe(401);
    });

    it('rejects requests with a missing Authorization header', async () => {
      const res = await request(app).get('/api/v1/cases');
      expect(res.status).toBe(401);
    });
  });

  describe('3. Multi-Tenant Case Boundary (Cell A vs sealed Cell B case)', () => {
    it('denies an unassigned officer from Cell A mutating a sealed Cell B case (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/cases/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${tokenFor(officerA)}`)
        .send({ status: 'court_disposed', riskScore: 0.99 });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not the assigned officer');
    });

    it('allows the assigned Cell B officer authority over their own sealed case (200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/cases/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${tokenFor(officerB)}`)
        .send({ riskScore: 0.95 });
      expect(res.status).toBe(200);
      expect(res.body.case.assignedOfficerId).toBe(officerB.id);
    });
  });

  describe('4. Judge Read-Only Access', () => {
    it('grants a judge read access to a final case but not mutation (403 on PATCH)', async () => {
      const read = await request(app)
        .get(`/api/v1/cases/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${tokenFor(judge)}`);
      expect(read.status).toBe(200);
      expect(read.body.case.caseId).toBeTruthy();

      const mut = await request(app)
        .patch(`/api/v1/cases/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${tokenFor(judge)}`)
        .send({ status: 'court_disposed' });
      expect(mut.status).toBe(403);
    });
  });

  describe('4b. Forensic (alias of investigator) Access', () => {
    it('grants a forensic officer read access to the evidence vault (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/evidence/case/${sealedCaseIdB}`)
        .set('Authorization', `Bearer ${tokenFor(forensicOfficer)}`);
      expect(res.status).toBe(200);
      expect(res.body.evidences).toBeDefined();
    });

    it('grants a forensic officer access to the internal custody timeline (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/custody/E-999`)
        .set('Authorization', `Bearer ${tokenFor(forensicOfficer)}`);
      // A valid forensic token passes the RBAC gate (route may 404 on missing
      // evidence, but must NOT be 401/403).
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  describe('5. Victim Self-Service (own data only)', () => {
    it('allows a victim to read their OWN case status snapshot (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/cases/${ownedByVictimCaseId}`)
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(200);
      // A victim snapshot must NOT include forensic/evidence internals.
      expect(res.body.case.status).toBe('under_investigation');
      expect(res.body.case.evidence).toBeUndefined();
      expect(res.body.case.complaint).toBeUndefined();
    });

    it('allows a victim to create a complaint for themselves (201)', async () => {
      const res = await request(app)
        .post('/api/v1/cases/complaints')
        .set('Authorization', `Bearer ${victimToken}`)
        .send({
          title: 'Fake account impersonation',
          description: 'A fake account is impersonating me and sharing my photos to defraud my contacts.',
          crimeType: 'identity_theft',
          victimEmail: victim.email,
          victimName: victim.fullName,
          contactNumber: '7777777777',
          incidentDate: '2026-08-01',
          platform: 'Telegram',
          crimeDescription: 'Suspected data breach and fake account impersonation on my profile.',
          aiPredictedCategory: 'Identity Theft',
          aiConfidence: 0.8,
          severity: 'medium',
          location: 'Pune',
        });
      expect(res.status).toBe(201);
      expect(res.body.complaint.complaintId).toMatch(/^CC-\d{5}$/);
    });
  });
});
