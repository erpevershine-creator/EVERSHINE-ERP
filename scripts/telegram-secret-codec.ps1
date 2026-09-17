param([ValidateSet('Protect','Unprotect')][string]$Operation)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$raw=[Convert]::FromBase64String([Console]::In.ReadToEnd())
$entropy=[Text.Encoding]::UTF8.GetBytes('EVERSHINE-ERP-telegram-v1')
if($Operation -eq 'Protect'){$out=[Security.Cryptography.ProtectedData]::Protect($raw,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}else{$out=[Security.Cryptography.ProtectedData]::Unprotect($raw,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
[Console]::Write([Convert]::ToBase64String($out))
