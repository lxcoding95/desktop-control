import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_CHECKS = Object.freeze(['verify-windows', 'verify-linux', 'archive-validation', 'package-protocol', 'licenses']);
export const QUIET_WINDOW_MS = 5 * 60 * 1000;
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);

export function isRuntimePath(path) {
  if (path.split('/').some(part => ['test', 'tests', 'docs', '__fixtures__'].includes(part)) || /(?:\.test\.|\.md$)/i.test(path)) {
    return ['LICENSE', 'THIRD-PARTY-NOTICES.md'].includes(path);
  }
  return /^(?:packages\/|plugin\/|tools\/plugin\/)/.test(path)
    || /^(?:package(?:-lock)?\.json|tsconfig(?:\.[^/]+)?\.json|LICENSE|THIRD-PARTY-NOTICES\.md)$/.test(path);
}

/** Entries are Git blob IDs for committed inputs; manifest IDs may be version-normalized. */
export function fingerprintRuntime(entries) {
  const runtime = entries.filter(entry => isRuntimePath(entry.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!runtime.length) throw Error('No runtime inputs');
  const seen = new Set();
  for (const entry of runtime) {
    if (seen.has(entry.path) || /[\0\r\n]/.test(entry.path) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(entry.blobId)) throw Error('Invalid or duplicate runtime input');
    seen.add(entry.path);
  }
  return createHash('sha256').update(runtime.map(entry => `${entry.path}\0${entry.blobId}\n`).join('')).digest('hex');
}

export function nextPreviewVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-preview\.(0|[1-9]\d*))?$/.exec(version);
  if (!match) throw Error('Expected stable or preview SemVer');
  const [, major, minor, patch, preview] = match;
  return preview === undefined ? `${major}.${minor}.${BigInt(patch) + 1n}-preview.1` : `${major}.${minor}.${patch}-preview.${BigInt(preview) + 1n}`;
}

/** No filesystem, clock, upload, mutation, trust grant or background activity. */
export function decideRelease({ latestPublished, candidate, receipts = {}, finalize = false, quietWindowMs = QUIET_WINDOW_MS }) {
  if (!latestPublished || !candidate || typeof candidate.clean !== 'boolean' || typeof finalize !== 'boolean'
      || !hex(candidate.fingerprint, 64) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(candidate.currentHead ?? '')
      || !hex(latestPublished.sourceFingerprint, 64) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(latestPublished.sourceCommit ?? '')
      || !Number.isSafeInteger(quietWindowMs) || quietWindowMs < 0) throw Error('Invalid release input');
  const nextVersion = nextPreviewVersion(latestPublished.version);
  const now = Date.parse(candidate.now), latestChangeAt = Date.parse(candidate.latestChangeAt);
  if (!Number.isFinite(now) || !Number.isFinite(latestChangeAt) || latestChangeAt > now) throw Error('Invalid change timestamp');
  const required = candidate.securityCritical === true;
  const reason = required ? candidate.securityReason?.trim() : undefined;
  if (required && !reason) throw Error('Security-critical update requires a reason');
  const base = { fingerprint: candidate.fingerprint, sourceCommit: candidate.currentHead, nextVersion, required, ...(reason ? { reason } : {}) };
  if (!candidate.clean) return { ...base, status: 'WAIT_DIRTY' };
  if (candidate.fingerprint === latestPublished.sourceFingerprint) return { ...base, status: 'NO_CHANGE', nextVersion: null };
  const quietUntil = new Date(latestChangeAt + quietWindowMs).toISOString();
  if (!finalize && !required && now < latestChangeAt + quietWindowMs) return { ...base, status: 'WAIT_QUIET', quietUntil };
  const matches = receipt => receipt?.status === 'passed' && receipt.fingerprint === candidate.fingerprint && receipt.head === candidate.currentHead;
  const checks = Array.isArray(receipts.checks) ? receipts.checks : [];
  const missingGates = REQUIRED_CHECKS.filter(name => {
    const matching = checks.filter(receipt => receipt?.name === name);
    return matching.length !== 1 || !matches(matching[0]);
  });
  if (!matches(receipts.independentReview) || receipts.independentReview.independent !== true) missingGates.push('independent-review');
  if (missingGates.length) return { ...base, status: 'WAIT_GATES', missingGates };
  return { ...base, status: 'READY', quietUntil, quietBypass: required ? 'security-critical' : finalize ? 'explicit-finalize' : null };
}

/** Read committed source only; no Git index, working tree or account mutation. */
export function inspectGit(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const currentHead = git('rev-parse', 'HEAD').trim();
  const records = git('ls-tree', '-r', '-z', '--full-tree', 'HEAD').split('\0').filter(Boolean);
  const entries = records.map(record => {
    const match = /^(\d+) (\S+) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw Error('Invalid Git tree record');
    return { mode: match[1], type: match[2], blobId: match[3], path: match[4] };
  }).filter(entry => isRuntimePath(entry.path));
  for (const entry of entries) {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw Error('Runtime source must contain regular Git blobs only');
    if (['plugin/plugin.json', 'plugin/.codex-plugin/plugin.json'].includes(entry.path)) {
      const manifest = JSON.parse(git('show', `HEAD:${entry.path}`));
      delete manifest.version;
      const content = Buffer.from(JSON.stringify(manifest));
      // Git blob identity, without writing an object (-w is deliberately absent).
      const algorithm = entry.blobId.length === 64 ? 'sha256' : 'sha1';
      entry.blobId = createHash(algorithm).update(`blob ${content.length}\0`).update(content).digest('hex');
    }
  }
  const changedPaths = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean);
  const latestChangeAt = git('log', '-1', '--format=%cI', '--', ...entries.map(entry => entry.path)).trim();
  if (git('rev-parse', 'HEAD').trim() !== currentHead) throw Error('HEAD changed while inspecting source');
  return { clean: changedPaths.length === 0, fingerprint: fingerprintRuntime(entries), currentHead, latestChangeAt, changedPaths };
}

function main(args) {
  const finalize = args.includes('--finalize');
  const rest = args.filter(arg => arg !== '--finalize');
  if (rest.length !== 2 || rest[0] !== '--input') throw Error('Usage: node tools/plugin/release-policy.mjs --input <receipt.json> [--finalize]');
  const input = JSON.parse(readFileSync(resolve(rest[1]), 'utf8'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const candidate = { ...inspectGit(root), now: new Date().toISOString(), securityCritical: input.securityCritical, securityReason: input.securityReason };
  // An orchestrator may record a later edit time than Git's last commit; never shorten the quiet window.
  if (input.latestChangeAt !== undefined) {
    if (!Number.isFinite(Date.parse(input.latestChangeAt))) throw Error('Invalid recorded change timestamp');
    if (Date.parse(input.latestChangeAt) > Date.parse(candidate.latestChangeAt)) candidate.latestChangeAt = input.latestChangeAt;
  }
  console.log(JSON.stringify({ dryRun: true, ...decideRelease({ latestPublished: input.latestPublished, candidate, receipts: input.receipts, finalize }) }, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
