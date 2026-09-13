param(
  [Parameter(Mandatory = $true)][string]$Start,
  [Parameter(Mandatory = $true)][string]$End,
  [Parameter(Mandatory = $true)][string]$PhotoDirectory
)

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  & node scripts/import-account-face-test-photos.mjs "--start=$Start" "--end=$End" "--photo-dir=$PhotoDirectory"
  if ($LASTEXITCODE -ne 0) { throw "Account face photo analysis failed." }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
