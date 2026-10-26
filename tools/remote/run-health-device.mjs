// Trusted local operator entrypoint; never expose through an MCP tool.
// Configuration/secret arrives through stdin, never command-line arguments.
import {createHealthTicketProvider} from './health-ticket-provider.mjs';
import {createOutboundHealthClient} from './outbound-device-client.mjs';
let raw='', client;
try {
  for await (const chunk of process.stdin) {
    raw+=chunk.toString('utf8');
    if(Buffer.byteLength(raw)>8192) throw Error('INVALID_CONFIG');
  }
  const config=JSON.parse(raw);raw='';
  if(Object.keys(config).sort().join(',')!=='deviceId,expectedHost,ownerId,requestSecret' ||
      typeof config.requestSecret!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(config.requestSecret)) throw Error('INVALID_CONFIG');
  const secret=Buffer.from(config.requestSecret,'base64url');
  const ticketProvider=createHealthTicketProvider({endpoint:'https://'+config.expectedHost+'/device-ticket',
    expectedHost:config.expectedHost,ownerId:config.ownerId,deviceId:config.deviceId,requestSecret:secret});
  secret.fill(0);config.requestSecret=undefined;
  client=createOutboundHealthClient({endpoint:'wss://'+config.expectedHost+'/device',
    expectedHost:config.expectedHost,deviceId:config.deviceId,ticketProvider});
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{client.stop();process.exitCode=0;});
  await client.connect();
  console.log('REMOTE_HEALTH_DEVICE_READY=true');
  // Explicit process lifetime only, no background service or reconnect policy.
  const watch=setInterval(()=>{
    if(client.getState()==='stopped') {clearInterval(watch);console.log('REMOTE_HEALTH_DEVICE_STOPPED=true');}
  },250);
} catch {
  raw='';client?.stop();console.error('REMOTE_HEALTH_DEVICE_UNAVAILABLE');process.exitCode=1;
}
