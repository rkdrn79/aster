@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
REM Why %~n0: the native launcher shares this shim's name, so a renamed product needs no edit here.
set "LAUNCHER=%SCRIPT_DIR%%~n0.exe"

if not exist "%LAUNCHER%" (
  echo Unable to locate the native CLI launcher at "%LAUNCHER%" 1>&2
  exit /b 1
)

REM Why: cmd.exe reparses %%* and can execute/truncate embedded newlines. The
REM native launcher is the supported path for orchestration message bodies.
if /I "%~1"=="orchestration" if /I "%~2"=="send" goto :unsafe_body
if /I "%~1"=="orchestration" if /I "%~2"=="reply" goto :unsafe_body

"%LAUNCHER%" %*
exit /b %ERRORLEVEL%

:unsafe_body
echo %~nx0 cannot safely forward orchestration message bodies. Use "%LAUNCHER%" instead. 1>&2
exit /b 2
