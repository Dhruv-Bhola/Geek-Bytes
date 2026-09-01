#!/usr/bin/env node
/**
 * DMS Full System E2E Integration & Security Audit Test Suite
 * ===========================================================
 * Modules:
 *   A — Evidence Lifecycle (complaint → case → upload → anchor → verify → AI → custody → report)
 *   B — Tamper Detection + Cryptographic Integrity
 *   C — RBAC Matrix (role-based access control)
 *   D — Input Validation / Security (MIME spoof, SQL injection, JWT validation)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const API_BASE = (process.env.API_BASE || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
const AI_BASE  = (process.env.AI_BASE  || 'http://localhost:8000').replace(/\/+$/, '');
const ENCRYPTED_ROOT = path.join(__dirname, '..', 'server', 'data', 'encrypted');

// JWT_SECRET from server/.env (read at runtime for expired-token test)
let JWT_SECRET = 'super_secret_jwt_key_for_dms_platform_2026';
try {
  const envPath = path.join(__dirname, '..', 'server', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^JWT_SECRET="?([^"\n]+)"?\s*$/m);
  if (match) JWT_SECRET = match[1];
} catch (_) { /* use default */ }

// ---------------------------------------------------------------------------
// ANSI colour helpers
// ---------------------------------------------------------------------------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
};
const ok   = (m) => `${C.green}PASS${C.reset}  ${m}`;
const bad  = (m) => `${C.red}FAIL${C.reset}  ${m}`;
const warn = (m) => `${C.yellow}WARN${C.reset}  ${m}`;
const skip = (m) => `${C.yellow}SKIP${C.reset}  ${m}`;

// ---------------------------------------------------------------------------
// Counters & metrics
// ---------------------------------------------------------------------------
let passed = 0, failed = 0, skipped = 0;
const timings = [];
const moduleResults = {};
let currentModule = '';

function setModule(name) {
  currentModule = name;
  if (!moduleResults[name]) moduleResults[name] = { pass: 0, fail: 0, skip: 0, tests: [] };
}

function assert(cond, label) {
  if (cond) {
    passed++;
    if (currentModule) moduleResults[currentModule].pass++;
    if (currentModule) moduleResults[currentModule].tests.push({ label, status: 'PASS' });
    console.log('  ' + ok(label));
    return true;
  }
  failed++;
  if (currentModule) moduleResults[currentModule].fail++;
  if (currentModule) moduleResults[currentModule].tests.push({ label, status: 'FAIL' });
  console.log('  ' + bad(label));
  return false;
}

function warnAssert(cond, label) {
  if (cond) { passed++; if (currentModule) { moduleResults[currentModule].pass++; moduleResults[currentModule].tests.push({ label, status: 'PASS' }); } console.log('  ' + ok(label)); return true; }
  skipped++; if (currentModule) { moduleResults[currentModule].skip++; moduleResults[currentModule].tests.push({ label, status: 'WARN' }); } console.log('  ' + warn(label)); return false;
}

function section(title) {
  console.log('');
  console.log(C.bold + C.cyan + '══════════════════════════════════════════════════════════════════' + C.reset);
  console.log(C.bold + C.cyan + '  ' + title + C.reset);
  console.log(C.bold + C.cyan + '══════════════════════════════════════════════════════════════════' + C.reset);
}

function subsection(title) {
  console.log('');
  console.log(C.bold + C.magenta + '  ── ' + title + ' ──' + C.reset);
}

// ---------------------------------------------------------------------------
// HTTP client (axios optional, native fetch fallback)
// ---------------------------------------------------------------------------
let axiosModule = null;
try { axiosModule = require('axios'); } catch (_) { /* optional */ }

async function request(method, url, { body, token, form, rawHeaders } = {}) {
  const headers = { ...rawHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;

  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const t0 = Date.now();
  let res;
  if (axiosModule) {
    const r = await axiosModule({
      method, url, headers, data: payload,
      validateStatus: () => true,
      timeout: 15000,
    });
    res = { status: r.status, data: r.data, headers: r.headers };
  } else {
    const r = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : payload,
      signal: AbortSignal.timeout(15000),
    });
    let data = null;
    const text = await r.text();
    try { data = JSON.parse(text); } catch (_) { data = text; }
    res = { status: r.status, data, headers: Object.fromEntries(r.headers.entries()) };
  }
  timings.push(Date.now() - t0);
  return res;
}

// ---------------------------------------------------------------------------
// Demo account credentials (seeded)
// ---------------------------------------------------------------------------
const DEMO = {
  victim_jane:   { email: 'jane@example.com',      password: 'password123', role: 'victim' },
  Rahul123:      { email: 'rahul.sharma@cyber.gov', password: 'password123', role: 'police' },
  forensic_anil: { email: 'anil@forensic.gov',      password: 'password123', role: 'forensic' },
  legal_verma:   { email: 'verma@courts.gov',       password: 'password123', role: 'judge' },
};

async function login(userKey) {
  const acct = DEMO[userKey];
  if (!acct) throw new Error(`Unknown user: ${userKey}`);
  const res = await request('POST', `${API_BASE}/auth/login`, {
    body: { identifier: acct.email, password: acct.password },
  });
  const token = res.data && (res.data.accessToken || res.data.token);
  return { ...res, token };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function makeTestArtifact(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-e2e-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.from(content));
  return filePath;
}

