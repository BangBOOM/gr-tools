import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFirmwareCore, GateError } from '../src/index.ts';
const fixture = new URL('../../../fwdc239b.bin',import.meta.url);
const toArrayBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
const base = toArrayBuffer(await readFile(fixture));
const core = await createFirmwareCore({
  platform: JSON.parse(await readFile(new URL('../platform/platform.json',import.meta.url),'utf8')),
  wasmBytes:toArrayBuffer(await readFile(new URL('../wasm/gr_firmware_core_bg.wasm',import.meta.url))),
});
assert.equal((await core.inspect(base)).profile,'official-2.10');
assert.equal((await core.plan(base)).status,'PASS');
assert.equal((await core.plan(base,{profile:'V9.1-four-slot',slots:[]})).status,'FAIL');
const result = await core.build(base,{profile:'V9.1-reference'},{onProgress:p=>console.log(JSON.stringify(p))});
assert.equal(result.report.status,'PASS');
assert.equal(result.report.candidateSha256,'58135687e2b990636369d80ef36475cab0ea28a5128184322f2cd94ba46352d5');
const bad = result.firmware.slice(0); new Uint8Array(bad)[1000] ^= 1;
await assert.rejects(core.verify(base,bad));
console.log(JSON.stringify({status:'PASS',report:result.report},null,2));
