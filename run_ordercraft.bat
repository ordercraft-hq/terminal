@echo off
title ORDERCRAFT — Financial Workstation
color 0b

echo ==================================================
echo   ORDERCRAFT — Financial Workstation   
echo ==================================================
echo.

:: Detect project directory
set "PROJECT_DIR=%~dp0"

:START
cd /d "%PROJECT_DIR%"
echo Working Directory: %CD%
echo.

echo [1/2] Starting ORDERCRAFT Go Backend (127.0.0.1:8448)...
start "ORDERCRAFT Backend" cmd /k "title ORDERCRAFT Backend && go run main.go --port 8448 --no-browser"

echo [2/2] Starting Vite Frontend Server (http://localhost:3000)...
start "ORDERCRAFT Frontend" cmd /k "title ORDERCRAFT Frontend && cd frontend && npm run dev"

echo.
echo ==================================================
echo   ORDERCRAFT Terminal is launching!
echo   Frontend: http://localhost:3000
echo   Backend:  http://127.0.0.1:8448
echo ==================================================
echo.
echo Waiting 3 seconds before opening browser...
timeout /t 3 /nobreak >nul

start http://localhost:3000
exit /b 0
