@echo off
REM 双击启动 love-map-mini 本地后端（保持窗口开启即服务持续运行）。
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
