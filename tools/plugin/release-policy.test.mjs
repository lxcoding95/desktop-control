import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { decideRelease, fingerprintRuntime, inspectGit, isRuntimePath, nextPreviewVersion, REQUIRED_CHECKS } from './release-policy.mjs';

const now = '2026-10-25T12:00:00.000Z';
const fingerprint = 'a'.repeat(64);
const currentHead = 'b'.repeat(40);
function fixture(overrides = {}) {
  return {
    latestPublished: { version: '0.0.1-preview.3', sourceFingerprint: 'c'.repeat(64), sourceCommit: 'd'.repeat(40) },
    candidate: { clean: true, latestChangeAt: '2026-10-25T11:54:00Z', now, fingerprint, currentHead, changedPaths: ['packages/mcp-server/src/private.mts'], ...overrides },
    receipts: {
      checks: REQUIRED_CHECKS.map(name => ({ name, status: 'passed', fingerprint, head: currentHead })),
      independentReview: { status: 'passed', independent: true, fingerprint, head: currentHead },
    },
  };
}
test('dirty source always waits, including finalize', () => {
  assert.equal(decideRelease({ ...fixture({ clean: false }), finalize: true }).status, 'WAIT_DIRTY');
});
test('multiple recent edits coalesce; last change resets five minute window', () => {
  for (const latestChangeAt of ['2026-10-25T11:56:00Z', '2026-10-25T11:59:59Z']) {
    assert.equal(decideRelease(fixture({ latestChangeAt })).status, 'WAIT_QUIET');
  }
  assert.equal(decideRelease(fixture({ latestChangeAt: '2026-10-25T11:55:00Z' })).status, 'READY');
});
test('same fingerprint never releases, even with docs HEAD change or finalize', () => {
  const input = fixture({ changedPaths: ['docs/notes.md'] });
  input.latestPublished.sourceFingerprint = fingerprint;
  input.receipts = {};
  assert.equal(decideRelease({ ...input, finalize: true }).status, 'NO_CHANGE');
});
test('required checks fail closed on missing, failed, skipped or stale evidence', () => {
  for (const mutation of [
    r => r.checks.pop(),
    r => { r.checks[0].status = 'failed'; },
    r => { r.checks[0].status = 'skipped'; },
    r => { r.checks[0].fingerprint = 'f'.repeat(64); },
    r => { r.checks[0].head = 'f'.repeat(40); },
    r => { delete r.independentReview; },
    r => { r.independentReview.independent = false; },
    r => { r.independentReview.head = 'f'.repeat(40); },
    r => { r.independentReview.fingerprint = 'f'.repeat(64); },
    r => { r.independentReview.status = 'failed'; },
  ]) {
    const input = fixture(); mutation(input.receipts);
    assert.equal(decideRelease({ ...input, finalize: true }).status, 'WAIT_GATES');
  }
});
test('finalize bypasses quiet window only', () => {
  const input = fixture({ latestChangeAt: '2026-10-25T11:59:59Z' });
  assert.equal(decideRelease({ ...input, finalize: true }).status, 'READY');
  input.receipts.checks = [];
  assert.equal(decideRelease({ ...input, finalize: true }).status, 'WAIT_GATES');
});
test('security critical bypass requires reason and still needs all gates', () => {
  const input = fixture({ latestChangeAt: '2026-10-25T11:59:59Z', securityCritical: true, securityReason: 'Revocation boundary repair' });
  const decision = decideRelease(input);
  assert.equal(decision.status, 'READY');
  assert.equal(decision.required, true);
  assert.equal(decision.reason, 'Revocation boundary repair');
  input.receipts.checks = [];
  assert.equal(decideRelease(input).status, 'WAIT_GATES');
  assert.throws(() => decideRelease(fixture({ securityCritical: true })), /reason/i);
});
test('preview version suggestion is deterministic and rejects unsupported versions', () => {
  assert.equal(nextPreviewVersion('0.0.1-preview.3'), '0.0.1-preview.4');
  assert.equal(nextPreviewVersion('1.2.3'), '1.2.4-preview.1');
  assert.throws(() => nextPreviewVersion('latest'));
});
test('runtime fingerprint uses sorted paths and blob IDs, not docs or head', () => {
  const entries = [{ path: 'plugin/start.mjs', blobId: '1'.repeat(40) }, { path: 'packages/mcp-server/src/server.mts', blobId: '2'.repeat(40) }];
  const expected = fingerprintRuntime(entries);
  assert.equal(expected, fingerprintRuntime([...entries].reverse()));
  assert.equal(expected, fingerprintRuntime([...entries, { path: 'docs/notes.md', blobId: '3'.repeat(40) }]));
  assert.notEqual(expected, fingerprintRuntime([{ ...entries[0], blobId: '4'.repeat(40) }, entries[1]]));
  assert.notEqual(expected, fingerprintRuntime([entries[0]]));
  assert.equal(isRuntimePath('packages/private-files/src/index.mjs'), true);
  assert.equal(isRuntimePath('package-lock.json'), true);
  assert.equal(isRuntimePath('packages/mcp-server/test/fixture.mjs'), false);
  assert.equal(isRuntimePath('docs/plan.md'), false);
});
test('invalid timestamps, empty fingerprints and duplicate evidence cannot yield READY', () => {
  assert.throws(() => decideRelease(fixture({ now: 'invalid' })));
  assert.throws(() => decideRelease(fixture({ latestChangeAt: '2026-10-25T12:01:00Z' })));
  assert.throws(() => decideRelease(fixture({ fingerprint: '' })));
  const input = fixture(); input.receipts.checks.push(input.receipts.checks[0]);
  assert.equal(decideRelease(input).status, 'WAIT_GATES');
});
test('Git inspection ignores docs/version-only commits but detects real runtime edits and dirty work', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-control-release-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const commit = () => { git('add', '.'); git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); };
  try {
    git('init', '-q'); mkdirSync(join(root, 'plugin')); mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'plugin', 'plugin.json'), JSON.stringify({ name: 'fixture', version: '0.0.1-preview.3' }));
    writeFileSync(join(root, 'plugin', 'start.mjs'), 'export const value = 1;');
    commit();
    const baseline = inspectGit(root);
    assert.equal(baseline.clean, true);
    writeFileSync(join(root, 'docs', 'note.md'), 'Documentation edit'); commit();
    const docs = inspectGit(root);
    assert.notEqual(docs.currentHead, baseline.currentHead);
    assert.equal(docs.fingerprint, baseline.fingerprint);
    writeFileSync(join(root, 'plugin', 'plugin.json'), JSON.stringify({ name: 'fixture', version: '0.0.1-preview.4' })); commit();
    assert.equal(inspectGit(root).fingerprint, baseline.fingerprint);
    writeFileSync(join(root, 'plugin', 'start.mjs'), 'export const value = 2;');
    assert.equal(inspectGit(root).clean, false);
    commit();
    assert.notEqual(inspectGit(root).fingerprint, baseline.fingerprint);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
