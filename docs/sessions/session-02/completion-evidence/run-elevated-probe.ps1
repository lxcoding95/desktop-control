$ErrorActionPreference='Stop'
$taskRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$repo=Join-Path $taskRoot 'work/s02-extension3/closure-checkout'
$probe=Join-Path $PSScriptRoot 'windows-elevated-probe.mjs'
$log=Join-Path $taskRoot 'outputs/s02-final/windows-elevated-probe.log'
"START:$([DateTimeOffset]::UtcNow.ToString('o'))" | Set-Content -Encoding utf8 $log
& 'C:\Program Files\nodejs\node.exe' $probe $repo 2>&1 | Add-Content -Encoding utf8 $log
$code=$LASTEXITCODE
"EXIT_CODE:$code" | Add-Content -Encoding utf8 $log
"END:$([DateTimeOffset]::UtcNow.ToString('o'))" | Add-Content -Encoding utf8 $log
exit $code
