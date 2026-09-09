# 스티커 담벼락 AI 도우미 설치 관리자
# PowerShell에서 다음 한 줄로 실행합니다.
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

Write-Host ''
Write-Host '스티커 담벼락 AI 도우미를 준비합니다.' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host 'AI 도우미 파일을 가져오는 중…'
Invoke-WebRequest -Uri $HelperUrl -OutFile $HelperFile -UseBasicParsing

if (-not (Test-Path $NodeExe)) {
    Write-Host '실행 환경(Node.js)을 준비하는 중입니다. 처음 한 번만 필요합니다…'
    Invoke-WebRequest -Uri $NodePackageUrl -OutFile $NodeArchive -UseBasicParsing
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
Write-Host '설치가 끝났습니다.' -ForegroundColor Green
Write-Host "설치 폴더: $InstallDir"
Write-Host '앞으로는 스티커 담벼락 첫 페이지의 “AI 도우미 켜기” 버튼만 누르세요.'
& $LauncherFile
