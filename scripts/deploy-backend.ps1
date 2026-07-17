param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [switch]$SkipDbPush,
  [switch]$SkipFunctions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functions = @(
  "diet-extract",
  "face-analyze",
  "health-sync-ingest",
  "watch-sync",
  "rhythm-score",
  "export-user-data"
)

if (!$ProjectRef) {
  throw "Missing Supabase project ref. Pass -ProjectRef or set SUPABASE_PROJECT_REF."
}

$supabase = Get-Command supabase -ErrorAction SilentlyContinue
if (!$supabase) {
  throw "Supabase CLI is not installed. Install it first, then rerun this script."
}

Push-Location $root
try {
  Write-Host "== Link Supabase project =="
  supabase link --project-ref $ProjectRef

  if (!$SkipDbPush) {
    Write-Host "== Push database migrations =="
    supabase db push
  }

  if (!$SkipFunctions) {
    Write-Host "== Deploy Edge Functions =="
    foreach ($functionName in $functions) {
      Write-Host "Deploying $functionName"
      supabase functions deploy $functionName --project-ref $ProjectRef
    }
  }

  Write-Host ""
  Write-Host "Backend deploy completed."
  Write-Host "Optional secrets for formal algorithm providers:"
  Write-Host "  supabase secrets set NAVA_DIET_EXTRACT_URL=... NAVA_DIET_EXTRACT_KEY=... --project-ref $ProjectRef"
  Write-Host "  supabase secrets set NAVA_FACE_ANALYZE_URL=... NAVA_FACE_ANALYZE_KEY=... --project-ref $ProjectRef"
} finally {
  Pop-Location
}
