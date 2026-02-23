@echo off
REM ACE-Step UI - Debug Mode Startup Script
REM Similar to start-all.bat but for development with hot reload
REM Frontend runs on port 5173 (Vite dev server)
setlocal

echo ==================================
echo   ACE-Step UI - Debug Mode
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: UI dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Get ACE-Step path from environment or use default
if "%ACESTEP_PATH%"=="" (
    set ACESTEP_PATH=..\ACE-Step-1.5
)

REM Check if ACE-Step exists
if not exist "%ACESTEP_PATH%" (
    echo.
    echo Warning: ACE-Step not found at %ACESTEP_PATH%
    echo.
    echo Please set ACESTEP_PATH or place ACE-Step-1.5 next to ace-step-ui
    echo Example: set ACESTEP_PATH=C:\ACE-Step-1.5
    echo.
    pause
    exit /b 1
)

REM Detect ACE-Step installation type
set API_COMMAND=
if exist "%ACESTEP_PATH%\python_embeded\python.exe" (
    echo [+] Detected Windows Portable Package
    set API_COMMAND=python_embeded\python acestep\api_server.py
) else if exist "%ACESTEP_PATH%\env\Scripts\python.exe" (
    echo [+] Detected Virtual Environment Installation
    set API_COMMAND=env\Scripts\python.exe acestep\api_server.py
) else (
    echo [+] Detected UV Installation
    set API_COMMAND=uv run acestep-api --port 8001
)

echo.
echo ==================================
echo   Starting Services in Debug Mode
echo ==================================
echo.

REM Start ACE-Step API in new window
echo [1/3] Starting ACE-Step API server...
echo          Enabling Language Model for metadata generation...
start "ACE-Step API - DEBUG" cmd /k "cd /d "%ACESTEP_PATH%" && set ACESTEP_INIT_LLM=true && set ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-4B && %API_COMMAND%"

REM Wait for API to start
echo Waiting for API to initialize...
timeout /t 5 /nobreak >nul

REM Start backend in new window with ACESTEP_PATH
echo [2/3] Starting backend server...
start "Backend Server - DEBUG" cmd /k "cd /d "%~dp0server" && set ACESTEP_PATH=%ACESTEP_PATH% && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend in new window (Vite dev server)
echo [3/3] Starting frontend dev server...
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
