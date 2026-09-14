param([ValidateSet("PublicAiLogin", "TodoExtraction", "PriorityAdvice")][string]$Check = "PublicAiLogin")

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $scriptPath = if ($Check -eq "TodoExtraction") { "scripts/verify-todo-extraction.mjs" } elseif ($Check -eq "PriorityAdvice") { "scripts/verify-priority-advice.mjs" } else { "scripts/verify-public-ai-login.mjs" }
  & node $scriptPath
  if ($LASTEXITCODE -ne 0) { throw "Authenticated AI acceptance failed." }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
