[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppleCertificatePath,
    [string]$SigningDirectory = 'Q:\NAVA-Workspace\Build\AppleSigning',
    [SecureString]$P12Password
)

$ErrorActionPreference = 'Stop'

function Resolve-OpenSsl {
    $command = Get-Command openssl -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @('C:\Program Files\Git\usr\bin\openssl.exe', 'C:\Program Files\Git\mingw64\bin\openssl.exe')) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw 'OpenSSL was not found.'
}

$resolvedSigningDirectory = [System.IO.Path]::GetFullPath($SigningDirectory)
$approvedRoot = [System.IO.Path]::GetFullPath('Q:\NAVA-Workspace\Build')
if (-not $resolvedSigningDirectory.StartsWith($approvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "SigningDirectory must stay under $approvedRoot."
}

$certificateInput = (Resolve-Path -LiteralPath $AppleCertificatePath).Path
$privateKeyPath = Join-Path $resolvedSigningDirectory 'nava-apple-distribution-private.key.pem'
$certificatePemPath = Join-Path $resolvedSigningDirectory 'nava-apple-distribution-certificate.pem'
$p12Path = Join-Path $resolvedSigningDirectory 'nava-apple-distribution.p12'
$certificatePublicKeyPath = Join-Path $resolvedSigningDirectory '.certificate-public-key.pem'
$privatePublicKeyPath = Join-Path $resolvedSigningDirectory '.private-public-key.pem'

if (-not (Test-Path -LiteralPath $privateKeyPath)) { throw "Private key not found: $privateKeyPath" }
foreach ($path in @($certificatePemPath, $p12Path)) {
    if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite existing signing material: $path" }
}
if (-not $P12Password) { $P12Password = Read-Host 'Choose a strong password for the exported P12' -AsSecureString }

$openssl = Resolve-OpenSsl
$plainPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($P12Password)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($plainPasswordPointer)
    $env:NAVA_P12_EXPORT_PASSWORD = $plainPassword

    & $openssl x509 -inform DER -in $certificateInput -out $certificatePemPath 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $openssl x509 -inform PEM -in $certificateInput -out $certificatePemPath
        if ($LASTEXITCODE -ne 0) { throw 'The downloaded Apple certificate is neither valid DER nor PEM.' }
    }

    & $openssl x509 -in $certificatePemPath -pubkey -noout -out $certificatePublicKeyPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the Apple certificate public key.' }
    & $openssl pkey -in $privateKeyPath -pubout -out $privatePublicKeyPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the local private key.' }

    $certificateKeyHash = (Get-FileHash -LiteralPath $certificatePublicKeyPath -Algorithm SHA256).Hash
    $privateKeyHash = (Get-FileHash -LiteralPath $privatePublicKeyPath -Algorithm SHA256).Hash
    if ($certificateKeyHash -ne $privateKeyHash) {
        throw 'The Apple certificate does not match the local private key used to create the CSR.'
    }

    & $openssl pkcs12 -export -inkey $privateKeyPath -in $certificatePemPath -out $p12Path -name 'NAVA Apple Distribution' -passout env:NAVA_P12_EXPORT_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'OpenSSL could not create the P12 signing identity.' }
}
finally {
    Remove-Item Env:NAVA_P12_EXPORT_PASSWORD -ErrorAction SilentlyContinue
    if ($plainPasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainPasswordPointer) }
    foreach ($path in @($certificatePublicKeyPath, $privatePublicKeyPath)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
}

Write-Host "P12 ready: $p12Path"
Write-Warning 'Keep the P12 and its password outside Git. They become two separate GitHub environment secrets only when the upload workflow is enabled.'
