$ErrorActionPreference = "Stop"

function Invoke-Npm {
  param([string[]]$Arguments)
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm command failed: npm $($Arguments -join ' ')"
  }
}

Write-Host "== NAVA App verification =="

Write-Host ""
Write-Host "1. Build"
Invoke-Npm -Arguments @("run", "build")

Write-Host ""
Write-Host "2. Lint"
Invoke-Npm -Arguments @("run", "lint")

Write-Host ""
Write-Host "3. Audit"
Invoke-Npm -Arguments @("audit")

Write-Host ""
Write-Host "4. Motion response tests"
Invoke-Npm -Arguments @("run", "motion:test")

Write-Host ""
Write-Host "5. Rhythm algorithm tests"
Invoke-Npm -Arguments @("run", "algorithm:test")

Write-Host ""
Write-Host "6. FDNB health algorithm tests"
Invoke-Npm -Arguments @("run", "fdnb:test")

Write-Host ""
Write-Host "7. AI prompt tests"
Invoke-Npm -Arguments @("run", "ai:prompt:test")

Write-Host ""
Write-Host "8. Structured entry parser"
Invoke-Npm -Arguments @("run", "structured:test")

Write-Host ""
Write-Host "9. Backend contract"
Invoke-Npm -Arguments @("run", "backend:verify")

Write-Host ""
Write-Host "10. Edge Function type check"
Invoke-Npm -Arguments @("run", "backend:typecheck")

Write-Host ""
Write-Host "11. Phone OTP tests"
Invoke-Npm -Arguments @("run", "backend:test")

Write-Host ""
Write-Host "12. iOS project contract"
Invoke-Npm -Arguments @("run", "ios:verify")

Write-Host ""
Write-Host "Verification completed."
