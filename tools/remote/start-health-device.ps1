# Explicit, normal-user, health-only outbound connector. No listener or OS tools.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ExpectedHost)
$ErrorActionPreference='Stop'
if (!$IsWindows -or $ExpectedHost -cnotmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$') {throw 'Windows and exact trusted Worker hostname required'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run as a normal user, not elevated'}
$path=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ssh/desktop-control.txt'
foreach($item in @((Split-Path $path),$path)) {
  if((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected vault refused'}
}
$acl=Get-Acl -LiteralPath $path
if(!$acl.AreAccessRulesProtected){throw 'Private vault ACL required'}
foreach($rule in $acl.Access){
  if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value){throw 'Unexpected vault reader'}
}
$vault=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
if($vault.format -cne 'desktop-control-local-vault-v2' -or !$vault.license.issued -or
   $vault.license.grant.scope -cne 'remote.health' -or $vault.license.grant.expires_at_ms -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Existing unexpired health entitlement required'}
$plainBytes=$null;$process=$null
try {
  $plainBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($vault.protected_secrets.'cloudflare.device_bootstrap_key'.protected),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $config=@{expectedHost=$ExpectedHost;ownerId=$vault.preview.owner_id;deviceId=$vault.preview.device_id;requestSecret=[Text.Encoding]::UTF8.GetString($plainBytes)}
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=(Get-Command node -ErrorAction Stop).Source
  [void]$start.ArgumentList.Add((Join-Path $PSScriptRoot 'run-health-device.mjs'))
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true
  $process=[Diagnostics.Process]::Start($start)
  $process.StandardInput.Write(($config|ConvertTo-Json -Compress));$process.StandardInput.Close()
  $config=$null;$vault=$null
  [Security.Cryptography.CryptographicOperations]::ZeroMemory($plainBytes);$plainBytes=$null
  $process.WaitForExit();exit $process.ExitCode
} finally {
  if($null -ne $plainBytes){[Security.Cryptography.CryptographicOperations]::ZeroMemory($plainBytes)}
  if($null -ne $process -and !$process.HasExited){$process.Kill();$process.WaitForExit()}
}
