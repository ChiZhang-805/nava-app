$ErrorActionPreference = "Stop"

function Invoke-Npm {
  param([string[]]$Arguments)
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm command failed: npm $($Arguments -join ' ')"
  }
}

Write-Host "== NAVA App verification =="
Invoke-Npm -Arguments @("run", "repository:scan")
Invoke-Npm -Arguments @("run", "locale:test")

Invoke-Npm -Arguments @("run", "external-preview:test")
Invoke-Npm -Arguments @("run", "phone-system:test")
Invoke-Npm -Arguments @("run", "wellbeing:test")
Invoke-Npm -Arguments @("run", "media-feedback:test")
Invoke-Npm -Arguments @("run", "native-photos:test")
Invoke-Npm -Arguments @("run", "ios:verify:portable")
Invoke-Npm -Arguments @("run", "media-feedback:visual")
Invoke-Npm -Arguments @("run", "camera:visual")
Invoke-Npm -Arguments @("run", "external-preview:visual")
Invoke-Npm -Arguments @("run", "desktop-simulator:visual")

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
Invoke-Npm -Arguments @("run", "mascot:visual")
Invoke-Npm -Arguments @("run", "mascot:interaction:visual")

Write-Host ""
Write-Host "6. Daily module completion and routing"
Invoke-Npm -Arguments @("run", "module-progress:test")

Write-Host ""
Write-Host "7. Four-viewport record-card geometry"
Invoke-Npm -Arguments @("run", "module-progress:visual")

Write-Host ""
Write-Host "8. Six-module overview and AI geometry"
Invoke-Npm -Arguments @("run", "module-overviews:visual")

Write-Host ""
Write-Host "9. Four-viewport record-editor geometry"
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
Invoke-Npm -Arguments @("run", "journal:voice:test")

Write-Host ""
Write-Host "16. Weekly report and focus-flow contracts"
Invoke-Npm -Arguments @("run", "weekly-report:test")
Invoke-Npm -Arguments @("run", "weekly-report:visual")

Write-Host ""
Write-Host "17. Backend contract"
Invoke-Npm -Arguments @("run", "backend:verify")

Write-Host ""
Write-Host "18. Edge Function type check"
Invoke-Npm -Arguments @("run", "backend:typecheck")

Write-Host ""
Write-Host "19. Phone OTP tests"
Invoke-Npm -Arguments @("run", "backend:test")

Write-Host ""
Write-Host "20. Native health and auth contract"
Invoke-Npm -Arguments @("run", "health:contract:test")

Write-Host ""
Write-Host "21. iOS project contract"
Invoke-Npm -Arguments @("run", "ios:verify")

Write-Host ""
Write-Host "22. Consent and real-data boundary contract"
Invoke-Npm -Arguments @("run", "consent:contract:test")

Write-Host ""
Write-Host "23. Browser translation DOM resilience"
Invoke-Npm -Arguments @("run", "translation:test")

Write-Host ""
Write-Host "24. Supabase request reuse and refresh boundaries"
Invoke-Npm -Arguments @("run", "performance:test")

Write-Host ""
Write-Host "25. Notification planner contract"
Invoke-Npm -Arguments @("run", "notification:test")

Write-Host ""
Write-Host "26. Home guidance and mascot-state contract"
Invoke-Npm -Arguments @("run", "home-guidance:test")

Write-Host ""
Write-Host "27. Home widget and maintenance contracts"
Invoke-Npm -Arguments @("run", "home-widgets:test")

Write-Host ""
Write-Host "27a. Quarterly calendar geometry"
Invoke-Npm -Arguments @("run", "calendar:visual")

Write-Host ""
Write-Host "28. Cloud persistence, export, and deletion contracts"
Invoke-Npm -Arguments @("run", "cloud-data:test")

Write-Host ""
Write-Host "29. Exercise session and recovery contracts"
Invoke-Npm -Arguments @("run", "exercise:test")

Write-Host ""
Write-Host "30. Native remote-push contracts"
Invoke-Npm -Arguments @("run", "push:contract:test")

Write-Host ""
Write-Host "31. Apple device preview catalog"
Invoke-Npm -Arguments @("run", "device-preview:test")

Write-Host ""
Write-Host "32. Points shop and daily AI conversation contracts"
Invoke-Npm -Arguments @("run", "shop:test")

Write-Host ""
Write-Host "33. Desktop focus-event preview and mobile isolation"
Invoke-Npm -Arguments @("run", "focus-preview:visual")

Write-Host ""
Write-Host "Verification completed."
