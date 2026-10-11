// Generated from re/tools/V9_1_capacity_arm.cjs SHA256 ffde0e7733aab5badc9b73b2b32735acdac0fc50212d0f1e24949e323abcc974
export default function(require, Buffer, process, console, __dirname, module, exports) {
// Actual V9.1 plan regression, with V9 negative control and historical controls.
// Read-only frozen ROM diagnostic: native constructor capacity vs native list population.
// No firmware files are emitted or modified. The optional capacity repair is emulator memory only.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const R=path.resolve(__dirname,'..'),U=require(R+'/analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const stock=fs.readFileSync(R+'/extract/unpackedFW'),frozen=fs.readFileSync(R+'/build/four-films-menu-v9/unpackedFW.checksummed.bin');
const off=a=>a-0x53000000+0x10870,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const v7=Buffer.from(stock);for(const p of JSON.parse(fs.readFileSync(R+'/build/CH-adjustable-gold/plan.json')).patches)Buffer.from(p.new_hex,'hex').copy(v7,off(Number(p.va)));
const v8=fs.readFileSync(R+'/build/dual-gold-800t-menu-v8/unpackedFW.checksummed.bin'),v81=fs.readFileSync(R+'/build/dual-gold-800t-menu-v8-1/unpackedFW.checksummed.bin');
const candidate=fs.readFileSync(R+'/build/V9-1-integrated/unpackedFW.before-checksum.bin');
const candidatePlanBytes=fs.readFileSync(R+'/build/V9-1-integrated/plan.json');
assert.equal(sha(candidate),(process.expectedPayloadSha256 || '4332e9babb26aea76cebd3a28a9dd46572f152d83de1f33ef42bf1b0b4aebd84'));
const versions={stock,V7:v7,V8:v8,'V8.1':v81,V9:frozen,'V9-capacity-19-memory-only':frozen,'V9.1':candidate};
const expected='27019fc37d8db4250a79a68a73a46a8c5b89f0ef0a149ee01ca43c8bbedc6fdd';assert.equal(sha(frozen),expected);
return U().then(u=>{
 const results=[];
 for(const version of Object.keys(versions))for(const originalFlag of [0,1]){
  const e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM),rom=versions[version];
  e.mem_map(0x53000000,0x1400000,u.PROT_ALL);e.mem_write(0x53000000,rom.subarray(0x10870,0x10870+0x1400000));
  e.mem_map(0x55000000,0x400000,u.PROT_ALL);e.mem_map(0x56000000,0x100000,u.PROT_ALL);
  if(version.includes('capacity-19'))e.mem_write(0x532833bc,Buffer.from('1300a0e3','hex'));
  const CTRL=0x56001000,RAW=0x56002000,LIST=0x56003000,VECTOR=0x56004000,TYPES=0x56005000,SP=0x560ff000,RET=0x56000000;
  const wr=(a,v,n=4)=>{const b=Buffer.alloc(n);n===1?b.writeUInt8(v):b.writeUInt32LE(v>>>0);e.mem_write(a,b);};
  const rd=(a,n=4)=>Buffer.from(e.mem_read(a,n));
  const ret=v=>{if(v!==undefined)e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
  let rows=[],vectorRead=[],allocs=[],capacity=0,lastPC=0,createdViews=0,createdWrappers=0,vectorSize=0;
  for(const[a,v]of [[0x5320ad88,0],[0x5320b37c,RAW],[0x5316d8d4,0x04000025],[0x533965bc,0],[0x53390fe4,0]])e.hook_add(u.HOOK_CODE,()=>ret(v),{},a,a);
  e.hook_add(u.HOOK_CODE,()=>{allocs.push(e.reg_read_i32(u.ARM_REG_R0));ret(TYPES);},{},0x536af31c,0x536af31c);
  e.hook_add(u.HOOK_CODE,(_e,pc)=>{lastPC=Number(pc);});
  wr(RAW+5,originalFlag,1);wr(CTRL+0x168,LIST);wr(LIST+0xf4,VECTOR);
  const regs=(a,b=0,c=0,d=0)=>{e.reg_write_i32(u.ARM_REG_CPSR,0x10);for(let i=0;i<13;i++)e.reg_write_i32(u['ARM_REG_R'+i],0x33330000+i);for(const[r,v]of [[u.ARM_REG_R0,a],[u.ARM_REG_R1,b],[u.ARM_REG_R2,c],[u.ARM_REG_R3,d],[u.ARM_REG_SP,SP],[u.ARM_REG_LR,RET]])e.reg_write_i32(r,v);};
  const call=(pc,a=CTRL,b=0,c=0,d=0)=>{regs(a,b,c,d);e.emu_start(pc,RET,0,100000);assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);return e.reg_read_i32(u.ARM_REG_R0)>>>0;};
  capacity=call(0x53189b38);wr(CTRL+0x180,capacity,1);
  // Execute actual configuration prologue up to, excluding, graphics factory 53394610.
  regs(CTRL);e.emu_start(0x5318974c,0x53394610,0,10000);const factoryCount=e.reg_read_i32(u.ARM_REG_R2)>>>0;
  assert.equal(factoryCount,capacity);assert.deepEqual(allocs,[capacity]);assert(rd(TYPES,capacity).equals(Buffer.alloc(capacity,0x1a)));
  const liveCount=call(0x53189ca0);
  // Execute the real ListView factory loop, preserving its vector/item ownership contract.
  // Only graphics child creation, heap allocation, vector push and relayout primitives are stubbed.
  const LIST_VTABLE=0x5600e000,CHILD_VTABLE=0x5600f000,ADD_CHILD=0x5600d000;
  wr(LIST,LIST_VTABLE);wr(LIST_VTABLE+0x30,ADD_CHILD);wr(CHILD_VTABLE+0x58,0x533945fc);
  for(const[a,v]of [[ADD_CHILD,0],[0x536b57dc,0],[0x533ad308,0]])e.hook_add(u.HOOK_CODE,()=>ret(v),{},a,a);
  e.hook_add(u.HOOK_CODE,()=>{const child=0x5600a000+createdViews++*0x20;wr(child,CHILD_VTABLE);ret(child);},{},0x533ad7f0,0x533ad7f0);
  e.hook_add(u.HOOK_CODE,()=>{assert.equal(e.reg_read_i32(u.ARM_REG_R0),16);ret(0x56009000+createdWrappers++*0x20);},{},0x536af2a8,0x536af2a8);
  e.hook_add(u.HOOK_CODE,()=>{assert.equal(e.reg_read_i32(u.ARM_REG_R0)>>>0,LIST+0xf0);const at=e.reg_read_i32(u.ARM_REG_R1)>>>0;wr(VECTOR+vectorSize++*4,rd(at).readUInt32LE());wr(LIST+0xf8,VECTOR+vectorSize*4);ret();},{},0x536b6f5c,0x536b6f5c);
  call(0x53394610,LIST,TYPES,factoryCount,0x3a);assert.equal(createdViews,capacity);assert.equal(createdWrappers,capacity);assert.equal(vectorSize,capacity);
  wr(VECTOR+capacity*4,0); // guard immediately beyond logical vector size; real heap value is unknown.
  e.hook_add(u.HOOK_CODE,()=>{rows.push(e.reg_read_i32(u.ARM_REG_R1)>>>0);},{},0x53394758,0x53394758);
  // Formatting and current-item predicate do not allocate or affect population iteration bounds.
  for(const[a,v]of [[0x5318a480,0],[0x5318abe0,0]])e.hook_add(u.HOOK_CODE,()=>ret(v),{},a,a);
  e.hook_add(u.HOOK_MEM_READ,(_e,_t,a,n)=>{a=Number(a);if(a>=VECTOR&&a<=VECTOR+(capacity+1)*4)vectorRead.push({pc:hex(lastPC),address:hex(a),bytes:n,row:(a-VECTOR)/4,in_bounds:a<VECTOR+capacity*4});});
  let failure=null;try{call(0x5318b498);}catch(err){failure={error:String(err),pc:hex(lastPC),row:e.reg_read_i32(u.ARM_REG_R1)>>>0};}
  const overflowRows=rows.filter(x=>x>=capacity);
  if(version==='V9'){assert(failure);assert.equal(failure.pc,'0x53394760');assert.deepEqual(overflowRows,[17]);assert.equal(liveCount,18+originalFlag);}
  else {assert.equal(failure,null);assert.equal(rows.length,liveCount);assert.deepEqual(overflowRows,[]);}
  results.push({version,rom_sha256:sha(rom),originalFlag,constructor_capacity:capacity,type_bytes_requested:allocs[0],list_factory_count:factoryCount,native_factory_iterations:createdViews,native_item_wrappers:createdWrappers,vector_size:vectorSize,live_count:liveCount,visited_rows:rows,overflow_rows:overflowRows,failure,vector_reads:vectorRead});e.close();
 }
 const out={status:'CONFIRMED_NATIVE_CAPACITY_MISMATCH',frozen_rom_sha256:sha(frozen),candidate_rom_sha256:sha(candidate),combined_plan_sha256:sha(candidatePlanBytes),results,proven:['Native constructor computes capacity17 for frozen V9','Native list factory receives exactly17 item count and executes17 iterations creating17 Item wrappers','RAW ImageControl page live count18/19','Native population reads vector index17 without any bounds check','Changing only capacity getter532833bc to19 in emulator memory removes logical out-of-bounds in both Original modes'],limitations:['Primitive graphics child creation, allocation, vector push and relayout are stubbed; native ListView factory and getter and native population loop execute; zero guard exposes logical out-of-bounds; actual device heap contents and shutdown instruction are unknown','Font rendering, graphics child constructors and hardware preview are not executed','This is not a firmware build or physical repair confirmation']};
 fs.mkdirSync(R+'/analysis/V9-1-capacity-regression',{recursive:true});fs.writeFileSync(R+'/analysis/V9-1-capacity-regression/capacity-checks.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,cases:results.map(({version,originalFlag,constructor_capacity,live_count,overflow_rows,failure})=>({version,originalFlag,constructor_capacity,live_count,overflow_rows,failure}))},null,2));
 function hex(n){return '0x'+(n>>>0).toString(16);}
}).catch(err=>{console.error(err);process.exitCode=1;});

}
