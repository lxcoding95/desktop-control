import * as z from 'zod/v4';
import { setImmediate } from 'node:timers/promises';
import type { PrivateControlCapability, PrivateWorkspaceCapability } from './bridge/private-grants.mts';

const control = ['browser.read', 'browser.interact', 'desktop.read', 'desktop.input', 'terminal.exec'] as const;
const workspace = ['files.read', 'files.write', 'files.remove', 'pdf.create'] as const;
const origin = z.string().min(1).max(512).refine(value => {
  if (!/^[\x20-\x7e]+$/.test(value)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.origin === value; }
  catch { return false; }
});
/** One independently stored permission group per confirmation; never a partial multi-file grant. */
export const permissionRequestSchema = z.strictObject({
  scope: z.enum(['diagnostics', 'workspace', 'controls']),
  capabilities: z.array(z.enum([...control, ...workspace, 'diagnostics.read'])).min(1).max(5),
  // Re-enable is intentionally native-UI-only until cross-process stop generation
  // binding has been accepted. A pending model proposal must not erase a later Esc.
  allowedOrigins: z.array(origin).max(20), reenableStopped: z.literal(false)
}).superRefine((value, context) => {
  const allowed: readonly string[] = value.scope === 'controls' ? control : value.scope === 'workspace' ? workspace : ['diagnostics.read'];
  if (new Set(value.capabilities).size !== value.capabilities.length || value.capabilities.some(capability => !allowed.includes(capability)))
    context.addIssue({ code: 'custom', message: 'INVALID_SELECTION' });
  const browser = value.capabilities.some(capability => capability.startsWith('browser.'));
  if (new Set(value.allowedOrigins).size !== value.allowedOrigins.length || browser !== (value.allowedOrigins.length > 0) ||
      (value.reenableStopped && value.scope !== 'controls')) context.addIssue({ code: 'custom', message: 'INVALID_SELECTION' });
});
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;
export interface PermissionProposal {
  readonly controls: readonly PrivateControlCapability[]; readonly allowedOrigins: readonly string[];
  readonly diagnostics: boolean; readonly workspaceCapabilities: readonly PrivateWorkspaceCapability[];
  readonly reenableStopped: boolean; readonly lifetime: { readonly kind: 'until-revoked' };
}
interface Host {
  principal(): string | null;
  confirm(proposal: PermissionProposal, signal: AbortSignal): Promise<boolean>;
  begin(scope: PermissionRequest['scope']): string;
  commit(scope: PermissionRequest['scope'], transaction: string): void;
  apply(request: PermissionRequest): void;
  revoke(scope: PermissionRequest['scope']): void;
}
/** Trusted dependency boundary only. No approval token, key, path or principal accepted from a tool. */
export function createPermissionRequester(host: Host) {
  let pending = false;
  return async (input: unknown, signal: AbortSignal): Promise<{ granted: boolean }> => {
    const parsed = permissionRequestSchema.safeParse(input);
    if (!parsed.success || signal.aborted || pending) throw Error('PERMISSION_DENIED');
    const request = parsed.data;
    Object.freeze(request.capabilities); Object.freeze(request.allowedOrigins); Object.freeze(request);
    const principal = host.principal();
    if (!principal) throw Error('PERMISSION_DENIED');
    const proposal: PermissionProposal = Object.freeze({
      controls: Object.freeze(request.scope === 'controls' ? [...request.capabilities] as PrivateControlCapability[] : []),
      workspaceCapabilities: Object.freeze(request.scope === 'workspace' ? [...request.capabilities] as PrivateWorkspaceCapability[] : []),
      allowedOrigins: Object.freeze([...request.allowedOrigins]), diagnostics: request.scope === 'diagnostics',
      reenableStopped: request.reenableStopped, lifetime: Object.freeze({ kind: 'until-revoked' as const })
    });
    pending = true;
    let applied = false;
    try {
      if (!await host.confirm(proposal, signal)) return { granted: false };
      // Let queued abort/stop notifications run before the synchronous policy replacement.
      await setImmediate();
      if (signal.aborted || host.principal() !== principal) throw Error('PERMISSION_DENIED');
      const transaction = host.begin(request.scope);
      applied = true;
      host.apply(request);
      await setImmediate();
      if (signal.aborted || host.principal() !== principal) throw Error('PERMISSION_DENIED');
      // Commit removes the protected write-ahead marker. No asynchronous gap
      // follows this commit point; interrupted/uncommitted attempts stay denied
      // in fresh processes even when the attempted rollback cannot be saved.
      host.commit(request.scope, transaction);
      return { granted: true };
    } catch {
      if (applied) {
        try { host.revoke(request.scope); } catch { throw Error('PERMISSION_RECOVERY_REQUIRED'); }
      }
      throw Error('PERMISSION_DENIED');
    } finally { pending = false; }
  };
}
