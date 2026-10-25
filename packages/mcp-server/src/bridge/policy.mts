/** Deny-by-default, host-checked capability evaluation. No MCP request can supply grants. */
export const STATUS_CAPABILITY = 'diagnostics.read';
export const STATUS_RESOURCE = 'local:desktop-control';

export type GrantLifetime = { readonly kind: 'until-revoked' };
export type AccessLifetime = { readonly kind: 'timed'; readonly expiresAt: number } | GrantLifetime;

interface DiagnosticGrantIdentity {
  readonly principal: string;
  readonly capability: typeof STATUS_CAPABILITY;
  readonly resource: typeof STATUS_RESOURCE;
  readonly revoked: boolean;
}
/** Timed v1 grants are never silently promoted to a persistent v2 permission. */
export type DiagnosticGrant = DiagnosticGrantIdentity & (
  { readonly expiresAt: number; readonly lifetime?: never } |
  { readonly lifetime: GrantLifetime; readonly expiresAt?: never }
);

export function isPersistentLifetime(value: unknown): value is GrantLifetime {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 1 && Object.hasOwn(value, 'kind') && (value as Record<string, unknown>).kind === 'until-revoked';
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
      if (candidate === null || typeof candidate !== 'object' || Object.getPrototypeOf(candidate) !== Object.prototype) return false;
      const grant = candidate as Record<string, unknown>;
      const lifetimeValid = Object.hasOwn(grant, 'lifetime')
        ? !Object.hasOwn(grant, 'expiresAt') && isPersistentLifetime(grant.lifetime)
        : typeof grant.expiresAt === 'number' && Number.isSafeInteger(grant.expiresAt) && grant.expiresAt > now;
      return grant.principal === request.principal &&
        grant.capability === STATUS_CAPABILITY && grant.resource === STATUS_RESOURCE &&
        grant.revoked === false && lifetimeValid;
    });
  } catch {
    return false;
  }
}
