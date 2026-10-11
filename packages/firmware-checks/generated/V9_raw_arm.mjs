// Generated from re/tools/V9_raw_arm.cjs SHA256 4df2b6c227191b5b6392715e74c5e0fde9c08152453c46b863845fb5c702048b
export default function(require, Buffer, process, console, __dirname, module, exports) {
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const R=__dirname+'/../',M=require(R+'analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const C=require('./V9_guest_common.cjs'),dir=R+'build/V9-raw',p=JSON.parse(fs.readFileSync(dir+'/manifest.json')),fw=fs.readFileSync(R+'extract/unpackedFW'),v6=C.v7;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),rawcode=fs.readFileSync(dir+'/raw.bin');assert.equal(sha(rawcode),p.sha256);
const rawPlacedBase=C.combined?Number(C.combined.modules.find(m=>m.name==='raw').base):Number(p.base);
p.symbols=Object.fromEntries(Object.entries(p.symbols).map(([n,a])=>[n,rawPlacedBase+a]));
return M().then(u=>{
 const RAW=0x56001000,PROP=0x56003000,PM=0x56005000,UD=0x56007000,DATA=0x56008000,SP=0x560ff000,RET=0x56000000;
 let e,api=[],lastPC=0,minSP=SP,escapeWrites=[];const read=(a,n)=>Buffer.from(e.mem_read(a,n));const write=(a,v,n=4)=>{let z=Buffer.alloc(n);n===1?z.writeUInt8(v):z.writeUInt32LE(v>>>0);e.mem_write(a,z);};
 const reg=(n,v)=>e.reg_write_i32(u['ARM_REG_'+n],v);const ret=(v)=>{if(v!==undefined)reg('R0',v);reg('PC',e.reg_read_i32(u.ARM_REG_LR));};
 function setup(patched){e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);for(let[a,n]of[[0x53000000,0x1400000],[0x54800000,0x100000],[0x55000000,0x400000],[0x56000000,0x100000]])e.mem_map(a,n,u.PROT_ALL);e.mem_write(0x53000000,fw.subarray(0x10870,0x10870+0x1400000));for(let x of v6.patches)e.mem_write(Number(x.va),Buffer.from(x.new_hex,'hex'));if(patched){if(C.combined)C.load(e);C.apply(e,'backend');C.apply(e,'menu');C.apply(e,'raw');}
 e.hook_add(u.HOOK_CODE,()=>{lastPC=Number(e.reg_read_i32(u.ARM_REG_PC))>>>0;let sp=e.reg_read_i32(u.ARM_REG_SP)>>>0;if(sp>=0x56000000&&sp<=SP)minSP=Math.min(minSP,sp);});
 e.hook_add(u.HOOK_MEM_WRITE,(_e,_t,a,n,value)=>{a=Number(a);value=Number(value)>>>0;const clone=SP-1032;if(n===4&&value>=clone&&value<clone+0x3c4&&!(a>=SP-0x2000&&a<=SP))escapeWrites.push({address:a,value,pc:lastPC});});
 e.hook_add(u.HOOK_CODE,()=>ret(0x12340000),{},0x5320ad88,0x5320ad88);
 e.hook_add(u.HOOK_CODE,()=>ret(UD),{},0x5320b31c,0x5320b31c);
 e.hook_add(u.HOOK_CODE,()=>ret(),{},0x53283b98,0x53283b98);
 e.hook_add(u.HOOK_CODE,()=>{assert(e.reg_read_i32(u.ARM_REG_R0)!==0,'native assert false');ret(1);},{},0x536b93d0,0x536b93d0);
 e.hook_add(u.HOOK_CODE,(_e,a)=>{api.push({pc:Number(a),value:e.reg_read_i32(u.ARM_REG_R1)>>>0,target:e.reg_read_i32(u.ARM_REG_R0)>>>0});ret(1);},{},0x53558000,0x5355d000);
 write(UD+4,DATA);
 }
 function init(slot,inner,value=4){e.mem_write(RAW,Buffer.alloc(0x3c4));write(RAW+0x18,PM);write(RAW+0x24,PROP);write(RAW+0x82,slot,1);for(let s=0;s<3;s++){write(RAW+0x83+s,inner,1);for(let i=0;i<13;i++){const row=Buffer.alloc(17);for(let j=0;j<7;j++)row[j]=value;row[13]=value;row[14]=value;e.mem_write(RAW+0x86+s*0xdd+i*17,row);}}e.mem_write(PROP,Buffer.alloc(0x1040));write(PROP+0x77c,22,1);for(let j=0;j<6;j++)write(PROP+0x77d+j,value,1);write(PROP+0x784,value,1);write(PROP+0x793,value,1);write(PROP+0x794,value,1);e.mem_write(DATA,Buffer.alloc(0x1c80));for(let ord=0;ord<4;ord++)for(let s=0;s<3;s++){for(let j=0;j<9;j++)write(DATA+0xb26+ord*33+s*11+j,value,1);}api=[];}
 function call(pc,a=RAW,b=0,c=0,d=0){reg('CPSR',0xa80a0010);for(let i=0;i<13;i++)reg('R'+i,0x11110000+i);reg('R0',a);reg('R1',b);reg('R2',c);reg('R3',d);reg('SP',SP);reg('LR',RET);api=[];try{e.emu_start(pc,RET,0,200000);}catch(err){console.error('entry',pc.toString(16),'last',lastPC.toString(16));throw err;}assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);for(let i=4;i<=11;i++)assert.equal(e.reg_read_i32(u['ARM_REG_R'+i])>>>0,0x11110000+i,'callee register r'+i);return e.reg_read_i32(u.ARM_REG_R0)>>>0;}
 function fallbackPrefix(slot,inner,original=false){
  init(slot,inner,4);reg('CPSR',0xa80a0010);for(let i=0;i<13;i++)reg('R'+i,0x11110000+i);reg('R0',RAW);reg('SP',SP);reg('LR',RET);
  const entry=original?0x548f0000:0x53283d18,end=entry+4;if(original)e.mem_write(entry,fw.subarray(C.off(0x53283d18),C.off(0x53283d18)+4));
  e.emu_start(entry,original?end:0x53283d1c,0,1000);assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,original?end:0x53283d1c);
  return {regs:Array.from({length:13},(_,i)=>e.reg_read_i32(u['ARM_REG_R'+i])>>>0),sp:e.reg_read_i32(u.ARM_REG_SP)>>>0,flags:e.reg_read_i32(u.ARM_REG_CPSR)>>>0,model:read(RAW,0x3c4).toString('hex'),side:read(DATA+0xbaa,204).toString('hex')};
 }
 let baseline=[],fallback=[];
 setup(false);
 for(let slot=0;slot<3;slot++)for(let inner=0;inner<13;inner++)for(let value of[0,4,8])for(let m of p.methods.filter(x=>x.label!=='snapshot')){init(slot,inner,value);const result=call(Number(m.va),RAW,value);baseline.push({slot,inner,value,m,result,api:[...api],model:read(RAW,0x3c4).toString('hex')});}
 for(const [slot,inner] of [[3,13],[3,16],[255,13],[255,16],[0,12],[0,17],[0,255],[2,17],[2,255]])fallback.push({slot,inner,state:fallbackPrefix(slot,inner,true)});
 e.close();setup(true);let old=0;
 for(const f of fallback)assert.deepEqual(fallbackPrefix(f.slot,f.inner),f.state,'invalid custom range changed native prefix');
 for(let b of baseline){init(b.slot,b.inner,b.value);assert.equal(call(Number(b.m.va),RAW,b.value),b.result);assert.deepEqual(api,b.api);assert.equal(read(RAW,0x3c4).toString('hex'),b.model);old++;}
 // init from persistent, neutral clamp, sidecar no writes outside204B.
 let initCases=0;
 for(let value of[0,4,8,255]){init(0,13,value);const before=read(DATA,0x1c80);call(p.symbols.init_gold);for(let s=0;s<12;s++){let row=read(DATA+0xbaa+s*17,17);for(let j of p.gold_controls)assert.equal(row[j],value<=8?value:4);for(let j of[7,8,9,10,11,12,15,16])assert.equal(row[j],0);}assert(read(DATA,0xbaa).equals(before.subarray(0,0xbaa)));assert(read(DATA+0xc76,0x1c80-0xc76).equals(before.subarray(0xc76)));initCases++;}
 let gold=0;minSP=SP;escapeWrites=[];let snapshots=0,cancels=0,setterChanges=0,switchedCancels=0,originCases=0,stillCases=0;
for(let ordinal=0;ordinal<4;ordinal++){const inner=13+ordinal,sideBase=DATA+0xbaa+ordinal*51;
 for(let slot=0;slot<3;slot++)for(let value of[0,4,8])for(let m of p.methods.filter(x=>x.label!=='snapshot')){init(slot,inner,value);call(p.symbols.init_gold);const before=read(RAW,0x3c4),side=read(DATA+0xbaa,204),ref=baseline.find(b=>b.slot===slot&&b.inner===7&&b.value===value&&b.m.va===m.va);const result=call(Number(m.va),RAW,value);assert(read(RAW,0x3c4).equals(before),'real RAW changed '+m.va);if(m.kind===2){assert.deepEqual(api,[]);assert(read(DATA+0xbaa,204).equals(side));}else{assert.equal(result,ref.result);assert.deepEqual(api,ref.api);if(m.label==='set'){const expected=Buffer.from(ref.model,'hex').subarray(0x86+slot*0xdd+7*17,0x86+slot*0xdd+8*17);assert(read(sideBase+slot*17,17).equals(expected));}else assert(read(DATA+0xbaa,204).equals(side));}gold++;}
 
 for(let slot=0;slot<3;slot++)for(let value of[0,4,8]){init(slot,inner,value);call(p.symbols.init_gold);const oldcache=read(RAW+0x86,0x297),side=read(sideBase+slot*17,17);call(0x532846c4);call(0x532846dc);assert(read(RAW+0x3a2,17).equals(side));assert.equal(read(RAW+0x3a0,1)[0],inner);if(slot)assert.equal(read(RAW+0x3a1,1)[0],inner);assert(read(RAW+0x86,0x297).equals(oldcache));snapshots++;for(let j of p.gold_controls)write(sideBase+slot*17+j,8-value,1);call(0x53289460);assert(read(sideBase+slot*17,17).equals(side),'cancel Gold row');assert.equal(read(RAW+0x83+slot,1)[0],inner);assert(read(RAW+0x86,0x297).equals(oldcache));cancels++;}


 
 for(let slot=0;slot<3;slot++)for(let value=0;value<=8;value++)for(let m of p.methods.filter(x=>x.label==='set'&&x.kind===1)){init(slot,inner,4);call(p.symbols.init_gold);const before=read(RAW,0x3c4),row=read(sideBase+slot*17,17);call(Number(m.va),RAW,value);row[m.index]=value;assert(read(sideBase+slot*17,17).equals(row));assert(read(RAW,0x3c4).equals(before));assert.equal(api.length,1);assert.equal(api[0].target,PM);assert.equal(api[0].value,value);setterChanges++;}
 // Gold to native style switch then cancel restores Gold snapshot, never aliases original caches.
 
 for(let slot of[1,2])for(let value of[0,4,8]){init(slot,inner,value);call(p.symbols.init_gold);call(0x532846c4);call(0x532846dc);const snap=read(sideBase+slot*17,17);write(RAW+0x83+slot,7,1);call(0x53289240);call(0x53286f40,RAW,8-value);call(0x53289460);assert.equal(read(RAW+0x83+slot,1)[0],inner);assert(read(sideBase+slot*17,17).equals(snap));switchedCancels++;}
 // Selector0 keeps actual original-photo Gold25 metadata and native parameter readers.
 for(let slot=0;slot<3;slot++)for(let value of[0,4,8]){init(slot,0,value);write(PROP+0x77c,25+ordinal,1);for(let m of p.methods.filter(x=>x.label==='get'))assert.equal(call(Number(m.va)),value);assert.equal(call(0x53289058,RAW,0),25+ordinal);originCases++;}
 const CTRL=0x5600a000;const styles=[11,12,13,14,15,16,22,17,18,19,20,21];e.mem_write(CTRL,Buffer.alloc(0x200));
 for(let slot=0;slot<3;slot++){for(let i=0;i<styles.length;i++){assert.equal(call(0x531aca98,CTRL,styles[i]),i);const n=call(0x531afab8,CTRL,slot,i);assert(n>=1&&n<=11);stillCases++;}assert.equal(call(0x531aca98,CTRL,25+ordinal),6);assert.equal(call(0x531afab8,CTRL,slot,6),slot?10:9);stillCases++;}
 }
 // Different values in both styles and all three slots expose aliasing that
 // neutral/symmetric fixtures would hide. Only the active 17B record may change.
 let isolationCases=0;
 for(let slot=0;slot<3;slot++){
  init(slot,13,4);
  for(let ord=0;ord<4;ord++)for(let s=0;s<3;s++)for(let j=0;j<9;j++)write(DATA+0xb26+ord*33+s*11+j,(ord*2+s)%9,1);
  call(p.symbols.init_gold);
  for(let ord=0;ord<4;ord++){
   write(RAW+0x83+slot,13+ord,1);const before=read(DATA+0xbaa,204),expected=Buffer.from(before);
   assert.equal(call(0x53283d18),(ord*2+slot)%9);
   const value=(ord+slot+2)%9;call(0x53286f40,RAW,value);expected[ord*51+slot*17]=value;
   assert(read(DATA+0xbaa,204).equals(expected),'cross-style/slot setter alias');isolationCases++;
  }
 }
 let pairCancelCases=0;
 for(let slot of[1,2])for(let start=0;start<4;start++)for(let target=0;target<4;target++)if(start!==target){
  init(slot,13+start,4);
  for(let ord=0;ord<4;ord++)for(let s=0;s<3;s++)for(let j=0;j<9;j++)write(DATA+0xb26+ord*33+s*11+j,(ord*2+s+j)%9,1);
  call(p.symbols.init_gold);call(0x532846c4);call(0x532846dc);
  const before=read(DATA+0xbaa,204),oldCaches=read(RAW+0x86,0x297);
  write(RAW+0x83+slot,13+target,1);call(0x53289240);call(0x53286f40,RAW,(start+target)%9);
  const changed=read(DATA+0xbaa,204);assert.equal(changed[target*51+slot*17],(start+target)%9);
  call(0x53289460);assert.equal(read(RAW+0x83+slot,1)[0],13+start);
  assert(read(DATA+0xbaa+start*51+slot*17,17).equals(before.subarray(start*51+slot*17,start*51+slot*17+17)),'pair cancel restored wrong identity');
  assert(read(DATA+0xbaa+target*51+slot*17,17).equals(changed.subarray(target*51+slot*17,target*51+slot*17+17)),'pair cancel polluted target');
  assert(read(RAW+0x86,0x297).equals(oldCaches));pairCancelCases++;
 }
 assert.deepEqual(escapeWrites,[],'stack clone pointer escaped into heap');
 const result={status:'PASS',combined_plan_sha256:C.combinedBytes?sha(C.combinedBytes):undefined,final_rom_only:!!C.combined,scope:'Real ARM native numeric getters/setters/apply via stack-local clone; native caches unchanged; not whole camera',module_sha256:p.sha256,styles_tested:[25,26,27,28],old_cases:old,invalid_range_native_prefix_cases:fallback.length,gold_cases:gold,gold_setter_change_cases:setterChanges,init_cases:initCases,snapshot_cases:snapshots,cancel_cases:cancels,switched_cancel_cases:switchedCancels,ordered_four_style_pair_cancel_cases:pairCancelCases,asymmetric_style_slot_isolation_cases:isolationCases,origin_metadata_cases:originCases,still_list_cases:stillCases,clone_pointer_escape_writes:escapeWrites,observed_max_stack_bytes:SP-minSP,numeric_helpers_stubbed:false,limitations:['UserData manager getter injected, currentheap 1c80 provided; Four styles shared layout ordinal-bound','Property API setters capture numeric values; real queue/lock/async job not executed','No framebuffer/UI lifecycle, RAW refresh old fullfunction or camera execution','Extra stack1032B before native stack; camera stack headroom pending']};fs.mkdirSync(C.reportDir('raw'),{recursive:true});fs.writeFileSync(C.reportDir('raw')+'/checks.json',JSON.stringify(result,null,2)+'\n');e.close();console.log(JSON.stringify(result));
}).catch(x=>{console.error(x);process.exitCode=1;});

}