function flipFirstByte(filePath) {
  const buf = fs.readFileSync(filePath);
  if (!buf.length) return false;
  buf[0] = buf[0] ^ 0xff;
  fs.writeFileSync(filePath, buf);
  return true;
}

function makeExeFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-e2e-mal-'));
  const filePath = path.join(dir, 'malware.exe');
  fs.writeFileSync(filePath, Buffer.from('MZ' + '\x00'.repeat(100) + 'PE\x00\x00'));
  return filePath;
}

// JWT helpers for security tests
function makeExpiredJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: '00000000-0000-0000-0000-000000000000',
    customUserId: 'fake_user',
    role: 'police',
    jurisdiction: null,
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
    iss: 'dms',
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ===========================================================================
// MODULE A — Full Evidence Lifecycle
// ===========================================================================
async function moduleA() {
  section('MODULE A — Full Evidence Lifecycle');
  const state = {};

  // A1. Victim login
  subsection('A1: Victim Login');
  const vLogin = await login('victim_jane');
  assert(vLogin.status === 200 && vLogin.token, `victim_jane login → ${vLogin.status}`);
  if (!vLogin.token) return null;
  state.victimToken = vLogin.token;

  // A2. Create complaint
  subsection('A2: File Citizen Complaint');
  const complaintRes = await request('POST', `${API_BASE}/cases/complaints`, {
    body: {
      victimName: 'Jane Doe',
      contactNumber: '+91-9812345678',
      incidentDate: new Date().toISOString(),
      platform: 'Instagram',
      crimeDescription: 'Unauthorized access to my Instagram account and phishing messages sent to my contacts without consent. Full theft of credentials.',
      location: 'Mumbai, Maharashtra',
      additionalDetails: 'E2E integration test complaint for SIH jury demo validation.',
    },
    token: state.victimToken,
  });
  assert(complaintRes.status === 201, `POST /cases/complaints → ${complaintRes.status}`);
  const complaint = (complaintRes.data && complaintRes.data.complaint) || {};
  state.complaintUUID = complaint.id;
  state.complaintId = complaint.complaintId;
  assert(typeof complaint.complaintId === 'string' && /^CC-\d{5}$/.test(complaint.complaintId),
    `complaintId = ${complaint.complaintId || '(missing)'} matches CC-\\d{5}`);
  assert(complaint.status === 'submitted', `initial complaint status = ${complaint.status}`);
  console.log(`  ${C.dim}complaint: ${complaint.complaintId} (UUID: ${String(complaint.id).slice(0, 8)}...)${C.reset}`);

  // A3. Police login + create case from complaint
  subsection('A3: Create Case from Complaint (Rahul123)');
  const pLogin = await login('Rahul123');
  assert(pLogin.status === 200 && pLogin.token, `Rahul123 login → ${pLogin.status}`);
  if (!pLogin.token) return null;
  state.policeToken = pLogin.token;

  const caseRes = await request('POST', `${API_BASE}/cases`, {
    body: {
      complaintId: state.complaintUUID,
      caseTitle: 'E2E Test — Social Media Phishing Investigation',
    },
    token: state.policeToken,
  });
  assert(caseRes.status === 201, `POST /cases/ → ${caseRes.status}`);
  const caseObj = (caseRes.data && caseRes.data.case) || {};
  state.caseUUID = caseObj.id;
  state.caseId = caseObj.caseId;
  assert(typeof caseObj.caseId === 'string' && /^CYB-\d{4}$/.test(caseObj.caseId),
    `caseId = ${caseObj.caseId || '(missing)'} matches CYB-\\d{4}`);
  assert(caseObj.status === 'open', `initial case status = ${caseObj.status}`);
  console.log(`  ${C.dim}case: ${caseObj.caseId} (UUID: ${String(caseObj.id).slice(0, 8)}...)${C.reset}`);

  // A4. Victim evidence upload (screenshot)
  subsection('A4: Victim Evidence Upload');
  const victimFile = makeTestArtifact('screenshot_instagram.png', 'FAKE_PNG_EVIDENCE_BYTES_FOR_E2E_TEST_VICTIM_UPLOAD_2026');
  const victimForm = new FormData();
  victimForm.append('file', new Blob([fs.readFileSync(victimFile)], { type: 'image/png' }), 'screenshot_instagram.png');
  victimForm.append('complaintId', state.complaintId);
  victimForm.append('evidenceType', 'screenshot');

  const victimUp = await request('POST', `${API_BASE}/evidence/victim`, { form: victimForm, token: state.victimToken });
  assert(victimUp.status === 201, `POST /evidence/victim → ${victimUp.status} (${(victimUp.data && victimUp.data.error) || ''})`);
  const victimEvidence = (victimUp.data && victimUp.data.evidence) || {};
  state.victimEvidenceId = victimEvidence.evidenceId;
  assert(!!victimEvidence.evidenceId, `victim evidenceId = ${victimEvidence.evidenceId || '(missing)'}`);
  assert(!!victimEvidence.sha256Hash, `victim sha256Hash = ${String(victimEvidence.sha256Hash).slice(0, 12)}...`);
  console.log(`  ${C.dim}victim evidence: ${victimEvidence.evidenceId} anchored=${victimUp.data && victimUp.data.anchored}${C.reset}`);

  // A5. Police evidence upload (heavy artifact)
  subsection('A5: Police Evidence Upload + Chain Anchor');
  const policeFile = makeTestArtifact('cctv_footage.mp4', 'POLICE_CCTV_EVIDENCE_BYTES_FOR_E2E_TEST_POLICE_UPLOAD_2026_' + 'X'.repeat(200));
  const policeForm = new FormData();
  policeForm.append('file', new Blob([fs.readFileSync(policeFile)], { type: 'video/mp4' }), 'cctv_footage.mp4');
  policeForm.append('complaintId', state.complaintId);
  policeForm.append('caseId', state.caseId);
  policeForm.append('evidenceType', 'video');

  const policeUp = await request('POST', `${API_BASE}/evidence/police`, { form: policeForm, token: state.policeToken });
  assert(policeUp.status === 201, `POST /evidence/police → ${policeUp.status} (${(policeUp.data && policeUp.data.error) || ''})`);
  const policeEvidence = (policeUp.data && policeUp.data.evidence) || {};
  state.policeEvidenceId = policeEvidence.evidenceId;
  state.policeSha256 = policeEvidence.sha256Hash;
  state.policeTxHash = policeUp.data && policeUp.data.txHash;
  state.policeTxBlock = policeUp.data && policeUp.data.txBlock;
  state.contractAddress = policeUp.data && policeUp.data.contractAddress;
  assert(!!policeEvidence.evidenceId, `police evidenceId = ${policeEvidence.evidenceId || '(missing)'}`);
  assert(!!policeEvidence.sha256Hash, `police sha256Hash = ${String(policeEvidence.sha256Hash).slice(0, 12)}...`);
  // LIVE BLOCKCHAIN ANCHOR — the whole point of this task
  assert(policeUp.data && policeUp.data.anchored === true,
    `police evidence anchored on-chain = ${policeUp.data && policeUp.data.anchored}`);
  assert(policeUp.data && policeUp.data.onChainStatus === 'ANCHORED',
    `onChainStatus = ${policeUp.data && policeUp.data.onChainStatus}`);
  assert(typeof state.policeTxHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(state.policeTxHash),
    `real txHash = ${state.policeTxHash ? state.policeTxHash.slice(0, 18) + '...' : '(missing)'}`);
  assert(typeof state.policeTxBlock === 'number' && state.policeTxBlock > 0,
    `anchor blockNumber = ${state.policeTxBlock}`);
  assert(typeof state.contractAddress === 'string' && state.contractAddress.startsWith('0x'),
    `contractAddress = ${state.contractAddress ? state.contractAddress.slice(0, 12) + '...' : '(missing)'}`);
  console.log(`  ${C.dim}police evidence: ${policeEvidence.evidenceId} sha256=${String(policeEvidence.sha256Hash).slice(0, 16)}... anchored=${policeUp.data && policeUp.data.anchored} tx=${String(state.policeTxHash).slice(0, 12)}... block=${state.policeTxBlock}${C.reset}`);

  // A6. Verify new police evidence → VERIFIED
  subsection('A6: Cryptographic Integrity Verification');
  const verifyRes = await request('GET', `${API_BASE}/evidence/${state.policeEvidenceId}/verify`, { token: state.policeToken });
  assert(verifyRes.status === 200 && verifyRes.data && verifyRes.data.status === 'VERIFIED',
    `GET /evidence/${state.policeEvidenceId}/verify → ${verifyRes.status} status=${verifyRes.data && verifyRes.data.status}`);
  const liveHash = verifyRes.data && verifyRes.data.liveHash;
  assert(liveHash === state.policeSha256, `liveHash matches stored sha256Hash (${String(liveHash).slice(0, 12)}...)`);
  const onchain = verifyRes.data && verifyRes.data.onchain;
  assert(onchain && onchain.available === true,
    `on-chain verification available = ${onchain && onchain.available} (live relayer connected)`);
  assert(onchain && onchain.valid === true,
    `on-chain hash = ${onchain && onchain.valid} (matches on-ledger record)`);
  assert(onchain && onchain.historyCount >= 1,
    `on-chain audit history entries = ${onchain && onchain.historyCount}`);
  console.log(`  ${C.dim}onchain: ${JSON.stringify(onchain)}${C.reset}`);

  // A7. AI Forensic Analysis — Crime Classification
  subsection('A7: AI Crime Classification');
  const aiClassify = await request('POST', `${AI_BASE}/api/ai/classify`, {
    body: { text: 'Unauthorized access to my Instagram account and phishing messages sent to my contacts without consent. Someone stole my credentials and is impersonating me.', complaint_id: state.complaintId },
  });
  assert(aiClassify.status === 200, `POST /api/ai/classify → ${aiClassify.status}`);
  const classifyData = aiClassify.data || {};
  assert(typeof classifyData.predicted_category === 'string' && classifyData.predicted_category.length > 0,
    `predicted_category = ${classifyData.predicted_category || '(missing)'}`);
  assert(typeof classifyData.confidence === 'number' && classifyData.confidence > 0,
    `confidence = ${classifyData.confidence}`);
  assert(typeof classifyData.recommended_cell === 'string' && classifyData.recommended_cell.length > 0,
    `recommended_cell = ${classifyData.recommended_cell}`);
  console.log(`  ${C.dim}category=${classifyData.predicted_category} confidence=${classifyData.confidence} cell=${classifyData.recommended_cell}${C.reset}`);

  // A8. AI Forensic Analysis — Case Brief Summarization
  subsection('A8: AI RAG Case Brief Summary');
  const aiSummarize = await request('POST', `${AI_BASE}/api/ai/summarize`, {
    body: {
      text: `Case ${state.caseId}: Victim Jane Doe reported unauthorized Instagram access. Evidence E-001 screenshot verified. Evidence ${state.policeEvidenceId} CCTV footage verified with SHA-256 hash match. Chain of custody maintained. Suspect used phishing links to steal credentials. Financial loss estimated at ₹15,000. All evidence integrity verified via blockchain audit trail.`,
      case_id: state.caseId,
      max_length: 300,
    },
  });
  assert(aiSummarize.status === 200, `POST /api/ai/summarize → ${aiSummarize.status}`);
  const summaryData = aiSummarize.data || {};
  assert(typeof summaryData.summary === 'string' && summaryData.summary.length > 10,
    `summary length = ${(summaryData.summary || '').length} chars`);
  assert(Array.isArray(summaryData.key_points) && summaryData.key_points.length >= 1,
    `key_points count = ${(summaryData.key_points || []).length}`);
  console.log(`  ${C.dim}summary: ${(summaryData.summary || '').slice(0, 80)}...${C.reset}`);

  // A9. Chain-of-custody entry
  subsection('A9: Chain-of-Custody Log Entry');
  const custodyRes = await request('POST', `${API_BASE}/custody/log`, {
    body: {
      evidenceId: state.policeEvidenceId,
      action: 'verified',
      remarks: 'E2E test: evidence integrity verified after forensic upload',
    },
    token: state.policeToken,
  });
  assert(custodyRes.status === 201, `POST /custody/log → ${custodyRes.status}`);
  const custodyEntry = (custodyRes.data && custodyRes.data.entry) || {};
  state.custodyEntryId = custodyEntry.id;
  assert(!!custodyEntry.id, `custody entry UUID = ${custodyEntry.id ? String(custodyEntry.id).slice(0, 8) + '...' : '(missing)'}`);
  console.log(`  ${C.dim}custody action=${custodyEntry.action} actor=${custodyEntry.actorRole}${C.reset}`);

  // A10. Read custody timeline
  subsection('A10: Read Custody Timeline');
  const timelineRes = await request('GET', `${API_BASE}/custody/${state.policeEvidenceId}`, { token: state.policeToken });
  assert(timelineRes.status === 200, `GET /custody/${state.policeEvidenceId} → ${timelineRes.status}`);
  const timeline = (timelineRes.data && timelineRes.data.timeline) || [];
  assert(timeline.length >= 2, `custody timeline entries = ${timeline.length} (≥ 2)`);
  const actions = timeline.map((e) => e.action);
  assert(actions.includes('uploaded'), `timeline includes 'uploaded' action`);
  assert(actions.includes('verified'), `timeline includes 'verified' action`);
  console.log(`  ${C.dim}timeline actions: ${actions.join(', ')}${C.reset}`);

  // A11. Generate investigation report
  subsection('A11: Generate Investigation Report');
  const reportRes = await request('POST', `${API_BASE}/reports`, {
    body: { caseId: state.caseUUID, remarks: 'E2E test: final investigation report generated' },
    token: state.policeToken,
  });
  assert(reportRes.status === 201, `POST /reports → ${reportRes.status}`);
  const reportEntry = (reportRes.data && reportRes.data.report) || {};
  state.reportEntryId = reportEntry.id;
  assert(reportEntry.action === 'report_generated', `report custody action = ${reportEntry.action}`);

  // Section 65B on-chain certificate embedded in the report payload
  const sec65b = reportRes.data && reportRes.data.section65B;
  assert(!!sec65b, `report includes section65B on-chain certificate`);
  assert(!!sec65b.transactionHash && /^0x[0-9a-fA-F]{64}$/.test(sec65b.transactionHash),
    `sec65B transactionHash = ${sec65b.transactionHash ? sec65b.transactionHash.slice(0, 18) + '...' : '(missing)'}`);
  assert(typeof sec65b.contractAddress === 'string' && sec65b.contractAddress.startsWith('0x'),
    `sec65B contractAddress = ${sec65b.contractAddress ? sec65b.contractAddress.slice(0, 12) + '...' : '(missing)'}`);
  assert(typeof sec65b.blockNumber === 'number' && sec65b.blockNumber > 0,
    `sec65B blockNumber = ${sec65b.blockNumber}`);
  assert(typeof sec65b.blockTimestamp === 'string' && sec65b.blockTimestamp.length > 0,
    `sec65B blockTimestamp = ${sec65b.blockTimestamp || '(missing)'}`);
  console.log(`  ${C.dim}report entry id=${String(reportEntry.id).slice(0, 8)}... 65B tx=${String(sec65b && sec65b.transactionHash).slice(0, 14)}... block=${sec65b && sec65b.blockNumber}${C.reset}`);

  // A12. Judge signs report (Section 65B certification)
  subsection('A12: Judge Digital Signature (Section 65B)');
  const signRes = await request('PATCH', `${API_BASE}/reports/${state.reportEntryId}/sign`, {
    body: {},
    token: (await login('legal_verma')).token,
  });
  assert(signRes.status === 200, `PATCH /reports/${String(state.reportEntryId).slice(0, 8)}.../sign → ${signRes.status}`);
  const signedData = (signRes.data && signRes.data.report) || {};
  assert(signedData.remarks && signedData.remarks.includes('reviewed/signed'), `signed remarks = ${signedData.remarks || '(missing)'}`);
  console.log(`  ${C.dim}signed by: ${signedData.remarks}${C.reset}`);

  // A13. Read reports for case (judge)
  subsection('A13: Retrieve Case Reports (Judge)');
  const readReports = await request('GET', `${API_BASE}/reports/case/${state.caseUUID}`, {
    token: (await login('legal_verma')).token,
  });
  assert(readReports.status === 200, `GET /reports/case/${state.caseId} → ${readReports.status}`);
  const reports = (readReports.data && readReports.data.reports) || [];
  assert(reports.length >= 1, `reports count = ${reports.length}`);
  const foundSigned = reports.find((r) => r.remarks && r.remarks.includes('reviewed/signed'));
  assert(!!foundSigned, `signed report found in case reports`);
  const proofInListing = reports.find((r) => r.section65B && r.section65B.transactionHash);
  assert(!!proofInListing, `section65B on-chain proof present in reports listing`);
  console.log(`  ${C.dim}case reports: ${reports.length} entries (65B proof included)${C.reset}`);

  // A14. Evidence vault listing
  subsection('A14: Evidence Vault Listing');
  const vaultRes = await request('GET', `${API_BASE}/evidence/case/${state.caseId}`, { token: state.policeToken });
  assert(vaultRes.status === 200, `GET /evidence/case/${state.caseId} → ${vaultRes.status}`);
  const evidences = (vaultRes.data && vaultRes.data.evidences) || [];
  assert(evidences.length >= 1, `evidence vault items = ${evidences.length}`);
  const verifiedCount = evidences.filter((e) => e.integrityStatus === 'verified').length;
  assert(verifiedCount >= 1, `verified evidence count = ${verifiedCount}`);
  console.log(`  ${C.dim}vault: ${evidences.length} items, ${verifiedCount} verified${C.reset}`);

  return state;
}

