/**
 * Secure Evidence DMS Hackathon Demo Seed
 * ------------------------------------------------------------------
 * Production-grade, idempotent demo dataset for the SIH 2026 evaluation.
 *
 *  - FLUSHES the demo rows (custody -> evidence -> case -> complaint)
 *    and re-seeds a deterministic scenario so every run starts identical.
 *  - Users:
 *       Rahul123      (police,       "Head Constable Rahul Kumar")
 *       victim_jane   (victim)
 *       forensic_anil (investigator, Digital Forensics Lab)
 *       legal_verma   (judge,        read-only courtroom access)
 *  - Case CYB-1042 with evidence E-001 / E-002 / E-009 and a complete
 *    6-stage chain of custody ending in judicial report sign-off.
 *
 * Usage (represents blockchain redeploy + DB reset; run from repo root):
 *   1) cd contracts && npx hardhat run scripts/deploy.js --network localhost
 *   2) node database/seeds/hackathon_demo_seed.js
 *
 * Requires DATABASE_URL (see server/.env.example) and
 * server/node_modules to be installed.
 */
const path = require('path');

// Load server/.env so DATABASE_URL (and other secrets) are available at runtime.
require(path.join(__dirname, '../../server/node_modules/dotenv')).config({
  path: path.join(__dirname, '../../server/.env'),
});

