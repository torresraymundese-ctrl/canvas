@echo off
setlocal
title Director Canvas Launcher

set "TARGET=%~1"
set "MODE=%~2"

if not defined TARGET (
  for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "$n=[string][char]30011+[char]24067; Join-Path 'D:\' $n"`) do set "TARGET=%%I"
)

if not defined LOCAL_APP_PORT set "LOCAL_APP_PORT=4187"
set "CANVAS_URL=http://127.0.0.1:%LOCAL_APP_PORT%/"
set "HEALTH_URL=http://127.0.0.1:%LOCAL_APP_PORT%/api/health"

if not defined TARGET goto target_error
if not exist "%TARGET%\package.json" goto app_error
if not exist "%TARGET%\server\index.js" goto app_error
where node.exe >nul 2>&1
if errorlevel 1 goto node_error

powershell.exe -NoProfile -Command "try { $r=Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 2; if($r.data.status -eq 'ok'){exit 0} } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto ready

echo Starting Director Canvas. Please wait...
if not exist "%TARGET%\runtime" mkdir "%TARGET%\runtime" >nul 2>&1
start "Director Canvas Service" /min /D "%TARGET%" node.exe --env-file-if-exists=.env server/index.js --port=%LOCAL_APP_PORT% <nul >"%TARGET%\runtime\launcher.log" 2>&1

powershell.exe -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{$r=Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 2;if($r.data.status -eq 'ok'){exit 0}}catch{};Start-Sleep -Milliseconds 250};exit 1" >nul 2>&1
if errorlevel 1 goto start_error

:ready
if /i "%MODE%"=="--no-browser" exit /b 0
start "" "%CANVAS_URL%"
exit /b 0

:target_error
echo.
echo [ERROR TARGET] Canvas target folder could not be resolved.
pause
exit /b 2

:app_error
echo.
echo [ERROR APP] Canvas program files are missing in:
echo %TARGET%
pause
exit /b 3

:node_error
echo.
echo [ERROR NODE] Node.js is not available on PATH.
pause
exit /b 4

:start_error
echo.
echo [ERROR START] Canvas did not become ready within 15 seconds.
echo Close any process using port %LOCAL_APP_PORT% and try again.
pause
exit /b 5
