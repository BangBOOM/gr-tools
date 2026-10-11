import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fitCube,parseCube,sampleCube,evaluateRecipe,validateRecipe,metrics,recipeHash,holdoutSamples,verifyFitResult} from '../src/index.ts';
import {bakeLut} from '../../color-engine/index.ts';
import {BSTD_Q13} from '../../color-engine/camera.ts';
const wasm=readFileSync(new URL('../wasm/gr_firmware_fit_bg.wasm',import.meta.url));
const wasmBytes=wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength) as ArrayBuffer;
function cubeText(values:ArrayLike<number>,size=17):string {let out=`TITLE "Exact imported cube"\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`;for(let i=0;i<values.length;i+=3)out+=`${values[i]} ${values[i+1]} ${values[i+2]}\n`;return out;}
const identity=cubeText(bakeLut({},17));await assert.rejects(fitCube(identity,{wasmBytes:new ArrayBuffer(4)}));
// The identity cube is the camera's Standard rendering: slot matrix Bstd (so M·Bstd⁻¹=I) and near-identity curves (G round-trips through its inverse within 0.06 codes).
const fitIdentity=await fitCube(identity,{wasmBytes,limits:{max_8bit:1,rmse_8bit:.25}});
assert.equal(fitIdentity.report.limits_pass,true);assert.equal(fitIdentity.report.review_required,true);assert.equal(fitIdentity.report.camera_calibrated,false);
assert.deepEqual(fitIdentity.matrix_q13,BSTD_Q13);
assert.ok(fitIdentity.curves_q14.every(row=>row.every((v,i)=>Math.abs(v-i*64)<=64)));
const repeated=await fitCube(identity);assert.deepEqual(repeated,await fitCube(identity));
// The deterministic recipe is unchanged when only original file comments change.
const commented=await fitCube(identity+'# preserves recipe but changes input identity\n');
assert.deepEqual(commented.matrix_q13,fitIdentity.matrix_q13);assert.equal(commented.report.recipe_sha256,fitIdentity.report.recipe_sha256);assert.notEqual(commented.report.input_cube_sha256,fitIdentity.report.input_cube_sha256);assert.notEqual(commented.report.fit_sha256,fitIdentity.report.fit_sha256);
const goldText=cubeText(bakeLut({base:'gold'},33),33),gold=await fitCube(goldText,{limits:{rmse_8bit:4,p95_8bit:8,max_8bit:20}});
assert.equal(gold.report.limits_pass,true);assert.equal(gold.curves_q14[0].length,257);validateRecipe(gold);
const gold65=await fitCube(goldText,{nodes:65});assert.equal(gold65.curves_q14[0].length,65);assert.equal(gold65.report.curve_nodes,65);assert.notEqual(gold65.report.fit_sha256,gold.report.fit_sha256);validateRecipe(gold65);
const artisticText=cubeText(bakeLut({curves:{master:[.18,.8,.12,.95,.7]},curve_interpolation:'smooth',mixer:{red:{hue:100,saturation:-70}},film:{highlight_softness:80}},17));
const artistic=await fitCube(artisticText,{limits:{rmse_8bit:.001}});assert.equal(artistic.report.limits_pass,false);assert.equal(artistic.report.review_required,true);assert.ok(artistic.report.holdout.rmse_8bit>4);
for(const bad of [identity.replace('LUT_3D_SIZE 17','LUT_3D_SIZE 18'),identity.replace('0 0 0\n','NaN 0 0\n'),identity.replace('DOMAIN_MAX 1 1 1','DOMAIN_MAX 2 1 1'),identity+'0 0 0\n'])await assert.rejects(fitCube(bad));
for(const bad of [
  {...gold,matrix_q13:[[8193,0,0],...gold.matrix_q13.slice(1)]},
  {...gold,matrix_q13:[[NaN,0,8192],...gold.matrix_q13.slice(1)]},
  {...gold,curves_q14:gold.curves_q14.map((row,i)=>i?row:[0,100,1,...row.slice(3)])},
  {...gold,curves_q14:gold.curves_q14.map((row,i)=>i?row:[0,300,...row.slice(2)])},
])assert.throws(()=>validateRecipe(bad));
assert.deepEqual(metrics([.125,.25,.375],[0,.125,.25]),{rmse_8bit:31.875,p95_8bit:31.875,max_8bit:31.875,clipped_channel_fraction:0,samples:1});
assert.equal(await recipeHash(gold),gold.report.recipe_sha256);
await verifyFitResult(gold,goldText);await assert.rejects(verifyFitResult(gold,goldText+'#different bytes'));
const altered=structuredClone(gold);altered.curves_q14[0][256]--;await assert.rejects(verifyFitResult(altered,goldText));
const alteredReport=structuredClone(gold);alteredReport.report.holdout.max_8bit++;await assert.rejects(verifyFitResult(alteredReport,goldText));
// Imported evidence may be correctly rehashed yet numerically false.
async function resign(fit:typeof gold){fit.report.fit_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...fit.report,fit_sha256:undefined})))),v=>v.toString(16).padStart(2,'0')).join('');return fit;}
for(const mutate of [
  (r:any)=>{r.holdout={rmse_8bit:0,p95_8bit:0,max_8bit:0,clipped_channel_fraction:0,samples:4096};},
  (r:any)=>{r.endpoints.rmse_8bit=0;},(r:any)=>{r.review_required=false;},(r:any)=>{r.camera_calibrated=true;},
  (r:any)=>{r.holdout_seed=1;},(r:any)=>{r.samples_sha256='0'.repeat(64);},(r:any)=>{r.method='other';},
  (r:any)=>{r.cube_size=65;},(r:any)=>{r.float_candidate.max_8bit=NaN;},(r:any)=>{r.limits_pass=false;},
]){const forged=structuredClone(gold);mutate(forged.report);await assert.rejects(verifyFitResult(await resign(forged),goldText));}
await verifyFitResult(gold65,goldText);await verifyFitResult(artistic,artisticText);
const samples=holdoutSamples();const results=[{text:identity,fit:fitIdentity},{text:goldText,fit:gold},{text:goldText,fit:gold65},{text:artisticText,fit:artistic}].map(({text,fit})=>({text,fit,rgb:Array.from(samples),prediction:Array.from(evaluateRecipe(samples,fit)),target:Array.from(sampleCube(parseCube(text),samples))}));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(results));
console.log(JSON.stringify({identity:fitIdentity.report.holdout,gold:gold.report.holdout,gold65:gold65.report.holdout,artistic:artistic.report.holdout}));
