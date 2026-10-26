import { readdir, readFile, readlink } from 'node:fs/promises';

/** Fail closed on inaccessible proc data; exempt only connected, unnamed Unix stdio. */
export async function inspectSockets(pid) {
  const base = `/proc/${pid}`;
  const tables = Object.fromEntries(await Promise.all(['tcp', 'tcp6', 'udp', 'udp6', 'unix'].map(async kind =>
    [kind, (await readFile(`${base}/net/${kind}`, 'utf8')).trim().split('\n').slice(1).map(line => line.trim().split(/\s+/))])));
  const descriptors = await Promise.all((await readdir(`${base}/fd`)).map(async fd => {
    try { return { fd, target: await readlink(`${base}/fd/${fd}`) }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }));
  const inheritedStdio = [], unexpected = [];
  for (const item of descriptors) {
    const inode = item?.target.match(/^socket:\[(\d+)\]$/)?.[1];
    if (!inode) continue;
    const networkKinds = ['tcp', 'tcp6', 'udp', 'udp6'].filter(kind => tables[kind].some(row => row[9] === inode));
    const unix = tables.unix.find(row => row[6] === inode);
    const stdio = ['0', '1', '2'].includes(item.fd) && networkKinds.length === 0 &&
      unix?.[4] === '0001' && unix[5] === '03' && unix.length === 7;
    (stdio ? inheritedStdio : unexpected).push({ ...item, networkKinds, unix: Boolean(unix) });
  }
  return { inheritedStdio, unexpected };
}
