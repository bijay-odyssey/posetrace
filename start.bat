@echo off
setlocal
rem Syncs deps, then starts the PoseTrace dev server (HTTPS, LAN-visible) so
rem you can test it on this PC or on a phone.
rem   start.bat          -> dev server (default)
rem   start.bat build    -> production build, served with `vite preview`
cd /d "%~dp0"

rem `npm install` is a fast no-op when node_modules already matches
rem package.json, so always run it rather than trusting a stale directory
rem after a `git pull`.
echo Syncing dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

if /i "%~1"=="build" (
  echo Building the production bundle and serving it...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
  call npm run preview
  if errorlevel 1 (
    echo.
    echo vite preview exited with an error.
    pause
  )
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
  if errorlevel 1 (
    echo.
    echo The dev server exited with an error.
    pause
  )
)

endlocal
