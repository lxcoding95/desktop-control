$ErrorActionPreference='Stop'
$taskRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$repo=Join-Path $taskRoot 'work/s02-extension3/closure-checkout'
$log=Join-Path $taskRoot 'outputs/s02-final/windows-final-clean.log'
function Run-Recorded([string]$Label,[scriptblock]$Command){
 "COMMAND:$Label"; "START:$([DateTimeOffset]::UtcNow.ToString('o'))"
 & $Command
 $code=$LASTEXITCODE
 "EXIT_CODE:$code"; "END:$([DateTimeOffset]::UtcNow.ToString('o'))"
 if($code -ne 0){throw "$Label failed exit$code"}
}
Start-Transcript -Path $log -Force
Push-Location $repo
try {
 Run-Recorded 'git fetch origin' {git fetch origin}
 Run-Recorded 'git switch feat/s02-local-mcp-core' {git switch feat/s02-local-mcp-core}
 Run-Recorded 'git pull --ff-only' {git pull --ff-only}
 Run-Recorded 'git rev-parse HEAD' {git rev-parse HEAD}
 Run-Recorded 'git status' {git status --short --branch}
 Run-Recorded 'node --version' {node --version}
 Run-Recorded 'npm --version' {npm.cmd --version}
 Run-Recorded 'npm ci --ignore-scripts' {npm.cmd ci --ignore-scripts}
 Run-Recorded 'npm run verify' {npm.cmd run verify}
 Run-Recorded 'npm ls --all' {npm.cmd ls --all}
 Run-Recorded 'npm audit --json' {npm.cmd audit --json}
 Run-Recorded 'git diff --check' {git diff --check}
 Run-Recorded 'git status' {git status --short --branch}
} finally {Pop-Location;Stop-Transcript}
