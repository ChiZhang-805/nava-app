param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [switch]$SkipDbPush,
  [switch]$SkipFunctions,
  [switch]$ConfigureAuthEmailOtp,
  [switch]$ConfigureSmsSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functions = @(
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

if (!$ProjectRef) {
  throw "Missing Supabase project ref. Pass -ProjectRef or set SUPABASE_PROJECT_REF."
}

$localSupabase = Join-Path $root "node_modules\.bin\supabase.cmd"
if (Test-Path -LiteralPath $localSupabase) {
  $supabaseCommand = $localSupabase
} else {
  $globalSupabase = Get-Command supabase -ErrorAction SilentlyContinue
  if (!$globalSupabase) {
    throw "Supabase CLI is unavailable. Run npm install, then rerun this script."
  }
  $supabaseCommand = $globalSupabase.Source
}

function Invoke-SupabaseCommand {
  param([string[]]$CliArgs)
  & $supabaseCommand @CliArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed: supabase $($CliArgs -join ' ')"
  }
}

Push-Location $root
try {
  Write-Host "== Link Supabase project =="
  Invoke-SupabaseCommand -CliArgs @("link", "--project-ref", $ProjectRef)

  if (!$SkipDbPush) {
    Write-Host "== Push database migrations =="
    Invoke-SupabaseCommand -CliArgs @("db", "push")
  }

  if (!$SkipFunctions) {
    if ($ConfigureSmsSecrets) {
      & (Join-Path $PSScriptRoot "configure-sms-secrets.ps1") -ProjectRef $ProjectRef
    }

    Write-Host "== Deploy Edge Functions =="
    foreach ($functionName in $functions) {
      Write-Host "Deploying $functionName"
      Invoke-SupabaseCommand -CliArgs @("functions", "deploy", $functionName, "--project-ref", $ProjectRef)
    }
  }

  if ($ConfigureAuthEmailOtp) {
    & (Join-Path $PSScriptRoot "configure-auth-email-otp.ps1") -ProjectRef $ProjectRef
  }

  Write-Host ""
  Write-Host "Backend deploy completed."
  Write-Host "Optional secrets for formal algorithm providers:"
  Write-Host "  supabase secrets set NAVA_DIET_EXTRACT_URL=... NAVA_DIET_EXTRACT_KEY=... --project-ref $ProjectRef"
  Write-Host "  supabase secrets set NAVA_FACE_ANALYZE_URL=... NAVA_FACE_ANALYZE_KEY=... --project-ref $ProjectRef"
  Write-Host "Phone OTP deployment:"
  Write-Host "  .\scripts\deploy-backend.ps1 -ProjectRef $ProjectRef -ConfigureSmsSecrets -ConfigureAuthEmailOtp"
} finally {
  Pop-Location
}
