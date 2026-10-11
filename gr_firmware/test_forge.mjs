// Development fault injection only. Reads local private inputs; no uploads.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [basePath,candidatePath,reportPath,dir]=process.argv.slice(2);
if(!basePath||!candidatePath||!reportPath||!dir)throw Error('missing test fixture paths');
const load=p=>import(new URL('../'+p,import.meta.url));
const [wasm,decoder,reportModule]=await Promise.all([
 load('packages/firmware-core/wasm/gr_firmware_core.js'),load('packages/firmware-core/src/decoder.ts'),load('packages/firmware-core/src/report.ts')]);
const {additiveSum,decodeIndependent}=decoder,{sealReport,verifyReportIntegrity}=reportModule;
const sha=x=>createHash('sha256').update(x).digest('hex');
const base=new Uint8Array(await readFile(basePath)),real=new Uint8Array(await readFile(candidatePath)),report=JSON.parse(await readFile(reportPath,'utf8'));
await wasm.default({module_or_path:await readFile(new URL('../packages/firmware-core/wasm/gr_firmware_core_bg.wasm',import.meta.url))});
const body=wasm.decode(real),menu=report.candidate.modules.find(x=>x.name==='menu'),at=menu.base-0x53000000+0x10870;
body[at]^=1;new DataView(body.buffer).setUint32(body.length-4,-additiveSum(body.subarray(0,-4))>>>0,true);
const bad=wasm.repack(base,body),newPayload=decodeIndependent(bad).payload;
const replacements=new Map([[report.candidateSha256,sha(bad)],[report.payloadSha256,sha(newPayload)],[report.planSha256,sha(new TextEncoder().encode('forged-plan-with-modified-opcode'))],[menu.sha256,sha(newPayload.subarray(at,at+menu.bytes))]]);
function rewrite(v){if(typeof v==='string')return replacements.get(v)??v;if(Array.isArray(v))return v.map(rewrite);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)]));return v;}
const forged=await sealReport({...rewrite(report),bytes:bad.length});
const valid=await verifyReportIntegrity(forged,bad);if(!valid)throw Error('Fault failed to pass the unsigned report verifier');
await writeFile(join(dir,'bad-opcode.bin'),bad);await writeFile(join(dir,'forged-report.json'),JSON.stringify(forged));
console.log(JSON.stringify({dir,reportIntegrityAccepted:valid,candidateSha256:forged.candidateSha256}));
