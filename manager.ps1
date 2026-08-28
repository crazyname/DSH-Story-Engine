$ErrorActionPreference = 'Stop'
$project = 'D:\DSH-Story-Engine'
Push-Location $project
try {
  & '.\setup-links.ps1'
  npm run build
  Write-Host '内容包管理页面：http://127.0.0.1:3091'
  Write-Host '保持此窗口开启；按 Ctrl+C 停止管理页面。'
  npm run manager
} finally {
  Pop-Location
}
