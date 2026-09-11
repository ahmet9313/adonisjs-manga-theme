[CmdletBinding()]
param(
    [switch]$Seed,
    [switch]$Production,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = $null

function Find-Node24 {
    $candidates = @()
    $globalNode = Get-Command node -ErrorAction SilentlyContinue
    if ($globalNode) { $candidates += $globalNode.Source }
    $candidates += Get-ChildItem -Path (Join-Path $PSScriptRoot '.tools') -Filter node.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName

    foreach ($candidate in $candidates) {
        $major = [int]((& $candidate --version).TrimStart('v').Split('.')[0])
        if ($major -ge 24) { return $candidate }
    }
    return $null
}

function Install-PortableNode24 {
    Write-Host '[start] Node.js 24 taşınabilir sürümü proje içine indiriliyor...'
    $architecture = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
        'Arm64' { 'arm64' }
        'X64' { 'x64' }
        default { throw "Desteklenmeyen Windows mimarisi: $_" }
    }

    $distUrl = 'https://nodejs.org/dist/latest-v24.x'
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$distUrl/SHASUMS256.txt").Content
    $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})  (node-v[^\s]+-win-$architecture\.zip)$")
    if (-not $match.Success) { throw 'Node.js 24 indirme paketi bulunamadı.' }

    $expectedHash = $match.Groups[1].Value
    $archiveName = $match.Groups[2].Value
    $toolsDirectory = Join-Path $PSScriptRoot '.tools'
    $archivePath = Join-Path $toolsDirectory $archiveName
    New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "$distUrl/$archiveName" -OutFile $archivePath

    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        Remove-Item -LiteralPath $archivePath -Force
        throw 'Node.js paketinin SHA256 doğrulaması başarısız.'
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDirectory -Force
    Remove-Item -LiteralPath $archivePath -Force
    $extractedDirectory = Join-Path $toolsDirectory ([IO.Path]::GetFileNameWithoutExtension($archiveName))
    return Join-Path $extractedDirectory 'node.exe'
}

$nodeCommand = Find-Node24
if (-not $nodeCommand) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host '[start] Node.js 24+ winget ile kuruluyor/yükseltiliyor...'
        if (Get-Command node -ErrorAction SilentlyContinue) {
            & winget upgrade --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
        }
        else {
            & winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
        }
        $env:Path = "${env:ProgramFiles}\nodejs;${env:LOCALAPPDATA}\Programs\nodejs;$env:Path"
        $nodeCommand = Find-Node24
    }
    if (-not $nodeCommand) { $nodeCommand = Install-PortableNode24 }
}

$nodeDirectory = Split-Path -Parent $nodeCommand
$env:Path = "$nodeDirectory;$env:Path"

$scriptArgs = @()
if ($Seed) { $scriptArgs += '--seed' }
if ($Production) { $scriptArgs += '--production' }
if ($Check) { $scriptArgs += '--check' }

& $nodeCommand scripts/setup-and-start.mjs @scriptArgs
exit $LASTEXITCODE
