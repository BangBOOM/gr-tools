/** Exercise the real Firmware task lifecycle with a fake Worker and a controlled report verifier, no ARM. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirmwareTasks} from '../src/tasks.ts';
function deferred(){let resolve!:(v:any)=>void;return {promise:new Promise(r=>resolve=r),resolve:(v:any)=>resolve(v)};}
const workers:FakeWorker[]=[];
class FakeWorker {
 onmessage:any;onerror:any;onmessageerror:any;terminated=false;
 constructor(){workers.push(this);}
 terminate(){this.terminated=true;}
 postMessage(message:any){queueMicrotask(()=>this.onmessage({data:{id:message.id,kind:'result',value:{firmware:new ArrayBuffer(256),report:{status:'PASS',gates:[{status:'PASS'}]}}}}));}
}
(globalThis as any).Worker=FakeWorker;
function setup(){
 workers.length=0;const verification=deferred(),toasts:string[]=[];
 const tasks=createFirmwareTasks({verifyReportIntegrity:()=>verification.promise as Promise<boolean>,onChange(){},toast:message=>toasts.push(message)});
 tasks.state.base={name:'base',bytes:new Uint8Array(256),info:{sha256:'a'}};
 return {tasks,state:tasks.state,verification,toasts};
}
async function verificationPending(h:ReturnType<typeof setup>){for(let i=0;i<10;i++)await Promise.resolve();assert.equal(h.state.busy,true);}
test('build remains locked while checking final report; cancellation rejects old PASS',async()=>{
 const h=setup(),done=h.tasks.execute();await verificationPending(h);assert.equal(h.state.firmware,null);assert.equal(h.state.progress!.percent,99);h.tasks.cancel();h.verification.resolve(true);await done;
 assert.equal(h.state.busy,false);assert.equal(h.state.firmware,null);assert.equal(h.state.report!.status,'CANCELLED');assert.ok(workers.length===1&&workers.every(w=>w.terminated));
 assert.equal(h.state.progress!.percent,99);assert.equal(h.state.progress!.status,'stopped');
});
test('configuration epoch rejects a successful report for replaced inputs',async()=>{
 const h=setup(),done=h.tasks.execute();await verificationPending(h);h.tasks.invalidate();h.verification.resolve(true);await done;assert.equal(h.state.firmware,null);assert.equal(h.state.busy,false);
});
test('preparatory clone failure releases the UI and permits another task',async()=>{
 const h=setup(),clone=globalThis.structuredClone;
 globalThis.structuredClone=()=>{throw new Error('allocation failure');};
 try{await h.tasks.execute();}finally{globalThis.structuredClone=clone;}
 assert.equal(h.state.busy,false);assert.equal(workers.length,0);assert.deepEqual(h.toasts,['allocation failure']);
 const done=h.tasks.execute();await verificationPending(h);h.verification.resolve(true);await done;assert.equal(h.state.firmware!.byteLength,256);assert.equal(h.state.busy,false);
});
test('cancelling a running Worker reports CANCELLED and terminates it',async()=>{
 const h=setup();FakeWorker.prototype.postMessage=function(){};
 const done=h.tasks.execute();await Promise.resolve();assert.equal(h.state.busy,true);h.tasks.cancel();await done;
 assert.equal(h.state.report!.status,'CANCELLED');assert.equal(h.state.phase,'Cancelled');assert.equal(h.state.busy,false);assert.ok(workers[0].terminated);
});
