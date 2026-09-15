@echo off
call "%~dp0scripts\start-canvas.cmd" "%~dp0" %*
exit /b %ERRORLEVEL%
