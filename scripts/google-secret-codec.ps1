param([ValidateSet('Protect','Unprotect')][string]$Operation)
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $erpInput=[Convert]::FromBase64String([Console]::In.ReadToEnd())
 $erpEntropy=[Text.Encoding]::UTF8.GetBytes('EVERSHINE-ERP.google-oauth.v1')
 if($Operation -eq 'Protect') {
  $erpOutput=[Security.Cryptography.ProtectedData]::Protect($erpInput,$erpEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 } else {
  $erpOutput=[Security.Cryptography.ProtectedData]::Unprotect($erpInput,$erpEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }
 [Console]::Write([Convert]::ToBase64String($erpOutput))
} catch { [Console]::Error.Write('GOOGLE_SECRET_STORE_FAILED'); exit 1 }
finally {
 if($null -ne $erpInput){[Array]::Clear($erpInput,0,$erpInput.Length)}
 if($null -ne $erpOutput){[Array]::Clear($erpOutput,0,$erpOutput.Length)}
}
