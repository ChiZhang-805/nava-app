param(
  [string]$Anchor = "2026-08-28",
  [string]$Start = "",
  [switch]$AuditOnly,
  [switch]$SummaryOnly,
  [switch]$SkipFace,
  [string]$ReceiptPath = ""
)

function Invoke-HistoryNode {
  param([string[]]$Arguments)
  if ($ReceiptPath) {
    & node @Arguments | Tee-Object -FilePath $ReceiptPath -Append
  } else {
    & node @Arguments
  }
  if ($LASTEXITCODE -ne 0) { throw "History command failed." }
}

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $anchorDate = [datetime]::ParseExact($Anchor, "yyyy-MM-dd", $null)
  $startDate = if ($Start) { [datetime]::ParseExact($Start, "yyyy-MM-dd", $null).ToString("yyyy-MM-dd") } else { $anchorDate.AddDays(-13).ToString("yyyy-MM-dd") }
  $endDate = $anchorDate.AddDays(-1).ToString("yyyy-MM-dd")
  if ($startDate -gt $endDate) { throw "Start must be on or before the day before Anchor." }

  if ($AuditOnly) {
    if ($SummaryOnly) {
      Invoke-HistoryNode @("scripts/audit-account-completeness.mjs", "--start=$startDate", "--end=$endDate")
    } else {
      Invoke-HistoryNode @("scripts/audit-account-history.mjs", "--anchor=$Anchor")
    }
  } else {
    Invoke-HistoryNode @("scripts/seed-account-history.mjs", "--anchor=$Anchor", "--skip-face=$($SkipFace.IsPresent.ToString().ToLowerInvariant())")
    Invoke-HistoryNode @("scripts/backfill-account-auxiliary.mjs", "--start=$startDate", "--end=$endDate")
    if ($SummaryOnly) {
      Invoke-HistoryNode @("scripts/audit-account-completeness.mjs", "--start=$startDate", "--end=$endDate")
    } else {
      Invoke-HistoryNode @("scripts/audit-account-history.mjs", "--anchor=$Anchor")
    }
    if ($ReceiptPath) { "__NAVA_SECURE_HISTORY_COMPLETE__" | Add-Content -LiteralPath $ReceiptPath }
  }
} finally {
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
