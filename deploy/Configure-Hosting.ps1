param(
    [Parameter(Mandatory=$true)][string]$BackendUrl,
    [Parameter(Mandatory=$true)][string]$FrontendUrl
)
$ErrorActionPreference = 'Stop'
function Read-Origin([string]$Value) {
    $uri = [Uri]$Value
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo -or -not $uri.IsDefaultPort) {
        throw 'Use a complete HTTPS origin, with no path, port, credentials, query or fragment.'
    }
    return $uri.GetLeftPart([UriPartial]::Authority)
}
$backendOrigin = Read-Origin $BackendUrl
$frontendOrigin = Read-Origin $FrontendUrl
$projectDir = Split-Path $PSScriptRoot -Parent
$cloudEnvPath = Join-Path $PSScriptRoot '.env.cloud'
if (Test-Path -LiteralPath $cloudEnvPath) {
    throw '.env.cloud already exists. Update its origins manually to preserve the existing secret.'
}
$secretBytes = New-Object byte[] 48
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
$secret = [Convert]::ToBase64String($secretBytes)
$config = [ordered]@{
    '$schema' = 'https://openapi.vercel.sh/vercel.json'
    framework = 'vite'
    buildCommand = 'npm run build'
    outputDirectory = 'dist'
    rewrites = @(
        @{ source = '/api/:path*'; destination = "$backendOrigin/api/:path*" },
        @{ source = '/uploads/:path*'; destination = "$backendOrigin/uploads/:path*" },
        @{ source = '/((?!api(?:/|$)|uploads(?:/|$)).*)'; destination = '/index.html' }
    )
}
$envText = @"
BACKEND_DOMAIN=$(([Uri]$backendOrigin).Host)
SECRET_KEY=$secret
CORS_ORIGINS=$frontendOrigin
PATIENT_PORTAL_URL=$frontendOrigin/patient
BREAST_MODEL_PATH=app/ml/weights/breast_model.pth
CERVICAL_MODEL_PATH=app/ml/weights/cervical_model.pth
PCOS_MODEL_PATH=app/ml/weights/pcos_model.pth
"@
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($cloudEnvPath, $envText, $utf8)
[System.IO.File]::WriteAllText((Join-Path $projectDir 'frontend/vercel.json'), ($config | ConvertTo-Json -Depth 5), $utf8)
Write-Output 'Hosting settings created. The cloud secret stays in deploy/.env.cloud; do not commit or share it.'