// ===========================================================================
// MODULE B — Tamper Detection + Cryptographic Integrity
// ===========================================================================
async function moduleB(state) {
  section('MODULE B — Tamper Detection & Cryptographic Integrity');
  if (!state || !state.policeEvidenceId) {
    console.log('  ' + skip('No evidence from Module A — skipping Module B'));
    skipped += 5;
    return;
  }

  const evidenceId = state.policeEvidenceId;
  const binPath = path.join(ENCRYPTED_ROOT, `${evidenceId}.bin`);

  // B1. Encrypted artifact exists on disk
  subsection('B1: Encrypted Artifact Integrity');
  const binExists = fs.existsSync(binPath);
  assert(binExists, `encrypted artifact ${evidenceId}.bin exists on disk`);
  if (!binExists) { skipped += 4; return; }

  const originalBuf = fs.readFileSync(binPath);
  assert(originalBuf.length > 0, `artifact size = ${originalBuf.length} bytes`);

  // B2. Pre-tamper baseline verify → VERIFIED
  subsection('B2: Pre-Tamper Baseline Verify');
  const v1 = await request('GET', `${API_BASE}/evidence/${evidenceId}/verify`, { token: state.policeToken });
  assert(v1.status === 200 && v1.data && v1.data.status === 'VERIFIED',
    `baseline verify → ${v1.status} status=${v1.data && v1.data.status}`);
  assert(v1.data && v1.data.liveHash === state.policeSha256,
    `baseline liveHash === stored sha256Hash`);

  // B3. Byte tamper → TAMPERED + INTEGRITY_ALERT
  subsection('B3: Byte Tamper Detection');
  const flipped = flipFirstByte(binPath);
  assert(flipped, `flipped byte 0 of ${evidenceId}.bin`);

  const v2 = await request('GET', `${API_BASE}/evidence/${evidenceId}/verify`, { token: state.policeToken });
  const tamperedOk = (v2.status === 409 || v2.status === 200) && v2.data && v2.data.status === 'TAMPERED';
  assert(tamperedOk, `post-tamper verify → ${v2.status} status=${v2.data && v2.data.status}`);
  assert(v2.data && v2.data.alert === 'INTEGRITY_ALERT', `INTEGRITY_ALERT emitted (${v2.data && v2.data.alert})`);
  const reason = v2.data && v2.data.reason;
  // AES-256-GCM tampered ciphertext fails auth tag before decryption → DECRYPTION_FAILED
  // Bit-flip in plaintext portion would yield LOCAL_HASH_MISMATCH; both are valid detections
  const validReasons = ['LOCAL_HASH_MISMATCH', 'ONCHAIN_HASH_MISMATCH', 'DECRYPTION_FAILED'];
  assert(validReasons.includes(reason),
    `tamper reason = ${reason} (expected one of: ${validReasons.join(', ')})`);
  console.log(`  ${C.dim}alert=${v2.data && v2.data.alert} reason=${reason} liveHash=${String(v2.data && v2.data.liveHash).slice(0, 12)}...${C.reset}`);

  // B4. DB integrityStatus updated to tampered
  subsection('B4: Database Integrity Status = tampered');
  const vaultAfter = await request('GET', `${API_BASE}/evidence/case/${state.caseId}`, { token: state.policeToken });
  const tamperedEvidence = ((vaultAfter.data && vaultAfter.data.evidences) || []).find((e) => e.evidenceId === evidenceId);
  assert(tamperedEvidence && tamperedEvidence.integrityStatus === 'tampered',
    `DB integrityStatus = ${tamperedEvidence && tamperedEvidence.integrityStatus}`);

  // B5. Restore byte → VERIFIED again
  subsection('B5: Byte Restoration → Re-verified');
  fs.writeFileSync(binPath, originalBuf);
  const v3 = await request('GET', `${API_BASE}/evidence/${evidenceId}/verify`, { token: state.policeToken });
  assert(v3.status === 200 && v3.data && v3.data.status === 'VERIFIED',
    `restored verify → ${v3.status} status=${v3.data && v3.data.status}`);
  assert(v3.data && v3.data.liveHash === state.policeSha256,
    `restored liveHash matches original sha256Hash`);
  console.log(`  ${C.dim}restored: ${v3.data && v3.data.status} liveHash=${String(v3.data && v3.data.liveHash).slice(0, 12)}...${C.reset}`);
}

