param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!$ProjectRef) {
  throw "Missing Supabase project ref. Pass -ProjectRef or set SUPABASE_PROJECT_REF."
}
if (!$AccessToken) {
  throw "Missing Supabase personal access token. Pass -AccessToken or set SUPABASE_ACCESS_TOKEN."
}

$root = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $root "supabase\templates\email_otp.html"
if (!(Test-Path -LiteralPath $templatePath)) {
  throw "Missing email OTP template: $templatePath"
}

$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
$payload = @{
  mailer_subjects_confirmation = "{{ .Token }} is your NAVA verification code"
  mailer_subjects_magic_link = "{{ .Token }} is your NAVA verification code"
  mailer_templates_confirmation_content = $template
  mailer_templates_magic_link_content = $template
} | ConvertTo-Json -Depth 4

$headers = @{
  Authorization = "Bearer $AccessToken"
  "Content-Type" = "application/json"
}
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Write-Host "Configuring hosted Supabase email templates for six-digit OTP..."
Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
Write-Host "Email OTP templates configured."
