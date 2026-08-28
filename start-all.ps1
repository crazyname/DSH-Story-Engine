$ErrorActionPreference = 'Stop'
$project = 'D:\DSH-Story-Engine'
$harness = 'D:\DeepSeek-Harness'

& (Join-Path $project 'setup-links.ps1')
Push-Location $project
try { npm run build } finally { Pop-Location }

$node = (Get-Command node -ErrorAction Stop).Source
$manager = Start-Process -FilePath $node `
  -ArgumentList (Join-Path $project 'dist\manager-server.js') `
  -WorkingDirectory $project -WindowStyle Hidden -PassThru

Write-Host '内容包管理：http://127.0.0.1:3091'
Write-Host 'DeepSeek Harness：http://127.0.0.1:3080'
try {
  Push-Location $harness
  try { pnpm dsh web --patch (Join-Path $project 'harness.patch.yml') --no-open } finally { Pop-Location }
} finally {
  if (-not $manager.HasExited) { Stop-Process -Id $manager.Id -ErrorAction SilentlyContinue }
}