// Resolve shared dependencies from the /server workspace so a single schema
// and module set is used regardless of the current working directory.
const bcrypt = require(path.join(__dirname, '../../server/node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(__dirname, '../../server/node_modules/@prisma/client'));

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 12;

function fakeSha256(seed) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(seed).digest('hex');
}

const DEMO_USERS = [
  {
    customUserId: 'Rahul123',
    fullName: 'Head Constable Rahul Kumar',
    email: 'rahul.kumar@cyber.gov',
    phone: '+91-9123456780',
    password: DEMO_PASSWORD,
    role: 'police',
    badgeNumber: 'BH-CRC-1847',
    jurisdictionCell: 'Cyber Crime / Women Safety Cell',
  },
  {
    customUserId: 'victim_jane',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+91-9812345678',
    password: DEMO_PASSWORD,
    role: 'victim',
  },
  {
    customUserId: 'forensic_anil',
    fullName: 'Forensic Officer Anil Kumar',
    email: 'anil@forensic.gov',
    phone: '+91-9988776655',
    password: DEMO_PASSWORD,
    role: 'forensic',
    badgeNumber: 'DFL-0291',
    jurisdictionCell: 'Digital Forensics Lab',
  },
  {
    customUserId: 'legal_verma',
    fullName: 'Justice Amit Verma',
    email: 'verma@courts.gov',
    phone: '+91-9887766554',
    password: DEMO_PASSWORD,
    role: 'judge',
    badgeNumber: 'JD-1023',
    jurisdictionCell: 'Cyber Crimes Court',
  },
];

const COMPLAINT = {
  complaintId: 'CC-10482',
  victimName: 'Jane Doe',
  contactNumber: '+91-9812345678',
  incidentDate: new Date('2026-01-15T09:30:00Z'),
  platform: 'Instagram',
  crimeDescription:
    'Unauthorized access to my Instagram account. The account was used to send phishing messages to my contacts and images from my profile were stolen and posted elsewhere without consent.',
  location: 'Mumbai, Maharashtra',
  additionalDetails:
    'Suspected the attacker gained access via a phishing link received on WhatsApp. No financial loss but privacy compromised significantly.',
  aiPredictedCategory: 'Online Harassment',
  aiConfidence: 0.92,
  severity: 'high',
  assignedCell: 'Cyber Crime / Women Safety Cell',
  status: 'case_created',
};

const CASE = {
  caseId: 'CYB-1042',
  caseTitle: 'Instagram Account Takeover & Cyber Harassment',
  status: 'under_investigation',
  riskScore: 0.78,
};

const EVIDENCE = [
  {
    evidenceId: 'E-001',
    sourceType: 'victim',
    evidenceType: 'screenshot',
    uploadedBy: 'victim_jane',
    fileUrl: 's3://dms-evidence/E-001_screenshot.jpg',
    seed: 'E-001-instagram-hacked-screenshot',
    metadata: {
      deviceInfo: 'iPhone 13',
      captureTimestamp: '2026-01-15T12:00:00Z',
      sourceUrl: 'https://instagram.com/p/ab12',
      ocrText: 'Security alert: new login from unknown device',
    },
  },
  {
    evidenceId: 'E-002',
    sourceType: 'victim',
    evidenceType: 'chat_export',
    uploadedBy: 'victim_jane',
    fileUrl: 's3://dms-evidence/E-002_whatsapp_export.txt',
    seed: 'E-002-whatsapp-phishing-chat',
    metadata: {
      platform: 'WhatsApp',
      captureTimestamp: '2026-01-15T13:00:00Z',
      sourceUrl: 'https://wa.me/919876543210',
    },
  },
  {
    evidenceId: 'E-009',
    sourceType: 'forensic',
    evidenceType: 'document',
    uploadedBy: 'forensic_anil',
    fileUrl: 's3://dms-evidence/E-009_forensic_report.pdf',
    seed: 'E-009-digital-forensics-report',
    metadata: {
      labName: 'Digital Forensics Lab',
      analysisType: 'account_activity_analysis',
      captureTimestamp: '2026-01-20T10:00:00Z',
    },
  },
];

// Complete, chronological 6-stage chain of custody matching the UI timeline.
const CUSTODY_TIMELINE = [
  // E-001 (victim screenshot)
  { evidence: 'E-001', actor: 'victim_jane', action: 'uploaded', remark: 'Evidence uploaded by victim' },
  { evidence: 'E-001', actor: 'Rahul123', action: 'received', remark: 'Received by Cyber Crime Cell' },
  { evidence: 'E-001', actor: 'Rahul123', action: 'verified', remark: 'SHA-256 matched on-chain anchor' },
  { evidence: 'E-001', actor: 'forensic_anil', action: 'accessed', remark: 'Forensic review of screenshot' },
  { evidence: 'E-001', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Device provenance confirmed' },
  // E-002 (victim chat export - tamper target)
  { evidence: 'E-002', actor: 'victim_jane', action: 'uploaded', remark: 'Evidence uploaded by victim' },
  { evidence: 'E-002', actor: 'Rahul123', action: 'received', remark: 'Received by Cyber Crime Cell' },
  { evidence: 'E-002', actor: 'Rahul123', action: 'verified', remark: 'SHA-256 matched on-chain anchor' },
  { evidence: 'E-002', actor: 'forensic_anil', action: 'accessed', remark: 'Threat-video domain analysis' },
  { evidence: 'E-002', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Synthetic-media review complete' },
  // E-009 (forensic report)
  { evidence: 'E-009', actor: 'forensic_anil', action: 'uploaded', remark: 'Forensic report uploaded' },
  { evidence: 'E-009', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Account activity analysis completed' },
  { evidence: 'E-009', actor: 'Rahul123', action: 'received', remark: 'Report received for case file' },
  // Courtroom sign-off (judge) anchored on the primary evidence
  { evidence: 'E-009', actor: 'legal_verma', action: 'report_generated', remark: 'Final investigation report digitally signed by judiciary' },
];

async function flushDemo() {
  console.log('Flushing seeded demo rows...');
  const evidenceIds = EVIDENCE.map((e) => e.evidenceId);
  await prisma.custodyLog.deleteMany({
    where: { evidence: { evidenceId: { in: evidenceIds } } },
  });
  await prisma.evidence.deleteMany({ where: { evidenceId: { in: evidenceIds } } });
  await prisma.case.deleteMany({ where: { caseId: { in: [CASE.caseId] } } });
  await prisma.complaint.deleteMany({ where: { complaintId: { in: [COMPLAINT.complaintId] } } });
  await prisma.user.deleteMany({
    where: { customUserId: { in: DEMO_USERS.map((u) => u.customUserId) } },
  });
}

async function upsertUsers() {
  let passwordHash = null;
  const ids = {};
  for (const user of DEMO_USERS) {
    if (!passwordHash) passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const record = await prisma.user.create({
      data: { ...user, passwordHash },
    });
    ids[user.customUserId] = record.id;
    console.log(`  user: ${user.customUserId} (${user.role})`);
  }
  return ids;
}

function noteRedeploy() {
  console.log('\n  > Redeploy EvidenceAuditLedger on the local node:');
  console.log('    cd contracts && npx hardhat run scripts/deploy.js --network localhost');
  console.log('  > Then set CONTRACT_ADDRESS + RELAYER_PRIVATE_KEY in server/.env');
}

async function main() {
  console.log('Secure Evidence DMS hackathon demo seed starting...\n');

  await flushDemo();
  const userIds = await upsertUsers();

  const victimId = userIds.victim_jane;
  const officerId = userIds.Rahul123;
  const forensicId = userIds.forensic_anil;

  const complaint = await prisma.complaint.create({
    data: {
      complaintId: COMPLAINT.complaintId,
      victimId,
      victimName: COMPLAINT.victimName,
      contactNumber: COMPLAINT.contactNumber,
      incidentDate: COMPLAINT.incidentDate,
      platform: COMPLAINT.platform,
      crimeDescription: COMPLAINT.crimeDescription,
      location: COMPLAINT.location,
      additionalDetails: COMPLAINT.additionalDetails,
      aiPredictedCategory: COMPLAINT.aiPredictedCategory,
      aiConfidence: COMPLAINT.aiConfidence,
      severity: COMPLAINT.severity,
      assignedCell: COMPLAINT.assignedCell,
      status: COMPLAINT.status,
    },
  });
  console.log(`  complaint: ${complaint.complaintId}`);

  const caseRecord = await prisma.case.create({
    data: {
      caseId: CASE.caseId,
      complaintId: complaint.id,
      assignedOfficerId: officerId,
      caseTitle: CASE.caseTitle,
      status: CASE.status,
      riskScore: CASE.riskScore,
    },
  });
  console.log(`  case: ${caseRecord.caseId}`);

  const evidenceRows = {};
  for (const item of EVIDENCE) {
    const ev = await prisma.evidence.create({
      data: {
        evidenceId: item.evidenceId,
        caseId: caseRecord.id,
        complaintId: complaint.id,
        uploadedById: userIds[item.uploadedBy],
        sourceType: item.sourceType,
        evidenceType: item.evidenceType,
        fileUrl: item.fileUrl,
        sha256Hash: fakeSha256(item.seed),
        integrityStatus: 'verified',
        metadata: item.metadata,
      },
    });
    evidenceRows[item.evidenceId] = ev.id;
    console.log(`  evidence: ${item.evidenceId}`);
  }

  for (const entry of CUSTODY_TIMELINE) {
    const evidenceRow = evidenceRows[entry.evidence];
    const ev = await prisma.evidence.findUnique({
      where: { id: evidenceRow },
      select: { sha256Hash: true },
    });
    await prisma.custodyLog.create({
      data: {
        evidenceId: evidenceRow,
        actorId: userIds[entry.actor],
        actorRole: DEMO_USERS.find((u) => u.customUserId === entry.actor).role,
        action: entry.action,
        recordedSha256Hash: ev.sha256Hash,
        remarks: entry.remark,
      },
    });
    console.log(`  custody: ${entry.evidence} <- ${entry.action} by ${entry.actor}`);
  }

  console.log('\nSeed complete.');
  console.log(`Demo password (customUserId): ${DEMO_PASSWORD}`);
  console.log('  Rahul123 (Police), victim_jane (Victim), forensic_anil (Investigator), legal_verma (Judge)');
  noteRedeploy();
}

main()
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
