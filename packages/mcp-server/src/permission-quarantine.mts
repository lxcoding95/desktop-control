import type { ReadonlyGrantStore } from './bridge/policy.mts';

export type PermissionScope = 'diagnostics' | 'workspace' | 'controls';

/** Fail-closed scope latch shared by every adapter in ONE private server instance.
 * There is deliberately no reset method and no MCP argument can bypass it.
 * A separately persisted pending marker is the cross-process barrier. If even
 * marker creation fails, this latch alone cannot certify durable revocation:
 * old grants may remain on disk. Do not auto-restart after that failure; trusted
 * local recovery must repair storage/revoke/verify denial before reconnecting.
 */
export function createPermissionQuarantine() {
  const scopes = new Set<PermissionScope>();
  const isQuarantined = (scope: PermissionScope) => scopes.has(scope);
  return Object.freeze({
    isQuarantined,
    quarantine(scope: PermissionScope): void { scopes.add(scope); },
    assertGrantAllowed(scope: PermissionScope): void {
      if (scopes.has(scope)) throw Error('PERMISSION_RECOVERY_REQUIRED');
    },
    revoke(scope: PermissionScope, action: () => void): void {
      try { action(); }
      catch { scopes.add(scope); throw Error('PERMISSION_RECOVERY_REQUIRED'); }
    },
    guardGrantStore(source: ReadonlyGrantStore): ReadonlyGrantStore {
      return { getGrants: () => {
        if (scopes.has('diagnostics')) return [];
        const grants = source.getGrants();
        return scopes.has('diagnostics') ? [] : grants;
      } };
    },
    guardAuthority<Capability, Access>(scope: 'workspace' | 'controls', source: { authorize(capability: Capability): Access | null }) {
      return { authorize(capability: Capability): Access | null {
        if (scopes.has(scope)) return null;
        const access = source.authorize(capability);
        return scopes.has(scope) ? null : access;
      } };
    }
  });
}
export type PermissionQuarantine = ReturnType<typeof createPermissionQuarantine>;

/** Direct revocations need their own write-ahead barrier. Rollback inside an
 * existing permission transaction instead calls its raw revoker, keeping that
 * transaction's marker. Tokens never enter a tool input or response.
 */
export function createJournaledPermissionRevoker(quarantine: PermissionQuarantine, host: {
  begin(scope: PermissionScope): string; revoke(scope: PermissionScope): void; commit(scope: PermissionScope, transaction: string): void;
}) {
  return (scope: PermissionScope): void => quarantine.revoke(scope, () => {
    const transaction = host.begin(scope);
    host.revoke(scope);
    host.commit(scope, transaction);
  });
}
