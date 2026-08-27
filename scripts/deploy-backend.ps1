param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [switch]$ApplyAllMigrations,
  [switch]$SkipFunctions,
  [switch]$DeploySharedFunctions,
  [switch]$ConfigureAuthEmailOtp,
  [switch]$ConfigureAuthSmtp,
  [switch]$ConfigureSmsSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$canonicalProjectRef = "wxteapvwagvhhtrjrbim"
$appFunctions = @(
  "health-sync-ingest",
  "watch-sync",
  "rhythm-score",
  "dnb-weekly-report",
  "fdnb-recompute",
  "export-user-data",
  "delete-account",
  "aliyun-sms-send",
  "aliyun-sms-verify",
  "auth-account-status"
)
$sharedFunctions = @(
  "ai-extract-data",
  "ai-chat-reply",
  "diet-extract",
  "face-analyze"
)

if (!$ProjectRef) {
  $ProjectRef = $canonicalProjectRef
}

if ($ProjectRef -ne $canonicalProjectRef) {
  throw "Refusing deployment to non-canonical project '$ProjectRef'. NAVA APP backend is '$canonicalProjectRef'."
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

  if ($ApplyAllMigrations) {
    Write-Host "== Push database migrations =="
    Invoke-SupabaseCommand -CliArgs @("db", "push")
  } else {
    Write-Host "== Database migrations skipped (use -ApplyAllMigrations after reviewing the migration plan) =="
  }

  if (!$SkipFunctions) {
    if ($ConfigureSmsSecrets) {
      & (Join-Path $PSScriptRoot "configure-sms-secrets.ps1") -ProjectRef $ProjectRef
    }

    Write-Host "== Deploy Edge Functions =="
    $functions = @($appFunctions)
    if ($DeploySharedFunctions) {
      $functions += $sharedFunctions
    }
    foreach ($functionName in $functions) {
      Write-Host "Deploying $functionName"
      Invoke-SupabaseCommand -CliArgs @("functions", "deploy", $functionName, "--project-ref", $ProjectRef)
    }
  }

  if ($ConfigureAuthSmtp) {
    & (Join-Path $PSScriptRoot "configure-auth-smtp.ps1") -ProjectRef $ProjectRef
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
  Write-Host "  .\scripts\deploy-backend.ps1 -ProjectRef $ProjectRef -ConfigureSmsSecrets -ConfigureAuthEmailOtp -ConfigureAuthSmtp"
  Write-Host "Database migrations are never pushed implicitly; add -ApplyAllMigrations only after reviewing the linked project."
} finally {
  Pop-Location
}
