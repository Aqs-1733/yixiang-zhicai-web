@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" 检查API配置.py
) else (
  py -3 检查API配置.py
)
pause
