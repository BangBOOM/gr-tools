/** Live-preview fit: the `fitCube` recipe without CUBE text, report, or hashes. Export still uses `fitCube` and `verifyFitResult`. */
import initialize,{fit_cube} from '../wasm/gr_firmware_fit.js';
import {FIT_WASM_SHA256} from '../wasm/pin.ts';
import {MODEL} from '../../color-engine/index.ts';
import {validateRecipe,fitInputs,SEED_MATRICES_Q13,MULTIAXIAL_CONSTANTS} from './index.ts';
import type {Recipe} from './index.ts';
import {CAMERA_CURVE_NODES} from './target.ts';
let initialized:Promise<unknown>|undefined;
async function ready(wasmBytes?:ArrayBuffer){
  initialized??=(async()=>{
    const bytes=wasmBytes??await (await fetch(new URL('../wasm/gr_firmware_fit_bg.wasm',import.meta.url))).arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==FIT_WASM_SHA256)throw new Error('Fit WASM integrity differs');
    return initialize({module_or_path:bytes});
  })().catch(error=>{initialized=undefined;throw error;});
  await initialized;
}
const seeds=new Float64Array(SEED_MATRICES_Q13.flat(2)),gamma=new Float64Array(MODEL.gamma);
/** `lut` is Studio's R-fastest float LUT. Rounding to 9 decimals reproduces the values `parseCube` reads from Studio's CUBE text, so the recipe equals the exported fit. */
export async function fitPreview(lut:Float32Array,size:number,wasmBytes?:ArrayBuffer):Promise<Recipe>{
  await ready(wasmBytes);
  const cube=Float64Array.from(lut,v=>Number(v.toFixed(9))),nodes=CAMERA_CURVE_NODES;
  const inputs=fitInputs({values:cube,size}),result=fit_cube(inputs.latent,inputs.target,nodes,gamma,MULTIAXIAL_CONSTANTS,seeds);
  const rows=(offset:number,width:number)=>Array.from({length:3},(_,i)=>Array.from(result.slice(offset+i*width,offset+(i+1)*width)));
  return validateRecipe({matrix_q13:rows(9+3*nodes,3),curves_q14:rows(18+3*nodes,nodes)});
}
