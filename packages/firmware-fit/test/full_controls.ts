/** Release CI: exhaustive isolated scalar outputs; instruction corners separate. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import initialize,{native_gamma} from '../wasm/gr_firmware_fit.js';
import {generateNativeGamma,NATIVE_GAMMA_MODEL,NATIVE_GAMMA_VERSION} from '../src/native-gamma.ts';
const load=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/${name}`,import.meta.url),'utf8'));
const golden=load('native-gamma-golden.json'),corners=load('control-corners.json'),evidence=load('control-corners-evidence.json'),model=NATIVE_GAMMA_MODEL;
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(readFileSync(new URL('../fixtures/native-gamma-model.json',import.meta.url))),golden.model_sha256);
assert.equal(sha(readFileSync(new URL('../fixtures/control-corners.json',import.meta.url))),evidence.corpus_sha256);
const wasm=readFileSync(new URL('../wasm/gr_firmware_fit_bg.wasm',import.meta.url));await initialize({module_or_path:wasm});
const seeds=new Uint32Array(model.key_seeds),families=new Uint16Array(model.families.flat(2)),blend=new Uint16Array(model.blend_q11),constant=model.normalization_constant;
const reference=process.argv[2]?readFileSync(process.argv[2]):null;let offset=0,count=0,monotone=0,min=16384,max=0,cornerCount=0;
const tsHash=createHash('sha256'),rustHash=createHash('sha256');
function packed(curve:Uint16Array):Uint8Array{const bytes=new Uint8Array(512),view=new DataView(bytes.buffer);curve.forEach((v,i)=>view.setUint16(i*2,v,true));return bytes;}
for(let key=-4;key<=4;key++)for(let contrast=-4;contrast<=4;contrast++)for(let highlight=-4;highlight<=4;highlight++)for(let shadow=-4;shadow<=4;shadow++){
  const params={key,contrast,highlight,shadow,flag:0,exposure:8832},curve=generateNativeGamma(params),rust=native_gamma(key,contrast,highlight,shadow,0,8832,seeds,families,blend,constant),bytes=packed(curve),id=[key,contrast,highlight,shadow].join(',');
  assert.equal(curve.length,256);assert.deepEqual(rust,curve,`Rust/TS differ at ${id}`);if(reference){assert.deepEqual(bytes,new Uint8Array(reference.subarray(offset,offset+512)),`Python oracle differs at ${id}`);offset+=512;}
  tsHash.update(bytes);rustHash.update(packed(rust));count++;monotone+=Number(curve.every((v,i)=>!i||v>=curve[i-1]));min=Math.min(min,...curve);max=Math.max(max,...curve);
  if(corners[id]){assert.deepEqual(Array.from(curve),corners[id].curve,`Instruction interpreter differs at ${id}`);cornerCount++;}
}
assert.equal(count,6561);assert.equal(count,golden.cases);assert.equal(monotone,golden.monotone_cases);assert.equal(min,golden.minimum_q14);assert.equal(max,golden.maximum_q14);assert.equal(cornerCount,16);
assert.equal(tsHash.digest('hex'),golden.aggregate_u16le_sha256);assert.equal(rustHash.digest('hex'),golden.aggregate_u16le_sha256);if(reference)assert.equal(offset,reference.length);
for(const bad of [null,[],{key:true},{key:1.5},{shadow:-5},{flag:2},{exposure:0},{exposure:65536},{exposure:NaN},{contrast:null},{extra:1}])assert.throws(()=>generateNativeGamma(bad as any));
assert.throws(()=>native_gamma(5,0,0,0,0,8832,seeds,families,blend,constant));assert.throws(()=>native_gamma(0,0,0,0,2,8832,seeds,families,blend,constant));assert.throws(()=>native_gamma(0,0,0,0,0,0,seeds,families,blend,constant));
console.log(JSON.stringify({status:'PASS',version:NATIVE_GAMMA_VERSION,scalar_combinations:count,instruction_interpreter_corners:cornerCount,aggregate_u16le_sha256:golden.aggregate_u16le_sha256,monotone_cases:monotone,scope:golden.scope}));
