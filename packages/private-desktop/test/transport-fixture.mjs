import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

// Trusted test transport. It never invokes a native process or injects desktop input.
export function transportFixture(onRequest = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null;
  child.stdin = new Writable({ write(chunk, encoding, done) { onRequest(JSON.parse(chunk.toString()), child); done(); } });
  child.kill = () => { child.exitCode = 1; child.emit('exit', 1); return true; };
  return child;
}
