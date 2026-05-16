@echo off
setlocal
REM Launch Edge/Chrome with TradingView chart and CDP enabled
REM Usage: scripts\launch_tv_debug_edge.bat [port]

set "PORT=%1"
if "%PORT%"=="" set "PORT=9222"

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo Error: Edge/Chrome not found.
  exit /b 1
)

set "PROFILE_DIR=%TEMP%\tradingview-mcp-browser-profile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%" >nul 2>&1

echo Launching TradingView chart in browser with CDP on port %PORT%...
start "" "%BROWSER%" --remote-debugging-port=%PORT% --user-data-dir="%PROFILE_DIR%" --new-window https://www.tradingview.com/chart/

echo Waiting for CDP...
ping -n 6 127.0.0.1 >nul

set /a WAIT_ATTEMPTS=0
:check
curl -s http://localhost:%PORT%/json/version >nul 2>&1
if %errorlevel% neq 0 (
  set /a WAIT_ATTEMPTS+=1
  if %WAIT_ATTEMPTS% geq 20 (
    echo Error: CDP did not come up on port %PORT%.
    exit /b 1
  )
  ping -n 3 127.0.0.1 >nul
  goto check
)

echo CDP ready at http://localhost:%PORT%
curl -s http://localhost:%PORT%/json/version
echo.
endlocal