// ===========================================================================
// MODULE C — RBAC Matrix
// ===========================================================================
async function moduleC() {
  section('MODULE C — Role-Based Access Control Matrix');

  const vLogin = await login('victim_jane');
  const pLogin = await login('Rahul123');
  const jLogin = await login('legal_verma');
  const vToken = vLogin.token;
  const pToken = pLogin.token;
  const jToken = jLogin.token;

  // C1. Victim → GET /cases (police-only) → 403
  subsection('C1: Victim → Officer-Only Endpoints → 403');
  const c1 = await request('GET', `${API_BASE}/cases`, { token: vToken });
  assert(c1.status === 403, `victim GET /cases → ${c1.status} (expect 403)`);
  assert(c1.data && c1.data.error === 'Access denied', `error = "${c1.data && c1.data.error}"`);

  // C2. Victim → GET /evidence/case/:id → 403
  const c2 = await request('GET', `${API_BASE}/evidence/case/CYB-1042`, { token: vToken });
  assert(c2.status === 403, `victim GET /evidence/case/CYB-1042 → ${c2.status} (expect 403)`);

  // C3. Victim → POST /reports → 403
  const c3 = await request('POST', `${API_BASE}/reports`, { body: { caseId: 'fake' }, token: vToken });
  assert(c3.status === 403, `victim POST /reports → ${c3.status} (expect 403)`);

  // C4. Police → POST /cases/complaints (victim-only) → 403
  subsection('C2: Police → Victim-Only Endpoints → 403');
  const c4 = await request('POST', `${API_BASE}/cases/complaints`, {
    body: { victimName: 'Test', contactNumber: '123', platform: 'Test', crimeDescription: 'Test description for RBAC check' },
    token: pToken,
  });
  assert(c4.status === 403, `police POST /cases/complaints → ${c4.status} (expect 403)`);

  // C5. Judge → POST /evidence/police (police-only) → 403
  const c5 = await request('POST', `${API_BASE}/evidence/police`, { form: new FormData(), token: jToken });
  assert(c5.status === 403 || c5.status === 400, `judge POST /evidence/police → ${c5.status} (expect 403 or 400)`);

  // C6. No token → protected endpoints → 401
  subsection('C3: No Token → 401 Unauthorized');
  const c6a = await request('GET', `${API_BASE}/cases`);
  assert(c6a.status === 401, `no token GET /cases → ${c6a.status} (expect 401)`);
  assert(c6a.data && c6a.data.error === 'Access token required', `error = "${c6a.data && c6a.data.error}"`);

  const c6b = await request('GET', `${API_BASE}/evidence/case/CYB-1042`);
  assert(c6b.status === 401, `no token GET /evidence/case/CYB-1042 → ${c6b.status} (expect 401)`);

  const c6c = await request('POST', `${API_BASE}/custody/log`, { body: { evidenceId: 'E-001', action: 'verified', remarks: 'test' } });
  assert(c6c.status === 401, `no token POST /custody/log → ${c6c.status} (expect 401)`);

  // C7. Victim → own complaint endpoint → 200
  subsection('C4: Victim → Own Complaints → 200');
  const c7 = await request('GET', `${API_BASE}/cases/complaints/own`, { token: vToken });
  assert(c7.status === 200, `victim GET /cases/complaints/own → ${c7.status} (expect 200)`);
  const ownComplaints = (c7.data && c7.data.complaints) || [];
  assert(Array.isArray(ownComplaints), `own complaints is array (${ownComplaints.length} items)`);

  // C8. Police → GET /cases → 200
  subsection('C5: Officer → Authorized Endpoints → 200');
  const c8 = await request('GET', `${API_BASE}/cases`, { token: pToken });
  assert(c8.status === 200, `police GET /cases → ${c8.status} (expect 200)`);

  // C9. Judge → GET /reports/case/:id → 200
  const c9 = await request('GET', `${API_BASE}/reports/case/CYB-1042`, { token: jToken });
  assert(c9.status === 200, `judge GET /reports/case/CYB-1042 → ${c9.status} (expect 200)`);
}

