import assert from 'node:assert/strict';
import {RawEngine} from '../index.ts';
import {rawDefaults} from '../core.ts';
const prior={Worker:globalThis.Worker,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
const timers=new Map<number,()=>void>();let timerId=0;
class FakeWorker {
  static all:FakeWorker[]=[];static failPost=false;
  onmessage:any;onerror:any;onmessageerror:any;messages:any[]=[];dead=false;
  constructor(){FakeWorker.all.push(this);}
  postMessage(message:any){if(FakeWorker.failPost){FakeWorker.failPost=false;throw new DOMException('clone failed','DataCloneError');}this.messages.push(message);}
  terminate(){this.dead=true;}
  reply(data:any={}){this.onmessage({data:{id:this.messages.at(-1).id,...data}});}
}
(globalThis as any).Worker=FakeWorker;
(globalThis as any).setTimeout=(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;};
(globalThis as any).clearTimeout=(id:number)=>timers.delete(id);
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
try{
  const raw=new RawEngine(),file=new File(['fake'],'sample.dng');
  const first=raw.decode(file,rawDefaults),second=raw.decode(file,rawDefaults);
  const rejectFirst=assert.rejects(first,{name:'AbortError'}),rejectSecond=assert.rejects(second,{name:'AbortError'});
  await tick();assert.equal(FakeWorker.all.length,1);assert.equal(FakeWorker.all[0].messages.length,1);assert.equal(timers.size,1);
  raw.cancel();await Promise.all([rejectFirst,rejectSecond]);assert.equal(timers.size,0);assert.equal(FakeWorker.all[0].dead,true);
  const next=raw.decode(file,rawDefaults);await tick();const good=FakeWorker.all.at(-1)!;good.reply({ok:true});assert.equal((await next).ok,true);assert.equal(timers.size,0);
  FakeWorker.failPost=true;await assert.rejects(raw.decode(file,rawDefaults),{name:'DataCloneError'});assert.equal(timers.size,0);assert.equal(good.dead,true);
  const recovered=raw.decode(file,rawDefaults);await tick();const fresh=FakeWorker.all.at(-1)!;assert.notEqual(fresh,good);
  // A stale old-worker completion cannot resolve/cancel the replacement task.
  good.reply({stale:true});assert.equal(timers.size,1);fresh.reply({ok:'recovered'});assert.equal((await recovered).ok,'recovered');assert.equal(timers.size,0);
  const corrupt=raw.decode(file,rawDefaults);const rejectCorrupt=assert.rejects(corrupt,/Could not read/);await tick();const broken=FakeWorker.all.at(-1)!;broken.onmessageerror({});await rejectCorrupt;assert.equal(broken.dead,true);assert.equal(timers.size,0);
  const timeout=raw.decode(file,rawDefaults);const rejectedTimeout=assert.rejects(timeout,{name:'AbortError'});await tick();for(const fn of [...timers.values()])fn();await rejectedTimeout;assert.equal(timers.size,0);
  // Removing B must preserve both A's active decode and its queued export.
  const a=new File(['a'],'a.dng'),b=new File(['b'],'b.dng'),c=new File(['c'],'c.dng');
  const decodeA=raw.decode(a,rawDefaults),queuedB=raw.decode(b,rawDefaults),exportA=raw.export(a,rawDefaults,new Float32Array(3),'png');
  const rejectedB=assert.rejects(queuedB,{name:'AbortError'});await tick();const ownerA=FakeWorker.all.at(-1)!,generation=raw.generation;
  raw.release(b);assert.equal(raw.generation,generation);assert.equal(ownerA.dead,false);assert.equal(ownerA.messages.length,1);
  ownerA.reply({decoded:'a'});assert.equal((await decodeA).decoded,'a');await rejectedB;await tick();
  assert.equal(ownerA.messages.length,2);assert.equal(ownerA.messages.at(-1).type,'export');
  raw.release(b);assert.equal(ownerA.dead,false);ownerA.reply({exported:'a'});assert.equal((await exportA).exported,'a');
  // Removing the active owner cancels only its jobs, then advances the queue.
  const activeA=raw.decode(a,rawDefaults),queuedA=raw.export(a,rawDefaults,new Float32Array(3),'jpeg'),decodeC=raw.decode(c,rawDefaults);
  const rejectedActiveA=assert.rejects(activeA,{name:'AbortError'}),rejectedQueuedA=assert.rejects(queuedA,{name:'AbortError'});
  await tick();raw.release(a);await Promise.all([rejectedActiveA,rejectedQueuedA]);await tick();
  const ownerC=FakeWorker.all.at(-1)!;assert.equal(ownerA.dead,true);assert.notEqual(ownerC,ownerA);assert.equal(ownerC.messages.length,1);
  ownerA.reply({stale:true});assert.equal(timers.size,1);ownerC.reply({decoded:'c'});assert.equal((await decodeC).decoded,'c');assert.equal(timers.size,0);
  // Completed workers retain RGB16 cache ownership until replacement/release.
  raw.release(b);assert.equal(ownerC.dead,false);
  raw.release(c);assert.equal(ownerC.dead,true);assert.equal(raw.generation,generation);assert.equal(timers.size,0);
  await assert.rejects(raw.decode(a,rawDefaults),{name:'AbortError'});
  raw.cancel();console.log('RAW lifecycle: cancel queued work, stale responses, synchronous clone failure, message error, timeout and recovery PASS');
}finally{Object.assign(globalThis,prior);}
