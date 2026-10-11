import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const messages:any[]=[],self:any={postMessage:(data:any)=>messages.push(data)};
const context=vm.createContext({self,Float32Array,Uint8ClampedArray,Map,Math});
vm.runInContext(readFileSync(new URL('../editor/render.worker.js',import.meta.url),'utf8'),context);
const size=33,lut=new Float32Array(size**3*3);let i=0;
for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){lut[i++]=Math.max(0,Math.min(1,(r/32-.5)*32));lut[i++]=g/32;lut[i++]=b/32;}
const pixels=new Float32Array([.5001,.25,.75,.5002,.25,.75]);
self.onmessage({data:{type:'load',id:'raw',pixels:pixels.buffer,format:'rgb-f32'}});
self.onmessage({data:{type:'render',kind:'main',requestId:51,photoId:'raw',size,lut:lut.buffer}});
const result=new Uint8ClampedArray(messages.at(-1).pixels);
assert.deepEqual(Array.from(result),[1,64,191,255,2,64,191,255]);assert.equal(messages.at(-1).requestId,51);
// Both red inputs round to the same 8-bit input. Their distinct outputs prove
// the RAW source stayed float32 through interpolation rather than via canvas.
assert.equal(Math.round(pixels[0]*255),Math.round(pixels[3]*255));
const thumbnail=new Uint8ClampedArray([0,255,0,129]);
self.onmessage({data:{type:'render',kind:'thumb',requestId:52,photoId:'raw',pixels:thumbnail.buffer,size,lut:lut.buffer}});
assert.deepEqual(Array.from(new Uint8ClampedArray(messages.at(-1).pixels)),[0,255,0,129]);
self.onmessage({data:{type:'remove',id:'raw'}});self.onmessage({data:{type:'render',requestId:53,photoId:'raw',size,lut:lut.buffer}});
assert.equal(messages.at(-1).type,'error');assert.equal(messages.at(-1).requestId,53);
console.log('Studio preview Worker: float32 precision, R-fastest LUT, thumbnail alpha and photo release PASS');