// ===========================================================================
// MODULE D — Input Validation & Security Hardening
// ===========================================================================
async function moduleD(state) {
  section('MODULE D — Input Validation & Security Hardening');

  const pLogin = await login('Rahul123');
  const pToken = pLogin.token;

  // D1. MIME spoof — disallowed file type → 400
  subsection('D1: MIME Type Spoofing Rejection');
  const malwareFile = makeExeFile();
  const spoofForm = new FormData();
  spoofForm.append('file', new Blob([fs.readFileSync(malwareFile)], { type: 'application/x-msdownload' }), 'malware.exe');
  spoofForm.append('complaintId', state ? state.complaintId : 'CC-10482');
  spoofForm.append('evidenceType', 'other');

  const d1 = await request('POST', `${API_BASE}/evidence/police`, { form: spoofForm, token: pToken });
  assert(d1.status === 400, `MIME-spoofed upload → ${d1.status} (expect 400)`);
  const d1msg = (d1.data && d1.data.error) || '';
  assert(d1msg.includes('File upload error') || d1msg.includes('not allowed') || d1.status === 400,
    `error message indicates type rejection: "${d1msg.slice(0, 60)}"`);
  console.log(`  ${C.dim}reject message: ${d1msg}${C.reset}`);

  // D2. SQL injection in login identifier → sanitized, 401
  subsection('D2: SQL Injection Sanitization');
  const sqlPayloads = [
    "admin'; DROP TABLE users; --",
    "' OR '1'='1",
    "rahul' UNION SELECT * FROM users --",
    "'; UPDATE users SET role='admin' WHERE email='jane@example.com'; --",
  ];
  let allSanitized = true;
  for (const payload of sqlPayloads) {
    const d2 = await request('POST', `${API_BASE}/auth/login`, {
      body: { identifier: payload, password: 'password123' },
    });
    if (d2.status !== 401 && d2.status !== 400) {
      allSanitized = false;
      console.log(`  ${bad(`SQL injection "${payload.slice(0, 30)}..." → ${d2.status}`)}`);
    }
  }
  assert(allSanitized, `all SQL injection payloads sanitized → 401/400 (Prisma parameterized)`);

  // D3. Malformed JWT → 401
  subsection('D3: Malformed / Invalid JWT → 401');
  const malformedTokens = [
    'not.a.jwt',
    'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZha2UifQ.invalid_signature',
    'Bearer ',
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMzQ1In0.',  // empty sig
  ];
  let allRejected = true;
  for (const tok of malformedTokens) {
    const d3 = await request('GET', `${API_BASE}/cases`, { token: tok });
    if (d3.status !== 401) {
      allRejected = false;
      console.log(`  ${bad(`malformed token "${tok.slice(0, 30)}..." → ${d3.status}`)}`);
    }
  }
  assert(allRejected, `all malformed JWTs → 401 Invalid token`);

  // D4. Expired JWT → 401
  subsection('D4: Expired JWT → 401 Token Expired');
  const expiredToken = makeExpiredJWT();
  const d4 = await request('GET', `${API_BASE}/cases`, { token: expiredToken });
  assert(d4.status === 401, `expired JWT → ${d4.status} (expect 401)`);
  assert(d4.data && (d4.data.error === 'Token expired' || d4.data.error === 'Invalid token'),
    `error = "${d4.data && d4.data.error}"`);

  // D5. Oversized file upload → Multer limit
  subsection('D5: Oversized File Upload Rejection (> 50MB victim limit)');
  const bigContent = Buffer.alloc(51 * 1024 * 1024, 0x41); // 51MB
  const bigForm = new FormData();
  bigForm.append('file', new Blob([bigContent], { type: 'image/jpeg' }), 'huge_photo.jpg');
  bigForm.append('complaintId', state ? state.complaintId : 'CC-10482');
  bigForm.append('evidenceType', 'screenshot');

  const d5 = await request('POST', `${API_BASE}/evidence/victim`, {
    form: bigForm,
    token: (await login('victim_jane')).token,
  });
  assert(d5.status === 400, `51MB upload → ${d5.status} (expect 400 multer limit)`);
  console.log(`  ${C.dim}upload limit error: ${(d5.data && d5.data.error) || ''}${C.reset}`);

  // D6. Complaint validation — missing required fields → 400
  subsection('D6: Complaint Validation — Missing Fields → 400');
  const d6 = await request('POST', `${API_BASE}/cases/complaints`, {
    body: { victimName: '' },
    token: (await login('victim_jane')).token,
  });
  assert(d6.status === 400, `empty complaint → ${d6.status} (expect 400)`);

  // D7. Missing evidence file → 400
  subsection('D7: No File Attached → 400');
  const d7Form = new FormData();
  d7Form.append('complaintId', state ? state.complaintId : 'CC-10482');
  d7Form.append('evidenceType', 'document');
  const d7 = await request('POST', `${API_BASE}/evidence/police`, {
    form: d7Form,
    token: pToken,
  });
  assert(d7.status === 400, `no file attached → ${d7.status} (expect 400)`);

  // D8. Health check — service liveness
  subsection('D8: Service Health & Availability');
  const d8api = await request('GET', `${API_BASE.replace('/api/v1', '')}/health`);
  assert(d8api.status === 200 && d8api.data && d8api.data.status === 'healthy',
    `API /health → ${d8api.status} status=${d8api.data && d8api.data.status}`);

  const d8ai = await request('GET', `${AI_BASE}/health`);
  assert(d8ai.status === 200, `AI /health → ${d8ai.status}`);
}

