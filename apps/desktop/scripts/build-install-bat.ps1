# install-smart-office.ps1을 install-smart-office.bat으로 다시 굽는다.
#
# .bat 안에 PS1 내용을 그대로 옮겨적지 않고 base64(-EncodedCommand)로 감싸는 이유 —
# 배치 파일 문법은 %, &, |, <, >, ^, 따옴표에 민감해서 PowerShell 코드를 줄 단위로
# 옮겨적으면 이스케이프가 골치 아프다. base64 블록은 영문·숫자·+/=뿐이라 배치가
# 안전하게 그대로 통과시킨다.
#
# install-smart-office.ps1을 고칠 때마다 이 스크립트를 다시 돌려야 .bat도 같이
# 바뀐다 — 두 파일이 따로 논다는 걸 몰랐다가 옛 로직이 계속 배포되는 사고를 막으려고
# 여기 적어 둔다.
#
# 사용법: apps/desktop에서 `powershell -File scripts/build-install-bat.ps1`
$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
$ps1Path = Join-Path $scriptDir 'install-smart-office.ps1'
$batPath = Join-Path $scriptDir 'install-smart-office.bat'

$content = Get-Content -Path $ps1Path -Raw -Encoding UTF8
$bytes = [System.Text.Encoding]::Unicode.GetBytes($content)
$encoded = [Convert]::ToBase64String($bytes)

$batLines = @(
    '@echo off'
    'title Smart Office Install'
    "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    'pause'
    ''
)
# 순수 ASCII로만 — 한글 안내문은 전부 PS1 쪽(Write-Host)이 맡는다. 배치 파일 자체에
# 비ASCII를 넣으면 콘솔 코드페이지에 따라 깨질 수 있는데, EncodedCommand는 이미
# UTF-16이라 코드페이지와 무관하게 항상 안전하다.
[System.IO.File]::WriteAllText($batPath, ($batLines -join "`r`n"), [System.Text.Encoding]::ASCII)

Write-Host "written: $batPath ($((Get-Item $batPath).Length) bytes)"
