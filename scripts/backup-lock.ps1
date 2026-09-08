param([Parameter(Mandatory=$true)][string]$LockPath)
$ErrorActionPreference='Stop'
try {
 $erpLock=[IO.File]::Open($LockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
} catch [IO.IOException] { [Console]::WriteLine('BUSY'); exit 0 }
try {
 [Console]::WriteLine('LOCKED')
 [Console]::Out.Flush()
 [void][Console]::In.ReadToEnd()
} finally { $erpLock.Dispose() }
