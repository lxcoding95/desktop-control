import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlSequencer } from '../src/bridge/control-sequencer.mts';
test('management transitions serialize behind admitted input and cannot race a new helper', async () => {
  const queue = createControlSequencer(), caller = new AbortController(), order: string[] = [];
  let finish: (() => void) | undefined;
  const first = queue.run(caller.signal, async () => { order.push('input'); await new Promise<void>(resolve => { finish = resolve; }); order.push('input-ended'); });
  const management = queue.run(caller.signal, () => { order.push('settings-protected'); return Promise.resolve(); });
  await Promise.resolve(); assert.deepEqual(order, ['input']);
  finish?.(); await first; await management;
  assert.deepEqual(order, ['input', 'input-ended', 'settings-protected']);
});
test('emergency stop bypasses a pending dialog and cancels queued input', async () => {
  const queue = createControlSequencer(), caller = new AbortController(); let calls = 0;
  const pending = queue.run(caller.signal, signal => new Promise<void>(resolve => { signal.addEventListener('abort', () => resolve(), { once: true }); }));
  const queued = queue.run(caller.signal, () => { calls++; return Promise.resolve(); });
  const rejected = assert.rejects(queued, /CANCELLED/);
  await Promise.resolve();
  await queue.run(caller.signal, () => Promise.resolve(), true);
  await pending; await rejected; assert.equal(calls, 0);
});
test('new input waits until an urgent settings window has a protected process identity', async () => {
  const queue = createControlSequencer(), caller = new AbortController();
  let protectedWindow = false, finish: (() => void) | undefined;
  const settings = queue.run(caller.signal, async () => {
    await new Promise<void>(resolve => { finish = resolve; }); protectedWindow = true;
  }, true);
  const input = queue.run(caller.signal, () => { assert.equal(protectedWindow, true); return Promise.resolve(); });
  await Promise.resolve(); assert.equal(protectedWindow, false);
  finish?.(); await settings; await input;
});
