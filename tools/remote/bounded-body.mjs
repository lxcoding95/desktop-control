/** Bounded hostile HTTP-body reader. No logging, credentials or network. */
export class BoundedBodyError extends Error {
  constructor(code) {super(code);this.name='BoundedBodyError';this.code=code;}
}
const fail = code => {throw new BoundedBodyError(code);};
export async function readBoundedBody(request, {maxBytes=1024,timeoutMs=1000}={}) {
  if (!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>65536||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000) throw TypeError('Invalid body bounds');
  let reader, timer, onAbort;
  try {
    if (!request || typeof request.headers?.get!=='function') fail('INVALID_BODY');
    if (request.body!==null) reader=request.body.getReader();
    const length=request.headers.get('content-length');
    if (length!==null) {
      if (!/^(0|[1-9][0-9]{0,15})$/.test(length)||!Number.isSafeInteger(Number(length))) fail('INVALID_LENGTH');
      if (Number(length)>maxBytes) fail('BODY_TOO_LARGE');
    }
    if(request.signal?.aborted) fail('BODY_ABORTED');
    if(!reader) return '';
    const deadline=performance.now()+timeoutMs;
    const interrupted=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new BoundedBodyError('BODY_TIMEOUT')),timeoutMs);
      onAbort=()=>reject(new BoundedBodyError('BODY_ABORTED'));
      request.signal?.addEventListener('abort',onAbort,{once:true});
    });
    const buffer=new Uint8Array(maxBytes);let used=0;
    while(true) {
      // Empty immediately resolved chunks can monopolize the microtask queue;
      // the monotonic check also enforces the deadline when timers cannot run.
      if(performance.now()>=deadline) fail('BODY_TIMEOUT');
      const part=await Promise.race([reader.read(),interrupted]);
      if(performance.now()>=deadline) fail('BODY_TIMEOUT');
      if(part.done) break;
      if(!(part.value instanceof Uint8Array)) fail('INVALID_BODY');
      if(part.value.byteLength>maxBytes-used) fail('BODY_TOO_LARGE');
      buffer.set(part.value,used);used+=part.value.byteLength;
    }
    try {return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));}
    catch {fail('INVALID_UTF8');}
  } catch(error) {
    // Cancellation is best-effort: a hostile producer's cancel promise may never
    // settle. Do not let it extend the body deadline or leak rejected promises.
    try {Promise.resolve(reader?.cancel()).catch(()=>{});} catch {}
    if(error instanceof BoundedBodyError) throw error;
    throw new BoundedBodyError('INVALID_BODY');
  } finally {
    clearTimeout(timer);
    if(onAbort) request.signal?.removeEventListener('abort',onAbort);
    try {reader?.releaseLock();} catch {}
  }
}
