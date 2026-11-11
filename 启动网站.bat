@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PIP_CACHE_DIR=%~dp0.cache\pip"
echo ============================================
echo        颐享智财 · 响应式网站版
echo ============================================
if not exist ".venv\Scripts\python.exe" (
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3.12 -m venv .venv
        if errorlevel 1 py -3 -m venv .venv
    ) else (
        python -m venv .venv
    )
    if errorlevel 1 (
        echo [错误] 未找到 Python 3.10+，请先安装 Python 3.12。
        pause
        exit /b 1
    )
    ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络或 Python 版本。
        pause
        exit /b 1
    )
)
if not exist "backend\.env" (
    if exist "%~dp0..\颐享智财_可运行产品包.zip" (
        echo [配置] 从原始产品包导入您已有的 API 配置...
        ".venv\Scripts\python.exe" "%~dp0导入原项目API配置.py" "%~dp0..\颐享智财_可运行产品包.zip"
    ) else (
        echo [提示] 尚未设置 backend\.env。请参考 backend\.env.example 填写 API 密钥。
    )
)
echo.
echo [启动] 网站地址: http://127.0.0.1:8004/site/
echo [接口] API 文档: http://127.0.0.1:8004/docs
echo [提示] 关闭本窗口即停止本地网站。
start "" /min cmd /c "timeout /t 4 /nobreak >nul && start http://127.0.0.1:8004/site/"
cd backend
set PYTHONPATH=%CD%
"%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8004
pause
