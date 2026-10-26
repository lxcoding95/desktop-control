import {createDeviceTicketRequestProvider} from './configured-device-ticket.mjs';
import {readBoundedBody} from './bounded-body.mjs';

/** Trusted LOCAL bootstrap configuration only. Never expose as an MCP tool or
 * accept endpoint, identity or secrets from model arguments. No persistence,
 * logging, reconnect, pairing revival or local capability grants. */
export function createHealthTicketProvider({endpoint,expectedHost,ownerId,deviceId,requestSecret,fetchImpl=fetch}={}) {
  const invalid=()=>{throw new TypeError('INVALID_HEALTH_TICKET_CONFIG');};
  if(typeof expectedHost!=='string'||expectedHost.length>253||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+workers\.dev$/.test(expectedHost)||
      endpoint!==`https://${expectedHost}/device-ticket`||typeof fetchImpl!=='function') invalid();
  let signer;
  try {signer=createDeviceTicketRequestProvider({ownerId,deviceId,requestSecret});} catch {invalid();}
  return async function provideHealthTicket() {
    let response;
    try {
      const body=await signer.createRequest();
      response=await fetchImpl(endpoint,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify(body)
      });
      if(!response||response.status!==200||response.redirected||
          (response.url&&response.url!==endpoint)) throw Error();
      const raw=await readBoundedBody(response,{maxBytes:4096,timeoutMs:1000});
      const value=JSON.parse(raw);
      if(value===null||typeof value!=='object'||Array.isArray(value)||
          Object.keys(value).sort().join(',')!=='scope,ticket'||value.scope!=='remote.health'||
          typeof value.ticket!=='string'||value.ticket.length>2048||
          !/^dt1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.ticket)) throw Error();
      return value.ticket;
    } catch {
      // Do not retain upstream errors, URLs, bodies, signed requests or tokens.
      try {Promise.resolve(response?.body?.cancel()).catch(()=>{});} catch {}
      throw new Error('HEALTH_TICKET_UNAVAILABLE');
    }
  };
}
