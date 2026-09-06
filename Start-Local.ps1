$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
$taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (Test-Path -LiteralPath $taskBundledNode) { $taskNodePath = $taskBundledNode }
elseif ($taskNode) { $taskNodePath = $taskNode.Source }
else { throw 'Install Node.js 24 LTS first.' }
if (!(Test-Path -LiteralPath 'node_modules\next\dist\bin\next')) { throw 'Run npm ci in this project folder first.' }
try {
  $taskExisting = Invoke-WebRequest 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 5
  if ($taskExisting.StatusCode -eq 200 -and $taskExisting.Content.Contains('EVERSHINE ERP') -and $taskExisting.Content.Contains('local foundation review')) {
    Write-Host 'EVERSHINE foundation is already running at http://localhost:3000'
    exit 0
  }
} catch { }
Write-Host 'EVERSHINE ERP - http://localhost:3000 - Local foundation review'
& $taskNodePath 'scripts/dev.mjs'
