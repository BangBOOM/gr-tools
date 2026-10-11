import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { runNativeRefreshPropertyGate } from '../generated/persistence_refresh_property_gate.mjs';
import MUnicorn from '../vendor/source-build-2026-10-09/unicorn_arm.mjs';
import { common, probes } from '../generated/index.mjs';
import { additiveSum } from '../../firmware-core/src/decoder.ts';
import { applyFrozenPlan, assetBytes, getPlan, type Platform } from '../../firmware-core/src/platform.ts';
import type { Candidate } from '../../firmware-core/src/candidate.ts';
import { EXPECTED_PROBE_STATUS } from '../../firmware-core/src/report.ts';

export type ProbeReport = { name: string; status: 'PASS' | 'FAIL'; reports: Record<string, any>; error?: string; milliseconds: number; finalPayloadSha256?:string };
const digest = (b: Uint8Array) => bytesToHex(sha256(b));
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  const words = a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0 ? a.length >>> 2 : 0;
  const x = new Int32Array(a.buffer, a.byteOffset, words), y = new Int32Array(b.buffer, b.byteOffset, words);
  for (let i = 0; i < words; i++) if (x[i] !== y[i]) return false;
  for (let i = words * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
/**
 * SHA-256 for one check run. Suites hash the same 30 MB payloads many times, and JavaScript
 * SHA-256 runs at about 80 MB/s in Chrome. A digest of a large input is reused only after an
 * exact byte comparison with a private snapshot, so every result equals SHA-256 of the current bytes.
 * `seed` computes digests with native WebCrypto before the synchronous suites run.
 */
function digestCache() {
  const known: { bytes: Uint8Array; hex: string }[] = [];
  const large = (b: Uint8Array) => b.length >= 1 << 20;
  const digestOf = (b: Uint8Array) => {
    if (!large(b)) return digest(b);
    const hit = known.find(entry => sameBytes(entry.bytes, b));
    if (hit) return hit.hex;
    const hex = digest(b); known.push({ bytes: b.slice(), hex }); return hex;
  };
  return {
    digest: digestOf,
    async seed(b: Uint8Array) {
      if (!large(b) || known.some(entry => sameBytes(entry.bytes, b))) return;
      const bytes = b.slice();
      known.push({ bytes, hex: bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))) });
    },
    /** The Node `crypto` subset the suites require. */
    module: { createHash(name: string) {
      assertion(name === 'sha256', 'unapproved hash algorithm');
      // Suites always call update(bytes).digest('hex') in one expression.
      const chunks: Uint8Array[] = [];
      return { update(b: Uint8Array | string) { chunks.push(typeof b === 'string' ? new TextEncoder().encode(b) : b); return this; }, digest(format: string) {
        assertion(format === 'hex');
        if (chunks.length === 1) return digestOf(chunks[0]);
        const state = sha256.create(); for (const chunk of chunks) state.update(chunk); return bytesToHex(state.digest());
      } };
    } },
  };
}
function normalize(p: string): string {
  const canonical = p.replaceAll('\\', '/');
  const pos = canonical.indexOf('/re/');
  const cleaned = pos >= 0 ? canonical.slice(pos) : canonical;
  const parts: string[] = [];
  for (const item of cleaned.split('/')) { if (item === '..') parts.pop(); else if (item && item !== '.') parts.push(item); }
  return '/' + parts.join('/');
}
const path = { join: (...a: string[]) => normalize(a.join('/')), resolve: (...a: string[]) => normalize(a.join('/')), isAbsolute: (p: string) => p.startsWith('/') };
function deep(a: any, b: any): boolean {
  if (a === b) return true;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return a.byteLength === b.byteLength && Array.from(a as any).every((v, i) => v === (b as any)[i]);
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b,k) && deep(a[k],b[k]));
}
function assertion(value: any, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const assert = Object.assign(assertion, {
  equal: (a: any, b: any, message?: string) => assertion(a == b, message ?? `expected ${String(b)}, received ${String(a)}`),
  notEqual: (a: any, b: any, message?: string) => assertion(a != b, message ?? 'unexpected equality'),
  deepEqual: (a: any, b: any, message?: string) => assertion(deep(a,b), message ?? 'deep equality failed'),
});
// Preserve original process isolation: sharing one Emscripten heap across suites
// changes fresh guest allocation contents and can invalidate native baselines.
const unicorn = () => MUnicorn();

/** Runs unchanged assertions against actual ARM instructions and native ROM paths.
 * The only adapters are ESM syntax, Buffer, in-memory fixture I/O and reporting.
 * Intended for a dedicated Worker: emu_start is synchronous and CPU intensive.
 */
export async function runReferenceChecks(source: Uint8Array, platform: Platform,
  options: { version?:'V9.1'|'V9.2'; names?: string[]; candidate?:Candidate; finalPayload?:Uint8Array; onProgress?: (name: string, result?: ProbeReport) => void } = {}): Promise<ProbeReport[]> {
  const hashes = digestCache();
  for (const b of [source, options.finalPayload, options.candidate?.beforeChecksum, ...(options.candidate?.assets.values() ?? [])]) if (b) await hashes.seed(b);
  assertion(hashes.digest(source) === platform.source_payload_sha256, 'probe official source fingerprint mismatch');
  const assetCache = new Map<string, Buffer>(), payloadCache = new Map<string, Buffer>();
  const generatedPaths: Record<string, [string, boolean]> = {
    '/re/build/dual-gold-800t-menu-v8/unpackedFW.checksummed.bin': ['V8', true],
    '/re/build/dual-gold-800t-menu-v8-1/unpackedFW.checksummed.bin': ['V8.1', true],
    '/re/build/four-films-menu-v9/unpackedFW.checksummed.bin': ['V9', true],
    '/re/build/V9-1-integrated/unpackedFW.before-checksum.bin': ['V9.1', false],
    '/re/build/V9-2-integrated/unpackedFW.before-checksum.bin': ['V9.2', false],
  };
  function fixture(p: string): Buffer {
    p = normalize(p);
    if(version==='V9.2'&&p==='/re/build/V9-1-integrated/plan.json')p=platform.plans['V9.2'];
    if(version==='V9.2'&&p==='/re/build/V9-1-integrated/unpackedFW.before-checksum.bin')p='/re/build/V9-2-integrated/unpackedFW.before-checksum.bin';
    if(options.finalPayload&&p==='/re/build/'+(version==='V9.2'?'V9-2':'V9-1')+'-integrated/unpackedFW.before-checksum.bin'){const b=options.finalPayload;return Buffer.from(b.buffer,b.byteOffset,b.byteLength);}
    if(options.candidate?.assets.has(p)){const b=options.candidate.assets.get(p)!;return Buffer.from(b.buffer,b.byteOffset,b.byteLength);}
    if (p === '/re/extract/unpackedFW') return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    if (generatedPaths[p]) {
      if (!payloadCache.has(p)) {
        const [profile, fix] = generatedPaths[p]; const body = applyFrozenPlan(source, getPlan(platform, profile));
        if (fix) new DataView(body.buffer).setUint32(body.length - 4, -additiveSum(body.subarray(0,body.length-4)) >>> 0, true);
        payloadCache.set(p, Buffer.from(body.buffer, body.byteOffset, body.byteLength));
      }
      return payloadCache.get(p)!;
    }
    if (!assetCache.has(p)) {
      const b = assetBytes(platform,p);
      assertion(hashes.digest(b) === platform.assets[p].sha256, `fixture asset hash mismatch ${p}`);
      assetCache.set(p,Buffer.from(b.buffer,b.byteOffset,b.byteLength));
    }
    return assetCache.get(p)!;
  }
  const version=options.version??options.candidate?.version??'V9.1';
  const names = options.names ?? (version==='V9.2'?[...platform.probes,'persistence_apdata13_probe','persistence_refresh_property_gate']:platform.probes);
  const results: ProbeReport[] = [];
  for (const name of names) {
    if (!(name in probes)&&name!=='persistence_refresh_property_gate') throw new Error(`unknown approved probe ${name}`);
    options.onProgress?.(name);
    const started = performance.now(), reports: Record<string, any> = {};
    const candidate=options.candidate;
    const process = { argv: name==='persistence_apdata13_probe'?['browser',name,'--final','--payload','/re/build/V9-2-integrated/unpackedFW.before-checksum.bin','--plan',platform.plans[version],'--output','/re/analysis/web-apdata13/checks.json']:['browser', name, platform.plans[version], '0x53002080'], exitCode: 0,
      exit(code:number):never{throw new Error(`probe exited with code${code}`);},
      storageKey:version==='V9.2'?12:11,expectedPlanSha256:hashes.digest(candidate?.assets.get(platform.plans[version])??assetBytes(platform,platform.plans[version])),isCandidate:!!candidate,finalPayload:options.finalPayload,expectedPayloadSha256:options.finalPayload?hashes.digest(options.finalPayload):candidate?hashes.digest(candidate.beforeChecksum):undefined,
      expectedDisplayRows:candidate?JSON.parse(new TextDecoder().decode(candidate.assets.get('/re/build/V9-menu/manifest.json')!)).typed_display_rows:undefined,
      expectedLabels:candidate?.slots.map(s=>s.label),
      expectedLabelLengths:candidate?Object.fromEntries(candidate.slots.map((s,i)=>[0x312+i,s.label.length+1])):undefined,
      expectedTokens:candidate?.slots.map(s=>s.token),registryChanged:candidate?.registryChanged,
      previousRegistryHeaderHex:JSON.parse(new TextDecoder().decode(assetBytes(platform,'/re/build/V9-storage/plan.json'))).header_hex,
    };
    const outputs = new Map<string, string>();
    const fs = {
      readFileSync(p: string, encoding?: string) { const b = fixture(p); return encoding ? b.toString(encoding as any) : b; },
      mkdirSync() {},
      writeFileSync(p: string, value: string | Uint8Array) { outputs.set(normalize(p), typeof value === 'string' ? value : Buffer.from(value).toString()); },
    };
    let commonModule: any;
    const errors: string[] = [];
    const quiet = { log() {}, error(...items: any[]) { errors.push(items.map(x => x instanceof Error ? (x.stack ?? x.message) : String(x)).join(' ')); } };
    function require(p: string): any {
      if (p === 'fs') return fs;
      if (p === 'path') return path;
      if (p === 'assert') return assert;
      if (p === 'crypto') return hashes.module;
      if (p.endsWith('/unicorn_arm.js')) return unicorn;
      if (p === './V9_guest_common.cjs') {
        if (!commonModule) { const m = { exports: {} }; common(require, Buffer, process, quiet, '/re/tools', m, m.exports); commonModule = m.exports; }
        return commonModule;
      }
      throw new Error(`probe dependency not approved ${p}`);
    }
    let error: string | undefined;
    try {
      if(name==='persistence_refresh_property_gate'){
        assertion(options.finalPayload,'refresh gate requires final decoded payload');
        const storage=JSON.parse(new TextDecoder().decode(assetBytes(platform,'/re/build/V9-2-storage/plan.json')));
        const module=options.candidate?.plan.modules.find((m:any)=>m.name==='storage');
        const base=module?Number(module.base):Number(storage.base),entry=base+Number(storage.symbol_offsets.v92_refresh);
        const hook=0x53279a0c,at=hook-0x53000000+0x10870,word=new DataView(options.finalPayload.buffer,options.finalPayload.byteOffset+at,4).getUint32(0,true);
        assertion((word>>>24)===0xeb&&hook+8+((word<<8)>>6)===entry,'final refresh BL target/module mismatch');
        const r=runNativeRefreshPropertyGate(await unicorn(),options.finalPayload,entry);
        reports['/re/analysis/web-refresh/checks.json']={...r,payload_sha256:hashes.digest(options.finalPayload),combined_plan_sha256:process.expectedPlanSha256};
      }else await probes[name](require, Buffer, process, quiet, '/re/tools', { exports: {} }, {});
      if (process.exitCode) throw new Error(errors.join('\n') || 'ARM probe reported an assertion or emulator failure');
      for (const [p, text] of outputs) reports[p] = JSON.parse(text);
      assertion(Object.keys(reports).length > 0, 'probe emitted no evidence report');
      for (const r of Object.values(reports)) assertion(r.status===EXPECTED_PROBE_STATUS[name], 'probe status is not the exact approved outcome');
      if (name === 'V9_1_capacity_arm') {
        const r: any = Object.values(reports)[0];
        assertion(r.results.filter((v: any) => v.version === 'V9').length === 2, 'missing V9 negative controls');
        assertion(r.results.filter((v: any) => v.version === 'V9').every((v: any) => v.failure?.pc === '0x53394760' && deep(v.overflow_rows,[17])), 'capacity negative control did not fail at expected native instruction');
      }
    } catch (e) { error = (e instanceof Error ? e.message : String(e))+(errors.length?'\n'+errors.join('\n'):''); }
    const result: ProbeReport = { name, status: error ? 'FAIL' : 'PASS', reports, error, milliseconds: performance.now() - started,finalPayloadSha256:options.finalPayload?hashes.digest(options.finalPayload):undefined };
    results.push(result); options.onProgress?.(name,result);
    // Return control between suites; an external Worker watchdog can terminate.
    await new Promise(resolve => setTimeout(resolve,0));
  }
  assertion(hashes.digest(source) === platform.source_payload_sha256, 'probe mutated source ROM');
  return results;
}

/** Every installed candidate curve is exercised against the final-ROM codec.
 * Blocked257 interpolation combines two real ARM node lookups; the integrated
 * backend suite additionally executes the shipped ARM interpolation hook.
 */
export async function runCandidateCurveChecks(candidate:Candidate):Promise<any>{
  const backend=candidate.plan.modules.find(m=>m.name==='backend')!;
  const offset=backend.base-0x53000000+0x10870;
  const rom=candidate.beforeChecksum.subarray(offset,offset+backend.bytes);
  const dataView=new DataView(rom.buffer,rom.byteOffset,rom.byteLength),u=await MUnicorn(),e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);
  const CODE=0x100000,DATA=0x200000,STACK=0x300000,OUT=0x400000,SP=STACK+2048,RET=CODE+0xf00;
  for(const address of [CODE,DATA,STACK,OUT])e.mem_map(address,4096,u.PROT_ALL);
  e.mem_write(CODE,rom.subarray(1776,2068));const registers=Array.from({length:8},(_,i)=>u['ARM_REG_R'+(i+4)]),canaries=registers.map((_,i)=>0xabc000+i);
  let calls=0,malformed=0,domain=0;const rows:any[]=[];
  const invoke=(kind:number,pointer:number,length:number,index:number)=>{
    e.reg_write_i32(u.ARM_REG_R0,pointer);e.reg_write_i32(u.ARM_REG_R1,kind?index:length);e.reg_write_i32(u.ARM_REG_R2,index);e.reg_write_i32(u.ARM_REG_R3,OUT);e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);
    registers.forEach((r,i)=>e.reg_write_i32(r,canaries[i]));e.mem_write(OUT,Buffer.from([0xa5,0xa5]));e.emu_start(CODE+(kind?232:0),RET,0,2000);calls++;
    assertion(e.reg_read_i32(u.ARM_REG_PC)>>>0===RET,'candidate codec did not return');assertion(e.reg_read_i32(u.ARM_REG_SP)>>>0===SP,'candidate codec stack');assert.deepEqual(registers.map(r=>e.reg_read_i32(r)>>>0),canaries,'candidate codec callee registers');
    return {result:e.reg_read_i32(u.ARM_REG_R0)>>>0,value:Buffer.from(e.mem_read(OUT,2)).readUInt16LE()};
  };
  try {
    for(let slot=0;slot<4;slot++)for(let ch=0;ch<3;ch++){
      const directory=2500+(slot*3+ch)*8,at=dataView.getUint32(directory,true)-backend.base,n=dataView.getUint16(directory+4,true),kind=dataView.getUint16(directory+6,true),bytes=Buffer.from(rom.subarray(at,at+n)),pointer=DATA+4096-n,row=candidate.slots[slot].recipe.curves_q14[ch];
      e.mem_write(DATA,Buffer.alloc(4096));e.mem_write(pointer,bytes);let previous=-1;
      if(kind===0){
        for(let index=0;index<257;index++){const out=invoke(0,pointer,n,index);assert.deepEqual(out,{result:1,value:row[index]});}
        for(let x=0;x<=16384;x++){const index=Math.min(x>>>6,256),lo=invoke(0,pointer,n,index);assertion(lo.result===1);let actual=lo.value;if(x<16384){const hi=invoke(0,pointer,n,index+1);assertion(hi.result===1);actual+=Math.floor(((hi.value-lo.value)*(x&63)+32)/64);}const expected=x>=16384?row[256]:row[index]+Math.floor(((row[index+1]-row[index])*(x&63)+32)/64);assert.equal(actual,expected);assertion(actual>=previous&&actual<=16384);previous=actual;domain++;}
        for(let size=0;size<n;size++){assert.deepEqual(invoke(0,pointer,size,256),{result:0,value:0xa5a5});malformed++;}
        for(const index of [257,0xffffffff]){assert.deepEqual(invoke(0,pointer,n,index),{result:0,value:0xa5a5});malformed++;}
        for(let block=0;block<17;block++){const bad=Buffer.from(bytes);bad.writeUInt16LE(65535,block*2);e.mem_write(pointer,bad);assert.deepEqual(invoke(0,pointer,n,Math.min(block*16,256)),{result:0,value:0xa5a5});malformed++;}e.mem_write(pointer,bytes);
      }else{
        for(let x=0;x<=16384;x++){const out=invoke(1,pointer,n,x),index=Math.min(x>>>8,64),expected=x>=16384?row[64]:row[index]+Math.floor(((row[index+1]-row[index])*(x&255)+128)/256);assert.equal(out.result,expected);assertion(out.result>=previous&&out.result<=16384);previous=out.result;domain++;}
        for(const x of [16385,65535,0xffffffff])assert.equal(invoke(1,pointer,n,x).result,row[64]);
      }
      assertion(Buffer.from(e.mem_read(pointer,n)).equals(bytes),'candidate curve table mutated');rows.push({slot,channel:ch,nodes:row.length,fullQ14Domain:true,tableSha256:digest(bytes)});
    }
  }finally{e.close();}
  return {status:'PASS_CANDIDATE_FINAL_ROM_NATIVE_CURVES',calls,fullDomainInputs:domain,malformedBlockedInputs:malformed,rows,abi:'r4-r11 and SP preserved',guard:'table ends immediately before an unmapped page',limitations:['Blocked257 full domain uses real ARM bounded node lookup plus host integer interpolation; integrated V9 backend suite separately executes shipped interpolation arithmetic','No ISP hardware or camera timing']};
}
