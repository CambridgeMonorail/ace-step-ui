@echo off
REM Helper script to start ACE-Step UI with Pinokio installation
REM Sets ACESTEP_PATH to the Pinokio installation and runs start-all.bat

set ACESTEP_PATH=C:\Users\%USERNAME%\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5

echo Setting ACESTEP_PATH to: %ACESTEP_PATH%
echo.

call start-all.bat
