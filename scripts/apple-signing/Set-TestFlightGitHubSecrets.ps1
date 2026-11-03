[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$P12Path,
    [Parameter(Mandatory = $true)] [string]$AppProvisioningProfilePath,
    [Parameter(Mandatory = $true)] [string]$WatchProvisioningProfilePath,
    [Parameter(Mandatory = $true)] [string]$AppStoreConnectPrivateKeyPath,
    [Parameter(Mandatory = $true)] [string]$AppStoreConnectKeyId,
    [Parameter(Mandatory = $true)] [string]$AppStoreConnectIssuerId,
    [SecureString]$P12Password,
    [string]$EnvironmentName = 'testflight'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is required.' }
& gh auth status 2>$null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

function Resolve-RequiredFile([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label not found: $Path" }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Convert-FileToBase64([string]$Path) {
    return [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
}

function Set-GitHubEnvironmentSecret([string]$Name, [string]$Value) {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'gh'
    $startInfo.Arguments = "secret set $Name --env $EnvironmentName"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Could not start gh for $Name." }
    $process.StandardInput.Write($Value)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Could not set $Name. $errorOutput $output" }
    Write-Host "Configured GitHub environment secret: $Name"
}

$resolvedP12 = Resolve-RequiredFile $P12Path 'P12 signing identity'
$resolvedAppProfile = Resolve-RequiredFile $AppProvisioningProfilePath 'iPhone provisioning profile'
$resolvedWatchProfile = Resolve-RequiredFile $WatchProvisioningProfilePath 'Watch provisioning profile'
$resolvedApiKey = Resolve-RequiredFile $AppStoreConnectPrivateKeyPath 'App Store Connect private key'
if (-not $P12Password) { $P12Password = Read-Host 'P12 password' -AsSecureString }

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($P12Password)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Set-GitHubEnvironmentSecret 'APPLE_DISTRIBUTION_CERTIFICATE_BASE64' (Convert-FileToBase64 $resolvedP12)
    Set-GitHubEnvironmentSecret 'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD' $plainPassword
    Set-GitHubEnvironmentSecret 'APPLE_PROVISIONING_PROFILE_APP_BASE64' (Convert-FileToBase64 $resolvedAppProfile)
    Set-GitHubEnvironmentSecret 'APPLE_PROVISIONING_PROFILE_WATCH_BASE64' (Convert-FileToBase64 $resolvedWatchProfile)
    Set-GitHubEnvironmentSecret 'APP_STORE_CONNECT_KEY_ID' $AppStoreConnectKeyId.Trim()
    Set-GitHubEnvironmentSecret 'APP_STORE_CONNECT_ISSUER_ID' $AppStoreConnectIssuerId.Trim()
    Set-GitHubEnvironmentSecret 'APP_STORE_CONNECT_PRIVATE_KEY' ([IO.File]::ReadAllText($resolvedApiKey))
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    $plainPassword = $null
}

Write-Host "All TestFlight secrets are configured in GitHub environment '$EnvironmentName'."
