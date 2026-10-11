// Browser-compatible integer ARM shim -> native bulk receiver gate.
// Caller supplies initialized Unicorn module, final decoded ROM bytes and
// the final storage manifest's absolute v92_refresh entry. No file/network I/O.
export function runNativeRefreshPropertyGate(u, payload, refreshEntry) {
  const ensure = (ok, message) => { if (!ok) throw Error(message); };
  const fields = [0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xc0,0xcf,0xd0];
  const vectors = [[8,7,6,5,3,2,1,0,8],[0,1,2,3,5,6,7,8,0]];
  const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
  const rows = [];
  const cases=[];
  for (const style of [25,26,27,28,22]) for (const slot of [0,1,2]) for (const variant of [0,1])cases.push({style,slot,variant,kind:'normal'});
  for(const kind of ['invalid-tail','movie','mismatch','invalid-slot'])cases.push({style:25,slot:kind==='invalid-slot'?3:0,variant:0,kind});
  for (const {style,slot,variant,kind} of cases) {
    const e = new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);
    try {
      for (const [a,n] of [[0x53000000,0x1400000],[0x55000000,0x400000],[0x56000000,0x100000]]) e.mem_map(a,n,u.PROT_ALL);
      const off = a => a-0x53000000+0x10870;
      // Keep fixture state deterministic across repeated Emscripten heaps.
      e.mem_write(0x56000000,new Uint8Array(0x100000));
      e.mem_write(0x53000000,payload.subarray(off(0x53000000),off(0x54400000)));
      e.mem_write(0x55000000,payload.subarray(off(0x5407b540),off(0x5407b540)+0x3a080));
      const UD=0x56001000,DATA=0x56002000,API=0x56006000,PM=0x56008000,PROP=0x56009000,OTHER=0x5600b000,SNAP=0x5600d000,RET=0x56000000,SP=0x560ff000;
      const read=(a,n)=>new Uint8Array(e.mem_read(a,n));
      const word=(a,v)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v,true);e.mem_write(a,b);};
      const reg=n=>e.reg_read_i32(u['ARM_REG_R'+n])>>>0;
      word(UD+4,DATA);word(API+0x518,PM);word(PM,OTHER);word(PM+4,PROP);
      const tail=new Uint8Array(132);for(let i=0;i<12;i++)tail.set(vectors[(i+variant)%2],i*11);
      if(kind==='invalid-tail')tail[8]=9;
      e.mem_write(DATA+0xb26,tail);e.mem_write(DATA+0x1c0,new Uint8Array([slot]));e.mem_write(DATA+0x1c2+slot*2,new Uint8Array([kind==='mismatch'?26:style]));
      if(kind==='movie')e.mem_write(DATA+0x44,new Uint8Array([1]));
      const snapshot=new Uint8Array(0x158);snapshot[0xb8]=style;for(const f of fields)snapshot[f]=4;
      snapshot[0xd1]=2;snapshot[0xd2]=3;e.mem_write(SNAP,snapshot);
      let boundary=0,commit=0,styleHook=0,patchedSnapshot;
      const expectedRegs=Array.from({length:13},(_,i)=>i===0?API:i===1?SNAP:i===4?UD:0x12340000+i);
      const ret=v=>{e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
      e.hook_add(u.HOOK_CODE,(_e,a)=>{
        a=Number(a);
        if(a===0x5354b6b0){
          ensure(expectedRegs.every((v,i)=>reg(i)===v),'shim register preservation');
          ensure((e.reg_read_i32(u.ARM_REG_SP)>>>0)===SP,'shim stack preservation');
          ensure(((e.reg_read_i32(u.ARM_REG_CPSR)>>>0)&0xf80f0000)>>>0===0xa80a0000,'shim APSR preservation');
          boundary++;patchedSnapshot=read(SNAP,0x158);e.reg_write_i32(u.ARM_REG_R2,0);e.reg_write_i32(u.ARM_REG_PC,0x5353f124);
        }
        else if(a===0x5313fd80){e.mem_write(reg(0),read(reg(1),reg(2)));ret(reg(0));}
        else if(a===0x531403a8){e.mem_write(reg(0),new Uint8Array(reg(2)).fill(reg(1)&255));ret(reg(0));}
        else if(a===0x536b53e0||a===0x536b53e8)ret(0);
        else if(a===0x5355dbbc){
          // This fixture has zero requested/resolved zoom floats. Native
          // VFP helper compares them equal and returns1 without any writes.
          const property=new DataView(read(reg(0)+4,4).buffer).getUint32(0,true);
          ensure(read(property+0x7b8,4).every(v=>v===0)&&read(property+0xfd8,4).every(v=>v===0),'zero-zoom fixture');
          ret(1);
        }
        else if(a===0x5355da14){
          const property=new DataView(read(reg(0)+4,4).buffer).getUint32(0,true);
          ensure(read(property+0x7b8,4).every(v=>v===0)&&read(property+0x7bc,1)[0]===0&&read(property+0xfdc,1)[0]===0,'zero-zoom status fixture');
          ret(1);
        }
        else if(a===0x5355198c)commit++;
        else if(a===0x53558274)styleHook++;
        else if(a===0x536b93d0||a===0x53820074)throw Error('Native assertion at '+a.toString(16));
      },{},1,0);
      e.reg_write_i32(u.ARM_REG_CPSR,0xa80a0010);
      expectedRegs.forEach((v,i)=>e.reg_write_i32(u['ARM_REG_R'+i],v));
      for(const [r,v] of [[u.ARM_REG_SP,SP],[u.ARM_REG_LR,RET]])e.reg_write_i32(r,v);
      try { e.emu_start(refreshEntry,RET,0,1_000_000); }
      catch (error) { throw Error(String(error)+' at PC '+(e.reg_read_i32(u.ARM_REG_PC)>>>0).toString(16)+' style '+style+' slot '+slot); }
      ensure((e.reg_read_i32(u.ARM_REG_PC)>>>0)===RET,'gate return');
      ensure(boundary===1&&commit===1&&styleHook===0,'native receiver path');
      const current=new DataView(read(PM,4).buffer).getUint32(0,true);
      const fallback=style===22||kind!=='normal';
      const expected=fallback?Array(9).fill(4):vectors[((style-25)*3+slot+variant)%2];
      ensure(equal(fields.map(f=>read(current+0x6c4+f,1)[0]),expected),'resolved controls');
      ensure(equal(fields.map(f=>read(current+0xee4+f,1)[0]),expected),'requested controls');
      ensure(equal(read(DATA+0xb26,132),tail),'tail unchanged');
      const allowed=new Set(fallback?[]:[...fields,0xd1,0xd2]);
      ensure(snapshot.every((v,i)=>v===patchedSnapshot[i]||allowed.has(i)),'snapshot isolation');
      if(fallback)ensure(equal(snapshot,patchedSnapshot),'fallback snapshot');
      rows.push({style,slot,variant,kind,controls:expected});
    } finally { e.close(); }
  }
  return {status:'PASS_NATIVE_REFRESH_PROPERTY_GATE',cases:rows.length,rows,registers_flags_preserved:true,limitations:['Integer refresh shim and native bulk receiver execute; full refresh VFP assembly and queue transport are excluded.','Copies and two float conversions use explicit host substitutes. VFP zoom helpers5355dbbc/5355da14 use asserted zero-zoom no-write results1; all nine-control assertions remain native. No camera execution.']};
}
