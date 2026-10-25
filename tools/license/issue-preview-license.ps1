# Issue exactly ONE locally signed Desktop Control preview entitlement.
# This is a LOCAL STAGING operation, not hosted OAuth/login activation.
# The owner vault has been initialized with setup-preview-owner.ps1.
# RSA private key, token, username and password are NEVER printed or committed.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'Windows PowerShell 7+ required.'
}
$homeDir = [Environment]::GetFolderPath('UserProfile')
$directory = Join-Path $homeDir '.ssh'
$path = Join-Path $directory 'desktop-control.txt'
foreach($candidate in @($directory,$path)) {
    $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Credential directory/file is redirected.'
    }
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$acl = Get-Acl -LiteralPath $path
if (-not $acl.AreAccessRulesProtected) {
    throw 'Vault permissions are not private.'
}
foreach($rule in $acl.Access) {
    if ($rule.AccessControlType -eq 'Allow' -and
        $rule.IdentityReference.Translate(
            [Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value) {
        throw 'Vault has an unexpected allowed reader.'
    }
}
if ((Get-Item -LiteralPath $path).Length -gt 1048576) {
    throw 'Invalid vault size.'
}
$vault = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
if ($vault.format -cne 'desktop-control-local-vault-v2' -or
    $vault.preview.seat_limit -ne 1 -or
    $vault.preview.public_signup -ne $false -or
    $vault.license.scheme -cne 'RSA-PSS-SHA256') {
    throw 'Preview owner vault is not configured safely.'
}
if ($vault.license.issued -eq $true -or $null -ne $vault.license.grant) {
    throw 'ONE_LICENSE_LIMIT_REACHED: Existing license not overwritten.'
}
if ($vault.preview.owner_id -cnotmatch '^[A-Za-z0-9._:-]{1,128}$' -or
    $vault.preview.device_id -cnotmatch '^[A-Za-z0-9._:-]{1,128}$') {
    throw 'Owner/device identity is invalid.'
}
$keyBytes = $null
$privateKeyBytes = $null
$rsa = $null
$tmp = $null
try {
    $keyBytes = [Convert]::FromBase64String($vault.license.signing_private_pkcs8_dpapi)
    $privateKeyBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $keyBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $rsa = [Security.Cryptography.RSA]::Create()
    $bytesRead = 0
    $rsa.ImportPkcs8PrivateKey($privateKeyBytes,[ref]$bytesRead)
    if ($bytesRead -ne $privateKeyBytes.Length -or $rsa.KeySize -lt 3072) {
        throw 'Invalid local private license signer.'
    }

    $issuedMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $expiryMs = [DateTimeOffset]::UtcNow.AddDays(7).ToUnixTimeMilliseconds()
    $licenseId = 'preview-' + [Guid]::NewGuid().ToString('N')
    # Keep exact ordered JSON fields for the Node.js verifier.
    $claims = [ordered]@{
        v = 1
        licenseId = $licenseId
        ownerId = $vault.preview.owner_id
        deviceId = $vault.preview.device_id
        issuedAt = $issuedMs
        expiresAt = $expiryMs
        scope = 'remote.health'
    }
    $json = $claims | ConvertTo-Json -Compress -Depth 3
    $body = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+','-').Replace('/','_')
    $msg = [Text.Encoding]::UTF8.GetBytes('desktop-control-preview-license-v1.'+$body)
    $sig = $rsa.SignData($msg,[Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pss)
    $signature = [Convert]::ToBase64String($sig).TrimEnd('=').Replace('+','-').Replace('/','_')
    $token = 'dcl1.'+$body+'.'+$signature
    $tokenBytes = [Text.Encoding]::UTF8.GetBytes($token)
    try {
        $cipher = [Security.Cryptography.ProtectedData]::Protect(
            $tokenBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    } finally {
        [Security.Cryptography.CryptographicOperations]::ZeroMemory($tokenBytes)
    }

    $vault.license.grant = @{
        license_id = $licenseId
        owner_id = $claims.ownerId
        device_id = $claims.deviceId
        scope = $claims.scope
        expires_at_ms = $expiryMs
        token_dpapi = [Convert]::ToBase64String($cipher)
        current_status = 'LOCAL_ISSUED_NOT_SERVER_ACTIVATED'
    }
    $vault.license.issued = $true

    $tmp = Join-Path $directory ('.dc-license-update-'+[Guid]::NewGuid().ToString('N')+'.tmp')
    $stream = [IO.File]::Open($tmp,[IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,[IO.FileShare]::None)
    $stream.Dispose()
    $tempAcl = Get-Acl -LiteralPath $tmp
    $tempAcl.SetAccessRuleProtection($true,$false)
    foreach($rule in @($tempAcl.Access)) { [void]$tempAcl.RemoveAccessRuleSpecific($rule) }
    $tempAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User,[Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $tmp -AclObject $tempAcl
    [IO.File]::WriteAllText($tmp,
        ($vault | ConvertTo-Json -Depth 10)+[Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
    [IO.File]::Replace($tmp,$path,$null)
    $tmp = $null
    Write-Output 'LOCAL_PREVIEW_LICENSE_ISSUED=TRUE'
    Write-Output 'ACTIVE_LICENSE_CAPACITY=1'
    Write-Output 'LICENSE_SCOPE=REMOTE_HEALTH_ONLY'
    Write-Output 'LICENSE_SERVER_ACTIVATED=FALSE'
    Write-Output 'LICENSE_TOKEN_DPAPI_ENCRYPTED=TRUE'
    Write-Output 'NO_SECRETS_PRINTED=TRUE'
} finally {
    if ($null -ne $keyBytes) {
        [Security.Cryptography.CryptographicOperations]::ZeroMemory($keyBytes)
    }
    if ($null -ne $privateKeyBytes) {
        [Security.Cryptography.CryptographicOperations]::ZeroMemory($privateKeyBytes)
    }
    if ($null -ne $rsa) { $rsa.Dispose() }
    if ($null -ne $tmp -and (Test-Path -LiteralPath $tmp)) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}
