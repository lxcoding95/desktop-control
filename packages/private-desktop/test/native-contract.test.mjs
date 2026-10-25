import test, { before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopHelper, defaultHelperPath } from '../controller.mjs';

let directory, probe;
const windowsOnly = { skip: process.platform !== 'win32' };
before(() => {
  if (process.platform !== 'win32') return;
  buildDesktopHelper();
  directory = mkdtempSync(path.join(tmpdir(), 'desktop-control-native-contract-'));
  probe = path.join(directory, 'probe.exe');
  execFileSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', ['/nologo', '/target:exe',
    '/reference:System.Windows.Forms.dll', `/out:${probe}`, fileURLToPath(new URL('./NativeContractProbe.cs', import.meta.url))],
  { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
});
after(() => {
  if (!directory) return;
  const target = path.resolve(directory);
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('desktop-control-native-contract-')) throw new Error('UNSAFE_TEST_CLEANUP');
  rmSync(target, { recursive: true, force: true });
});

test('native banner uses nonactivating window flags without showing a window', windowsOnly, () => {
  execFileSync(probe, [defaultHelperPath, 'banner'], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
});
test('native partial-input recovery emits only corresponding release events', windowsOnly, () => {
  execFileSync(probe, [defaultHelperPath, 'releases'], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
});


test('native cursor replacement uses only documented IDs and restores partial failure', windowsOnly, () => {
  execFileSync(probe, [defaultHelperPath, 'cursor-contract'], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
});
test('native start failure cleans every partially initialized resource stage', windowsOnly, () => {
  execFileSync(probe, [defaultHelperPath, 'start-cleanup'], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
});
