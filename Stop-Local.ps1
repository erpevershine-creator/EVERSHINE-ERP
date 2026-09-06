$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$taskNextPath = Join-Path $taskRoot 'node_modules\next\'
$taskProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($taskNextPath) }
if (!$taskProcesses) { Write-Host 'This EVERSHINE foundation server is already stopped.'; exit 0 }
foreach ($taskProcess in $taskProcesses) { Stop-Process -Id $taskProcess.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host 'Stopped only this EVERSHINE foundation server.'
