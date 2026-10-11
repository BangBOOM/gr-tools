import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDesktopHost} from '../src/desktop.ts';
test('native files cross only bounded256KiB chunks and saves commit in order',async()=>{
 const data=new Uint8Array(600000).map((_,i)=>i%251),reads:number[]=[],written:Uint8Array[]=[],methods:string[]=[];
 const host=createDesktopHost({async call(method,...args){methods.push(method);if(method==='Pick')return{id:'opaque',name:'raw.dng',size:data.length,type:'image/x-adobe-dng'};if(method==='ReadRange'){reads.push(args[2] as number);return Buffer.from(data.subarray(args[1] as number,(args[1] as number)+(args[2] as number))).toString('base64')};if(method==='SaveBegin')return'save';if(method==='SaveChunk'){written.push(new Uint8Array(Buffer.from(args[2] as string,'base64')));return;} }});
 const file=await host.pickFile();assert.ok(file);assert.deepEqual(await host.readRange(file,0,file.size),data);assert.deepEqual(reads,[262144,262144,75712]);await host.saveFile('result.bin',data);assert.deepEqual(written.map(b=>b.length),reads);assert.equal(methods.at(-1),'SaveCommit');
});
test('native cancellation removes partial output and never commits it',async()=>{
 const controller=new AbortController(),methods:string[]=[];const host=createDesktopHost({async call(method){methods.push(method);if(method==='SaveBegin')return'save';if(method==='SaveChunk')controller.abort();}});
 await assert.rejects(()=>host.saveFile('out.bin',new Uint8Array(300000),{signal:controller.signal}),{name:'AbortError'});assert.equal(methods.at(-1),'SaveCancel');assert.ok(!methods.includes('SaveCommit'));
});
