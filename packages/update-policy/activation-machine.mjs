// Desktop Control M03: pure, fail-closed activation lifecycle.
// This module NEVER stages files, switches executables, or validates signatures.
// All event receipts must be produced by the trusted, locally authorised updater.
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{32}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[A-Za-z0-9.-]+)?$/;
const PHASES = new Set([
  'AWAITING_STAGE', 'AWAITING_QUIESCE', 'AWAITING_SWITCH',
  'AWAITING_HEALTH', 'ROLLBACK_REQUIRED', 'ACTIVE', 'RETAINED_OLD', 'REPAIR_ONLY',
]);
const EVENTS = new Set([
  'STAGE_OK', 'STAGE_FAILED', 'QUIESCE_OK', 'QUIESCE_FAILED',
  'SWITCH_OK', 'SWITCH_FAILED', 'HEALTH_OK', 'HEALTH_FAILED',
  'ROLLBACK_OK', 'ROLLBACK_FAILED', 'ABORT',
]);
const MAX_STEPS = 12;
// In-process provenance only; persisted state MUST be independently protected and revalidated.
const minted = new WeakSet();
function deny() { throw new Error('INVALID_UPDATE_TRANSITION'); }
function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
function fields(v, required) {
  if (!plain(v) || Object.keys(v).length !== required.length || required.some(k => !Object.hasOwn(v, k))) deny();
}
function validDescriptor(d) {
  if (!plain(d) || ['transactionId', 'sourceVersion', 'targetVersion', 'artifactSha256', 'policySequence', 'mandatory'].some(k => !Object.hasOwn(d,k))) deny();
  if (!ID.test(d.transactionId) || !VERSION.test(d.sourceVersion) || !VERSION.test(d.targetVersion) ||
      d.sourceVersion === d.targetVersion || !DIGEST.test(d.artifactSha256) ||
      !Number.isSafeInteger(d.policySequence) || d.policySequence < 1 || typeof d.mandatory !== 'boolean') deny();
}
function snapshot(d, phase, step) {
  const result = Object.freeze({ transactionId: d.transactionId, sourceVersion: d.sourceVersion,
    targetVersion: d.targetVersion, artifactSha256: d.artifactSha256,
    policySequence: d.policySequence, mandatory: d.mandatory, phase, step });
  minted.add(result);
  return result;
}
export function beginActivation(descriptor) {
  fields(descriptor, ['transactionId', 'sourceVersion', 'targetVersion', 'artifactSha256', 'policySequence', 'mandatory']);
  validDescriptor(descriptor);
  return snapshot(descriptor, 'AWAITING_STAGE', 0);
}
export function advanceActivation(state, event) {
  if (!minted.has(state)) deny();
  fields(state, ['transactionId', 'sourceVersion', 'targetVersion', 'artifactSha256', 'policySequence', 'mandatory', 'phase', 'step']);
  validDescriptor(state);
  if (!PHASES.has(state.phase) || !Number.isSafeInteger(state.step) || state.step < 0 || state.step >= MAX_STEPS) deny();
  fields(event, ['transactionId', 'type']);
  if (event.transactionId !== state.transactionId || !EVENTS.has(event.type)) deny();
  const p = state.phase, t = event.type;
  let next;
  if (t === 'ABORT') {
    // After any pointer-switch attempt, old executable state is ambiguous.
    if (p === 'AWAITING_HEALTH') next = 'ROLLBACK_REQUIRED';
    else if (p === 'AWAITING_STAGE' || p === 'AWAITING_QUIESCE' || p === 'AWAITING_SWITCH') next = state.mandatory ? 'REPAIR_ONLY' : 'RETAINED_OLD';
    else deny();
  } else if (p === 'AWAITING_STAGE' && t === 'STAGE_OK') next = 'AWAITING_QUIESCE';
  else if (p === 'AWAITING_STAGE' && t === 'STAGE_FAILED') next = state.mandatory ? 'REPAIR_ONLY' : 'RETAINED_OLD';
  else if (p === 'AWAITING_QUIESCE' && t === 'QUIESCE_OK') next = 'AWAITING_SWITCH';
  else if (p === 'AWAITING_QUIESCE' && t === 'QUIESCE_FAILED') next = state.mandatory ? 'REPAIR_ONLY' : 'RETAINED_OLD';
  else if (p === 'AWAITING_SWITCH' && t === 'SWITCH_OK') next = 'AWAITING_HEALTH';
  else if (p === 'AWAITING_SWITCH' && t === 'SWITCH_FAILED') next = 'ROLLBACK_REQUIRED';
  else if (p === 'AWAITING_HEALTH' && t === 'HEALTH_OK') next = 'ACTIVE';
  else if (p === 'AWAITING_HEALTH' && t === 'HEALTH_FAILED') next = 'ROLLBACK_REQUIRED';
  else if (p === 'ROLLBACK_REQUIRED' && t === 'ROLLBACK_OK') next = state.mandatory ? 'REPAIR_ONLY' : 'RETAINED_OLD';
  else if (p === 'ROLLBACK_REQUIRED' && t === 'ROLLBACK_FAILED') next = 'REPAIR_ONLY';
  else deny();
  return snapshot(state, next, state.step + 1);
}
export function activationGate(state) {
  if (!minted.has(state)) deny();
  fields(state, ['transactionId', 'sourceVersion', 'targetVersion', 'artifactSha256', 'policySequence', 'mandatory', 'phase', 'step']);
  validDescriptor(state);
  if (!PHASES.has(state.phase) || !Number.isSafeInteger(state.step) || state.step < 0 || state.step > MAX_STEPS) deny();
  // This gate is only a *second* control. A real MCP handler must also verify
  // its signed policy, expiry, host identity and per-tool grants on every call.
  return Object.freeze({ ordinaryTools: state.phase === 'ACTIVE', repairTools: true,
    reason: state.phase === 'ACTIVE' ? 'HEALTH_VERIFIED' : 'UPDATE_IN_PROGRESS_OR_REPAIR' });
}
