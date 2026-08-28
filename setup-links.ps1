$ErrorActionPreference = 'Stop'
$project = 'D:\DSH-Story-Engine'
$harness = 'D:\DeepSeek-Harness'
$types = Join-Path $project 'node_modules\@types'
$scope = Join-Path $project 'node_modules\@deepseek-ai'
New-Item -ItemType Directory -Force -Path $types, $scope | Out-Null

function Get-PackageDir([string]$PackageName, [string]$Anchor) {
  # Resolve a package's real directory through Node from the harness tree.
  # The anchor uses forward slashes so it embeds safely in a JS string literal.
  $anchorJs = $Anchor -replace '\\', '/'
  $script = "console.log(require('path').dirname(require.resolve('$PackageName/package.json', { paths: ['$anchorJs'] })))"
  $resolved = & node -e $script 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $resolved) { throw "cannot resolve $PackageName (anchor: $Anchor)" }
  return ($resolved | Select-Object -First 1)
}

$harnessClient = Join-Path $harness 'packages\client\ui-sidebar'
$reactDir = Get-PackageDir 'react' $harnessClient
$reactTypesDir = Get-PackageDir '@types/react' $harnessClient

$links = @{
  (Join-Path $project 'node_modules\typescript') = (Join-Path $harness 'node_modules\typescript')
  (Join-Path $project 'node_modules\vitest') = (Join-Path $harness 'node_modules\vitest')
  (Join-Path $project 'node_modules\tsdown') = (Join-Path $harness 'node_modules\tsdown')
  (Join-Path $project 'node_modules\lightningcss') = (Join-Path $harness 'node_modules\lightningcss')
  (Join-Path $types 'node') = (Join-Path $harness 'node_modules\@types\node')
  (Join-Path $types 'react') = $reactTypesDir
  (Join-Path $project 'node_modules\react') = $reactDir
  (Join-Path $scope 'cordis') = (Join-Path $harness 'vendor\cordis')
  (Join-Path $scope 'dsh-tools') = (Join-Path $harness 'packages\core\tools')
  (Join-Path $scope 'dsh-system-prompt') = (Join-Path $harness 'packages\core\system-prompt')
  (Join-Path $scope 'dsh-user-questions') = (Join-Path $harness 'packages\interaction\user-questions')
  (Join-Path $scope 'dsh-client-runtime') = (Join-Path $harness 'packages\client\runtime')
  (Join-Path $scope 'dsh-client-ui-slots') = (Join-Path $harness 'packages\client\ui-slots')
  (Join-Path $scope 'dsh-client-ui-primitives') = (Join-Path $harness 'packages\client\ui-primitives')
  (Join-Path $scope 'dsh-client-ui-layout') = (Join-Path $harness 'packages\client\ui-layout')
  (Join-Path $scope 'dsh-client-ui-sidebar') = (Join-Path $harness 'packages\client\ui-sidebar')
  (Join-Path $scope 'dsh-host-webserver') = (Join-Path $harness 'packages\host\webserver')
}
foreach ($entry in $links.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Key)) {
    New-Item -ItemType Junction -Path $entry.Key -Target $entry.Value | Out-Null
  }
}

# Register the external story client plugin with the DSH web profile: the
# module scanner resolves patch rows from the profile directory, and Node's
# parent walk finds $DSH_HOME/profiles/node_modules. This writes only under
# the user's DSH home — never inside D:\DeepSeek-Harness.
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileModules = Join-Path $dshHome 'profiles\node_modules'
if (Test-Path -LiteralPath (Split-Path $dshHome -Parent)) {
  New-Item -ItemType Directory -Force -Path $profileModules | Out-Null
  $pluginLink = Join-Path $profileModules 'dsh-story-client'
  if (-not (Test-Path -LiteralPath $pluginLink)) {
    New-Item -ItemType Junction -Path $pluginLink -Target (Join-Path $project 'client\story-ui') | Out-Null
  }
  # Install project-owned presets through DSH's documented user preset root.
  # Preset discovery intentionally ignores junction entries, so these small
  # configuration folders are copied; unrelated user presets are untouched.
  $userPresetRoot = Join-Path $dshHome '.agent-presets'
  New-Item -ItemType Directory -Force -Path $userPresetRoot | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $project 'presets') -Directory | ForEach-Object {
    $presetLink = Join-Path $userPresetRoot $_.Name
    if (Test-Path -LiteralPath $presetLink) {
      $existing = Get-Item -LiteralPath $presetLink
      if ($existing.LinkType -eq 'Junction' -and $existing.Target -eq $_.FullName) {
        Remove-Item -LiteralPath $presetLink
      }
    }
    if (-not (Test-Path -LiteralPath $presetLink)) {
      New-Item -ItemType Directory -Path $presetLink | Out-Null
    }
    Copy-Item -Path (Join-Path $_.FullName '*') -Destination $presetLink -Recurse -Force
  }
}
Write-Host 'dev links ready; DeepSeek Harness sources untouched.'
