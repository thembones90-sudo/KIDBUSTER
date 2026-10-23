# Scout owner-only release procedure (master-account pilot). Phases:
#   -Phase Check  (default) read-only: fingerprint file format, git state, local gate.
#   -Phase Env    adds production-only RADAR_VAN_ENABLED and RADAR_VAN_OWNER_SHA256
#                 (sensitive). Refuses if either already exists. Reads the
#                 fingerprint from the git-ignored file via stdin; never prints it.
#   -Phase Stage  creates a STAGED production candidate (--prod --skip-domain);
#                 nothing is promoted. Then runs the live candidate checks.
# There is deliberately NO promote phase: promotion needs the owner's explicit
# authorization and is done by hand (see RELEASE-CHECKLIST.md).
param(
  [ValidateSet('Check', 'Env', 'Stage')][string]$Phase = 'Check',
  [string]$Fingerprint = 'A:\PATHFINDER V2\.v2-local\scout-owner-sha256.txt',
  [string]$Vercel = 'A:\PATHFINDER V2\.v2-local\vercel-cli\node_modules\.bin\vercel.cmd'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

function Fail($message) { Write-Error $message; exit 1 }

# --- Check (always runs first) ---
if (-not (Test-Path -LiteralPath $Fingerprint)) { Fail "Fingerprint file not found: $Fingerprint. Run the owner's secure local procedure first." }
$fp = (Get-Content -LiteralPath $Fingerprint -Raw).Trim()
if ($fp -notmatch '^[a-fA-F0-9]{64}$') { Fail 'Fingerprint file is malformed (expected 64 hex characters). Nothing was changed.' }
Remove-Variable fp
& git check-ignore -q -- $Fingerprint 2>$null
if ($LASTEXITCODE -ne 0 -and $Fingerprint.StartsWith($repo)) { Fail 'Fingerprint file is inside the repository but not git-ignored.' }
$dirty = & git status --porcelain -- index.html api assets scripts vercel.json .vercelignore
if ($dirty) { Fail 'Deployable files have uncommitted changes; commit first so the release is reproducible.' }
$branch = & git rev-parse --abbrev-ref HEAD; $commit = & git rev-parse --short HEAD
& node scripts/verify-release-integrity.cjs
if ($LASTEXITCODE -ne 0) { Fail 'Local release integrity gate failed.' }
Write-Output "CHECK OK: fingerprint well-formed (not shown), branch $branch at $commit, gate passed."
if ($Phase -eq 'Check') { exit 0 }

# --- Env ---
if ($Phase -eq 'Env') {
  $names = (& $Vercel env ls production 2>&1 | Out-String)
  foreach ($name in 'RADAR_VAN_ENABLED', 'RADAR_VAN_OWNER_SHA256') {
    if ($names -match "(?m)^\s*$name\s") { Fail "$name already exists in production; review it in the Vercel dashboard instead of overwriting." }
  }
  'true' | & $Vercel env add RADAR_VAN_ENABLED production --no-sensitive
  if ($LASTEXITCODE -ne 0) { Fail 'Could not add RADAR_VAN_ENABLED.' }
  (Get-Content -LiteralPath $Fingerprint -Raw).Trim().ToLowerInvariant() | & $Vercel env add RADAR_VAN_OWNER_SHA256 production --sensitive
  if ($LASTEXITCODE -ne 0) { Fail 'Could not add RADAR_VAN_OWNER_SHA256 (RADAR_VAN_ENABLED was added; remove it if you abort).' }
  Write-Output 'ENV OK: production-only RADAR_VAN_ENABLED and RADAR_VAN_OWNER_SHA256 (sensitive) added. Preview/development untouched. No deployment changed yet.'
  exit 0
}

# --- Stage ---
$out = & $Vercel deploy --prod --skip-domain --yes 2>&1 | Out-String
$url = ([regex]::Matches($out, 'https://kidbuster-[a-z0-9]+-thembones90-sudos-projects\.vercel\.app') | Select-Object -Last 1).Value
if ($LASTEXITCODE -ne 0 -or -not $url) { Write-Output $out; Fail 'Staged deployment failed (a release integrity failure stops the build here).' }
Write-Output "STAGED (not promoted): $url"
if (-not $env:VERCEL_AUTOMATION_BYPASS_SECRET) { Write-Output 'Set VERCEL_AUTOMATION_BYPASS_SECRET to run the live checks against the protected candidate.' }
& node tools/release/candidate-smoke.mjs $url --expect-scout enabled
if ($LASTEXITCODE -ne 0) { Fail "Live candidate checks failed for $url. Do not promote." }
Write-Output "Live candidate checks passed. Next: owner verifies Scout in the browser on $url, then authorizes promotion (RELEASE-CHECKLIST.md)."
