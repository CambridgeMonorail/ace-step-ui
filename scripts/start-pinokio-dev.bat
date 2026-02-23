@echo off
REM ACE-Step UI - Debug Mode with Pinokio Installation
REM Starts all services in separate terminals for easier debugging
REM Frontend runs on port 5173 with hot reload

setlocal

echo ==================================
echo   ACE-Step UI - Debug Mode
echo ==================================
echo.

REM Set path to Pinokio installation
set ACESTEP_PATH=C:\Users\%USERNAME%\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5

echo ACESTEP_PATH: %ACESTEP_PATH%
echo.

REM Check if ACE-Step exists
if not exist "%ACESTEP_PATH%\env\Scripts\python.exe" (
    echo Error: ACE-Step not found at %ACESTEP_PATH%
    echo Please verify your Pinokio installation path.
    pause
    exit /b 1
)

echo ==================================
echo   Starting Services in Debug Mode
echo ==================================
echo.

REM Start ACE-Step API in new window
echo [1/3] Starting ACE-Step API (port 8001)...
start "ACE-Step API - DEBUG" cmd /k "cd /d "%ACESTEP_PATH%" && env\Scripts\python.exe acestep\api_server.py"

REM Wait for API to start
echo Waiting for API to initialize...
timeout /t 5 /nobreak >nul

REM Start backend in new window
echo [2/3] Starting Backend Server (port 3001)...
start "Backend Server - DEBUG" cmd /k "cd /d "%~dp0server" && set ACESTEP_PATH=%ACESTEP_PATH% && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend in new window (Vite dev server)
echo [3/3] Starting Frontend Dev Server (port 5173)...
start "Frontend Dev Server - DEBUG" cmd /k "cd /d "%~dp0" && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak >nul

echo.
echo ==================================
echo   Debug Mode Running!
echo ==================================
echo.
echo   ACE-Step API:  http://localhost:8001
echo   Backend:       http://localhost:3001
echo   Frontend:      http://localhost:3000
echo.
echo   Each service has its own window - check them for logs
echo   Close any window to stop that service
echo.
echo ==================================
echo.

echo Opening browser in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo Press any key to close this window (services will keep running)
pause >nul
