param(
  [string]$Anchor = "2026-08-28"
)

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $anchorDate = [datetime]::ParseExact($Anchor, "yyyy-MM-dd", $null)
  $startDate = $anchorDate.AddDays(-13).ToString("yyyy-MM-dd")
  $endDate = $anchorDate.AddDays(-1).ToString("yyyy-MM-dd")

  node scripts/seed-account-history.mjs "--anchor=$Anchor"
  if ($LASTEXITCODE -ne 0) { throw "Core history seed failed." }

  node scripts/backfill-account-auxiliary.mjs "--start=$startDate" "--end=$endDate"
  if ($LASTEXITCODE -ne 0) { throw "Auxiliary history backfill failed." }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
