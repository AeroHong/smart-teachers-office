# 서명된 베타 배포 빌드.
#
# 2026-08-29, 자체 서명 코드 서명 인증서 도입 — SmartScreen/백신 경고를 줄이려고
# "선유고 스마트교무실" 인증서(10년 유효)를 만들었다. 개인키(.pfx)는 이 PC의
# %USERPROFILE%\.smart-office-codesign\ 에만 있고 저장소에는 안 들어간다(유출되면
# 그 인증서로 서명된 뭐든 60대 PC가 신뢰하게 되므로).
#
# 학교 네트워크가 TLS 검사(자체 서명 인증서로 가로챔, 여러 보안 소프트웨어 후보
# 확인됨)를 하고 있어, electron-builder가 실제 서명에 쓰는 winCodeSign 도구를
# Node 기본 CA로는 못 받는다 — Node가 OS 인증서 저장소를 같이 보게 하는
# --use-system-ca로 우회한다(Windows는 이미 그 검사 인증서를 신뢰하고 있어서 통한다).
#
# 사용법: apps/desktop에서 `npm run release:signed`
$ErrorActionPreference = 'Stop'

$certDir = Join-Path $env:USERPROFILE '.smart-office-codesign'
$pfxPath = Join-Path $certDir 'smart-office-codesign.pfx'
$pwPath = Join-Path $certDir 'pfx-password.txt'

if (-not (Test-Path $pfxPath) -or -not (Test-Path $pwPath)) {
    Write-Error "서명 인증서를 찾을 수 없습니다: $certDir`n이 PC에서 처음이라면 인증서부터 새로 만들어야 합니다."
    exit 1
}

$env:CSC_LINK = $pfxPath -replace '\\', '/'
$env:CSC_KEY_PASSWORD = (Get-Content $pwPath -Raw).Trim()
$env:NODE_OPTIONS = '--use-system-ca'

npm run release
