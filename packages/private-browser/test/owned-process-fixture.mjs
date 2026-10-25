// Test-only fixed script. The profile and executable name are supplied only by
// this fixture through its child environment, never by a browser/MCP request.
export const NO_SANDBOX_PATTERN = String.raw`(?:^|\s)--no-sandbox(?:\s|$)`;
export const ownedProcessStopScript = String.raw`
$ErrorActionPreference = "Stop"
$targets = @(Get-CimInstance Win32_Process -Filter "Name='$($env:DC_BROWSER_FIXTURE_PROCESS)'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($env:DC_BROWSER_FIXTURE_PROFILE) -and $_.CommandLine -notmatch "--type="
})
if ($targets.Count -ne 1) { throw "Owned browser process not uniquely identified" }
if ($targets[0].CommandLine -match "${NO_SANDBOX_PATTERN}") { throw "Browser sandbox disabled" }
$targets | ForEach-Object {
  $owned = Get-Process -Id $_.ProcessId -ErrorAction Stop
  $owned.Kill()
  if (-not $owned.WaitForExit(5000)) { throw "Owned browser process did not exit" }
}
Write-Output $targets.Count
`;
