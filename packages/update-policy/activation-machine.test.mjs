import test from 'node:test';
import assert from 'node:assert/strict';
import { beginActivation, advanceActivation, activationGate } from './activation-machine.mjs';
const base = () => ({ transactionId: 'a'.repeat(32), sourceVersion: '0.1.0', targetVersion: '0.2.0',
  artifactSha256: 'b'.repeat(64), policySequence: 7, mandatory: true });
const event = (type, id = 'a'.repeat(32)) => ({ transactionId: id, type });
function progress(mandatory=true) {
  let s = beginActivation({ ...base(), mandatory });
  for (const e of ['STAGE_OK', 'QUIESCE_OK', 'SWITCH_OK']) s = advanceActivation(s, event(e));
  return s;
}
const fails = (fn) => assert.throws(fn, /INVALID_UPDATE_TRANSITION/);

test('starts in restricted state, not active without health', () => {
  const s = beginActivation(base()); assert.equal(s.phase, 'AWAITING_STAGE');
  assert.equal(activationGate(s).ordinaryTools, false); assert.equal(activationGate(s).repairTools, true);
});
test('full successful staging/quiescence/switch/health yields ACTIVE', () => {
  const s = advanceActivation(progress(), event('HEALTH_OK'));
  assert.equal(s.phase, 'ACTIVE'); assert.equal(s.step, 4);
  assert.equal(activationGate(s).ordinaryTools, true); assert.ok(Object.isFrozen(s));
});
test('out-of-order health success cannot make active', () => fails(() => advanceActivation(beginActivation(base()), event('HEALTH_OK'))));
test('cannot skip quiescence and switch', () => fails(() => advanceActivation(advanceActivation(beginActivation(base()), event('STAGE_OK')), event('SWITCH_OK'))));
test('bad artifact hash rejected before lifecycle', () => fails(() => beginActivation({ ...base(), artifactSha256: '../x' })));
test('invalid transaction IDs rejected', () => fails(() => beginActivation({ ...base(), transactionId: 'abc' })));
test('unsigned/no-target inputs cannot start', () => fails(() => beginActivation({ ...base(), targetVersion: null })));
test('cannot perform same-version activation', () => fails(() => beginActivation({ ...base(), targetVersion: base().sourceVersion })));
test('wrong ID replay is rejected', () => fails(() => advanceActivation(beginActivation(base()), event('STAGE_OK','c'.repeat(32)))));
test('extra unknown event fields rejected', () => fails(() => advanceActivation(beginActivation(base()), { ...event('STAGE_OK'), injected: true })));
test('mandatory stage failure enters repair-only', () => assert.equal(advanceActivation(beginActivation(base()), event('STAGE_FAILED')).phase, 'REPAIR_ONLY'));
test('optional stage failure retains old, but gate stays closed until re-verification', () => { const s = advanceActivation(beginActivation({...base(),mandatory:false}), event('STAGE_FAILED')); assert.equal(s.phase, 'RETAINED_OLD'); assert.equal(activationGate(s).ordinaryTools, false); });
test('quiesce failure never switches pointer', () => { const s = advanceActivation(advanceActivation(beginActivation(base()), event('STAGE_OK')), event('QUIESCE_FAILED')); assert.equal(s.phase, 'REPAIR_ONLY'); });
test('failed switch means previous active pointer is uncertain', () => { let s = beginActivation(base()); for(const t of ['STAGE_OK','QUIESCE_OK','SWITCH_FAILED'])s=advanceActivation(s,event(t)); assert.equal(s.phase,'ROLLBACK_REQUIRED'); assert.equal(activationGate(s).ordinaryTools,false); });
test('health failure requires rollback', () => assert.equal(advanceActivation(progress(), event('HEALTH_FAILED')).phase, 'ROLLBACK_REQUIRED'));
test('mandatory update even successful old rollback stays repair-only', () => { const s=advanceActivation(advanceActivation(progress(),event('HEALTH_FAILED')),event('ROLLBACK_OK')); assert.equal(s.phase,'REPAIR_ONLY'); });
test('optional update old rollback stays restricted pending signed policy', () => { const s=advanceActivation(advanceActivation(progress(false),event('HEALTH_FAILED')),event('ROLLBACK_OK')); assert.equal(s.phase,'RETAINED_OLD'); assert.equal(activationGate(s).ordinaryTools,false); });
test('failed rollback permanently stays repair-only', () => assert.equal(advanceActivation(advanceActivation(progress(),event('HEALTH_FAILED')),event('ROLLBACK_FAILED')).phase,'REPAIR_ONLY'));
test('abort before pointer switch preserves old only for optional release', () => { assert.equal(advanceActivation(beginActivation({...base(),mandatory:false}),event('ABORT')).phase,'RETAINED_OLD'); assert.equal(advanceActivation(beginActivation(base()),event('ABORT')).phase,'REPAIR_ONLY'); });
test('abort after pointer switch requires rollback', () => assert.equal(advanceActivation(progress(),event('ABORT')).phase,'ROLLBACK_REQUIRED'));
test('no repeated success on terminal state', () => fails(() => advanceActivation(advanceActivation(progress(),event('HEALTH_OK')),event('HEALTH_OK'))));
test('no terminal recovery by presenting arbitrary event', () => fails(() => advanceActivation(advanceActivation(beginActivation(base()),event('ABORT')),event('SWITCH_OK'))));
test('forged step/property rejected', () => fails(() => advanceActivation({...beginActivation(base()), step:-1},event('STAGE_OK'))));
test('foreign property in state rejected', () => fails(() => activationGate({...beginActivation(base()), root:'bypass'})));
test('malformed or unknown event blocked', () => { fails(() => advanceActivation(beginActivation(base()),event('HACK'))); fails(() => advanceActivation(beginActivation(base()),null)); });
test('forged ACTIVE snapshot cannot bypass normal-tool block', () => { const s = beginActivation(base()); fails(() => activationGate({...s,phase:'ACTIVE',step:4})); fails(() => advanceActivation({...s},event('STAGE_OK'))); });
test('caller cannot mutate returned snapshots', () => {const s = beginActivation(base()); assert.ok(Object.isFrozen(s)); assert.equal(s.phase,'AWAITING_STAGE'); });
test('exhaustively rejects every premature or out-of-order four-event success path', () => {
  const alphabet = ['STAGE_OK','STAGE_FAILED','QUIESCE_OK','QUIESCE_FAILED','SWITCH_OK','SWITCH_FAILED','HEALTH_OK','HEALTH_FAILED','ROLLBACK_OK','ROLLBACK_FAILED','ABORT'];
  let activePaths = 0, reviewedPaths = 0;
  for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) for (const d of alphabet) {
    const seq = [a,b,c,d];
    let s = beginActivation(base());
    for (const type of seq) {
      try { s = advanceActivation(s,event(type)); } catch { break; }
    }
    reviewedPaths++;
    if (s.phase === 'ACTIVE') {
      activePaths++;
      assert.deepEqual(seq,['STAGE_OK','QUIESCE_OK','SWITCH_OK','HEALTH_OK']);
    }
  }
  assert.equal(reviewedPaths, 14641);
  assert.equal(activePaths, 1);
});
test('repeat abort after rollback required cannot advance state', () => fails(() => advanceActivation(advanceActivation(progress(),event('ABORT')),event('ABORT'))));
