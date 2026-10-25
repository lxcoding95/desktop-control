# Owned Windows interactive fixture — explicit opt-in

This is test-only source and is excluded from production plugin packages. Default test discovery reports the interactive case as SKIP. No compilation, policy change, window, cursor replacement or input occurs on that skipped path.

Root must announce the interactive interval and stop competing browser/desktop automation first. The test requires Windows interactive medium integrity, built current MCP grant modules under dist, the native helper compiler, and no currently active control policy. It refuses to overwrite an active control policy. No elevation is requested.

Run only after that coordination:

```powershell
$previousDesktopOptIn = $env:DC_DESKTOP_INTERACTIVE_TEST
$previousDesktopFocusWait = $env:DC_DESKTOP_WAIT_FOR_FOCUS
try {
    $env:DC_DESKTOP_INTERACTIVE_TEST = '1'
    $env:DC_DESKTOP_WAIT_FOR_FOCUS = '1'
    node --test packages/private-desktop/test/interactive.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Interactive fixture failed' }
} finally {
    $env:DC_DESKTOP_INTERACTIVE_TEST = $previousDesktopOptIn
    $env:DC_DESKTOP_WAIT_FOR_FOCUS = $previousDesktopFocusWait
}
```

When DC_DESKTOP_WAIT_FOR_FOCUS=1, the test prints READY_FOR_FOCUS and waits at most 60 seconds for the visible owned window to become foreground, before granting desktop input. Root can activate that unique fixture using the official Computer UI. Waiting is a read-only foreground check; no AttachThreadInput, foreground-lock setting, registry mutation or bypass is used. A timeout fails safely. The opt-in fixture is launched visibly (windowsHide=false); background native helpers remain hidden.

The dedicated visible WinForms window has a unique nonprivate title, one button and one textbox. JSON operations focus only those controls, verify the fixture remains foreground, report click/text counts, hash copied system-cursor bitmaps, inspect the captured helper PID for its visible banner label, send paired Escape, and close itself. It does not expose arbitrary typing, clicking, screen capture, shell, files or general process control.

The actual controller uses the real protected native host authority and a short-lived desktop.input-only grant. Its callback also verifies fixture foreground before every action/chunk and idle policy check. The three sequential sessions exercise button/text input and normal EOF restoration; targeted helper termination with independent watchdog restoration; and Escape with durable stop, callback revocation, fresh-controller denial and cursor restoration. No screenshot or private screen pixels are requested or logged. Cursor hashes cover only copied icon/mask bitmaps.

Every cleanup is attempted even if another cleanup fails. Failures are emitted as fixed diagnostic codes. The local control grant is revoked and the durable stop marker is left present; no test cleanup re-enables desktop control. A subsequent local grant action is required to resume.

The fixture is not proof of arbitrary applications, multiple monitors, mixed DPI, human/automation contention, secure desktop, UAC, reboot recovery, or a separately independent physical cursor. Foreground checks and Windows SendInput are not an atomic transaction. A human moving focus between the guard and OS dispatch is a residual interactive race, so the announced test interval matters. Cold WinForms startup can exceed five seconds; native commands use a bounded 30-second test deadline. A timeout remains a failed result, not an approval.

Verified 2026-10-25T10:28Z on Windows 10.0.26300, Node24.21.0/npm12.2.0: explicit coordinated run passed 1/1 test, 0 failures/skips, exit0. All three phases above completed. Independent post-check confirmed control state denied, desktop.input refused, stop marker present, and no owned helper/fixture processes. Raw local log desktop-interactive-native-T4.log SHA256 5BF388D76B7EAD02F953BD384FD7CEED72025EA572877C578B07A85EEF074DED. Earlier startup/focus/CURSOR_FAILED attempts remain preserved; this success does not erase their history. Default opt-in discovery remains SKIPPED.
