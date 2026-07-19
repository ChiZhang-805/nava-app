Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$functionRoot = Join-Path $root "supabase\functions"
$entrypoints = Get-ChildItem -LiteralPath $functionRoot -Directory |
  ForEach-Object { Join-Path $_.FullName "index.ts" } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Sort-Object

if ($entrypoints.Count -eq 0) {
  throw "No Supabase Edge Function entrypoints were found."
}

Write-Host "Deno checking $($entrypoints.Count) Edge Functions..."
Push-Location $root
try {
  & npx -y deno check @entrypoints
  if ($LASTEXITCODE -ne 0) {
    throw "Deno type checking failed."
  }
} finally {
  Pop-Location
}

