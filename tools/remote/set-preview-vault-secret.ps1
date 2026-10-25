# Add/rotate an encrypted secret in the current Windows user's vault.
# No secrets on command lines, stdout, public GitHub or cloud. By default
# prompts securely. -FromStdin is for future explicitly approved local clients.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SecretName,
    [switch]$Rotate,
    [switch]$FromStdin
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'Windows PowerShell 7+ required.'
}
if ($SecretName -cnotmatch '^(cloudflare|ssh|oauth|license|integration)\.[a-z][a-z0-9_.-]{0,63}$') {
    throw 'Secret name must belong to an approved namespace.'
}
$homeDir = [Environment]::GetFolderPath('UserProfile')
$sshDir = Join-Path $homeDir '.ssh'
$path = Join-Path $sshDir 'desktop-control.txt'
foreach ($candidate in @($sshDir,$path)) {
    $i = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
    if (($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing redirected credential path.'
    }
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.User) { throw 'User identity missing.' }
function Owner-Only([string]$file) {
    $acl = Get-Acl -LiteralPath $file
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $allow = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User,[Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($allow)
    Set-Acl -LiteralPath $file -AclObject $acl -ErrorAction Stop
    if (-not (Get-Acl -LiteralPath $file).AreAccessRulesProtected) {
        throw 'ACL is not private.'
    }
}
$file = Get-Item -LiteralPath $path -ErrorAction Stop
if ($file.Length -gt 1048576) { throw 'Vault file unexpectedly large.' }
$vault = Get-Content -LiteralPath $path -Raw -ErrorAction Stop |
    ConvertFrom-Json -AsHashtable -ErrorAction Stop
if ($vault.format -cne 'desktop-control-local-vault-v2' -or
    $null -eq $vault.protected_secrets -or
    $vault.preview.seat_limit -ne 1) {
    throw 'Unsupported or unsafe vault. No changes made.'
}
if ($vault.protected_secrets.Contains($SecretName) -and -not $Rotate) {
    throw 'Secret already exists; use -Rotate to replace it intentionally.'
}

$plain = $null
$bstr = [IntPtr]::Zero
$secretBytes = $null
$tmp = $null
try {
    if ($FromStdin) {
        # The invoking trusted local client must not log or echo stdin.
        $plain = [Console]::In.ReadToEnd().TrimEnd([char]13,[char]10)
    } else {
        $secure = Read-Host "Enter value for $SecretName (hidden)" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    if ([string]::IsNullOrWhiteSpace($plain) -or $plain.Length -gt 16384) {
        throw 'Secret must be nonempty and within safe size.'
    }
    $secretBytes = [Text.Encoding]::UTF8.GetBytes($plain)
    $cipher = [Security.Cryptography.ProtectedData]::Protect(
        $secretBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $vault.protected_secrets[$SecretName] = @{
        format = 'dpapi-current-user-b64'
        protected = [Convert]::ToBase64String($cipher)
        updated_utc = [DateTimeOffset]::UtcNow.ToString('o')
    }
    $tmp = Join-Path $sshDir ('.dc-vault-write-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $stream = [IO.File]::Open($tmp,[IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,[IO.FileShare]::None)
    $stream.Dispose()
    Owner-Only $tmp
    [IO.File]::WriteAllText(
        $tmp,($vault | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )
    # Atomic replacement avoids partially written credentials and backup leaks.
    [IO.File]::Replace($tmp,$path,$null)
    $tmp = $null
    Write-Output 'LOCAL_SECRET_SAVED=TRUE'
    Write-Output 'SECRETS_DPAPI_ENCRYPTED=TRUE'
    Write-Output 'CLOUD_SECRET_NOT_UPLOADED=TRUE'
    Write-Output 'NO_SECRETS_PRINTED=TRUE'
} finally {
    $plain = $null
    if ($null -ne $secretBytes) {
        [Security.Cryptography.CryptographicOperations]::ZeroMemory($secretBytes)
    }
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($null -ne $tmp -and (Test-Path -LiteralPath $tmp)) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}
