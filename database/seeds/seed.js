/**
 * Secure Evidence DMS database seed script.
 *
 * Populates demo users matching the Secure Evidence DMS UI, plus a sample
 * complaint, case, evidence set, and historical chain-of-custody records.
 *
 * Usage (from repository root, after `npm install` in /server):
 *   node database/seeds/seed.js
 *
 * Requires DATABASE_URL in the environment (see server/.env.example).
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

// Precomputed sha256 (not real file hashes; placeholder for demo records)
function fakeSha256(seed) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(seed).digest('hex');
}

const DEMO_USERS = [
  {
    customUserId: 'victim_jane',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+91-9812345678',
    password: DEMO_PASSWORD,
    role: 'victim',
  },
  {
    customUserId: 'Rahul123',
    fullName: 'Inspector Rahul Sharma',
    email: 'rahul.sharma@cyber.gov',
    phone: '+91-9123456780',
    password: DEMO_PASSWORD,
    role: 'police',
    badgeNumber: 'BH-CRC-1847',
    jurisdictionCell: 'Cyber Crime / Women Safety Cell',
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
    {
    customUserId: 'admin_sih',
    fullName: 'System Administrator',
    email: 'admin@dms.gov',
    phone: '6264026256',
    password: DEMO_PASSWORD,
    role: 'admin',
    badgeNumber: 'ADM-0001',
    jurisdictionCell: 'Central Administration',
  },
];

async function upsertUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const created = {};

  for (const user of DEMO_USERS) {
    // Drop the plaintext `password` field (not a Prisma User model attribute);
    // only the separately hashed `passwordHash` is persisted.
    const { password: _pw, ...userData } = user;

    const record = await prisma.user.upsert({
      where: { customUserId: user.customUserId },
      update: { ...userData, passwordHash },
      create: { ...userData, passwordHash },
    });
    created[user.customUserId] = record.id;
    console.log(`  user: ${user.customUserId} (${user.role})`);
  }

  return created;
}

async function seedComplaint(victimId) {
  const complaint = await prisma.complaint.upsert({
    where: { complaintId: 'CC-10482' },
    update: {},
    create: {
      complaintId: 'CC-10482',
      victimId,
      victimName: 'Jane Doe',
      contactNumber: '+91-9812345678',
      incidentDate: new Date('2026-01-15T09:30:00Z'),
      platform: 'Instagram',
      crimeDescription:
        'Unauthorized access to my Instagram account. The account was used to send phishing messages to my contacts and images from my profile were stolen and posted elsewhere without consent.',
      location: 'Mumbai, Maharashtra',
      additionalDetails:
        'Suspected the attacker gained access via a phishing link received on WhatsApp. No financial loss but privacy compromised significantly.',
      aiPredictedCategory: 'online_account_hacking',
      aiConfidence: 0.91,
      severity: 'high',
      assignedCell: 'Cyber Crime / Women Safety Cell',
      status: 'case_created',
    },
  });

  console.log(`  complaint: ${complaint.complaintId}`);
  return complaint;
}

async function seedCase(complaintId, officerId) {
  const caseRecord = await prisma.case.upsert({
    where: { caseId: 'CYB-1042' },
    update: {},
    create: {
      caseId: 'CYB-1042',
      complaintId,
      assignedOfficerId: officerId,
      caseTitle: 'Instagram Account Takeover & Cyber Harassment',
      status: 'under_investigation',
      riskScore: 0.78,
    },
  });

  console.log(`  case: ${caseRecord.caseId}`);
  return caseRecord;
}

async function seedEvidence(caseId, complaintId, victimId, officerId, forensicId) {
  const EVIDENCE = [
    {
      evidenceId: 'E-001',
      sourceType: 'victim',
      evidenceType: 'screenshot',
      uploadedById: victimId,
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
      uploadedById: victimId,
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
      uploadedById: forensicId,
      fileUrl: 's3://dms-evidence/E-009_forensic_report.pdf',
      seed: 'E-009-digital-forensics-report',
      metadata: {
        labName: 'Digital Forensics Lab',
        analysisType: 'account_activity_analysis',
        captureTimestamp: '2026-01-20T10:00:00Z',
      },
    },
  ];

  const evidenceIds = {};
  for (const item of EVIDENCE) {
    const record = await prisma.evidence.upsert({
      where: { evidenceId: item.evidenceId },
      update: {},
      create: {
        evidenceId: item.evidenceId,
        caseId,
        complaintId,
        uploadedById: item.uploadedById,
        sourceType: item.sourceType,
        evidenceType: item.evidenceType,
        fileUrl: item.fileUrl,
        sha256Hash: fakeSha256(item.seed),
        integrityStatus: 'verified',
        metadata: item.metadata,
      },
    });
    evidenceIds[item.evidenceId] = record.id;
    console.log(`  evidence: ${item.evidenceId}`);
  }

  return evidenceIds;
}

// Complete chronological chain-of-custody matching the UI 6-stage timeline.
const CUSTODY_TIMELINE = [
  // E-001 (victim screenshot)
  { evidence: 'E-001', actor: 'victim_jane', action: 'uploaded', remark: 'Evidence uploaded by victim' },
  { evidence: 'E-001', actor: 'Rahul123', action: 'received', remark: 'Received by Cyber Crime Cell' },
  { evidence: 'E-001', actor: 'Rahul123', action: 'verified', remark: 'SHA-256 matched on-chain anchor' },
  { evidence: 'E-001', actor: 'forensic_anil', action: 'accessed', remark: 'Forensic review of screenshot' },
  { evidence: 'E-001', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Device provenance confirmed' },
  // E-002 (victim chat export — tamper target)
  { evidence: 'E-002', actor: 'victim_jane', action: 'uploaded', remark: 'Evidence uploaded by victim' },
  { evidence: 'E-002', actor: 'Rahul123', action: 'received', remark: 'Received by Cyber Crime Cell' },
  { evidence: 'E-002', actor: 'Rahul123', action: 'verified', remark: 'SHA-256 matched on-chain anchor' },
  { evidence: 'E-002', actor: 'forensic_anil', action: 'accessed', remark: 'Threat-video domain analysis' },
  { evidence: 'E-002', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Synthetic-media review complete' },
  // E-009 (forensic report)
  { evidence: 'E-009', actor: 'forensic_anil', action: 'uploaded', remark: 'Forensic report uploaded' },
  { evidence: 'E-009', actor: 'forensic_anil', action: 'analysis_completed', remark: 'Account activity analysis completed' },
  { evidence: 'E-009', actor: 'Rahul123', action: 'received', remark: 'Report received for case file' },
  // Courtroom judicial sign-off (judge) anchored on the primary evidence
  { evidence: 'E-009', actor: 'legal_verma', action: 'report_generated', remark: 'Final investigation report digitally signed by judiciary' },
];

async function seedCustody(evidenceIds, userIds, caseId) {
  // Clear existing timeline for a clean demo (only for our seeded evidence)
  for (const evId of Object.values(evidenceIds)) {
    await prisma.custodyLog.deleteMany({ where: { evidenceId: evId } });
  }

  for (const entry of CUSTODY_TIMELINE) {
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceIds[entry.evidence] },
      select: { sha256Hash: true },
    });

    await prisma.custodyLog.create({
      data: {
        evidenceId: evidenceIds[entry.evidence],
        actorId: userIds[entry.actor],
        actorRole: DEMO_USERS.find((u) => u.customUserId === entry.actor).role,
        action: entry.action,
        recordedSha256Hash: evidence.sha256Hash,
        remarks: entry.remark,
      },
    });
    console.log(`  custody: E-${entry.evidence} <- ${entry.action} by ${entry.actor}`);
  }
}

async function main() {
  console.log('Seeding Secure Evidence DMS database...');

  const userIds = await upsertUsers();

  const victimId = userIds.victim_jane;
  const officerId = userIds.Rahul123;
  const forensicId = userIds.forensic_anil;

  const complaint = await seedComplaint(victimId);
  const caseRecord = await seedCase(complaint.id, officerId);
    await seedCaseAssignments(
    caseRecord.id,
    officerId,
    forensicId,
    userIds
  );
  const evidenceIds = await seedEvidence(caseRecord.id, complaint.id, victimId, officerId, forensicId);
  await seedCustody(evidenceIds, userIds, caseRecord.id);

  console.log('\nSeed complete.');
  console.log(`Demo login (customUserId / password): ${DEMO_PASSWORD}`);
  console.log('  victim_jane (Victim)');
  console.log('  Rahul123 (Police)');
  console.log('  forensic_anil (Forensic/Investigator)');
  console.log('  legal_verma (Judge)');
  console.log('  admin_sih (Admin)');
}
async function seedCaseAssignments(
  caseId,
  officerId,
  forensicId,
  userIds
) {
  const assignments = [
    {
      userId: officerId,
      assignedRole: 'police',
    },
    {
      userId: forensicId,
      assignedRole: 'forensic',
    },
    {
      userId: userIds.legal_verma,
      assignedRole: 'judge',
    },
  ];

  for (const assignment of assignments) {
    await prisma.caseAssignment.upsert({
      where: {
        caseId_userId: {
          caseId,
          userId: assignment.userId,
        },
      },
      update: {
        assignedRole: assignment.assignedRole,
        assignedBy: officerId,
        status: 'active',
      },
      create: {
        caseId,
        userId: assignment.userId,
        assignedRole: assignment.assignedRole,
        assignedBy: officerId,
        status: 'active',
      },
    });

    console.log(
      `  assignment: ${assignment.userId} -> ${assignment.assignedRole}`
    );
  }

  // Admin has global access through RBAC and does not need
  // a case assignment.
}
main()
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
