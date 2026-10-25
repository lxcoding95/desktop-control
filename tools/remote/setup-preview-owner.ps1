# Create credentials ONLY on the executing Windows account.
# Source code is safe to publish; GENERATED USERNAME/PASSWORD MUST NEVER BE COMMITTED.
# Requires PowerShell 7+. The credentials do not activate OAuth/cloud access.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'Windows PowerShell 7 or newer is required.'
}

$profileHome = [Environment]::GetFolderPath('UserProfile')
if ([string]::IsNullOrWhiteSpace($profileHome)) {
    throw 'Windows user profile could not be determined.'
}

$sshDir = Join-Path $profileHome '.ssh'
$path = Join-Path $sshDir 'desktop-control.txt'
if (-not (Test-Path -LiteralPath $sshDir -PathType Container)) {
    New-Item -ItemType Directory -Path $sshDir -ErrorAction Stop | Out-Null
}
if (Test-Path -LiteralPath $path) {
    throw 'CREDENTIALS_ALREADY_EXIST: Existing file has not been read or overwritten.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.User) { throw 'Unable to determine current Windows user SID.' }

# Create empty file exclusively, restrict its ACL BEFORE adding sensitive data.
$stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$stream.Dispose()
$created = $true

try {
    $acl = Get-Acl -LiteralPath $path
    $acl.SetAccessRuleProtection($true, $false)

    foreach ($rule in @($acl.Access)) {
        [void] $acl.RemoveAccessRuleSpecific($rule)
    }

    $allow = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity.User,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($allow)
    Set-Acl -LiteralPath $path -AclObject $acl -ErrorAction Stop

    $check = Get-Acl -LiteralPath $path
    if (-not $check.AreAccessRulesProtected) {
        throw 'Credential file inheritance was not disabled.'
    }

    $ownerBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
    $nameBytes  = [Security.Cryptography.RandomNumberGenerator]::GetBytes(8)
    $passBytes  = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)

    $ownerId = 'dc-owner-' + [Convert]::ToHexString($ownerBytes).ToLowerInvariant()
    $username = 'dc-owner-' + [Convert]::ToHexString($nameBytes).ToLowerInvariant()
    $password = [Convert]::ToBase64String($passBytes).TrimEnd('=').Replace('+','-').Replace('/','_')

    # Password is stored in plaintext ONLY because the owner requested this
    # local credentials file. ACL and device encryption remain essential.
    $data = [ordered]@{
        format = 'desktop-control-preview-local-credentials-v1'
        preview_single_user = $true
        owner_id = $ownerId
        username = $username
        password = $password
        created_utc = [DateTimeOffset]::UtcNow.ToString('o')
        status = 'LOCAL_ONLY_NOT_ENROLLED'
        notice = 'Do not share, upload or commit. OAuth sign-in is not configured.'
    }
    $json = $data | ConvertTo-Json -Depth 3
    [System.IO.File]::WriteAllText(
        $path, $json + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )

    # Verify no unexpected allow entries were added while writing.
    $rules = (Get-Acl -LiteralPath $path).Access
    foreach ($entry in $rules) {
        if ($entry.AccessControlType -eq 'Allow') {
            $sid = try {
                $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            } catch {
                throw 'Unverifiable credential file ACL.'
            }
            if ($sid -ne $identity.User.Value) {
                throw 'Credentials have an unexpected allowed reader.'
            }
        }
    }

    Write-Output 'LOCAL_CREDENTIALS_CREATED=TRUE'
    Write-Output 'PREVIEW_SINGLE_USER=TRUE'
    Write-Output 'CREDENTIALS_NOT_ENROLLED=TRUE'
    Write-Output 'NO_SECRETS_PRINTED=TRUE'
    $created = $false
} finally {
    if ($created) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}
