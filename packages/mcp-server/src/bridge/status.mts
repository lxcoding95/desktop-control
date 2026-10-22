import { DENY_ALL_GRANTS, STATUS_CAPABILITY, STATUS_RESOURCE, isAuthorized } from './policy.mts';
import type { ReadonlyGrantStore } from './policy.mts';

export interface StatusPayload {
  service: 'desktop-control';
  ready: true;
  api_version: 1;
}
export interface StatusAdapter { readStatus(): StatusPayload | Promise<StatusPayload>; }
export type StatusResult =
  | { isError: true; content: [{ type: 'text'; text: string }] }
  | { content: [{ type: 'text'; text: string }]; structuredContent: StatusPayload };

export interface StatusContext {
  readonly principal: string | null;
  readonly signal?: AbortSignal;
  readonly now?: number;
}
export interface StatusDependencies {
  readonly grants?: ReadonlyGrantStore;
  readonly adapter: StatusAdapter;
  readonly audit?: (decision: 'allow' | 'deny' | 'cancel') => void;
}

const failure = (code: 'PERMISSION_DENIED' | 'CANCELLED' | 'INTERNAL_ERROR'): StatusResult =>
  ({ isError: true, content: [{ type: 'text', text: code }] });

/** Gate immediately before the adapter; every failure is a redacted tool result. */
export function createStatusExecutor(deps: StatusDependencies) {
  const grants = deps.grants ?? DENY_ALL_GRANTS;
  return async (ctx: StatusContext): Promise<StatusResult> => {
    if (ctx.signal?.aborted) {
      deps.audit?.('cancel');
      return failure('CANCELLED');
    }
    if (!isAuthorized({ principal: ctx.principal, capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE },
        grants, ctx.now ?? Date.now())) {
      deps.audit?.('deny');
      return failure('PERMISSION_DENIED');
    }
    if (ctx.signal?.aborted) {
      deps.audit?.('cancel');
      return failure('CANCELLED');
    }
    deps.audit?.('allow');
    try {
      const payload = await deps.adapter.readStatus();
      if (ctx.signal?.aborted) return failure('CANCELLED');
      // Never forward untrusted adapter fields: produce exactly the public static schema.
      if (payload?.service !== 'desktop-control' || payload.ready !== true || payload.api_version !== 1)
        return failure('INTERNAL_ERROR');
      const status: StatusPayload = { service: 'desktop-control', ready: true, api_version: 1 };
      return { content: [{ type: 'text', text: JSON.stringify(status) }], structuredContent: status };
    } catch {
      return failure('INTERNAL_ERROR');
    }
  };
}

export const staticStatusAdapter: StatusAdapter = {
  readStatus: () => ({ service: 'desktop-control', ready: true, api_version: 1 })
};
