param(
  [string]$Upstream = "https://github.com/Tj-jiaoao/style-muse-next.git",
  [string]$RemoteName = "web-upstream"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  Write-Host "This script must run inside the nava-app git repository."
  exit 1
}

$existing = git remote
if ($existing -notcontains $RemoteName) {
  git remote add $RemoteName $Upstream
}

git fetch $RemoteName

Write-Host ""
Write-Host "Recent upstream commits:"
git log --oneline -n 12 "$RemoteName/main"

Write-Host ""
Write-Host "Contract-relevant file changes against current HEAD:"
git diff --name-status "HEAD..$RemoteName/main" -- `
  supabase `
  src/integrations `
  src/pages `
  src/mobile `
  package.json `
  capacitor.config.ts

Write-Host ""
Write-Host "Review database migrations, Edge Functions, Supabase types, and mobile source before merging changes."

