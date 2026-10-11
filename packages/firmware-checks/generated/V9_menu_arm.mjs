// Generated from re/tools/V9_menu_arm.cjs SHA256 b6f7870e05b909c0cf1d0633e050fe3f71f0349668370696d093245f6f23ea7d
export default function(require, Buffer, process, console, __dirname, module, exports) {
// Real native controller operations with transparent ordinal adapters.
const C=require('./V9_guest_common.cjs'),{fs,assert,R,source,off,sha,v7bytes,apply,load}=C;
const M=require(R+'/analysis/AV-independent-arm/package/dist/unicorn_arm.js');
return M().then(u=>{
 const e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);
 for(const[a,n]of[[0x53000000,0x1400000],[0x54800000,0x100000],[0x55000000,0x400000],[0x56000000,0x100000]])e.mem_map(a,n,u.PROT_ALL);
 load(e);const backend=apply(e,'backend'),menu=apply(e,'menu');
 const UD=0x56001000,DATA=0x56003000,MODEL=0x56006000,CTRL=0x56007000,RAW=0x56008000,PM=0x5600a000,PROP=0x5600b000,SP=0x560ff000,RET=0x56000000;
 const read=(a,n)=>Buffer.from(e.mem_read(a,n));const write=(a,v,n=4)=>{const b=Buffer.alloc(n);n===1?b.writeUInt8(v):b.writeUInt32LE(v>>>0);e.mem_write(a,b);};
 const ret=v=>{if(v!==undefined)e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
 let viewRow=0,drawn=[],selectedView=[],iconIDs=[],lastPC=0;
 for(const[a,v]of[[0x5320ad88,0],[0x5320b31c,UD],[0x5320b7fc,UD],[0x5320ba9c,MODEL],[0x5320b67c,0],[0x5320b37c,RAW]])e.hook_add(u.HOOK_CODE,()=>ret(v),{},a,a);
 e.hook_add(u.HOOK_CODE,()=>{assert.notEqual(e.reg_read_i32(u.ARM_REG_R0),0,'native assert '+lastPC.toString(16));ret();},{},0x536b93d0,0x536b93d0);
 e.hook_add(u.HOOK_CODE,()=>ret(1),{},0x532750f8,0x532750f8);
 e.hook_add(u.HOOK_CODE,()=>ret(read(DATA+0x1c2+2*read(DATA+0x1c0,1)[0],1)[0]),{},0x532bd6b4,0x532bd6b4);
 e.hook_add(u.HOOK_CODE,()=>ret(viewRow),{},0x53394820,0x53394820);
 e.hook_add(u.HOOK_CODE,()=>{drawn.push(e.reg_read_i32(u.ARM_REG_R1)>>>0);ret();},{},0x53396f80,0x53396f80);
 e.hook_add(u.HOOK_CODE,()=>{selectedView.push(e.reg_read_i32(u.ARM_REG_R1)>>>0);ret(0x5600d000);},{},0x53394758,0x53394758);
 e.hook_add(u.HOOK_CODE,()=>{iconIDs.push(e.reg_read_i32(u.ARM_REG_R1)>>>0);ret();},{},0x533a1734,0x533a1734);
 e.hook_add(u.HOOK_CODE,()=>{lastPC=e.reg_read_i32(u.ARM_REG_PC)>>>0;});
 const call=(a,r0=CTRL,r1=0,r2=0,r3=0)=>{e.reg_write_i32(u.ARM_REG_CPSR,0x10);for(let i=0;i<13;i++)e.reg_write_i32(u['ARM_REG_R'+i],0x11110000+i);for(const[r,v]of [[u.ARM_REG_R0,r0],[u.ARM_REG_R1,r1],[u.ARM_REG_R2,r2],[u.ARM_REG_R3,r3],[u.ARM_REG_SP,SP],[u.ARM_REG_LR,RET]])e.reg_write_i32(r,v);try{e.emu_start(a,RET,0,100000);}catch(err){console.error('failed',a.toString(16),lastPC.toString(16));throw err;}assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);return e.reg_read_i32(u.ARM_REG_R0)>>>0;};
 write(UD+4,DATA);write(CTRL+0x1a9,18,1);write(RAW+0x18,PM);write(RAW+0x24,PROP);
 const expectedRows=process.expectedDisplayRows || [22,17,25,26,27,28,11,12,13,14,15,16,18,19,20,21].map(selector=>({kind:'style',selector})).concat([{kind:'slot',slot:1},{kind:'slot',slot:2}]);
 assert.deepEqual(menu.typed_display_rows,expectedRows,'V9 user requested display order');
 const rows=menu.typed_display_rows,styles=menu.base_order;let mappings=0,selections=0,match=0,names=0,rawRows=0,candidateNames=0;
 for(const mode of[0,1,2])for(let slot=0;slot<3;slot++){
  write(MODEL+0x1b,mode,1);write(MODEL+0x1c,slot,1);write(DATA+(mode===1?0x57c:0x1c0),slot,1);
  const wanted=mode===1?[11,12,13,15,16,22,17,18,19,21]:styles;assert.equal(call(0x532c2a9c,MODEL),wanted.length);
  for(let i=0;i<wanted.length;i++){assert.equal(call(0x532c2c80,MODEL,i),wanted[i]);assert.equal(call(0x532c2f08,MODEL,wanted[i]),i);mappings++;}
 }
 write(MODEL+0x1b,0,1);assert.equal(call(0x531ab9e8),18);assert.equal(call(0x531a0514),18);
 for(let row=0;row<rows.length;row++){
  const d=rows[row],slot=d.kind==='slot'?d.slot:0;
  for(const entry of[0x531ab914,0x531a0ba0]){
   write(DATA+0x1c0,0,1);for(let s=0;s<3;s++)write(DATA+0x1c2+2*s,22,1);call(entry,CTRL,row);
   assert.equal(read(DATA+0x1c0,1)[0],slot);assert.equal(read(DATA+0x1c2+2*slot,1)[0],d.kind==='slot'?22:d.selector);selections++;
  }
  const expectedText=d.kind==='slot'?call(0x532a985c,0,22+slot):call(0x532922b4,0,d.selector);
  const expectedIcon=d.kind==='slot'?call(0x532a9988,0,22+slot):call(0x532935dc,0,d.selector);
  if(d.kind==='style'&&d.selector>=25&&d.selector<=28){assert.equal(expectedText,0x312+d.selector-25,'main/ADJ candidate resource binding');candidateNames+=2;}viewRow=row;drawn=[];call(0x531ab750);assert.deepEqual(drawn,[expectedText]);drawn=[];call(0x531a0538,CTRL,row);assert.deepEqual(drawn,[expectedText]);names+=2;
  selectedView=[];iconIDs=[];call(0x531a0690,CTRL,row);assert.deepEqual(selectedView,[row]);assert.deepEqual(iconIDs,[expectedIcon]);
  for(let candidate=0;candidate<rows.length;candidate++){
   const c=rows[candidate],wanted=c.kind===d.kind&&(d.kind==='slot'?c.slot===d.slot:c.selector===d.selector);
   assert.equal(call(0x531a1500,CTRL,candidate),wanted?1:0);
   assert.equal(call(0x531abe0c,CTRL,d.kind==='slot'?22:d.selector,candidate,slot),wanted?1:0);match+=2;
  }
 }
 selectedView=[];iconIDs=[];call(0x531ab7e4);
 assert.equal(selectedView.length,18);assert.equal(new Set(selectedView).size,18);
 for(let i=0;i<18;i++){const d=rows[selectedView[i]],want=d.kind==='slot'?call(0x532a9988,0,22+d.slot):call(0x532935dc,0,d.selector);assert.equal(iconIDs[i],want);}
 // Real RAW primary readers and match predicate consume remapped rows.
 for(const flag of[0,1]){
  write(MODEL+0x1b,2,1);write(RAW+5,flag,1);write(RAW+0x83+1,7,1);write(RAW+0x83+2,8,1);
  assert.equal(call(0x53283358,RAW),18+flag);
  for(let row=0;row<18+flag;row++){
   const d=flag&&row===0?{kind:'original'}:rows[row-flag],slot=d.kind==='slot'?d.slot:0,inner=d.kind==='original'?0:d.kind==='slot'?(slot===1?7:8):styles.indexOf(d.selector)<0?0:menu.base_inner_order[styles.indexOf(d.selector)];
   assert.equal(call(0x532834d0,RAW,row),slot);assert.equal(call(0x532834f0,RAW,row),inner);
   write(RAW+0x82,slot,1);write(RAW+0x83+slot,inner,1);assert.equal(call(0x5318aa64,CTRL,row),1);rawRows++;
  }
 }
 // Execute RAW ImageControl row rendering through its real page dispatcher.
 const rawDrawn=[];e.hook_add(u.HOOK_CODE,()=>{rawDrawn.push(e.reg_read_i32(u.ARM_REG_R1)>>>0);ret();},{},0x5339a9a0,0x5339a9a0);
 e.hook_add(u.HOOK_CODE,()=>ret(0x5600d000),{},0x533a1d34,0x533a1d34);
 e.hook_add(u.HOOK_CODE,()=>ret(),{},0x53390ef8,0x53390ef8);
 e.hook_add(u.HOOK_CODE,()=>ret(0x04000025),{},0x5316d8d4,0x5316d8d4);
 const rawNameRows=[];for(const flag of[0,1]){write(RAW+5,flag,1);for(let ordinal=0;ordinal<4;ordinal++){
  const row=rows.findIndex(d=>d.kind==='style'&&d.selector===25+ordinal)+flag;rawDrawn.length=0;
  call(0x5318a480,CTRL,0x5600d000,row);assert.equal(rawDrawn[0],0x29f+ordinal,'RAW candidate icon resource binding '+JSON.stringify({flag,ordinal,row,rawDrawn}));
  rawNameRows.push({original:flag,row,id:rawDrawn[0],label:(process.expectedLabels || ['Gold 200','Tungsten 800','Ektar 100','Metropolis'])[ordinal]});
 }}
 // Only resource getters / real descriptor construction are executed; no glyph rasterizer.
 const expectedLabels=process.expectedLabels || ['Gold 200','Tungsten 800','Ektar 100','Metropolis'];const resourceRows=[];for(let lang=0;lang<21;lang++)for(const id of[0x312,0x313,0x314,0x315])for(let path=0;path<2;path++){
  e.reg_write_i32(u.ARM_REG_CPSR,0x10);e.reg_write_i32(u.ARM_REG_R0,lang);e.reg_write_i32(u.ARM_REG_R7,id);e.reg_write_i32(u.ARM_REG_R5,MODEL);e.reg_write_i32(u.ARM_REG_R4,MODEL);e.reg_write_i32(u.ARM_REG_R11,SP);e.reg_write_i32(u.ARM_REG_SP,SP-0x200);
  const end=path?0x5339710c:0x53396728;e.emu_start(path?0x533970ec:0x533966d4,end,0,1000);assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,end);
  const ptr=path?(e.reg_read_i32(u.ARM_REG_R3)>>>0):read(SP-0xb0,4).readUInt32LE(0);if(!path){assert.equal(e.reg_read_i32(u.ARM_REG_R2),(process.expectedLabelLengths || {0x312:9,0x313:13,0x314:10,0x315:11})[id]);assert.equal(e.reg_read_i32(u.ARM_REG_R10),1);assert.equal(e.reg_read_i32(u.ARM_REG_R9),lang);assert.equal(e.reg_read_i32(u.ARM_REG_R8)>>>0,SP-0xb0);}
  const label=expectedLabels[id-0x312],descriptor=path?ptr:(e.reg_read_i32(u.ARM_REG_R7)>>>0),header=read(descriptor,8);
  assert.deepEqual([...header.subarray(0,4)],[label.length+1,1,0,0],'native label descriptor '+JSON.stringify({id,path,ptr,header:header.toString('hex'),r7:e.reg_read_i32(u.ARM_REG_R7)>>>0}));
  const stringPointer=header.readUInt32LE(4),utf16=read(stringPointer,(label.length+1)*2);
  for(let j=0;j<label.length;j++)assert.equal(utf16.readUInt16LE(j*2),label.charCodeAt(j),'native UTF16 label '+id);
  assert.equal(utf16.readUInt16LE(label.length*2),0,'native label NUL');
  resourceRows.push({lang,id,path,label,utf16_hex:utf16.toString('hex')});
 }
 const out={status:'PASS',combined_plan_sha256:C.combinedBytes?sha(C.combinedBytes):undefined,final_rom_only:!!C.combined,menu_sha256:menu.sha256,backend_sha256:backend.sha256,mappings,main_and_adj_selections:selections,main_and_adj_names:names,current_match_cases:match,main_icon_rows:18,raw_primary_rows:rawRows,new_text_paths:resourceRows.length,native_label_cases:resourceRows,native_label_utf16_cases:resourceRows.length,native_label_descriptor_cases:resourceRows.length,native_label_nul_cases:resourceRows.length,main_and_adj_candidate_name_cases:candidateNames,raw_candidate_icon_cases:rawNameRows,typed_rows:rows,movie_base_unchanged:true,stubs:['Manager acquisition','Current property from corresponding UserData selector for controller comparisons','View ordinal / draw / icon destination callbacks','UserData notifications','Assert return only when native condition true'],limits:['No physical glyph or framebuffer rendering','Only executed native controller methods; complete asynchronous page and Fn/ADJ dispatch unmeasured','RAW primary real readers and predicate execute; apply/confirm covered separately']};
 fs.mkdirSync(C.reportDir('menu'),{recursive:true});fs.writeFileSync(C.reportDir('menu')+'/checks.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));e.close();
}).catch(err=>{console.error(err);process.exitCode=1;});

}
