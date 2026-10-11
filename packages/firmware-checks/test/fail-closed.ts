import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeIndependent} from '../../firmware-core/src/decoder.ts';
import {probes} from '../generated/index.mjs';
import {runReferenceChecks} from '../src/index.ts';
const root=new URL('../../../',import.meta.url),source=decodeIndependent(new Uint8Array(await readFile(new URL('fwdc239b.bin',root)))).payload,platform=JSON.parse(await readFile(new URL('packages/firmware-core/platform/platform.json',root),'utf8'));
const name='four49_curve65_arm',original=probes[name];
try{
 for(const [label,fake]of [
  ['no evidence',async()=>{}],
  ['old PASS prefix',async(require:any)=>require('fs').writeFileSync('/re/analysis/test/checks.json',JSON.stringify({status:'PASS_FAKE'}))],
  ['executor exception',async()=>{throw new Error('deliberate emulator failure');}],
 ]as const){
  probes[name]=fake;const r=await runReferenceChecks(source,platform,{names:[name]});assert.equal(r[0].status,'FAIL',label);assert(r[0].error,label);
 }
}finally{probes[name]=original;}
const missing=structuredClone(platform);delete missing.assets['/re/analysis/four49/curve65.bin'];const r=await runReferenceChecks(source,missing,{names:[name]});assert.equal(r[0].status,'FAIL');assert.match(r[0].error!,/asset|undefined|missing/i);
await assert.rejects(()=>runReferenceChecks(source,platform,{names:['not-approved']}),/unknown approved/);
console.log('PASS: no evidence, wrong outcome, executor exception, missing asset and unapproved probe all fail closed');
