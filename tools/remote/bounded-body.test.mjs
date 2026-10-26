import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedBody} from './bounded-body.mjs';

const input = (body, headers = {}, signal) => ({body, headers:new Headers(headers), signal});
const bytes = value => new TextEncoder().encode(value);
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('accepts exact byte bound with or without optional Content-Length', async () => {
  for (const headers of [{},{'content-length':'1024'}]) {
    const stream = new ReadableStream({start(c){c.enqueue(bytes('x'.repeat(1024)));c.close();}});
    assert.equal(await readBoundedBody(input(stream,headers)), 'x'.repeat(1024));
  }
  assert.equal(await readBoundedBody(input(null)), '');
});
test('rejects chunked oversized body before producer finishes and cancels once', async () => {
  let cancelled=0, pulls=0;
  const stream = new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(600));},cancel(){cancelled++;}}, {highWaterMark:0});
  await rejects(readBoundedBody(input(stream)), 'BODY_TOO_LARGE');
  assert.equal(pulls,2);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('limits actual bytes rather than characters or a lying Content-Length', async () => {
  const stream = new ReadableStream({start(c){c.enqueue(bytes('é'.repeat(513)));}});
  await rejects(readBoundedBody(input(stream,{'content-length':'1'})), 'BODY_TOO_LARGE');
});
test('rejects malformed or excessive Content-Length without reading', async () => {
  for(const value of ['-1','1.5','+1','001','no','9007199254740993','1025']) {
    let cancelled=0,pulls=0;
    const stream = new ReadableStream({pull(){pulls++;},cancel(){cancelled++;}}, {highWaterMark:0});
    await rejects(readBoundedBody(input(stream,{'content-length':value})), value==='1025'?'BODY_TOO_LARGE':'INVALID_LENGTH');
    assert.equal(pulls,0);assert.equal(cancelled,1);
  }
});
test('deadline interrupts never-finished body without awaiting uncancellable cancellation', async () => {
  let cancelled=0;
  const stream = new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}}, {highWaterMark:0});
  const start=Date.now();
  await rejects(readBoundedBody(input(stream),{timeoutMs:20}), 'BODY_TIMEOUT');
  assert.equal(cancelled,1);assert.ok(Date.now()-start<1000);assert.equal(stream.locked,false);
});
test('request cancellation stops pending read, cancels reader, and releases lock', async () => {
  const abort = new AbortController();let cancelled=0;
  const stream = new ReadableStream({cancel(){cancelled++;}});
  const result=readBoundedBody(input(stream,{},abort.signal));abort.abort();
  await rejects(result,'BODY_ABORTED');assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('strict UTF-8 rejects invalid bytes but supports split multibyte sequences', async () => {
  const bad=new ReadableStream({start(c){c.enqueue(new Uint8Array([0xc3]));c.close();}});
  await rejects(readBoundedBody(input(bad)),'INVALID_UTF8');
  const good=new ReadableStream({start(c){c.enqueue(new Uint8Array([0xc3]));c.enqueue(new Uint8Array([0xa9]));c.close();}});
  assert.equal(await readBoundedBody(input(good)),'é');
});
test('configuration is bounded and upstream read failures are redacted', async () => {
  for(const options of [{maxBytes:0},{maxBytes:65537},{timeoutMs:0},{timeoutMs:10001},{maxBytes:1.5}])
    await assert.rejects(readBoundedBody(input(null),options),TypeError);
  const stream=new ReadableStream({pull(){throw Error('SECRET fixture');}});
  await assert.rejects(readBoundedBody(input(stream)),error=>error.code==='INVALID_BODY'&&!error.message.includes('SECRET'));
});
test('endless immediately available empty chunks cannot starve the deadline timer', async () => {
  let cancelled=0;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled++;}}, {highWaterMark:0});
  await rejects(readBoundedBody(input(stream),{timeoutMs:10}),'BODY_TIMEOUT');
  assert.equal(cancelled,1);
});
