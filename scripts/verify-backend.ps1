Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functionsRoot = Join-Path $root "supabase\functions"
$requiredFunctions = @(
  "diet-extract",
  "face-analyze",
  "health-sync-ingest",
  "watch-sync",
  "rhythm-score",
  "export-user-data"
)

Write-Host "== NAVA App backend verification =="

foreach ($functionName in $requiredFunctions) {
  $index = Join-Path $functionsRoot "$functionName\index.ts"
  if (!(Test-Path -LiteralPath $index)) {
    throw "Missing Edge Function: $functionName"
  }
  Write-Host "Found function: $functionName"
}

$sharedFiles = @("_shared\http.ts", "_shared\rhythm.ts", "_shared\rhythm-core.ts")
foreach ($shared in $sharedFiles) {
  $path = Join-Path $functionsRoot $shared
  if (!(Test-Path -LiteralPath $path)) {
    throw "Missing shared backend file: $shared"
  }
}

$migrations = Get-ChildItem -LiteralPath (Join-Path $root "supabase\migrations") -Filter "*.sql"
if ($migrations.Count -lt 2) {
  throw "Expected at least 2 Supabase migrations."
}
Write-Host "Migration files: $($migrations.Count)"

$frontendServiceRoleHits = Select-String -Path (Join-Path $root "src\**\*.*") -Pattern "SERVICE_ROLE|service_role" -CaseSensitive:$false -ErrorAction SilentlyContinue
if ($frontendServiceRoleHits) {
  throw "Frontend must not reference service role secrets."
}
Write-Host "Frontend secret scan: ok"

$deno = Get-Command deno -ErrorAction SilentlyContinue
if ($deno) {
  foreach ($functionName in $requiredFunctions) {
    $index = Join-Path $functionsRoot "$functionName\index.ts"
    Write-Host "Deno check: $functionName"
    deno check $index
  }
} else {
  Write-Host "Deno not found; skipped Deno type check."
}

Write-Host "Backend verification completed."
