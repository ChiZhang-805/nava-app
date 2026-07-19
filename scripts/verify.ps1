$ErrorActionPreference = "Stop"

Write-Host "== NAVA App verification =="

Write-Host ""
Write-Host "1. Build"
npm run build

Write-Host ""
Write-Host "2. Lint"
npm run lint

Write-Host ""
Write-Host "3. Audit"
npm audit

Write-Host ""
Write-Host "4. Motion response tests"
npm run motion:test

Write-Host ""
Write-Host "Verification completed."
