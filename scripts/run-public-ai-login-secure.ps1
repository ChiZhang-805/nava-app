param([ValidateSet("PublicAiLogin", "TodoExtraction", "PriorityAdvice", "TaskQuadrants", "PublicQuadrants", "FocusEncouragement", "FocusRelease", "ExternalPreview", "Reminders", "RemindersRelease", "Wellbeing", "HistoryAi", "MealChain", "CameraLayout", "SimulatorLayout", "MascotPlayer", "CalendarReport", "ResponsiveLayout")][string]$Check = "PublicAiLogin")

$secureEmail = Read-Host "NAVA account email" -AsSecureString
$securePassword = Read-Host "NAVA account password" -AsSecureString
$emailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureEmail)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:NAVA_ACCOUNT_EMAIL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($emailPointer)
  $env:NAVA_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ($Check -eq "CalendarReport" -or $Check -eq "ResponsiveLayout") {
    if ($Check -eq "ResponsiveLayout") { & node --experimental-strip-types scripts/verify-public-calendar-report.mjs --responsive }
    else { & node --experimental-strip-types scripts/verify-public-calendar-report.mjs }
    if ($LASTEXITCODE -ne 0) { throw "Public calendar/report acceptance failed." }
    return
  }
  if ($Check -eq "MascotPlayer") {
    & node scripts/verify-public-mascot-player.mjs
    if ($LASTEXITCODE -ne 0) { throw "Public mascot acceptance failed." }
    return
  }
  if ($Check -eq "CameraLayout" -or $Check -eq "SimulatorLayout") {
    if ($Check -eq "SimulatorLayout") { $env:NAVA_CAMERA_QA_DESKTOP = "1" }
    & node scripts/verify-public-camera-layout.mjs
    if ($LASTEXITCODE -ne 0) { throw "Public camera layout acceptance failed." }
    return
  }
  if ($Check -eq "MealChain") {
    & node scripts/verify-meal-chain-account.mjs
    if ($LASTEXITCODE -ne 0) { throw "Authenticated meal-chain acceptance failed; inspect recovery receipt." }
    return
  }
  if ($Check -eq "HistoryAi") {
    & node scripts/verify-history-ai-account.mjs
    if ($LASTEXITCODE -ne 0) { throw "Authenticated historical AI acceptance failed." }
    return
  }
  if ($Check -eq "RemindersRelease") {
    foreach ($siteUrl in @("https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/")) {
      $env:NAVA_REMINDER_UI_URL = $siteUrl
      & node scripts/verify-reminder-account.mjs
      if ($LASTEXITCODE -ne 0) { throw "Public reminder acceptance failed; stop before making further preference changes." }
      $env:NAVA_WELLBEING_UI_URL = $siteUrl
      & node --experimental-strip-types scripts/verify-wellbeing-account.mjs
      if ($LASTEXITCODE -ne 0) { throw "Public wellbeing acceptance failed." }
    }
    return
  }
  if ($Check -eq "Wellbeing") {
    & node --experimental-strip-types scripts/verify-wellbeing-account.mjs
    if ($LASTEXITCODE -ne 0) { throw "Authenticated wellbeing acceptance failed." }
    return
  }
  if ($Check -eq "Reminders") {
    & node scripts/verify-reminder-account.mjs
    if ($LASTEXITCODE -ne 0) { throw "Authenticated reminder acceptance failed." }
    return
  }
  if ($Check -eq "ExternalPreview") {
    & node scripts/verify-public-external-events.mjs
    if ($LASTEXITCODE -ne 0) { throw "Authenticated external-event acceptance failed." }
    return
  }
  $scriptPath = if ($Check -eq "TodoExtraction") { "scripts/verify-todo-extraction.mjs" } elseif ($Check -eq "PriorityAdvice") { "scripts/verify-priority-advice.mjs" } elseif ($Check -eq "TaskQuadrants") { "scripts/verify-task-quadrants.mjs" } elseif ($Check -eq "PublicQuadrants") { "scripts/verify-public-task-quadrants.mjs" } elseif ($Check -eq "FocusEncouragement") { "scripts/verify-focus-encouragement.mjs" } else { "scripts/verify-public-ai-login.mjs" }
  if ($Check -eq "FocusRelease") {
    $failedSites = 0
    foreach ($siteUrl in @("https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/")) {
      $env:NAVA_FOCUS_UI_URL = $siteUrl
      Write-Host "Focus release acceptance: $siteUrl"
      & node scripts/verify-focus-encouragement.mjs
      if ($LASTEXITCODE -ne 0) { $failedSites += 1; Write-Warning "This site's authenticated AI acceptance failed; continuing to inspect the other site." }
    }
    if ($failedSites -gt 0) { throw "Authenticated focus release acceptance failed on $failedSites site(s)." }
  } else {
    & node $scriptPath
    if ($LASTEXITCODE -ne 0) { throw "Authenticated AI acceptance failed." }
  }
} finally {
  if ($Check -eq "SimulatorLayout") { Remove-Item Env:NAVA_CAMERA_QA_DESKTOP -ErrorAction SilentlyContinue }
  if ($Check -eq "RemindersRelease") {
    Remove-Item Env:NAVA_REMINDER_UI_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NAVA_WELLBEING_UI_URL -ErrorAction SilentlyContinue
  }
  if ($Check -eq "FocusRelease") { Remove-Item Env:NAVA_FOCUS_UI_URL -ErrorAction SilentlyContinue }
  Remove-Item Env:NAVA_ACCOUNT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:NAVA_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($emailPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
