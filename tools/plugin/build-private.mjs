import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['tools/plugin/stage-workspace.mjs', ...(process.platform === 'win32' ? ['packages/private-desktop/controller.mjs', 'packages/private-settings/controller.mjs'] : [])])
  execFileSync(process.execPath, [file, ...(file.endsWith('controller.mjs') ? ['--build'] : [])], { cwd: root, windowsHide: true, stdio: 'inherit' });
