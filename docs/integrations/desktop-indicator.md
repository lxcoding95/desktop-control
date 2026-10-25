# Visible Windows desktop-control indicator

The native desktop controller now shows an original subtle blue gradient on **all four edges of every monitor present when control starts**. The existing top banner, black OS cursor, host grants, local action confirmation and durable Esc stop remain in force. This does not change browser-page indicators or create another AI agent.

## Implementation

`ControlEdge` creates four small topmost WinForms layered windows per monitor. Each has `WS_EX_LAYERED`, `WS_EX_TRANSPARENT`, `WS_EX_NOACTIVATE` and `WS_EX_TOOLWINDOW`, `ShowWithoutActivation`, and transparent/nonactivating hit-test handling. They contain no buttons or editable controls. A premultiplied-alpha blue surface fades quadratically from alpha 96 at the outer edge to 0 toward the desktop. At ordinary DPI the border is six physical pixels; per-monitor window DPI scales this within four to twelve physical pixels. Corners belong to the top/bottom surface, so overlapping borders do not double their opacity.

The process already requires Per-Monitor-V2 awareness. A hidden, nonactivating probe window at each monitor identifies its actual window DPI; negative desktop coordinates are supported. Invalid geometry/DPI or a render failure aborts activation through existing resource cleanup. Up to sixteen monitors are bounded; additional monitor topology is refused rather than silently omitted.

The windows are created only in the existing activation transaction after host authorization. A diagnostic screenshot alone does not show them. EOF, explicit stop, Esc and partial startup failure hide/dispose all owned edges. Windows removes them when the helper process exits or is killed; the independent watchdog continues to restore the system cursor. A display-settings change during active control synchronously latches input off before filesystem, notification or UI marshalling, then performs emergency cleanup instead of retaining stale monitor coordinates. Failed UI marshalling forces the helper to exit, with cursor watchdog recovery; an unavailable/disposed banner cannot skip the latch. Reactivation requires the existing local re-enable path.

This indicator is a visible affordance, not proof that arbitrary signed applications are safe or an OS sandbox. It does not permit UAC or secure-desktop control. The general desktop uses the user's actual OS cursor. The separately controlled browser has its own page-local virtual cursor and a different trust boundary.

## Evidence on 2026-10-25

Normal-user Windows native compilation succeeded. Final noninteractive wrapper/native-contract run: **21 PASS, 0 FAIL, 0 SKIP**, exit 0. The new reflection tests do not invoke native Main, show any window, capture the screen or inject input. They verify:

- Four non-overlapping rectangles within synthetic negative-coordinate screens and 96/144/192-DPI geometry.
- Layered, click-through, topmost, nonactivating, non-taskbar window settings and transparent hit-test handling.
- Monotonic soft blue alpha fading on all four surfaces, including a fully transparent inner edge.
- Disposal and release of every tracked indicator form.
- Immediate input latching before filesystem/pipe/UI work, refusal after the latch and forced-shutdown selection when UI marshalling fails, using delegates without changing the host display configuration.

The existing explicitly opted-in owned-window fixture also passed: **1 PASS, 0 FAIL, 0 SKIP**, exit 0. It performed input only into its own guarded foreground window and used read-only native window enumeration to check all four visible helper-owned edges, exact geometry, click-through/nonactivation styles and complete monitor coverage. It then verified edge removal after EOF, forced helper termination and injected Esc, alongside the original black-cursor/banner/restoration/watchdog/revocation regressions.

**Observed hardware: one monitor.** Multiple monitor rectangles and DPI scales are covered synthetically; physical multi-monitor/mixed-DPI, display hotplug, HDR and remote-desktop combinations remain unverified. Injected paired Esc exercised the actual keyboard hook; physical hardware Esc is not claimed.

Post-test cleanup was verified: controls denied, desktop input denied, durable stop marker present, zero owned helper/fixture processes. No additional administrator or symlink privileges were requested.

Final interactive rerun at 12:15 UTC after the display-change failure correction: 1 PASS, exit 0. Raw-log SHA-256: `891196d7fad402bcbe86ebce68476a1f54966424f58ce4dc08c50a05e4dd8322`. Tested native source SHA-256: `344e62a98afea1f01b4c25dd6ac10ea8b499adcf5054b126618927e82873fc12`. Raw private logs remain local; only this sanitized evidence belongs in GitHub.

## Primary API references

- [Layered windows and click-through behavior](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#layered-windows)
- [UpdateLayeredWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow)
- [GetDpiForWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getdpiforwindow)

The implementation was written for Desktop Control; no proprietary Browser/Computer plugin source was copied.
