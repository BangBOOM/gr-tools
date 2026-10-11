import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitCube} from '../src/index.ts';
import {fitPreview} from '../src/preview.ts';
import {bakeLut,PRESETS} from '../../color-engine/index.ts';
import {CAMERA_CURVE_NODES} from '../src/target.ts';
const wasm=readFileSync(new URL('../wasm/gr_firmware_fit_bg.wasm',import.meta.url));
const wasmBytes=wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength) as ArrayBuffer;
await assert.rejects(import('../src/preview.ts').then(m=>m.fitPreview(new Float32Array(3*8),2,new ArrayBuffer(4))));
// Same serialization as `cube()` in apps/studio/main.ts.
const studioCube=(lut:Float32Array)=>{const lines=['TITLE "t"','LUT_3D_SIZE 33','DOMAIN_MIN 0 0 0','DOMAIN_MAX 1 1 1'];for(let i=0;i<lut.length;i+=3)lines.push(`${lut[i].toFixed(9)} ${lut[i+1].toFixed(9)} ${lut[i+2].toFixed(9)}`);return lines.join('\n')+'\n';};
const states=[{},...Object.values(PRESETS).map(p=>({base:p.base,values:p.values})),{base:'gold',values:{contrast:47,saturation:-23,warmth:31}},{curves:{master:[.18,.8,.12,.95,.7]},curve_interpolation:'smooth',mixer:{red:{hue:100,saturation:-70}}}];
for(const state of states){
  const lut=bakeLut(state,33),exported=await fitCube(studioCube(lut),{nodes:CAMERA_CURVE_NODES,wasmBytes}),preview=await fitPreview(lut,33,wasmBytes);
  assert.deepEqual(preview,{matrix_q13:exported.matrix_q13,curves_q14:exported.curves_q14},JSON.stringify(state));
}
let t=performance.now();const lut=bakeLut({base:'gold',values:{contrast:40}},33);for(let i=0;i<10;i++)await fitPreview(lut,33);
console.log(`preview fit equals exported recipe for ${states.length} states; ${((performance.now()-t)/10).toFixed(1)} ms/fit`);
