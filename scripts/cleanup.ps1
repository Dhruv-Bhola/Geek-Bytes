# =============================================================================
# cleanup.ps1 - Safe workspace cleanup for the Digital DMS repo (cyberissues)
#
# Prunes redundant dependencies (root node_modules), Python bytecode, Hardhat
# build caches, and temporary scratch/log output - while STRICTLY preserving:
#   * Core source  : client/, server/src/, ai-engine/app/, database/,
#                    contracts/contracts/ (.js/.py/.sol/.html/.css)
#   * Configs      : .env, docker-compose.yml, hardhat.config.js,
#                    server/prisma/schema.prisma, migrations, seed scripts
#   * Storage      : server/data/encrypted/.gitkeep, server/uploads/.gitkeep,
#                    and the active AES-encrypted *.bin runtime artifacts
#
# All destructive ops use -ErrorAction SilentlyContinue and are best-effort.
# =============================================================================

$ErrorActionPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0

$ROOT = Split-Path -Parent $PSScriptRoot   # repo root (parent of this script's folder)
if ($ROOT -eq '') { $ROOT = (Get-Location).Path }
Set-Location $ROOT

function Get-SizeMB([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
              Measure-Object -Property Length -Sum).Sum
    return [math]::Round(($bytes / 1MB), 2)
  }
  return 0
}

function Step([string]$Title) {
  Write-Host ("`n== " + $Title + " ==") -ForegroundColor Cyan
}

# --- Protected markers: confirm they survive at the end ---------------------
# NOTE: 'server\data\encrypted\.gitkeep' is intentionally NOT in this list -
# that folder holds live AES-encrypted *.bin runtime artifacts (no marker).
# We instead verify the artifacts survive by counting them at the end.
$PROTECT_MARKERS = @(
  'server\uploads\.gitkeep',
  'server\.env',
  'server\.env.example',
  'docker-compose.yml',
  'contracts\hardhat.config.js',
  'server\prisma\schema.prisma',
  'database\seeds\seed.js',
  'contracts\contracts\EvidenceAuditLedger.sol'
)
foreach ($m in $PROTECT_MARKERS) {
  if (-not (Test-Path -LiteralPath (Join-Path $ROOT $m))) {
    Write-Host ("  NOTE: protected marker absent (may be ok): " + $m) -ForegroundColor Yellow
  }
}

$before = Get-SizeMB $ROOT
Write-Host ("Project size BEFORE: " + $before + " MB")

# ---------------------------------------------------------------------------
# 1. Python bytecode & runtime caches (ai-engine + any stray copies)
# ---------------------------------------------------------------------------
Step "1. Python bytecode & runtime caches"
Get-ChildItem -LiteralPath (Join-Path $ROOT 'ai-engine') -Recurse -Force -Directory |
  Where-Object { $_.Name -eq '__pycache__' -or $_.Name -eq '.pytest_cache' } |
  ForEach-Object { Write-Host ("  rm -r " + $_.FullName); Remove-Item -LiteralPath $_.FullName -Recurse -Force }
Get-ChildItem -LiteralPath (Join-Path $ROOT 'ai-engine') -Recurse -Force -File |
  Where-Object { $_.Extension -in '.pyc', '.pyo' } |
  ForEach-Object { Write-Host ("  rm " + $_.Name); Remove-Item -LiteralPath $_.FullName -Force }

# ---------------------------------------------------------------------------
# 2. Hardhat cache / artifacts (regenerated via `npx hardhat compile`)
# ---------------------------------------------------------------------------
Step "2. Hardhat build cache & artifacts"
foreach ($d in @('contracts\cache', 'contracts\artifacts', 'contracts\typechain-types')) {
  $p = Join-Path $ROOT $d
  if (Test-Path -LiteralPath $p) {
    Write-Host ("  rm -r " + $d); Remove-Item -LiteralPath $p -Recurse -Force
  }
}

# ---------------------------------------------------------------------------
# 3. Redundant ROOT node_modules (isolated installs live in server/ + contracts/)
# ---------------------------------------------------------------------------
Step "3. Redundant root ./node_modules (accidental duplicate install)"
$rootNM = Join-Path $ROOT 'node_modules'
if (Test-Path -LiteralPath $rootNM) {
  Write-Host "  rm -r ./node_modules (project uses server/node_modules + contracts/node_modules)"
  Remove-Item -LiteralPath $rootNM -Recurse -Force
} else {
  Write-Host "  ./node_modules already absent - skipping"
}

# ---------------------------------------------------------------------------
# 4. Temporary scratch / crash logs (.tmp dumps + root-level logs) - preserve dirs
# ---------------------------------------------------------------------------
Step "4. Temporary scratch & crash log output"
$junkPatterns = @('*.tmp', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*', 'combined.log', 'error.log', '*.dmp', '*.stackdump', 'test_payload*.bin')
foreach ($pat in $junkPatterns) {
  Get-ChildItem -LiteralPath $ROOT -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch '\\(node_modules|\.git|encrypted|staging|uploads)\\' -and
      $_.Name -like $pat
    } |
    ForEach-Object { Write-Host ("  rm " + $_.FullName); Remove-Item -LiteralPath $_.FullName -Force }
}

# ---------------------------------------------------------------------------
# Verify protected markers still present after cleanup
# ---------------------------------------------------------------------------
Write-Host ("`n== Verification: protected items must be present ==") -ForegroundColor Cyan
$missing = @()
foreach ($m in $PROTECT_MARKERS) {
  if (Test-Path -LiteralPath (Join-Path $ROOT $m)) {
    Write-Host ("  OK   " + $m) -ForegroundColor Green
  } else {
    Write-Host ("  MISS " + $m) -ForegroundColor Red
    $missing += $m
  }
}

$after = Get-SizeMB $ROOT
Write-Host ("`nProject size AFTER: " + $after + " MB  (freed " + [math]::Round($before - $after, 2) + " MB)") -ForegroundColor Cyan

# Active AES-encrypted runtime artifacts must survive untouched.
$binDir = Join-Path $ROOT 'server\data\encrypted'
$binCount = 0
if (Test-Path -LiteralPath $binDir) {
  $binCount = (Get-ChildItem -LiteralPath $binDir -Filter *.bin -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host ("  encrypted runtime .bin artifacts preserved: " + $binCount) -ForegroundColor Green
}

if ($missing.Count -gt 0) {
  Write-Host "`nWARNING: the following protected items are missing after cleanup:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host ("  - " + $_) }
  Write-Host "If they existed before, re-check. This run only deletes build/cache/tmp."
  exit 1
}
Write-Host "`nCleanup complete - all protected files intact." -ForegroundColor Green
