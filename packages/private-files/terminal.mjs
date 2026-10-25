// This entry executes only inside the unprivileged, networkless workspace container.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
const COMMANDS = { node: '/usr/local/bin/node', npm: '/usr/local/bin/npm', git: '/usr/bin/git', sh: '/bin/sh' };
export function validateTerminalRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).sort().join(',') !== 'argv,op' || request.op !== 'terminal' ||
      !Array.isArray(request.argv) || request.argv.length < 1 || request.argv.length > 64 ||
      !Object.hasOwn(COMMANDS, request.argv[0]) || request.argv.some(value => typeof value !== 'string' || value.includes('\0')) ||
      Buffer.byteLength(JSON.stringify(request.argv)) > 32768) throw Error('INVALID_INPUT');
  return { executable: COMMANDS[request.argv[0]], args: request.argv.slice(1) };
}
async function execute(request) {
  const { executable, args } = validateTerminalRequest(request);
  const child = spawn(executable, args, { cwd: '/workspace', detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp', npm_config_cache: '/tmp/npm-cache', GIT_TERMINAL_PROMPT: '0', LANG: 'C.UTF-8' } });
  let stdout = '', stderr = '', failure;
  const terminate = code => {
    failure ??= code;
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  };
  const collect = field => chunk => {
    if (field === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 65536) { stdout = ''; stderr = ''; terminate('LIMIT_EXCEEDED'); }
  };
  child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
  const timer = setTimeout(() => terminate('TIMEOUT'), 5000);
  try {
    const exitCode = await new Promise((resolve, reject) => { child.once('error', () => reject(Error('PROCESS_UNAVAILABLE'))); child.once('close', resolve); });
    if (failure) throw Error(failure);
    if (!Number.isInteger(exitCode)) throw Error('PROCESS_UNAVAILABLE');
    return { ok: true, exitCode, stdout, stderr };
  } finally { clearTimeout(timer); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk.toString('utf8'); if (Buffer.byteLength(input) > 65536) throw Error('LIMIT_EXCEEDED'); }
    console.log(JSON.stringify(await execute(JSON.parse(input))));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: { code: ['INVALID_INPUT', 'TIMEOUT', 'LIMIT_EXCEEDED', 'PROCESS_UNAVAILABLE'].includes(error.message) ? error.message : 'INTERNAL_ERROR' } }));
  }
}
