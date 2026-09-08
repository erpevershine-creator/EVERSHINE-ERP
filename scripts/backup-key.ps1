$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$erpKeyFolder = Join-Path $env:LOCALAPPDATA 'EVERSHINE-ERP'
$erpKeyFile = Join-Path $erpKeyFolder 'backup-key.dpapi'
[void][System.IO.Directory]::CreateDirectory($erpKeyFolder)
$erpEntropy = [System.Text.Encoding]::UTF8.GetBytes('EVERSHINE-ERP.local-backup.v1')
if (-not [System.IO.File]::Exists($erpKeyFile)) {
  $erpKey = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($erpKey)
  $erpWrapped = [System.Security.Cryptography.ProtectedData]::Protect($erpKey,$erpEntropy,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  $erpStream = [System.IO.File]::Open($erpKeyFile,[System.IO.FileMode]::CreateNew)
  try { $erpStream.Write($erpWrapped,0,$erpWrapped.Length) } finally { $erpStream.Dispose() }
}
$erpPlain = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($erpKeyFile),$erpEntropy,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Write([Convert]::ToBase64String($erpPlain))
[Array]::Clear($erpPlain,0,$erpPlain.Length)
