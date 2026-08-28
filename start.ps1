$ErrorActionPreference = 'Stop'
$project = 'D:\DSH-Story-Engine'
& (Join-Path $project 'setup-links.ps1')
Push-Location $project
try { npm run build; npm run build:client } finally { Pop-Location }
Push-Location 'D:\DeepSeek-Harness'
try { pnpm dsh web --patch (Join-Path $project 'harness.patch.yml') --no-open } finally { Pop-Location }
