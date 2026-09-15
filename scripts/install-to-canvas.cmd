@echo off
setlocal
title Director Canvas Installer

set "SOURCE=%~dp0app"
set "TARGET=%~1"

if not defined TARGET (
  for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "$n=[string][char]30011+[char]24067; Join-Path 'D:\' $n"`) do set "TARGET=%%I"
)

if not exist "%SOURCE%\package.json" goto source_error
if not defined TARGET goto target_error
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%TARGET%" goto target_error

echo Updating Director Canvas files. Please wait...
robocopy "%SOURCE%" "%TARGET%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1
set "COPY_RESULT=%ERRORLEVEL%"

if %COPY_RESULT% GEQ 8 goto copy_error

echo.
echo [OK] INSTALLATION COMPLETED.
echo You can close this window now.
pause
exit /b 0

:source_error
echo.
echo [ERROR] The app folder is missing or incomplete.
echo Extract the whole delivery package before running this file.
pause
exit /b 1

:target_error
echo.
echo [ERROR] The target folder could not be created.
pause
exit /b 2

:copy_error
echo.
echo [ERROR] Copy failed. Error code: %COPY_RESULT%
echo Please send a screenshot of this window.
pause
exit /b %COPY_RESULT%
