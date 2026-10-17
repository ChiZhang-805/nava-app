param(
  [string]$Blender = 'Q:\NAVA-Workspace\Tools\Blender\blender-5.2.2-windows-x64\blender.exe',
  [string]$RawRoot = 'Q:\NAVA-Workspace\Build\TestRuns\meshy-worn-catalog-v1\api',
  [string]$EvidenceRoot = 'Q:\NAVA-Workspace\Build\TestRuns\wardrobe-full-worn-v261\optimization',
  [string]$OutputRoot = 'src\assets\mascot\models\worn'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$catalogPath = Join-Path $PSScriptRoot 'accessory-catalog-v1.json'
$optimizer = Join-Path $PSScriptRoot 'optimize_full_worn_model.py'
$outputDirectory = Join-Path $repoRoot $OutputRoot
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

$catalog = Get-Content -Raw -Encoding utf8 -LiteralPath $catalogPath | ConvertFrom-Json
$reports = foreach ($item in $catalog.accessories) {
  $slug = $item.slug
  $inputModel = Join-Path $RawRoot "$slug\assets\model.glb"
  $inputTexture = Join-Path $RawRoot "$slug\assets\texture-00-base_color.png"
  $outputModel = Join-Path $outputDirectory "$slug.glb"
  $reportDirectory = Join-Path $EvidenceRoot $slug
  $reportPath = Join-Path $reportDirectory 'report.json'
  New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null

  foreach ($required in @($inputModel, $inputTexture)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing immutable input: $required" }
  }
  # Blender 5.2 writes Python deprecation warnings to stderr even when the
  # process succeeds. Capture that diagnostic stream without allowing
  # PowerShell's Stop preference to misclassify a warning as a failed build;
  # the native exit code and required outputs remain the actual hard gates.
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $blenderOutput = & $Blender --background --python $optimizer -- --name $slug --input $inputModel --texture $inputTexture --output $outputModel --report $reportPath --texture-size 1536 --target-triangles 60000 2>&1
  $blenderExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  $blenderOutput | Out-Host
  if ($blenderExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputModel -PathType Leaf) -or -not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw "Optimization failed for $slug"
  }
  Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
}

$summary = [ordered]@{
  count = $reports.Count
  totalBytes = ($reports | Measure-Object -Property outputBytes -Sum).Sum
  minTriangles = ($reports | Measure-Object -Property trianglesAfter -Minimum).Minimum
  maxTriangles = ($reports | Measure-Object -Property trianglesAfter -Maximum).Maximum
  preservedWornRelationship = -not ($reports.preservedWornRelationship -contains $false)
}
$summary | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $EvidenceRoot 'summary.json')
$summary | ConvertTo-Json
