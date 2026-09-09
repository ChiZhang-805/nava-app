param(
  [Parameter(Mandatory = $true)][string]$End,
  [ValidateSet("breakfast", "lunch", "dinner", "pantry")][string]$Meal = "lunch",
  [switch]$PhotoOnly
)

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  & node scripts/generate-account-ai-secure.mjs "--end=$End" "--meal=$Meal" "--photo-only=$($PhotoOnly.IsPresent.ToString().ToLowerInvariant())"
  if ($LASTEXITCODE -ne 0) { throw "Account AI generation failed." }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
