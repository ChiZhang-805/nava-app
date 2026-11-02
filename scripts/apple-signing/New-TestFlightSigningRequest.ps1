[CmdletBinding()]
param(
    [string]$OutputDirectory = 'Q:\NAVA-Workspace\Build\AppleSigning',
    [string]$CommonName = 'Chi Zhang',
    [string]$Organization = 'NAVA'
)

$ErrorActionPreference = 'Stop'

function Resolve-OpenSsl {
    $command = Get-Command openssl -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        'C:\Program Files\Git\usr\bin\openssl.exe',
        'C:\Program Files\Git\mingw64\bin\openssl.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw 'OpenSSL was not found. Install Git for Windows or pass the generated CSR work to a trusted machine.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$approvedRoot = [System.IO.Path]::GetFullPath('Q:\NAVA-Workspace\Build')
if (-not $resolvedOutput.StartsWith($approvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must stay under $approvedRoot."
}

$privateKeyPath = Join-Path $resolvedOutput 'nava-apple-distribution-private.key.pem'
$csrPath = Join-Path $resolvedOutput 'NAVA_Apple_Distribution.certSigningRequest'
$receiptPath = Join-Path $resolvedOutput 'signing-request-receipt.txt'

foreach ($path in @($privateKeyPath, $csrPath, $receiptPath)) {
    if (Test-Path -LiteralPath $path) {
        throw "Refusing to overwrite existing signing material: $path"
    }
}

if (-not (Test-Path -LiteralPath $resolvedOutput)) {
    New-Item -ItemType Directory -Path $resolvedOutput | Out-Null
}

$openssl = Resolve-OpenSsl
$subject = "/CN=$CommonName/O=$Organization"

try {
    & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out $privateKeyPath
    if ($LASTEXITCODE -ne 0) { throw 'OpenSSL could not generate the private key.' }

    & $openssl req -new -sha256 -key $privateKeyPath -out $csrPath -subj $subject
    if ($LASTEXITCODE -ne 0) { throw 'OpenSSL could not generate the certificate signing request.' }

    & $openssl req -in $csrPath -noout -verify
    if ($LASTEXITCODE -ne 0) { throw 'The generated certificate signing request did not verify.' }

    $keyHash = (Get-FileHash -LiteralPath $privateKeyPath -Algorithm SHA256).Hash
    $csrHash = (Get-FileHash -LiteralPath $csrPath -Algorithm SHA256).Hash
    @(
        'NAVA Apple Distribution signing request',
        "GeneratedUtc=$([DateTime]::UtcNow.ToString('o'))",
        "Subject=$subject",
        "TeamId=P9N6YYZ7Y9",
        'BundleId=health.nava.mobile',
        "PrivateKeySha256=$keyHash",
        "CsrSha256=$csrHash",
        'PrivateKeyStorage=LOCAL_ONLY_DO_NOT_UPLOAD_TO_GIT_OR_APPLE'
    ) | Set-Content -LiteralPath $receiptPath -Encoding UTF8
}
catch {
    foreach ($path in @($csrPath, $receiptPath, $privateKeyPath)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    throw
}

Write-Host "CSR ready for Apple: $csrPath"
Write-Host "Private key retained locally: $privateKeyPath"
Write-Warning 'Back up the private key securely. Apple receives the CSR only; never upload the private key to GitHub or Apple.'
