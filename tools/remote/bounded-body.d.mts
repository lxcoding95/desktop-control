export declare class BoundedBodyError extends Error {
  readonly code:'INVALID_LENGTH'|'BODY_TOO_LARGE'|'BODY_TIMEOUT'|'BODY_ABORTED'|'INVALID_UTF8'|'INVALID_BODY';
  constructor(code:BoundedBodyError['code']);
}
export declare function readBoundedBody(request:Request, options?:{maxBytes?:number;timeoutMs?:number}):Promise<string>;
