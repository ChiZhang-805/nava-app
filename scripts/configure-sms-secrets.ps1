param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessKeyId = $(if ($env:ALIYUN_SMS_ACCESS_KEY_ID) { $env:ALIYUN_SMS_ACCESS_KEY_ID } else { $env:ALIBABA_CLOUD_ACCESS_KEY_ID }),
  [string]$AccessKeySecret = $(if ($env:ALIYUN_SMS_ACCESS_KEY_SECRET) { $env:ALIYUN_SMS_ACCESS_KEY_SECRET } else { $env:ALIBABA_CLOUD_ACCESS_KEY_SECRET }),
  [string]$SignName = $env:ALIYUN_SMS_SIGN_NAME,
  [string]$TemplateCode = $env:ALIYUN_SMS_TEMPLATE_CODE,
  [string]$TemplateParamKey = $(if ($env:ALIYUN_SMS_TEMPLATE_PARAM_KEY) { $env:ALIYUN_SMS_TEMPLATE_PARAM_KEY } else { "code" }),
  [string]$OtpHmacSecret = $env:NAVA_OTP_HMAC_SECRET
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!$ProjectRef) { throw "Missing Supabase project ref. Pass -ProjectRef or set SUPABASE_PROJECT_REF." }
if (!$AccessKeyId) { throw "Missing ALIYUN_SMS_ACCESS_KEY_ID." }
if (!$AccessKeySecret) { throw "Missing ALIYUN_SMS_ACCESS_KEY_SECRET." }
if (!$SignName) { throw "Missing ALIYUN_SMS_SIGN_NAME. Use an approved Alibaba Cloud SMS signature." }
if (!$TemplateCode) { throw "Missing ALIYUN_SMS_TEMPLATE_CODE. Use an approved verification-code template." }
if (!$TemplateParamKey) { throw "ALIYUN_SMS_TEMPLATE_PARAM_KEY cannot be empty." }

$root = Split-Path -Parent $PSScriptRoot
$localSupabase = Join-Path $root "node_modules\.bin\supabase.cmd"
if (Test-Path -LiteralPath $localSupabase) {
  $supabaseCommand = $localSupabase
} else {
  $globalSupabase = Get-Command supabase -ErrorAction SilentlyContinue
  if (!$globalSupabase) { throw "Supabase CLI is unavailable. Run npm install first." }
  $supabaseCommand = $globalSupabase.Source
}

if (!$OtpHmacSecret) {
  $bytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($bytes)
  } finally {
    $random.Dispose()
  }
  $OtpHmacSecret = ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
  Write-Host "Generated a new NAVA_OTP_HMAC_SECRET for this Supabase project."
}

if ($OtpHmacSecret.Length -lt 32) { throw "NAVA_OTP_HMAC_SECRET must contain at least 32 characters." }

function ConvertTo-DotEnvValue {
  param([string]$Value)
  if ($Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "Secret values cannot contain line breaks."
  }
  return '"' + $Value.Replace("\", "\\").Replace('"', '\"') + '"'
}

$temporaryEnv = Join-Path ([IO.Path]::GetTempPath()) "nava-sms-$([Guid]::NewGuid().ToString('N')).env"
$lines = @(
  "ALIYUN_SMS_ACCESS_KEY_ID=$(ConvertTo-DotEnvValue $AccessKeyId)",
  "ALIYUN_SMS_ACCESS_KEY_SECRET=$(ConvertTo-DotEnvValue $AccessKeySecret)",
  "ALIYUN_SMS_SIGN_NAME=$(ConvertTo-DotEnvValue $SignName)",
  "ALIYUN_SMS_TEMPLATE_CODE=$(ConvertTo-DotEnvValue $TemplateCode)",
  "ALIYUN_SMS_TEMPLATE_PARAM_KEY=$(ConvertTo-DotEnvValue $TemplateParamKey)",
  "NAVA_OTP_HMAC_SECRET=$(ConvertTo-DotEnvValue $OtpHmacSecret)"
)

try {
  [IO.File]::WriteAllLines($temporaryEnv, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host "Configuring server-only SMS secrets for project $ProjectRef..."
  & $supabaseCommand "secrets" "set" "--env-file" $temporaryEnv "--project-ref" $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw "Supabase rejected one or more SMS secrets." }
  Write-Host "SMS secrets configured. Secret values were not written to the repository or exposed as CLI arguments."
} finally {
  if (Test-Path -LiteralPath $temporaryEnv) {
    Remove-Item -LiteralPath $temporaryEnv -Force
  }
}
