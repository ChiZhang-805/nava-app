param(
  [Parameter(Mandatory = $true)][string]$End,
  [string]$Start = "",
  [ValidateSet("breakfast", "lunch", "dinner", "pantry")][string]$Meal = "lunch",
  [switch]$PhotoOnly,
  [switch]$DietOnly,
  [switch]$HealthOnly,
  [string]$Scope = "",
  [bool]$Refresh = $true
)

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $firstDate = [datetime]::ParseExact($(if ($Start) { $Start } else { $End }), "yyyy-MM-dd", $null)
  $lastDate = [datetime]::ParseExact($End, "yyyy-MM-dd", $null)
  if ($firstDate -gt $lastDate) { throw "Start must be on or before End." }
  for ($day = $firstDate; $day -le $lastDate; $day = $day.AddDays(1)) {
    $date = $day.ToString("yyyy-MM-dd")
    & node scripts/generate-account-ai-secure.mjs "--end=$date" "--meal=$Meal" "--photo-only=$($PhotoOnly.IsPresent.ToString().ToLowerInvariant())" "--diet-only=$($DietOnly.IsPresent.ToString().ToLowerInvariant())" "--health-only=$($HealthOnly.IsPresent.ToString().ToLowerInvariant())" "--scope=$Scope" "--refresh=$($Refresh.ToString().ToLowerInvariant())"
    if ($LASTEXITCODE -ne 0) { throw "Account AI generation failed." }
  }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
