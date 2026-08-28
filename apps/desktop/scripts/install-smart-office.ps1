# 신규 PC용 일괄 설치 스크립트 — install-smart-office.bat이 이 내용을 base64로 인코딩해서
# 담고 있다("EncodedCommand"로 실행하는 이유는 배치 파일 안에 이 스크립트를 그대로
# 옮겨적으면 따옴표/특수문자 이스케이프가 골치 아파서다). 이 파일 자체는 사람이 읽고
# 고치는 원본이고, .bat을 다시 만들 때 이 파일 내용을 인코딩해서 넣는다
# (scripts/build-install-bat.ps1 참고).
#
# 인증서 등록만 관리자 권한이 필요하다(LocalMachine\Root에 쓰기 때문) — 앱 설치
# 자체는 1인 1PC 개인 설치(perMachine:false)라 필요 없다. 그래서 이 스크립트는
# 전체를 관리자 권한으로 실행하지 않고, 인증서 등록 한 단계만 별도 프로세스로
# 승격시킨다(Start-Process -Verb RunAs) — UAC 확인 창이 그 한 번만 뜬다.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$certUrl = 'https://smart-school-updates.web.app/smart-office-codesign.cer'
$installerUrl = 'https://smart-school-updates.web.app/smart-office-setup-latest.exe'
$workDir = Join-Path $env:TEMP 'smart-office-install'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

Write-Host '[1/3] 보안 인증서를 내려받는 중...'
$certPath = Join-Path $workDir 'cert.cer'
Invoke-WebRequest -Uri $certUrl -OutFile $certPath -UseBasicParsing

Write-Host '[2/3] 인증서를 등록하는 중... 관리자 권한 확인 창이 뜨면 예를 눌러주세요.'
try {
    $proc = Start-Process -FilePath 'certutil.exe' -ArgumentList @('-f', '-addstore', 'Root', $certPath) -Verb RunAs -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Host '  인증서 등록이 완료되지 않았습니다(취소했거나 오류). 설치는 계속 진행합니다.'
    }
} catch {
    Write-Host '  인증서 등록을 건너뛰었습니다(권한 확인 창에서 취소한 것으로 보입니다). 설치는 계속 진행합니다.'
}

Write-Host '[3/3] 프로그램을 내려받는 중...'
$setupPath = Join-Path $workDir 'setup.exe'
Invoke-WebRequest -Uri $installerUrl -OutFile $setupPath -UseBasicParsing

Write-Host ''
Write-Host '설치 창이 뜨면 안내에 따라 "다음/설치"를 눌러 완료해 주세요.'
# /S(완전 무인 설치)는 안 쓴다 — 이 PC에 이전에 관리자 권한으로 설치된 적이 있으면
# NSIS가 "모든 사용자/나만" 선택 대화상자를 띄우는데, 이 대화상자는 /S로도 안
# 숨겨져서 안내 없이 그대로 멈춘 것처럼 보인다(2026-08-29, 실제로 겪음). 마법사를
# 그대로 띄워서 뭘 눌러야 하는지 눈에 보이게 하는 편이 60대 규모 배포에서 더 안전하다.
Start-Process -FilePath $setupPath -Wait

Write-Host ''
Write-Host '설치가 끝났습니다. 이 창은 닫으셔도 됩니다.'
Start-Sleep -Seconds 3
