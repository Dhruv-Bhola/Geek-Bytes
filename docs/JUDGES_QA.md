# Secure Evidence DMS — Judge's QA Reference (SIH-26190)

Concise, verifiable answers to the questions a technical evaluator will ask.
Each claim is tied to a file, endpoint or test so it can be re-validated live.

## 1. What problem does it solve?

Bangalore Cyber Crime police receive thousands of digital-evidence-heavy
complaints. Evidence purity must survive from seizure to courtroom, but
current custody is spreadsheet-based and trivially contested.

**Answer:** Secure Evidence DMS is a tamper-evident CSAM/cyber-crime evidence vault —
AES-256-GCM at rest, a SHA-256 + GCM integrity check, and an immutable
blockchain-anchored chain of custody. The moment a single byte changes, the
alerter fires and an immutable custody entry is appended.

## 2. How is integrity actually enforced? (`server/src/controllers/evidenceController.js`)

- Upload → file **AES-256-GCM encrypted**, auth tag + IV stored in metadata,
  plaintext SHA-256 streamed, then anchored on-chain via
  `EvidenceAuditLedger.sol` (`recordEvent`).
- Verify (`GET /evidence/:id/verify`) recomputes live hash over the decrypted
  stream and compares to the chain anchor. Byte flip → either GCM
  `DECRYPTION_FAILED` or a hash mismatch → **409 TAMPERED** +
  `INTEGRITY_ALERT` custody row. Proven by `server/tests/tamper_integrity.test.js`.

## 3. Is the chain of custody immutable?

- Every action (`uploaded`→`verified`→`accessed`→`analysis_completed`→
  `report_generated`) is a first-class DB row **plus** an on-chain event on
  the hardhat-managed ledger. `verifyHash()` returns `(valid, count)` so
  tampering with history is detectable.
- Solidity tests: `contracts/test/EvidenceAuditLedger.test.js`.

## 4. RBAC — who can see what? (`server/src/middleware/authMiddleware.js`)

- `judge` — **read-only**; verified by `rbac_security.test.js`.
- `victim` — own complaint + own custody logs; **403** on police/legal
  surfaces. `GET /cases` and `GET /reports/case/:caseId` are gated to exclude
  victims.
- `police/investigator/lawyer` — scoped to their jurisdiction cell.
- JWT payload carries `id, customUserId, role, jurisdiction`; `verifyToken`
  re-loads the user row per request (revocation-safe).

## 5. What does the AI actually do? (FastAPI `ai-engine`)

- `POST /api/ai/classify`   — NLP triage: category, recommended cell,
  **bounded** probabilities.
- `POST /api/ai/deepfake-scan` — synthetic-media/manipulation score in
  `[0,1]` + `is_manipulated` decision. Now accepts `evidence_id` as a form
  field (previously broken file+body mix).
- `POST /api/ai/correlate`  — relationship graph linking shared entities into
  one traceable thread.
- Deterministic, injection-resilient, and bounded — see
  `ai-engine/tests/test_ai_pipeline.py` and `test_ai_security.py`.

## 6. Is it reproducible for me to run right now?

Yes. `bash scripts/run_all.sh` boots the whole stack, and
`bash scripts/run-security-checks.sh` re-runs RBAC, tamper, contract and AI
security assertions. The demo seed (`database/seeds/hackathon_demo_seed.js`)
gives an idempotent, deterministic scenario: `Rahul123`, `victim_jane`,
`forensic_anil`, `legal_verma`.

## 7. Known limits / honest caveats

- Local `hardhat` node is the chain for the demo; a production target swaps in
  a permissioned chain, but the contract interface is unchanged.
- FastAPI runs deterministic heuristics (no heavyweight model weights) so the
  demo is fast and hermetic.
- Demo seed uses `s3://` placeholders for integrity anchors; `simulate_tamper`
  requires a locally-uploaded artifact and errors helpfully otherwise.
