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
Write-Host "3. Sites artifact module identity"
Invoke-Npm -Arguments @("run", "sites:artifact:test")

Write-Host ""
Write-Host "4. Audit"
Invoke-Npm -Arguments @("audit")

Write-Host ""
Write-Host "5. Motion response tests"
Invoke-Npm -Arguments @("run", "motion:test")

Write-Host ""
Write-Host "6. Daily module completion and routing"
Invoke-Npm -Arguments @("run", "module-progress:test")

Write-Host ""
Write-Host "7. Four-viewport record-card geometry"
Invoke-Npm -Arguments @("run", "module-progress:visual")

Write-Host ""
Write-Host "8. Four-viewport record-editor geometry"
Invoke-Npm -Arguments @("run", "record-editor:visual")

Write-Host ""
Write-Host "9. Diet dish-presentation contract"
Invoke-Npm -Arguments @("run", "diet:presentation:test")

Write-Host ""
Write-Host "10. Nutrition meal and aggregate integrity"
Invoke-Npm -Arguments @("run", "nutrition:integrity:test")

Write-Host ""
Write-Host "11. Rhythm algorithm tests"
Invoke-Npm -Arguments @("run", "algorithm:test")

Write-Host ""
Write-Host "12. FDNB health algorithm tests"
Invoke-Npm -Arguments @("run", "fdnb:test")

Write-Host ""
Write-Host "13. AI prompt tests"
Invoke-Npm -Arguments @("run", "ai:prompt:test")

Write-Host ""
Write-Host "14. AI dual-summary contract"
Invoke-Npm -Arguments @("run", "ai:compact:test")

Write-Host ""
Write-Host "15. Structured entry parser"
Invoke-Npm -Arguments @("run", "structured:test")

Write-Host ""
Write-Host "16. Backend contract"
Invoke-Npm -Arguments @("run", "backend:verify")

Write-Host ""
Write-Host "17. Edge Function type check"
Invoke-Npm -Arguments @("run", "backend:typecheck")

Write-Host ""
Write-Host "18. Phone OTP tests"
Invoke-Npm -Arguments @("run", "backend:test")

Write-Host ""
Write-Host "19. Native health and auth contract"
Invoke-Npm -Arguments @("run", "health:contract:test")

Write-Host ""
Write-Host "20. iOS project contract"
Invoke-Npm -Arguments @("run", "ios:verify")

Write-Host ""
Write-Host "21. Consent and real-data boundary contract"
Invoke-Npm -Arguments @("run", "consent:contract:test")

Write-Host ""
Write-Host "22. Browser translation DOM resilience"
Invoke-Npm -Arguments @("run", "translation:test")

Write-Host ""
Write-Host "23. Supabase request reuse and refresh boundaries"
Invoke-Npm -Arguments @("run", "performance:test")

Write-Host ""
Write-Host "24. Notification planner contract"
Invoke-Npm -Arguments @("run", "notification:test")

Write-Host ""
Write-Host "25. Home guidance and mascot-state contract"
Invoke-Npm -Arguments @("run", "home-guidance:test")

Write-Host ""
Write-Host "26. Home widget and maintenance contracts"
Invoke-Npm -Arguments @("run", "home-widgets:test")

Write-Host ""
Write-Host "27. Cloud persistence, export, and deletion contracts"
Invoke-Npm -Arguments @("run", "cloud-data:test")

Write-Host ""
Write-Host "Verification completed."
