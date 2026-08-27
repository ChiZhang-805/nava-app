param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$SmtpHost = $env:NAVA_SMTP_HOST,
  [int]$SmtpPort = $(if ($env:NAVA_SMTP_PORT) { [int]$env:NAVA_SMTP_PORT } else { 587 }),
  [string]$SmtpUser = $env:NAVA_SMTP_USER,
  [string]$SmtpPassword = $env:NAVA_SMTP_PASSWORD,
  [string]$FromEmail = $env:NAVA_SMTP_FROM_EMAIL,
  [string]$SenderName = $(if ($env:NAVA_SMTP_SENDER_NAME) { $env:NAVA_SMTP_SENDER_NAME } else { "NAVA" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!$ProjectRef) { throw "Missing SUPABASE_PROJECT_REF." }
if (!$AccessToken) { throw "Missing SUPABASE_ACCESS_TOKEN." }
if (!$SmtpHost) { throw "Missing NAVA_SMTP_HOST." }
if ($SmtpPort -lt 1 -or $SmtpPort -gt 65535) { throw "NAVA_SMTP_PORT must be between 1 and 65535." }
if (!$SmtpUser) { throw "Missing NAVA_SMTP_USER." }
if (!$SmtpPassword) { throw "Missing NAVA_SMTP_PASSWORD." }
if (!$FromEmail -or $FromEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw "NAVA_SMTP_FROM_EMAIL must be a valid email address." }
if (!$SenderName) { throw "NAVA_SMTP_SENDER_NAME cannot be empty." }

$payload = @{
  external_email_enabled = $true
  mailer_secure_email_change_enabled = $true
  mailer_autoconfirm = $false
  smtp_admin_email = $FromEmail
  smtp_host = $SmtpHost
  smtp_port = $SmtpPort
  smtp_user = $SmtpUser
  smtp_pass = $SmtpPassword
  smtp_sender_name = $SenderName
} | ConvertTo-Json -Depth 4

$headers = @{
  Authorization = "Bearer $AccessToken"
  "Content-Type" = "application/json"
}
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Write-Host "Configuring production SMTP for NAVA Auth..."
Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null

$config = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
if (!$config.external_email_enabled -or $config.mailer_autoconfirm) {
  throw "Supabase Auth email settings did not pass the production safety check."
}
if (!$config.smtp_host -or !$config.smtp_admin_email) {
  throw "Supabase did not persist the custom SMTP configuration."
}
Write-Host "Production SMTP configured. Email confirmation remains required."
