@echo off
cd /d "%~dp0"
title TextForever Modern

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
  where py >nul 2>nul && set "PY=py"
)
if not defined PY (
  echo [ERROR] Python 3 not found.
  echo The launcher needs Python to serve the page locally.
  echo Alternative: double-click index.html and use the "Choose folder" button.
  echo.
  pause
  exit /b 1
)

echo Starting local server: http://127.0.0.1:8765
echo Bound to 127.0.0.1 only. Close this window to stop the server.
echo.

start "" /min cmd /c "timeout /t 2 >nul & explorer http://127.0.0.1:8765"
%PY% -m http.server 8765 --bind 127.0.0.1

echo.
echo Server stopped.
echo If there was an error above, port 8765 is probably already in use.
pause