// ===========================================================================
// SUMMARY DASHBOARD
// ===========================================================================
function printSummary(execTime) {
  console.log('');
  console.log(C.bold + C.cyan + '╔══════════════════════════════════════════════════════════════════╗' + C.reset);
  console.log(C.bold + C.cyan + '║          SIH DMS — E2E INTEGRATION & SECURITY AUDIT            ║' + C.reset);
  console.log(C.bold + C.cyan + '║                    EXECUTION SUMMARY DASHBOARD                  ║' + C.reset);
  console.log(C.bold + C.cyan + '╠══════════════════════════════════════════════════════════════════╣' + C.reset);

  // Module results
  for (const [name, res] of Object.entries(moduleResults)) {
    const total = res.pass + res.fail + res.skip;
    const icon = res.fail === 0 ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(C.bold + C.cyan + '║' + C.reset + `  ${icon} ${name.padEnd(45)} ${C.green}${String(res.pass).padStart(2)} PASS${C.reset}  ${C.red}${String(res.fail).padStart(2)} FAIL${C.reset}  ${C.yellow}${String(res.skip).padStart(2)} WARN${C.reset}  ` + C.bold + C.cyan + '║' + C.reset);
  }

  console.log(C.bold + C.cyan + '╠══════════════════════════════════════════════════════════════════╣' + C.reset);

  const totalTests = passed + failed + skipped;
  const passRatio = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0.0';
  const securityScore = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0.0';

  console.log(C.bold + C.cyan + '║' + C.reset + `  Total Tests:        ${C.bold}${totalTests}${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  console.log(C.bold + C.cyan + '║' + C.reset + `  Pass/Fail Ratio:    ${C.green}${passed} PASS${C.reset} / ${C.red}${failed} FAIL${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  console.log(C.bold + C.cyan + '║' + C.reset + `  Security Score:     ${C.bold}${C.green}${securityScore}%${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  console.log(C.bold + C.cyan + '║' + C.reset + `  Execution Time:     ${C.bold}${execTime}s${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  console.log(C.bold + C.cyan + '║' + C.reset + `  API Latency (avg):  ${timings.length ? (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(0) : 0}ms`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);

  console.log(C.bold + C.cyan + '╠══════════════════════════════════════════════════════════════════╣' + C.reset);
  if (failed === 0) {
    console.log(C.bold + C.cyan + '║' + C.reset + `  ${C.bold}${C.green}✓ ALL MODULES PASSED — SIH JURY DEMO READY${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  } else {
    console.log(C.bold + C.cyan + '║' + C.reset + `  ${C.bold}${C.red}✗ ${failed} ASSERTION(S) FAILED — REVIEW REQUIRED${C.reset}`.padEnd(69) + C.bold + C.cyan + '║' + C.reset);
  }
  console.log(C.bold + C.cyan + '╚══════════════════════════════════════════════════════════════════╝' + C.reset);
  console.log('');
}

// ===========================================================================
// RUNNER
// ===========================================================================
async function main() {
  console.log('');
  console.log(C.bold + '╔══════════════════════════════════════════════════════════════════╗' + C.reset);
  console.log(C.bold + '║   DMS Full System E2E Integration & Security Audit Test Suite  ║' + C.reset);
  console.log(C.bold + '╚══════════════════════════════════════════════════════════════════╝' + C.reset);
  console.log(`  API:   ${C.cyan}${API_BASE}${C.reset}`);
  console.log(`  AI:    ${C.cyan}${AI_BASE}${C.reset}`);
  console.log(`  Chain: ${C.cyan}http://127.0.0.1:8545${C.reset}`);
  console.log(`  Node:  ${C.cyan}${process.version}${C.reset}`);
  console.log(`  Start: ${C.dim}${new Date().toISOString()}${C.reset}`);

  const t0 = Date.now();

  let state = null;
  try {
    setModule('Module A — Lifecycle');
    state = await moduleA();
  } catch (err) {
    console.log('  ' + bad(`Module A crashed: ${err.message}`));
    failed++;
  }

  try {
    setModule('Module B — Tamper & Crypto');
    await moduleB(state);
  } catch (err) {
    console.log('  ' + bad(`Module B crashed: ${err.message}`));
    failed++;
  }

  try {
    setModule('Module C — RBAC');
    await moduleC();
  } catch (err) {
    console.log('  ' + bad(`Module C crashed: ${err.message}`));
    failed++;
  }

  try {
    setModule('Module D — Security');
    await moduleD(state);
  } catch (err) {
    console.log('  ' + bad(`Module D crashed: ${err.message}`));
    failed++;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  printSummary(elapsed);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  const msg = (err && err.message) || String(err);
  console.error(bad('Test runner crashed: ' + msg));
  if (/fetch failed|ECONNREFUSED|connect/i.test(msg)) {
    console.error('  ' + C.yellow + 'Ensure services are running: cd server && npm run start' + C.reset);
    console.error('  ' + C.yellow + 'API: ' + API_BASE + '  AI: ' + AI_BASE + C.reset);
  }
  process.exit(1);
});
