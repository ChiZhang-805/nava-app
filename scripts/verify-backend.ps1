Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functionsRoot = Join-Path $root "supabase\functions"
$requiredFunctions = @(
  "ai-extract-data",
  "ai-chat-reply",
  "diet-extract",
  "face-analyze",
  "health-sync-ingest",
  "watch-sync",
  "rhythm-score",
  "export-user-data",
  "aliyun-sms-send",
  "aliyun-sms-verify"
)

Write-Host "== NAVA App backend verification =="

foreach ($functionName in $requiredFunctions) {
  $index = Join-Path $functionsRoot "$functionName\index.ts"
  if (!(Test-Path -LiteralPath $index)) {
    throw "Missing Edge Function: $functionName"
  }
  Write-Host "Found function: $functionName"
}

$sharedFiles = @("_shared\http.ts", "_shared\phone-otp.ts", "_shared\rhythm.ts", "_shared\rhythm-core.ts")
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

$frontendFiles = Get-ChildItem -LiteralPath (Join-Path $root "src") -Recurse -File
$frontendServiceRoleHits = Select-String -LiteralPath $frontendFiles.FullName -Pattern "SERVICE_ROLE|service_role" -CaseSensitive:$false -ErrorAction SilentlyContinue
if ($frontendServiceRoleHits) {
  throw "Frontend must not reference service role secrets."
}
Write-Host "Frontend secret scan: ok"

Write-Host "Backend contract verification completed. Run npm run backend:typecheck for all Edge Function entrypoints."
