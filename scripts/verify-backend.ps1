Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functionsRoot = Join-Path $root "supabase\functions"
$requiredFunctions = @(
  "ai-extract-data",
  "ai-chat-reply",
  "ai-diet-report",
  "ai-health-report",
  "diet-extract",
  "face-analyze",
  "health-sync-ingest",
  "watch-sync",
  "rhythm-score",
  "dnb-weekly-report",
  "fdnb-recompute",
  "export-user-data",
  "delete-account",
  "aliyun-sms-send",
  "aliyun-sms-verify",
  "security-contact-otp",
  "auth-account-status"
)

Write-Host "== NAVA App backend verification =="

foreach ($functionName in $requiredFunctions) {
  $index = Join-Path $functionsRoot "$functionName\index.ts"
  if (!(Test-Path -LiteralPath $index)) {
    throw "Missing Edge Function: $functionName"
  }
  Write-Host "Found function: $functionName"
}

$sharedFiles = @("_shared\http.ts", "_shared\phone-otp.ts", "_shared\knowledge-tools.ts", "_shared\nutrition-evidence.ts", "_shared\consent.ts", "_shared\source-fingerprint.ts", "_shared\storage-ownership.ts", "_shared\rhythm.ts", "_shared\rhythm-core.ts", "_shared\fdnb-health-core.ts", "_shared\fdnb-health-features.ts", "_shared\fdnb-health-service.ts")
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

$frontendSharedHealthSecretHits = Select-String -LiteralPath $frontendFiles.FullName -Pattern "HEALTH_EXPORT_API_KEY|VITE_HEALTH_EXPORT|x-api-key" -CaseSensitive:$false -ErrorAction SilentlyContinue
if ($frontendSharedHealthSecretHits) {
  throw "Frontend must not contain the retired shared health-ingest credential contract."
}
Write-Host "Health ingest credential scan: JWT-only client contract verified"

Write-Host "Backend contract verification completed. Run npm run backend:typecheck for all Edge Function entrypoints."
