#!/usr/bin/env bash
#
# run_all.sh — Secure Evidence DMS one-click demo launcher
# -------------------------------------------------
# Spins up the full SIH evaluation stack:
#   1. PostgreSQL            (via docker compose service ``postgres_db``)
#   2. Hardhat local node    (port 8545) + deploy EvidenceAuditLedger
#   3. Express REST API      (port 5000)
#   4. FastAPI AI engine     (port 8000)
#   5. Frontend              (opens client/index.html in the browser)
#
# Each long-running process is backgrounded with logs written to ./logs.
# Ctrl-C / the EXIT trap stops every child process cleanly.
#
# Usage:
#   bash scripts/run_all.sh
#   bash scripts/run_all.sh --skip-deps   # skip dependency installs
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
SKIP_DEPS="${SKIP_DEPS:-0}"
if [ "${1:-}" = "--skip-deps" ]; then SKIP_DEPS=1; fi

PIDS=()
PORT_SERVER=5000
PORT_AI=8000
PORT_CHAIN=8545

cleanup() {
  echo
  echo "== Shutting down Digital Evidence Management System demo =="
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null
  done
}
trap cleanup EXIT INT TERM

fail() { echo "✖ $1" >&2; exit 1; }
have_cmd() { command -v "$1" >/dev/null 2>&1; }

echo "======================================================="
echo " Secure Evidence DMS — SIH26190 Demo Launcher"
echo " root: $ROOT"
echo "======================================================="

# ---- Tool availability ------------------------------------------------
have_cmd node || fail "node >= 18 is required"
have_cmd npm  || fail "npm is required"
have_cmd python3 || have_cmd python || fail "python3 is required"
have_cmd docker || echo "! docker not found — will assume PostgreSQL is already running"

# ---- 1. PostgreSQL -----------------------------------------------------
echo
echo "== [1/5] PostgreSQL =="
if have_cmd docker; then
  docker compose up -d postgres_db 2>&1 | tail -n 3
  echo "  > Postgres container requested (service: postgres_db)."
else
  echo "  > Skipping docker; ensure DATABASE_URL points to a running Postgres."
fi

# ---- 2. Install dependencies ------------------------------------------
echo
echo "== [2/5] Dependencies =="
if [ "$SKIP_DEPS" = "1" ]; then
  echo "  --skip-deps set; skipping installs"
else
  echo "  > server (npm ci)"
  (cd server && npm ci >/dev/null 2>&1) || echo "  ! server npm ci failed — npm install instead"
  echo "  > contracts (npm ci + build artifacts)"
  (cd contracts && npm ci >/dev/null 2>&1) || echo "  ! contracts npm ci failed — npm install instead"
  echo "  > ai-engine (pip install)"
  PY=$(command -v python3 || command -v python)
  (cd ai-engine && "$PY" -m pip install -r requirements.txt >/dev/null 2>&1) || echo "  ! ai-engine pip install failed"
fi

# ---- 3. Database schema + demo seed ------------------------------------
echo
echo "== [3/5] Database schema + demo seed =="
(cd server && npx prisma migrate deploy >/dev/null 2>&1) || (cd server && npx prisma db push --force-reset >/dev/null 2>&1)

# ---- 4. Hardhat node + contract deploy --------------------------------
echo
echo "== [4/5] Blockchain (hardhat node :$PORT_CHAIN + deploy) =="
(cd contracts && npx hardhat node >../logs/hardhat.log 2>&1) &
PIDS+=($!)
echo "  > hardhat node starting (logs/hardhat.log)"
sleep 3
(cd contracts && npx hardhat run scripts/deploy.js --network localhost >../logs/deploy.log 2>&1)
echo "  > contract deploy -> logs/deploy.log (copy CONTRACT_ADDRESS into server/.env)"

# ---- 5. Express REST API ----------------------------------------------
echo
echo "== [5/5] Express API (:${PORT_SERVER}) + FastAPI AI (:${PORT_AI}) =="
(cd server && npm run start >../logs/server.log 2>&1) &
PIDS+=($!)
echo "  > express server starting (logs/server.log)"

PY=$(command -v python3 || command -v python)
(cd ai-engine && "$PY" -m uvicorn main:app --host 0.0.0.0 --port "$PORT_AI" >../logs/ai.log 2>&1) &
PIDS+=($!)
echo "  > fastapi ai engine starting (logs/ai.log)"

# ---- Health checks -----------------------------------------------------
echo
echo "== Health checks =="
for i in $(seq 1 30); do
  OK=1
  curl -sf "http://127.0.0.1:${PORT_SERVER}/health" >/dev/null 2>&1 || OK=0
  curl -sf "http://127.0.0.1:${PORT_AI}/health" >/dev/null 2>&1 || OK=0
  if [ "$OK" = "1" ]; then
    echo "  ✔ Express + FastAPI healthy after ${i}s"
    break
  fi
  sleep 1
done

echo
echo "  Server API : http://127.0.0.1:${PORT_SERVER}/health"
echo "  AI engine  : http://127.0.0.1:${PORT_AI}/health"
echo "  Blockchain : http://127.0.0.1:${PORT_CHAIN}"

# ---- Frontend ----------------------------------------------------------
echo
echo "== Opening frontend =="
if [ -f "client/index.html" ]; then
  START_OR_OPEN=start; command -v open >/dev/null 2>&1 && START_OR_OPEN=open
  "$START_OR_OPEN" "client/index.html" 2>/dev/null || echo "  > open client/index.html manually"
fi

echo
echo "Digital Evidence Management System demo is running. Ctrl-C to stop all services."
echo "Logs: $ROOT/logs/{server,ai,hardhat,deploy}.log"
wait
