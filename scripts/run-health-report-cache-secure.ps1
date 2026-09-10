param(
  [Parameter(Mandatory = $true)][string]$End,
  [ValidateSet("all", "mood", "sleep", "exercise", "focus", "face", "weekly")][string]$Scope = "all"
)

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  & node scripts/verify-account-health-report-cache.mjs "--end=$End" "--scope=$Scope"
  if ($LASTEXITCODE -ne 0) { throw "Health report cache verification failed." }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
