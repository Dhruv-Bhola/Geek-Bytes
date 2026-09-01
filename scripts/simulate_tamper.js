#!/usr/bin/env node
/**
 * simulate_tamper.js — live tamper demo runner (SIH-26190)
 * -----------------------------------------------------------
 * Toggle the tamper state of an evidence artifact on disk and IMMEDIATELY
 * re-verify it against the live API so the INTEGRITY_ALERT is real time.
 *
 * Modes:
 *   tamper   flip a single byte of the AES-256 ciphertext  (detectable)
 *   restore  put back the original byte from the .orig sidecar
 *   toggle   flip if clean, restore if tampered  (default)
 *
 * A sidecar at `<artifact>.orig` records the original first byte so `restore`
 * is exact (byte-flipping is XOR/self-inverse, so a bare `toggle` also works).
 *
 * Usage (from repo root, with server/node_modules + a running server):
 *   node scripts/simulate_tamper.js [evidenceId] [tamper|restore|toggle]
 *   e.g.  node scripts/simulate_tamper.js E-002 tamper
 *         node scripts/simulate_tamper.js E-002 restore
 *
 * The evidence MUST have a locally-stored encrypted artifact with valid
 * metadata.aesIv / aesAuthTag (i.e. uploaded through the real pipeline, NOT
 * the s3:// placeholder from the static seed).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../server/node_modules/@prisma/client'));

const prisma = new PrismaClient();

const API_BASE = (process.env.API_BASE || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
const ENCRYPTED_ROOT = path.join(__dirname, '..', 'server', 'data', 'encrypted');
const FLIP_BYTE_INDEX = 0;

async function liveVerify(evidenceId, token) {
  const res = await fetch(`${API_BASE}/evidence/${encodeURIComponent(evidenceId)}/verify`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}

function isTamperedOnDisk(artifact) {
  const origPath = artifact + '.orig';
  if (!fs.existsSync(origPath)) return false;
  const current = fs.readFileSync(artifact);
  const saved = fs.readFileSync(origPath);
  return current[FLIP_BYTE_INDEX] !== saved[0];
}

async function main() {
  const evidenceId = process.argv[2] || 'E-002';
  const mode = (process.argv[3] || 'toggle').toLowerCase();

  const evidence = await prisma.evidence.findUnique({ where: { evidenceId } });
  if (!evidence) {
    console.error(`\n✖ Evidence ${evidenceId} not found in the database.`);
    console.error('  Run `node database/seeds/hackathon_demo_seed.js` first, then upload a real file.');
    process.exit(1);
  }

  // Resolve the physical encrypted artifact (fileUrl may be an s3:// placeholder).
  const raw = (evidence.fileUrl || '').replace(/\//g, path.sep);
  const artifact = path.isAbsolute(raw)
    ? raw
    : path.join(ENCRYPTED_ROOT, path.basename(evidence.fileUrl.replace(/^.*[\\/]/, '')));

  if (!fs.existsSync(artifact)) {
    console.error(`\n✖ Physical encrypted artifact not found at: ${artifact}`);
    console.error('  This evidence was seeded with an s3:// placeholder. Upload it via the');
    console.error('  police/victim evidence flow to create a local AES-256 encrypted file.');
    process.exit(1);
  }

  const buf = fs.readFileSync(artifact);
  if (buf.length === 0) {
    console.error('\n✖ Encrypted artifact is empty; nothing to tamper.');
    process.exit(1);
  }

  const origPath = artifact + '.orig';
  if (!fs.existsSync(origPath)) {
    fs.writeFileSync(origPath, Buffer.from([buf[FLIP_BYTE_INDEX]]));
  }
  const savedOriginal = fs.readFileSync(origPath)[0];

  const alreadyTampered = isTamperedOnDisk(artifact);
  const resolved = mode === 'toggle' ? (alreadyTampered ? 'restore' : 'tamper') : mode;

  console.log('\n=======================================================');
  console.log(' Secure Evidence DMS Tamper Simulation');
  console.log('=======================================================');
  console.log(`  Evidence        : ${evidenceId}  (${evidence.evidenceType})`);
  console.log(`  DB status       : ${evidence.integrityStatus}`);
  console.log(`  Anchored SHA256 : ${evidence.sha256Hash}`);
  console.log(`  Artifact        : ${artifact}`);
  console.log(`  Ciphertext      : ${buf.length} bytes`);
  console.log(`  Mode requested  : ${mode}  -> ${resolved.toUpperCase()}`);
  console.log('-------------------------------------------------------');

  if (resolved === 'restore') {
    buf[FLIP_BYTE_INDEX] = savedOriginal;
    fs.writeFileSync(artifact, buf);
    console.log(`  RESTORED byte ${FLIP_BYTE_INDEX} back to 0x${savedOriginal.toString(16).padStart(2, '0')}`);
  } else {
    buf[FLIP_BYTE_INDEX] = buf[FLIP_BYTE_INDEX] ^ 0xff;
    fs.writeFileSync(artifact, buf);
    console.log(`  TAMPERED byte ${FLIP_BYTE_INDEX} -> 0x${buf[FLIP_BYTE_INDEX].toString(16).padStart(2, '0')}`);
  }

  // Re-verify against the LIVE API as the police officer to show real result.
  try {
    const login = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'Rahul123', password: 'password123' }),
    }).then((r) => r.json());
    const token = login.accessToken;

    const verify = await liveVerify(evidenceId, token);
    console.log('-------------------------------------------------------');
    console.log(`  LIVE VERIFY    : HTTP ${verify.status}`);
    console.log(`  status         : ${verify.data && verify.data.status}`);
    if (verify.data && verify.data.alert) console.log(`  alert          : ${verify.data.alert}`);
    if (verify.data && verify.data.reason) console.log(`  reason         : ${verify.data.reason}`);
  } catch (e) {
    console.log('  ' + ('  LIVE VERIFY unavailable: ' + (e.message || '')));
    console.log('  Expect: status 409 TAMPERED + INTEGRITY_ALERT (or 200 VERIFIED after restore)');
  }

  console.log('=======================================================\n');
}

main()
  .catch((err) => {
    console.error('simulate_tamper error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
