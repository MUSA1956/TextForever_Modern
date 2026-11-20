@echo off
chcp 936 >nul
cd /d "%~dp0"
title TextForever Modern

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
  where py >nul 2>nul && set "PY=py"
)
if not defined PY (
  echo [错误] 没有找到 Python 3。
  echo 这个启动器需要 Python 才能开本地服务。
  echo 替代方案：直接双击 index.html，用「选择文件夹」加载。
  echo.
  pause
  exit /b 1
)

echo 正在启动本地服务：http://127.0.0.1:8765
echo 只监听本机地址，局域网和外网都访问不到；关闭本窗口即停止服务。
echo.

start "" /min cmd /c "timeout /t 2 >nul & explorer http://127.0.0.1:8765"
%PY% -m http.server 8765 --bind 127.0.0.1

echo.
echo 服务已停止。
echo 如果上面出现报错，多半是 8765 端口被别的程序占用，关掉它再试。
pause
