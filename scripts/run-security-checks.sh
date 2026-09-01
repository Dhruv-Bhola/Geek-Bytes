#!/usr/bin/env bash
#
# run-security-checks.sh — Digital Evidence Management System Security Runner
# ------------------------------------------------------
# One-shot compliance gate that:
#   1. Audits npm / pip dependencies for known vulnerabilities.
#   2. Compiles the Solidity contracts and runs the smart-contract security
#      & immutability suite (EvidenceAuditLedger.test.js).
#   3. Executes the zero-trust RBAC and cryptographic tamper-detection suites.
#   4. Validates the database schema / Prisma integrity.
#   5. Runs the AI forensics & model security suite.
#   6. Emits a PASS/FAIL compliance report and a non-zero exit code on failure.
#
# Usage:
#   bash scripts/run-security-checks.sh            # full gate
#   SKIP_DB=1 bash scripts/run-security-checks.sh  # omit DB-dependent suites
#
# Requirements: bash, node >= 18, npm, python3/pip, (optional) pip-audit.
# The RBAC + tamper suites need a reachable PostgreSQL (DATABASE_URL).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
declare -a RESULTS=()

report() {  # report <STATUS> <name> <detail>
  local status="$1" name="$2" detail="${3:-}"
  RESULTS+=("[$status] $name ${detail:+-> $detail}")
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    SKIP) SKIP=$((SKIP + 1)) ;;
  esac
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

echo "======================================================="
echo " Digital Evidence Management System Security Runner"
echo " root: $ROOT"
echo "======================================================="

# ---------------------------------------------------------------------------
# 1. Dependency vulnerability audit
# ---------------------------------------------------------------------------
echo
echo "== STEP 1: Dependency vulnerability audit =="

if have_cmd npm; then
  (cd server && npm audit --audit-level=high --omit=dev >/tmp/pl_server_audit.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "server npm audit" "no high/critical advisories"
  else
    report FAIL "server npm audit" "see /tmp/pl_server_audit.txt"
  fi

  (cd contracts && npm audit --audit-level=high --omit=dev >/tmp/pl_contracts_audit.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "contracts npm audit" "no high/critical advisories"
  else
    report FAIL "contracts npm audit" "see /tmp/pl_contracts_audit.txt"
  fi
else
  report SKIP "npm audit" "npm not installed"
fi

if have_cmd pip-audit; then
  (cd ai-engine && pip-audit -r requirements.txt >/tmp/pl_ai_audit.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "pip-audit (AI engine)" "no known advisories"
  else
    report FAIL "pip-audit (AI engine)" "see /tmp/pl_ai_audit.txt"
  fi
else
  report SKIP "pip-audit (AI engine)" "pip-audit not installed"
fi

# ---------------------------------------------------------------------------
# 2. Solidity compile + smart-contract security & immutability suite
# ---------------------------------------------------------------------------
echo
echo "== STEP 2: Smart-contract compile + security tests =="

if have_cmd npx; then
  (cd contracts && npx hardhat compile >/tmp/pl_contracts_compile.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "solidity compile" "contracts compiled"
  else
    report FAIL "solidity compile" "see /tmp/pl_contracts_compile.txt"
  fi

  # Run only the dedicated security/immutability suite (not the base suite).
  (cd contracts && npx hardhat test ./test/EvidenceAuditLedger.test.js >/tmp/pl_contracts_test.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "contract security tests" "EvidenceAuditLedger immutability + relayer + verifyHash"
  else
    report FAIL "contract security tests" "see /tmp/pl_contracts_test.txt"
  fi
else
  report SKIP "solidity compile + tests" "npx not installed"
fi

# ---------------------------------------------------------------------------
# 4. Database schema integrity (Prisma)
# ---------------------------------------------------------------------------
echo
echo "== STEP 4: Database schema integrity =="

if have_cmd npx; then
  (cd server && npx prisma validate >/tmp/pl_prisma_validate.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "prisma schema validate" "schema.prisma is valid"
  else
    report FAIL "prisma schema validate" "see /tmp/pl_prisma_validate.txt"
  fi
else
  report SKIP "prisma schema validate" "npx not installed"
fi

# ---------------------------------------------------------------------------
# 3. Zero-trust RBAC + cryptographic tamper detection suites (need DB)
# ---------------------------------------------------------------------------
echo
echo "== STEP 3: RBAC + tamper-detection suites (DB-dependent) =="

DB_READY=1
if [ "${SKIP_DB:-0}" = "1" ]; then
  DB_READY=0
elif have_cmd node && [ -n "${DATABASE_URL:-}" ]; then
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$queryRaw\`SELECT 1\`.then(() => { console.log('db-ok'); return p.\$disconnect(); })
      .catch(() => process.exit(1));
  " >/dev/null 2>&1 || DB_READY=0
elif ! have_cmd node; then
  DB_READY=0
fi

if [ "$DB_READY" = "1" ]; then
  # Load DATABASE_URL/JWT secret from server/.env if present.
  if [ -f "$ROOT/server/.env" ]; then
    set -a; . "$ROOT/server/.env"; set +a
  fi
  (cd server && npx jest tests/rbac_security.test.js --coverage=false >/tmp/pl_rbac.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "RBAC security tests" "role escalation + token tampering + tenant boundary"
  else
    report FAIL "RBAC security tests" "see /tmp/pl_rbac.txt"
  fi

  (cd server && npx jest tests/tamper_integrity.test.js --coverage=false >/tmp/pl_tamper.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "tamper integrity tests" "upload/verify/tamper/detect full lifecycle"
  else
    report FAIL "tamper integrity tests" "see /tmp/pl_tamper.txt (hardhat node must be up for VERIFIED step)"
  fi
else
  report SKIP "RBAC security tests" "DATABASE_URL not reachable — start Postgres or set SKIP_DB=0"
  report SKIP "tamper integrity tests" "DATABASE_URL not reachable — start Postgres or set SKIP_DB=0"
fi

# ---------------------------------------------------------------------------
# AI forensics & model security suite
# ---------------------------------------------------------------------------
echo
echo "== AI forensics & model security suite =="

if have_cmd python3; then
  (cd ai-engine && python3 -m pytest tests/test_ai_security.py -q >/tmp/pl_ai_test.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "AI security tests" "injection resilience + bounded deepfake probabilities"
  else
    report FAIL "AI security tests" "see /tmp/pl_ai_test.txt (ensure python3 -m pip install -r ai-engine/requirements.txt + pytest)"
  fi

  (cd ai-engine && python3 -m pytest tests/test_ai_pipeline.py -q >/tmp/pl_ai_pipeline.txt 2>&1)
  if [ $? -eq 0 ]; then
    report PASS "AI pipeline tests" "classify + deepfake-scan + correlate JSON schemas (E2E)"
  else
    report FAIL "AI pipeline tests" "see /tmp/pl_ai_pipeline.txt (ensure python3 -m pip install -r ai-engine/requirements.txt + pytest)"
  fi
else
  report SKIP "AI security tests" "python3 not installed"
  report SKIP "AI pipeline tests" "python3 not installed"
fi

# ---------------------------------------------------------------------------
# Compliance report
# ---------------------------------------------------------------------------
echo
echo "======================================================="
echo " SECURITY COMPLIANCE REPORT"
echo "======================================================="
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo "-------------------------------------------------------"
echo "  PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
echo "======================================================="

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAIL — $FAIL security gate(s) failed."
  exit 1
else
  echo "RESULT: PASS — all executed security gates green."
  exit 0
fi
