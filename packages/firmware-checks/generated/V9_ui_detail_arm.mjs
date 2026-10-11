// Generated from re/tools/V9_ui_detail_arm.cjs SHA256 f6642b3091b3037f416f861698c4b21d7b100c6f9c36de8e2a1c8bb816516095
export default function(require, Buffer, process, console, __dirname, module, exports) {
// V9 four-style adjustable RAW UI regression; no guest byte injection.
// Four-style typed-table regression, isolated output.
// Frozen V7 baseline retained.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const R=__dirname+'/../',M=require(R+'analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const C=require('./V9_guest_common.cjs'),fw=C.source,menu=C.moduleInfo('menu').p,p={...menu,table:menu.base+menu.symbols.raw_ui_table};
const bc=JSON.parse(fs.readFileSync(R+'build/BC-ui-guest/patches.json')),bd=JSON.parse(fs.readFileSync(R+'build/BD-fixed-gold-routing/manifest.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(sha(fw),C.v7.source_sha256);
return M().then(u=>{
 const CTRL=0x56001000,RAW=0x56002000,MODEL=0x56003000,PM=0x56004000,PROP=0x56005000,SLIDER=0x56007000,SP=0x560ff000,RET=0x56000000;
 let e,lastPC=0,tableRead=null,tracking=false,post=[],calls=[],scanReads=[],detailPage=0x04000025;
 const off=a=>a-0x53000000+0x10870;
 const read=(a,n)=>Buffer.from(e.mem_read(a,n));
 const write=(a,v,n=4)=>{let z=Buffer.alloc(n);n===1?z.writeUInt8(v):z.writeUInt32LE(v>>>0);e.mem_write(a,z);};
 const ret=v=>{if(v!==undefined)e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
 const planBytes=fs.readFileSync(R+'build/CH-adjustable-gold/plan.json'),combined=JSON.parse(planBytes),v6=JSON.parse(fs.readFileSync(R+'build/CF-independent-gold-colorfix/plan.json'));
 const formatterMap={};for(let t=0;t<18;t++){const a=fw.readUInt32LE(off(0x531914d4)+4*t),w=fw.readUInt32LE(off(a)+8);assert.equal(w>>>24,0xeb);let q=w&0xffffff;q=q&0x800000?q-0x1000000:q;formatterMap[t]=a+16+q*4;}
 let formatted=[];
 function make(patched){
  e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);
  for(let[a,n]of[[0x55000000,0x400000],[0x56000000,0x100000],[0x54800000,0x100000]])e.mem_map(a,n,u.PROT_ALL);
  e.mem_map(0x53000000,0x1400000,u.PROT_ALL);
  e.mem_write(0x53000000,fw.subarray(0x10870,0x10870+0x1400000));e.mem_write(0x55000000,fw.subarray(off(0x5407b540),off(0x5407b540)+0x3a080));
  for(const z of combined.patches){let a=parseInt(z.va);assert.equal(read(a,z.old_hex.length/2).toString('hex'),z.old_hex);e.mem_write(a,Buffer.from(z.new_hex,'hex'));}
  if(patched){if(C.combined)C.load(e);C.apply(e,'backend');C.apply(e,'menu');C.apply(e,'raw');}write(RAW+0x18,PM);write(RAW+0x24,PROP);write(PM,PROP);write(PM+4,PROP);
  for(let[a,val]of[[0x5320ad88,0],[0x5320b31c,0],[0x5320b67c,0],[0x5320b37c,RAW],[0x5320ba9c,MODEL]])e.hook_add(u.HOOK_CODE,()=>ret(val),{},a,a);
  e.hook_add(u.HOOK_CODE,()=>{assert(e.reg_read_i32(u.ARM_REG_R0)!==0,'native assert at '+lastPC.toString(16));ret();},{},0x536b93d0,0x536b93d0);
  for(let a of[0x53283b98,0x53191218,0x53191bdc,0x5318e0c4,0x5318e030,0x53191054,0x53191160,0x531904e4,0x5328932c,0x532846dc])e.hook_add(u.HOOK_CODE,()=>{calls.push(a);ret();},{},a,a);
  e.hook_add(u.HOOK_CODE,()=>ret(1),{},0x5327baf0,0x5327baf0);
  e.hook_add(u.HOOK_CODE,()=>ret(SLIDER),{},0x5319190c,0x5319190c);
  e.hook_add(u.HOOK_CODE,()=>ret(detailPage),{},0x5316d8d4,0x5316d8d4);
  e.hook_add(u.HOOK_CODE,()=>{post.push({dest:e.reg_read_i32(u.ARM_REG_R1)>>>0,source:e.reg_read_i32(u.ARM_REG_R2)>>>0});ret();},{},0x5316c9d8,0x5316c9d8);
  e.hook_add(u.HOOK_CODE,()=>ret(0x56009000),{},0x536af2a8,0x536af2a8);
  e.hook_add(u.HOOK_CODE,()=>ret(0),{},0x53394820,0x53394820);
  e.hook_add(u.HOOK_CODE,()=>{post.push('parent');ret();},{},0x5316ca28,0x5316ca28);
  for(let[t,a]of Object.entries(formatterMap))e.hook_add(u.HOOK_CODE,()=>{formatted.push({type:Number(t),row:e.reg_read_i32(u.ARM_REG_R1)});ret();},{},a,a);
  e.hook_add(u.HOOK_CODE,(_e,a)=>{lastPC=Number(a);});
  e.hook_add(u.HOOK_MEM_READ,(_e,_t,a,n)=>{a=Number(a);if(a>=0x53002180&&a<0x53002180+312||a>=parseInt(p.table)&&a<parseInt(p.table)+384){scanReads.push({a,n});if(tracking){tableRead={a,n,bytes:read(a,n).toString('hex')};e.emu_stop();}}});
 }
 const resetRegs=()=>{e.reg_write_i32(u.ARM_REG_CPSR,0xa80a0010);for(let i=0;i<13;i++)e.reg_write_i32(u['ARM_REG_R'+i],CTRL);e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);};
 function run(pc,a=CTRL,b=0,c=0){resetRegs();e.reg_write_i32(u.ARM_REG_R0,a);e.reg_write_i32(u.ARM_REG_R1,b);e.reg_write_i32(u.ARM_REG_R2,c);try{e.emu_start(pc,RET,0,100000);}catch(err){console.error('lastPC',lastPC.toString(16),'entry',pc.toString(16));throw err;}assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);return e.reg_read_i32(u.ARM_REG_R0)>>>0;}
 const styles=[11,12,13,14,15,16,22,17,18,19,20,21],outer=[0,11,12,13,14,15,16,22,17,18,19,20,21,25,26,27,28];
 function init(slot,style){write(RAW+0x82,slot,1);write(MODEL+0x1b,2,1);write(MODEL+0x1c,slot,1);write(PROP+0x77c,style,1);for(let s=0;s<3;s++)write(RAW+0x83+s,outer.indexOf(style),1);write(RAW+0x38,0,1);write(CTRL+0x19a,slot,1);write(CTRL+0x19b,styles.concat(25,26,27,28).indexOf(style),1);write(CTRL+0x19c,0,1);}
 const fragments=[
 [0x53190280,0x53190298],[0x53190650,0x53190670],[0x53191058,0x53191098],[0x53191164,0x5319119c],
 [0x53191278,0x53191290],[0x53191478,0x531914a4],[0x53191848,0x53191860],[0x531919b0,0x531919c8],
 [0x53191d50,0x53191d68],[0x531921c0,0x531921e0],[0x53192270,0x53192288],[0x531922e8,0x53192300]];
 function fragment(entry,slot,idx){write(CTRL+0x19a,slot,1);write(CTRL+0x19b,idx,1);resetRegs();e.reg_write_i32(u.ARM_REG_R0,CTRL);tracking=true;tableRead=null;try{e.emu_start(entry,RET,0,1000);}finally{tracking=false;}assert(tableRead,'no table read '+entry.toString(16));return tableRead;}
 make(false);
 const oldConverters=styles.map(style=>({style,index:run(0x5318dea0,CTRL,style)}));
 const baseline=[];for(let[entry]of fragments)for(let slot=0;slot<3;slot++)for(let idx=0;idx<12;idx++){const r=fragment(entry,slot,idx);baseline.push({entry,slot,idx,...r});}
 let oldEnter=[];for(let slot=0;slot<3;slot++)for(let style of styles){init(slot,style);calls=[];post=[];run(0x53191c4c);oldEnter.push({slot,style,calls:[...calls],post:[...post],ui:read(CTRL+0x199,3).toString('hex')});}
 let oldEligibility=[];for(let slot=0;slot<3;slot++)for(let style of styles){init(slot,style);detailPage=0x04000025;const eligible=run(0x5318b0e8);calls=[];post=[];run(0x5318b12c);oldEligibility.push({slot,style,eligible,calls:[...calls],post:[...post]});}
 const oldPrimary=[];for(let flag of[0,1]){init(1,22);write(RAW+5,flag,1);const count=run(0x53283358,RAW);for(let index=0;index<count;index++)oldPrimary.push({flag,index,count,slot:run(0x532834d0,RAW,index),inner:run(0x532834f0,RAW,index)});}
 e.close();make(true);
 for(let row of oldConverters)assert.equal(run(0x5318dea0,CTRL,row.style),row.index);assert.equal(run(0x5318dea0,CTRL,25),12);assert.equal(run(0x53283c08,RAW),16);for(const [style,index] of [[26,13],[27,14],[28,15]])assert.equal(run(0x5318dea0,CTRL,style),index);
 for(let row of baseline){const r=fragment(row.entry,row.slot,row.idx),delta=row.a-(0x53002180+(13*row.slot+row.idx)*8);assert.equal(r.a,parseInt(p.table)+(16*row.slot+row.idx)*8+delta);assert.equal(r.bytes,row.bytes);}
 let goldRefs=[];for(let[entry]of fragments)for(let slot=0;slot<3;slot++)for(let idx of[12,13,14,15]){const r=fragment(entry,slot,idx);assert(r.a>=parseInt(p.table)+(16*slot+idx)*8&&r.a<parseInt(p.table)+(16*slot+idx+1)*8);goldRefs.push({entry,slot,idx,...r});}
 for(let row of oldEnter){init(row.slot,row.style);calls=[];post=[];run(0x53191c4c);assert.deepEqual(calls,row.calls);assert.deepEqual(post,row.post);assert.equal(read(CTRL+0x199,3).toString('hex'),row.ui);}
 const goldEnter=[];for(let slot=0;slot<3;slot++)for(let custom of[25,26,27,28]){init(slot,custom);calls=[];post=[];run(0x53191c4c);assert.deepEqual(post,[]);assert.equal(read(CTRL+0x199,3).toString('hex'),Buffer.from([custom,slot,custom-13]).toString('hex'));goldEnter.push({slot,calls:[...calls],post:[...post]});}
 const goldEligibility=[];for(let row of oldEligibility){init(row.slot,row.style);detailPage=0x04000025;assert.equal(run(0x5318b0e8),row.eligible);calls=[];post=[];run(0x5318b12c);assert.deepEqual(calls,row.calls);assert.deepEqual(post,row.post);}
 for(let slot=0;slot<3;slot++)for(let custom of[25,26,27,28]){init(slot,custom);detailPage=0x04000025;assert.equal(run(0x5318b0e8),1);calls=[];post=[];run(0x5318b12c);assert.equal(post.length,1);assert.equal(calls.length,1);goldEligibility.push({slot,eligible:1,post:[...post]});}
 // Run native type17 slider event: real menu conversion + RAW setter store + UI refresh.
 const transitions=[];for(let slot of[1,2])for(let [start,target] of [25,26,27,28].flatMap(start=>styles.concat(25,26,27,28).map(t=>[start,t]).concat(styles.map(t=>[t,start])))){
  init(slot,start);run(0x5318df84);write(SLIDER+0xf8,menu.base_order.indexOf(target));const before=read(RAW+0x86,3*0xdd);calls=[];post=[];run(0x53191d14);
  assert.equal(run(0x53289148,RAW,slot),target);assert.equal(read(CTRL+0x199,1)[0],target);assert.equal(read(CTRL+0x19b,1)[0],target>=25?target-13:styles.indexOf(target));assert(read(RAW+0x86,3*0xdd).equals(before));transitions.push({slot,start,target,inner:read(RAW+0x83+slot,1)[0],ui:read(CTRL+0x19b,1)[0]});
 }
 // RAW primary selection list is independent of the Custom detail style slider.
 let applied=[];e.hook_add(u.HOOK_CODE,()=>{applied.push({slot:read(RAW+0x82,1)[0],inner:read(RAW+0x83+read(RAW+0x82,1)[0],1)[0]});ret();},{},0x53289240,0x53289240);
 const primaryGold=[];for(let flag of[0,1])for(let row=0;row<18+flag;row++){init(1,22);write(RAW+5,flag,1);const slot=run(0x532834d0,RAW,row),inner=run(0x532834f0,RAW,row);detailPage=0x04000025;assert.equal(run(0x53189ca0),18+flag);applied=[];run(0x5318a6d0,CTRL,row);assert.deepEqual(applied,[{slot,inner}]);assert.equal(run(0x5318aa64,CTRL,row),1);primaryGold.push({flag,row,slot,inner});}
 // Native table loop dispatches exactly nine Gold numeric rows plus Custom style selector.
 const goldLists=[];for(let slot=0;slot<3;slot++)for(let custom of[25,26,27,28]){init(slot,custom);run(0x5318df84);formatted=[];run(0x53191474);const types=(slot?[17]:[]).concat([0,1,2,3,4,5,6,13,14]);assert.deepEqual(formatted,types.map((type,row)=>({type,row})));goldLists.push({slot,row_count:formatted.length,types});}
 // Native style slider setup through max/index calculation, stop before view config helper.
 e.hook_add(u.HOOK_CODE,()=>ret(25),{},0x53284d18,0x53284d18);
 init(1,25);run(0x5318df84);resetRegs();e.emu_start(0x53190104,0x5339f194,0,10000);assert.equal(e.reg_read_i32(u.ARM_REG_R2),15);assert.equal(e.reg_read_i32(u.ARM_REG_R7),0);
 // Factory dispatch classification; execute actual branches, allocation stub only.
 const factory=[];for(let [page,ctor] of [[0x0400001f,0x53188cb0],[0x0400002b,0x5318e588]]){e.mem_write(CTRL,Buffer.alloc(0x200));resetRegs();e.reg_write_i32(u.ARM_REG_R1,page);e.emu_start(0x5316f410,ctor,0,10000);assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,ctor);factory.push({page,ctor});}
 // Execute all RAW table scan instructions to allocator entry; max remains11, 48 records.
 resetRegs();scanReads=[];e.emu_start(0x5318e1bc,0x5318e21c,0,10000);assert.equal(e.reg_read_i32(u.ARM_REG_R4),11);assert.equal(scanReads.length,48);
 const result={status:'PASS',combined_plan_sha256:C.combinedBytes?sha(C.combinedBytes):undefined,final_rom_only:!!C.combined,scope:'V9 four-style adjustable RAW onenter/eligibility/native list dispatch; V7 factory behavior retained',styles_tested:[25,26,27,28],old_converter_cases:12,old_direct_table_access_cases:baseline.length,gold_direct_table_access_cases:goldRefs.length,old_onenter_cases:oldEnter.length,goldEnter,old_primary_cases:oldPrimary.length,primaryGold,old_detail_eligibility_cases:oldEligibility.length,goldEligibility,goldLists,slider_config:{max_index:15,current_index:0},factory,transitions,table_scan:{records:scanReads.length,max_count:11},hooks:p.hooks.length,limitations:p.limits.concat(['UI refresh, parent navigation, model manager, snapshot copy and RAW apply stubbed; underlying style setter cache byte and native menu converters execute','Slider setup current style query injected; max/index conversions are native; view config/rendering not executed','Only table access fragments, not every downstream consumer or actual font/view rendering','Module guest or final plan as indicated; no whole-camera execution or physical stability proof'])};
 result.menu_sha256=menu.sha256;result.v7_plan_sha256=sha(planBytes);fs.mkdirSync(C.reportDir('raw-ui'),{recursive:true});fs.writeFileSync(C.reportDir('raw-ui')+'/checks.json',JSON.stringify(result,null,2)+'\n');e.close();console.log(JSON.stringify({status:'PASS',old_table:baseline.length,gold_table:goldRefs.length,transitions:transitions.length}));
}).catch(err=>{console.error(err);process.exitCode=1;});

}
