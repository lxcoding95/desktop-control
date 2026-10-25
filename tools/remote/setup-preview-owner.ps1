# Desktop Control local preview owner bootstrap (Windows PowerShell 7+).
# Creates encrypted credentials and an RSA-PSS license signer ONLY in the
# current Windows user's .ssh/desktop-control.txt; never writes secrets to Git.
# Accepts an EXISTING EMPTY file; refuses to overwrite nonempty content.
# Does not connect to Cloudflare, enroll OAuth users or enable any MCP tool.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'Windows PowerShell 7+ is required.'
}
$homeDir = [Environment]::GetFolderPath('UserProfile')
if ([string]::IsNullOrWhiteSpace($homeDir)) {
    throw 'User profile unavailable.'
}
$sshDir = Join-Path $homeDir '.ssh'
$path = Join-Path $sshDir 'desktop-control.txt'
if (-not (Test-Path -LiteralPath $sshDir -PathType Container)) {
    New-Item -ItemType Directory -Path $sshDir -ErrorAction Stop | Out-Null
}
$directory = Get-Item -LiteralPath $sshDir -Force -ErrorAction Stop
if ((($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw 'Redirected credential directory not allowed.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.User) { throw 'Windows user SID unavailable.' }
$currentSid = $identity.User.Value

function Set-OwnerOnlyAcl([string]$file) {
    $acl = Get-Acl -LiteralPath $file
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $allow = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User, [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($allow)
    Set-Acl -LiteralPath $file -AclObject $acl -ErrorAction Stop
    $check = Get-Acl -LiteralPath $file
    if (-not $check.AreAccessRulesProtected) { throw 'File ACL inheritance still active.' }
    foreach ($entry in $check.Access) {
        if ($entry.AccessControlType -eq 'Allow') {
            $sid = $entry.IdentityReference.Translate(
                [Security.Principal.SecurityIdentifier]).Value
            if ($sid -ne $currentSid) { throw 'Unexpected credential reader.' }
        }
    }
}
function Protect-LocalBytes([byte[]]$plain) {
    $encrypted = [Security.Cryptography.ProtectedData]::Protect(
        $plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    return [Convert]::ToBase64String($encrypted)
}
function Random-Hex([int]$bytes) {
    $buf = [Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
    try { return [Convert]::ToHexString($buf).ToLowerInvariant() }
    finally { [Security.Cryptography.CryptographicOperations]::ZeroMemory($buf) }
}

$existingEmpty = $false
$created = $false
if (Test-Path -LiteralPath $path) {
    $file = Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if ($file.PSIsContainer -or
        (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
        $file.Length -gt 4096) { throw 'Unsafe or nonempty credential file.' }
    if (-not [string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($path))) {
        throw 'CREDENTIALS_ALREADY_EXIST: Preserving all existing data.'
    }
    $existingEmpty = $true
} else {
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    $created = $true
}
$finished = $false
try {
    Set-OwnerOnlyAcl $path
    $pass = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $privateKeyBytes = $null
    $rsa = $null
    try {
        $passString = [Convert]::ToBase64String($pass).TrimEnd('=').
            Replace('+','-').Replace('/','_')
        $passwordBytes = [Text.Encoding]::UTF8.GetBytes($passString)
        try { $protectedPassword = Protect-LocalBytes $passwordBytes }
        finally { [Security.Cryptography.CryptographicOperations]::ZeroMemory($passwordBytes) }
        $rsa = [Security.Cryptography.RSA]::Create(3072)
        $privateKeyBytes = $rsa.ExportPkcs8PrivateKey()
        $protectedSigner = Protect-LocalBytes $privateKeyBytes
        $publicKeyBase64 = [Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())
        $owner = 'dc-owner-' + (Random-Hex 16)
        $username = 'dc-user-' + (Random-Hex 8)
        $device = 'dc-device-' + (Random-Hex 16)
        $data = [ordered]@{
            format = 'desktop-control-local-vault-v2'
            preview = [ordered]@{
                seat_limit = 1
                public_signup = $false
                owner_id = $owner
                username = $username
                device_id = $device
                password_dpapi = $protectedPassword
                status = 'LOCAL_ONLY_NOT_ENROLLED'
            }
            license = [ordered]@{
                scheme = 'RSA-PSS-SHA256'
                signing_private_pkcs8_dpapi = $protectedSigner
                verification_public_spki_base64 = $publicKeyBase64
                issued = $false
                grant = $null
            }
            protected_secrets = [ordered]@{}
            cloudflare = [ordered]@{
                connection = 'NOT_CONNECTED'
                account_created = $false
            }
            created_utc = [DateTimeOffset]::UtcNow.ToString('o')
            warning = 'Local-only. Credentials are encrypted for this Windows user; no OAuth/cloud account exists.'
        }
        [IO.File]::WriteAllText($path,
            (($data | ConvertTo-Json -Depth 7) + [Environment]::NewLine),
            [Text.UTF8Encoding]::new($false))
    } finally {
        if ($null -ne $privateKeyBytes) {
            [Security.Cryptography.CryptographicOperations]::ZeroMemory($privateKeyBytes)
        }
        [Security.Cryptography.CryptographicOperations]::ZeroMemory($pass)
        if ($null -ne $rsa) { $rsa.Dispose() }
    }
    Set-OwnerOnlyAcl $path
    $finished = $true
    Write-Output 'LOCAL_VAULT_INITIALIZED=TRUE'
    Write-Output 'EXISTING_EMPTY_FILE_HANDLED=TRUE'
    Write-Output 'LICENSE_CAPACITY=1'
    Write-Output 'SECRETS_DPAPI_ENCRYPTED=TRUE'
    Write-Output 'CLOUDFLARE_CONNECTED=FALSE'
    Write-Output 'NO_SECRETS_PRINTED=TRUE'
} finally {
    if (-not $finished) {
        if ($created) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        } elseif ($existingEmpty) {
            [IO.File]::WriteAllText($path, '', [Text.UTF8Encoding]::new($false))
        }
    }
}
