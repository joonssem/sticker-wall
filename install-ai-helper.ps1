# Sticker Wall AI helper installer.
# Run this from PowerShell with the one-line command shown on the website.
# irm "https://joonssem.github.io/sticker-wall/install-ai-helper.ps1" | iex

$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'StickerWallAI'
$HelperFile = Join-Path $InstallDir 'ai-helper.js'
$LauncherFile = Join-Path $InstallDir 'launch-ai-helper.ps1'
$NodeDir = Join-Path $InstallDir 'node'
$NodeExe = Join-Path $NodeDir 'node.exe'
$NodeVersion = 'v24.14.1'
$NodeArchive = Join-Path $env:TEMP "node-$NodeVersion-win-x64.zip"
$NodePackageUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$HelperUrl = 'https://joonssem.github.io/sticker-wall/ai-helper.js'

function Get-Download {
    param([string]$Uri, [string]$Destination, [long]$MinimumBytes = 1)

    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & curl.exe --fail --location --retry 3 --retry-delay 2 --output $Destination $Uri
        if ($LASTEXITCODE -eq 0 -and (Test-Path $Destination) -and ((Get-Item $Destination).Length -ge $MinimumBytes)) { return }
        Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    }

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest -Uri $Uri -OutFile $Destination -UseBasicParsing
            if ((Get-Item $Destination).Length -ge $MinimumBytes) { return }
        } catch {
            if ($attempt -eq 3) { throw }
            Start-Sleep -Seconds (2 * $attempt)
        }
        Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    }
    throw "Could not download $Uri"
}

Write-Host ''
Write-Host 'Preparing Sticker Wall AI helper…' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host 'Downloading AI helper…'
Get-Download -Uri $HelperUrl -Destination $HelperFile -MinimumBytes 1000

if (-not (Test-Path $NodeExe)) {
    Write-Host 'Downloading Node.js runtime (one-time setup)…'
    Get-Download -Uri $NodePackageUrl -Destination $NodeArchive -MinimumBytes 1000000
    $ExtractDir = Join-Path $InstallDir "node-$NodeVersion-win-x64"
    if (Test-Path $ExtractDir) { Remove-Item -LiteralPath $ExtractDir -Recurse -Force }
    Expand-Archive -LiteralPath $NodeArchive -DestinationPath $InstallDir -Force
    Move-Item -LiteralPath $ExtractDir -Destination $NodeDir -Force
    Remove-Item -LiteralPath $NodeArchive -Force -ErrorAction SilentlyContinue
}

@'
$ErrorActionPreference = 'Stop'
$InstallDir = Split-Path -Parent $PSCommandPath
$NodeExe = Join-Path $InstallDir 'node\node.exe'
$HelperFile = Join-Path $InstallDir 'ai-helper.js'
$Port = 8787

function Test-HelperRunning {
    try {
        $client = [Net.Sockets.TcpClient]::new()
        $client.Connect('127.0.0.1', $Port)
        $client.Dispose()
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-HelperRunning)) {
    Start-Process -FilePath $NodeExe -ArgumentList @($HelperFile) -WorkingDirectory $InstallDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 700
}
Start-Process 'http://127.0.0.1:8787/'
'@ | Set-Content -LiteralPath $LauncherFile -Encoding UTF8

$ProtocolKey = 'HKCU:\Software\Classes\stickerwall-ai'
New-Item -Path "$ProtocolKey\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $ProtocolKey -Name '(Default)' -Value 'URL:Sticker Wall AI Protocol'
Set-ItemProperty -Path $ProtocolKey -Name 'URL Protocol' -Value ''
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ProtocolCommand = "`"$PowerShellExe`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$LauncherFile`" `"%1`""
Set-ItemProperty -Path "$ProtocolKey\shell\open\command" -Name '(Default)' -Value $ProtocolCommand

Write-Host ''
Write-Host 'Installation complete.' -ForegroundColor Green
Write-Host "Install folder: $InstallDir"
Write-Host 'Next time, use the AI helper button on the Sticker Wall home page.'
& $LauncherFile
