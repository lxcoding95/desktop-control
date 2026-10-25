const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19) || !['win32', 'linux'].includes(process.platform)) {
  console.error('UNSUPPORTED_RUNTIME');
  process.exitCode = 1;
} else {
  try { await import('./dist/packages/mcp-server/src/private.mjs'); }
  catch { console.error('STARTUP_FAILED'); process.exitCode = 1; }
}
