# Secure Evidence DMS — Live Demo Script (SIH-26190)

A tightly paced, ~7–10 minute walkthrough tuned for the judging panel.
Every action below maps to a working endpoint or screen; nothing is mocked.

**Logins** (password for all: `password123`)

| customUserId  | Role          | Surface                        |
|---------------|---------------|--------------------------------|
| `victim_jane` | Victim        | file complaint, own evidence    |
| `Rahul123`    | Police        | case dashboard, evidence upload |
| `forensic_anil`| Investigator | analysis, deepfake scan         |
| `legal_verma` | Judge         | read-only sign-off              |

---

## 0. Boot (1 min)

```bash
bash scripts/run_all.sh
```

Waits on `/health` for the Express API (:5000) and FastAPI AI (:8000),
deploys `EvidenceAuditLedger` to the hardhat node (:8545) and opens the
frontend. Confirm all three health probes return 200.

---

## 1. Citizen files a complaint (1 min) — `victim_jane`

- Frontend → **Log in** as `victim_jane`.
- Submit a report: "My Instagram account was hacked and phishing messages were
  sent to my contacts."
- Watch the AI auto-classify → `Online Harassment`, severity `high`, routed to
  the Women Safety Cell. Confidence shown as a bounded probability.

## 2. Officer triages & opens a case (1 min) — `Rahul123`

- Switch to `Rahul123`. Case **CYB-1042** appears (from demo seed).
- Open the case → see complaint, AI classification, risk score 0.78.

## 3. Upload + blockchain anchor (1.5 min) — `Rahul123`

- Upload a real file as **E-002** (chat export) via the evidence flow.
- Verify the API returned a `sha256Hash`, `verified` integrity, and an
  on-chain record on the hardhat node.
- Point the panel at the custody timeline: uploaded → received → verified.

## 4. Forensic AI scan (1.5 min) — `forensic_anil`

- Run **deepfake-scan** on the uploaded artifact → bounded probabilities,
  `is_manipulated` flag, indicators list.
- Run **correlate** across E-001 / E-002 / E-009 → the relationship graph
  links the shared phone number into one traceable suspect thread.

## 5. Tamper detection — the "wow" moment (1.5 min)

```bash
node scripts/simulate_tamper.js E-002
```

- Script flips one byte of the AES-encrypted artifact on disk.
- Re-run verification: **HTTP 409 `TAMPERED`**, `INTEGRITY_ALERT` raised,
  integrity status → `tampered`, and a new custody entry is appended.
- Show the untouched evidence still verifies **200 OK** — selective detection.

## 6. RBAC — least privilege (1 min)

- As `legal_verma` (judge): open the case and final report → **read-only**.
- As `victim_jane`: you can see your own complaint and custody logs, but a
  police/legal surface returns **403**.

## 7. Court-ready sign-off (1 min)

- As `legal_verma`, sign the final investigation report (E-009) →
  `report_generated` custody entry, digitally anchored.

---

## Automated validation (optional, run anytime)

```bash
bash scripts/run-security-checks.sh   # RBAC, tamper, contract, AI security
(cd ai-engine && pytest tests)        # AI pipeline suite
bash -n scripts/run_all.sh            # shell syntax
```
