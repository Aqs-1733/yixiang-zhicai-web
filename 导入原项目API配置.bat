@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
    py -3.12 "导入原项目API配置.py"
) else (
    py -3.12 "导入原项目API配置.py" "%~1"
)
if errorlevel 1 echo [提示] 请将原始产品包放在本站 ZIP 的旁边后重试。
pause
