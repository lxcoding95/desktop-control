/** Deny-by-default, host-checked capability evaluation. No MCP request can supply grants. */
export const STATUS_CAPABILITY = 'diagnostics.read';
export const STATUS_RESOURCE = 'local:desktop-control';

export interface DiagnosticGrant {
  readonly principal: string;
  readonly capability: typeof STATUS_CAPABILITY;
  readonly resource: typeof STATUS_RESOURCE;
  /** Absolute epoch millis; mandatory and strictly in the future. */
  readonly expiresAt: number;
  readonly revoked: boolean;
}

export interface AuthorizationRequest {
  readonly principal: string | null;
  readonly capability: typeof STATUS_CAPABILITY;
  readonly resource: typeof STATUS_RESOURCE;
}

export interface ReadonlyGrantStore {
  /** This must be a trusted local source, NEVER tool inputs or untrusted document text. */
  getGrants(): readonly DiagnosticGrant[];
}

export const DENY_ALL_GRANTS: ReadonlyGrantStore = Object.freeze({
  getGrants: () => [] as readonly DiagnosticGrant[]
});

export function isAuthorized(
  request: AuthorizationRequest,
  grantStore: ReadonlyGrantStore,
  now: number = Date.now()
): boolean {
  if (typeof request.principal !== 'string' || request.principal.length === 0 ||
      request.capability !== STATUS_CAPABILITY || request.resource !== STATUS_RESOURCE ||
      !Number.isSafeInteger(now) || now < 0) return false;
  try {
    const grants = grantStore.getGrants();
    if (!Array.isArray(grants)) return false;
    return grants.some((candidate: unknown) => {
      if (candidate === null || typeof candidate !== 'object') return false;
      const grant = candidate as Record<string, unknown>;
      return grant.principal === request.principal &&
        grant.capability === STATUS_CAPABILITY && grant.resource === STATUS_RESOURCE &&
        grant.revoked === false &&
        typeof grant.expiresAt === 'number' && Number.isSafeInteger(grant.expiresAt) && grant.expiresAt > now;
    });
  } catch {
    return false;
  }
}
