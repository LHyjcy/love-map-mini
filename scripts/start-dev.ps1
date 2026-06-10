# start-dev.ps1 — 一键启动 love-map-mini 本地后端。
# 作用：确保 MySQL 服务在跑（开机自启，通常已在跑）→ 启动 API（前台，保持本窗口开着）。
# 用法：在 PowerShell 里执行  E:\dt\scripts\start-dev.ps1   或双击 start-dev.bat。

$ErrorActionPreference = 'Stop'

# 1) 确保 MySQL 服务在运行
try {
  $svc = Get-Service MySQL -ErrorAction Stop
  if ($svc.Status -ne 'Running') {
    Write-Host '[start-dev] 启动 MySQL 服务...' -ForegroundColor Yellow
    Start-Service MySQL
  }
  Write-Host "[start-dev] MySQL: $((Get-Service MySQL).Status)" -ForegroundColor Green
} catch {
  Write-Host '[start-dev] 未找到 MySQL 服务，请确认数据库已安装。' -ForegroundColor Red
}

# 2) 启动后端（前台运行；关闭本窗口即停止服务）
$api = Join-Path $PSScriptRoot '..\apps\api'
Set-Location $api
Write-Host '[start-dev] 启动后端 http://localhost:3000（Ctrl+C 可停止，请保持本窗口开启）...' -ForegroundColor Cyan
npm run dev
