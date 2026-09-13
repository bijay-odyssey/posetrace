@echo off
setlocal
rem Installs deps on first run, then starts the PoseTrace dev server (HTTPS,
rem LAN-visible) so you can test it on this PC or on a phone.
rem   start.bat          -> dev server (default)
rem   start.bat build    -> production build, served with `vite preview`
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    exit /b 1
  )
)

if /i "%~1"=="build" (
  echo Building the production bundle and serving it...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    exit /b 1
  )
  call npm run preview
) else (
  echo Starting the PoseTrace dev server...
  echo   - This PC:            https://localhost:5173
  echo   - Same-Wi-Fi phone:   use the "Network" URL Vite prints below
  echo   - Accept the self-signed HTTPS certificate warning, then allow camera access
  echo   - iPhone Safari: Share -^> Add to Home Screen to install it
  echo.
  echo Press Ctrl+C to stop.
  echo.
  call npm run dev
)

endlocal
