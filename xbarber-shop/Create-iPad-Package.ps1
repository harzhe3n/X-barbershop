$ErrorActionPreference = 'Stop'

$packageDirectory = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $packageDirectory "xbarber-shop-ipad-$timestamp.zip"
$items = @(
    (Join-Path $PSScriptRoot 'src'),
    (Join-Path $PSScriptRoot 'assets'),
    (Join-Path $PSScriptRoot 'database'),
    (Join-Path $PSScriptRoot 'vendor'),
    (Join-Path $PSScriptRoot 'manifest.json'),
    (Join-Path $PSScriptRoot 'sw.js'),
    (Join-Path $PSScriptRoot 'app-mode.json'),
    (Join-Path $PSScriptRoot 'precache-manifest.json'),
    (Join-Path $PSScriptRoot 'server_ios.py'),
    (Join-Path $PSScriptRoot 'README.md')
)

Compress-Archive -Path $items -DestinationPath $destination -CompressionLevel Optimal
Write-Output "iPad package created: $destination"
