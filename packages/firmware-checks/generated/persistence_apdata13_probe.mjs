// Generated from re/tools/persistence_apdata13_probe.cjs SHA256 976872dfcedf79e95f998bae128761600ad183fa0b45892e019712dd7c33970b
export default function(require, Buffer, process, console, __dirname, module, exports) {
// APData13 regression: prototype mode patches memory; --final checks the ROM as-is.
// Runs native UserData save/load and the stock DebugModel event/save/constructor.
// File primitives and singleton/allocator services are modeled; no camera I/O.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
function arg(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const payloadPath = path.resolve(arg('--payload', path.join(ROOT, 're/build/V9-1-integrated/unpackedFW.before-checksum.bin')));
const outputPath = arg('--output');
const payload = fs.readFileSync(payloadPath);
const M = require(path.join(ROOT, 're/analysis/AV-independent-arm/package/dist/unicorn_arm.js'));
const SHA = b => crypto.createHash('sha256').update(b).digest('hex');
const GOLD_PATH = 'F:\\APData12.bin';
const STOCK_PATH = 'F:\\APData11.bin';
const patchSpecs=[[0x53827b18,0x20],[0x53827b28,0x1d],[0x538286d4,0x1d],[0x53826bdc,0xc],[0x53826d88,0xd],[0x53826dec,0xd],[0x53826f00,0x44],[0x53826f4c,0x64],[0x53826fbc,0xd],[0x53826fc8,0x68],[0x53826fd0,0x64],[0x53826fe8,0x68]];
const finalMode=args.includes('--final')||args.includes('--no-patches');
const integrated=JSON.parse(fs.readFileSync(path.resolve(arg('--plan',path.join(ROOT,'re/build/V9-1-integrated/plan.json')))));
const storage=integrated.modules.find(x=>x.name==='storage');
const originalNative=['1c00a0e3','1c1080e2','1c2082e2','0b0051e3','0c0054e3','0c0054e3','3cd04de2','60504be2','0c0054e3','64304be2','60104be2','64301b15'];
const patches=patchSpecs.map(([a,imm],i)=>{const old=Buffer.from(originalNative[i],'hex').readUInt32LE(),next=((old&0xffffff00)|imm)>>>0;return {address:a,old_hex:originalNative[i],new_hex:Buffer.from(Uint32Array.of(next).buffer).toString('hex')};});
for(const offset of [284,360,432])patches.push({address:storage.base+offset,old_hex:'0b10a0e3',new_hex:'0c10a0e3'});
for(const p of patches){const off=p.address-0x53000000+0x10870;assert.equal(payload.subarray(off,off+4).toString('hex'),finalMode?p.new_hex:p.old_hex,`payload instruction ${p.address.toString(16)}`);}
const NEUTRAL = Buffer.concat(Array.from({ length: 12 }, () => Buffer.from([4,4,4,4,4,4,4,4,4,0,0])));
const NON_NEUTRAL = [0,1,2,3,5,6,7,8];
const EXPECTED = Array.from({ length: 8 }, (_, bank) => Buffer.from(Array.from({ length: 132 }, (_, j) => j % 11 >= 9 ? 0 : NON_NEUTRAL[(bank + j) % 8])));
return (async () => {
 const u = await M();
 function guest(files,options={}) {
  const e = new u.Unicorn(u.ARCH_ARM, u.MODE_ARM);
  const UD=0x56001000, APP=0x56002000, DOMAIN=0x56003000, ALLOC=0x56004000,
   V=0x56004100, ALLOCFN=0x56000020, FREEFN=0x56000024, DEFLT=0x56007000,
   DEBUG=0x5600a000, TRIGGER=0x5600a100, EVENT=0x5600a200, SP=0x563e0000, RET=0x56000000;
  for (const [a,n] of [[0x53000000,0x1400000],[0x55000000,0x400000],[0x56000000,0x400000]]) e.mem_map(a,n,u.PROT_ALL);
  e.mem_write(0x56000000,Buffer.alloc(0x400000));
  const off = a => a-0x53000000+0x10870;
  e.mem_write(0x53000000,payload.subarray(off(0x53000000),off(0x54400000)));
  e.mem_write(0x55000000,payload.subarray(off(0x5407b540),off(0x5407b540)+0x3a080));
  if(!finalMode)for(const p of patches)e.mem_write(p.address,Buffer.from(p.new_hex,'hex'));
  const rd = (a,n) => Buffer.from(e.mem_read(a,n));
  const wr = (a,v,n=4) => {const b=Buffer.alloc(n); n===1 ? b.writeUInt8(v) : n===2 ? b.writeUInt16LE(v) : b.writeUInt32LE(v>>>0);e.mem_write(a,b);};
  const r = n => e.reg_read_i32(u['ARM_REG_R'+n])>>>0;
  const ret = v => {if(v!==undefined)e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
  const hook = (a,f) => e.hook_add(u.HOOK_CODE,f,{},a,a);
  const cstr = a => {let s='';for(let i=0;i<65536;i++){const ch=rd(a+i,1)[0];if(!ch)return s;s+=String.fromCharCode(ch);}throw Error('unterminated string');};
  const put = (a,s) => e.mem_write(a,Buffer.from(s+'\0'));
  let heap=0x56020000;const allocations=new Map();
  const alloc = n => {const a=heap+16;heap+=(n+63)&~15;assert(heap<SP-0x10000);e.mem_write(a-8,Buffer.alloc(n+16,0xa7));e.mem_write(a,Buffer.alloc(n));allocations.set(a,n);return a;};
  wr(ALLOCFN,0xe12fff1e);wr(FREEFN,0xe12fff1e);wr(ALLOC,V);wr(V+8,ALLOCFN);wr(V+12,FREEFN);
  wr(V+0x18,ALLOCFN+8);hook(ALLOCFN+8,()=>ret(1));wr(0x56006000+4,ALLOC);wr(0x56006000+8,ALLOC);wr(APP,0x56006000);wr(APP+0xc,1);wr(APP+0x20,1,1);wr(0x56006000+0xc,1);wr(0x56006000+0x20,1,1);wr(DOMAIN+8,APP);
  e.mem_write(DEFLT,Buffer.alloc(0x1c80));e.mem_write(DEFLT+0xb26,NEUTRAL);
  wr(DEBUG+4,TRIGGER);wr(TRIGGER,7,2);wr(EVENT,0x35,2);
  const writes=[];hook(0x536af2a8,()=>{const n=r(0),a=alloc(n);e.mem_write(a,Buffer.alloc(n,0xcc));ret(a);});
  hook(0x53828014,()=>ret(DOMAIN));hook(0x536abf18,()=>ret(ALLOC));hook(ALLOCFN,()=>ret((options.failIO&&r(1)===1164)||(options.failBundle&&r(1)>2000)||(options.failNames&&r(1)===60)?0:alloc(r(1))));hook(FREEFN,()=>ret(0));
  hook(0x532406fc,()=>ret(DEFLT));hook(0x53246df8,()=>ret(1));hook(0x532750f8,()=>ret(1));
  for(const a of [0x5320ad88,0x5320aefc,0x532288b0,0x536ae71c,0x536ae870])hook(a,()=>ret(1));
  hook(0x5313fd80,()=>{e.mem_write(r(0),rd(r(1),r(2)));ret(r(0));});
  hook(0x531403a8,()=>{e.mem_write(r(0),Buffer.alloc(r(2),r(1)&255));ret(r(0));});
  hook(0x53141cf4,()=>ret(Buffer.compare(rd(r(0),r(2)),rd(r(1),r(2)))));
  hook(0x531416e8,()=>ret(cstr(r(0))===cstr(r(1))?0:1));
  hook(0x53141ac0,()=>ret(cstr(r(0)).length));
  hook(0x53141248,()=>{assert.equal(cstr(r(1)),'%s%02d.%s');const ext=cstr(rd(e.reg_read_i32(u.ARM_REG_SP)>>>0,4).readUInt32LE());put(r(0),cstr(r(2))+String(r(3)).padStart(2,'0')+'.'+ext);ret(12);});
  hook(0x53141100,()=>{assert.equal(cstr(r(2)),'%s\\%s');const s=cstr(r(3))+'\\'+cstr(rd(e.reg_read_i32(u.ARM_REG_SP)>>>0,4).readUInt32LE());put(r(0),s);ret(s.length);});
  hook(0x5362eb24,()=>{const name=cstr(r(1));if(options.writeFail&&name.endsWith('APData12.bin'))return ret(0);files.set(name,rd(r(2),r(3)));ret(1);});
  hook(0x5362dd78,()=>{const name=cstr(r(1));assert(files.has(name));files.set(name,Buffer.concat([files.get(name),rd(r(2),r(3))]));writes.push({name,payload_bytes:r(3),file_bytes:files.get(name).length});ret(1);});
  hook(0x5362e238,()=>{const f=files.get(cstr(r(1)));if(r(2))wr(r(2),f?1:0,1);ret(f?f.length:0);});
  hook(0x5362e684,()=>{const exists=files.has(cstr(r(1)));if(r(2))wr(r(2),exists?1:0,1);ret(exists?1:0);});
  hook(0x5362d8e4,()=>{const f=files.get(cstr(r(1)));if(!options.readFail&&f&&f.length>=r(3)){e.mem_write(r(2),f.subarray(0,r(3)));ret(1);}else ret(0);});
  hook(0x5362e294,()=>{if(options.readFail){wr(r(2),0);return ret(0);}const f=files.get(cstr(r(1)));if(f){const a=alloc(f.length);e.mem_write(a,f);wr(r(2),f.length);ret(a);}else{wr(r(2),0);ret(0);}});
  hook(0x5362d478,()=>ret(1));hook(0x5362df28,()=>{files.delete(cstr(r(1)));ret(1);});
  hook(0x536b82d4,()=>ret(1));hook(0x53825eb0,()=>ret(1));hook(0x5362def4,()=>ret(0));
  hook(0x53820074,()=>{throw Error('native stack canary failure');});hook(0x536b93d0,()=>{throw Error('native assertion');});
  function call(pc,a=0,b=0,c=0,d=0) {
   e.reg_write_i32(u.ARM_REG_CPSR,0x10);
   for(const [n,v] of [a,b,c,d].entries())e.reg_write_i32(u['ARM_REG_R'+n],v);
   e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);
   try { e.emu_start(pc,RET,0,5_000_000); } catch (error) { console.error({entry:pc.toString(16), pc:(e.reg_read_i32(u.ARM_REG_PC)>>>0).toString(16), r0:r(0).toString(16), r1:r(1).toString(16), r2:r(2).toString(16), r3:r(3).toString(16)});throw error; } assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);return r(0);
  }
  const ptrs = () => Array.from({length:8},(_,i)=>rd(UD+4+i*4,4).readUInt32LE());
  return {e,call,rd,wr,UD,APP,DOMAIN,DEBUG,EVENT,writes,ptrs,alloc,put,appCtor(){wr(DOMAIN+4,0x56006000);e.reg_write_i32(u.ARM_REG_CPSR,0x10);e.reg_write_i32(u.ARM_REG_R5,DOMAIN);e.reg_write_i32(u.ARM_REG_SP,SP);e.emu_start(0x53827b18,0x53827b6c,0,10000);const a=rd(DOMAIN+8,4).readUInt32LE();assert.equal(allocations.get(a),32);assert.deepEqual(rd(a+0x10,13),Buffer.alloc(13));assert.deepEqual(rd(a+0x1d,3),Buffer.alloc(3,0xcc));return a;},guards(){for(const[a,n]of allocations){assert.deepEqual(rd(a-8,8),Buffer.alloc(8,0xa7));assert.deepEqual(rd(a+n,8),Buffer.alloc(8,0xa7));}},seed(){ptrs().forEach((a,i)=>e.mem_write(a+0xb26,EXPECTED[i]));},tails(){return ptrs().map(a=>rd(a+0xb26,132));},close(){e.close();}};
 }

 const cases=[];
 for(const order of ['custom-stock','stock-custom']){
  const files=new Map();let g=guest(files);g.call(0x5324b284,g.UD);g.seed();
  const custom=()=>g.call(0x5323f274,g.UD),stock=()=>g.call(0x532dc414,g.DEBUG,g.EVENT);
  if(order==='custom-stock'){custom();stock();}else{stock();custom();}
  assert.equal(files.get(STOCK_PATH).length,10);assert.equal(files.get(STOCK_PATH).readUInt16LE(8),7);assert.equal(files.get(GOLD_PATH).length,1172);g.guards();g.close();
  g=guest(files);g.call(0x5324b284,g.UD);g.tails().forEach((b,i)=>assert.deepEqual(b,EXPECTED[i]));g.call(0x532dc314,g.DEBUG);assert.equal(g.rd(g.rd(g.DEBUG+4,4).readUInt32LE(),2).readUInt16LE(),7);
  // Native formatter/writer seeds every key, including stock and custom records.
  const expectedFiles=new Map();const data=g.alloc(2854);
  for(let key=0;key<13;key++){
   if(key!==11&&key!==12){const b=Buffer.alloc(key===0?1:16,key);g.e.mem_write(data,b);g.call(0x53826c54,g.APP,key,b.length,data);}
   expectedFiles.set(key,Buffer.from(files.get('F:\\APData'+String(key).padStart(2,'0')+'.bin')));
  }
  const out=g.alloc(8);assert.equal(g.call(0x53826ef0,g.APP,out,out+4),1);const bundlePtr=g.rd(out+4,4).readUInt32LE(),bundleLen=g.rd(out,4).readUInt32LE(),bundle=g.rd(bundlePtr,bundleLen);
  let pos=0,count=0;while(pos<bundle.length){const len=bundle.readUInt32LE(pos+60);pos+=64+len;count++;}assert.equal(pos,bundleLen);assert.equal(count,13);g.guards();g.close();
  // Fresh emulator executes native import and native cache attachment.
  const imported=new Map();g=guest(imported);const actualAPP=g.appCtor();const raw=g.alloc(bundle.length);g.e.mem_write(raw,bundle);assert.equal(g.call(0x53826bac,actualAPP,bundle.length,raw),1);
  for(const[key,expected]of expectedFiles)assert.deepEqual(imported.get('F:\\APData'+String(key).padStart(2,'0')+'.bin'),expected);
  const section=g.alloc(bundle.length+8);g.e.mem_write(section,g.rd(g.rd(0x55038eb0,4).readUInt32LE(),4));g.wr(section+4,bundle.length);g.e.mem_write(section+8,bundle);g.wr(g.DOMAIN+0x28,section);g.wr(g.DOMAIN+0x2c,bundle.length+8);g.call(0x53828610,g.DOMAIN);
  assert.equal(g.rd(actualAPP+0x1c,1)[0],1);assert.deepEqual(g.rd(actualAPP+0x1d,3),Buffer.alloc(3,0xcc));const cachedData=g.alloc(2854);imported.clear(); // Force cache-only reads, no filesystem fallback.
  for(const[key,expected]of expectedFiles){const n=expected.length-8;assert.equal(g.call(0x538270bc,actualAPP,key),n);assert.equal(g.call(0x53827218,actualAPP,key,n,cachedData),1);assert.deepEqual(g.rd(cachedData,n),expected.subarray(8));}
  g.call(0x5324b284,g.UD);g.tails().forEach((b,i)=>assert.deepEqual(b,EXPECTED[i]));g.guards();g.close();
  cases.push({order,fresh_boot:true,stock_bytes:2,custom_banks:8,custom_control_positions:8*4*3*9,all_values_non_neutral:true,real_APP_allocation_bytes:32,thirteenth_cache_flag:1,bundle_files:13,native_import:true,native_cache_only:true});
 }
 const failureFiles=new Map();let g=guest(failureFiles);g.call(0x5324b284,g.UD);g.seed();g.call(0x5323f274,g.UD);g.close();const original=Buffer.from(failureFiles.get(GOLD_PATH));
 const failures=[];
 for(const mode of ['missing','bad-checksum','registry-header','read-failure','allocation-failure']){
  const files=new Map(failureFiles);if(mode==='missing')for(const name of [...files.keys()])if(name.endsWith('APData12.bin'))files.delete(name);if(mode==='bad-checksum'){const b=Buffer.from(original);b[4]^=1;for(const name of files.keys())if(name.endsWith('APData12.bin'))files.set(name,b);}
  if(mode==='registry-header'){const b=Buffer.from(original);b[8+24]^=1;let crc=0xffffffff;for(const v of b.subarray(8,8+1160)){crc^=v;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}b.writeUInt32LE((~crc)>>>0,8+1160);let sum=0;for(let at=8;at<b.length;at+=4)sum=(sum+b.readUInt32LE(at))>>>0;b.writeUInt32LE(sum,4);for(const name of files.keys())if(name.endsWith('APData12.bin'))files.set(name,b);}
  g=guest(files,{readFail:mode==='read-failure',failIO:mode==='allocation-failure'});g.call(0x5324b284,g.UD);g.tails().forEach(b=>assert.deepEqual(b,NEUTRAL));g.guards();g.close();failures.push(mode);
 }
 const saveFailFiles=new Map(failureFiles);g=guest(saveFailFiles,{failIO:true});g.call(0x5324b284,g.UD);g.call(0x5323f274,g.UD);assert.deepEqual(saveFailFiles.get(GOLD_PATH),original);g.guards();g.close();
 for(const mode of ['bundle-allocation-failure','filename-allocation-failure']){g=guest(new Map(failureFiles),{failBundle:mode==='bundle-allocation-failure',failNames:mode==='filename-allocation-failure'});const out=g.alloc(8);assert.equal(g.call(0x53826ef0,g.APP,out,out+4),0);g.guards();g.close();failures.push(mode);}
 const writeFailFiles=new Map(failureFiles);g=guest(writeFailFiles,{writeFail:true});g.call(0x5324b284,g.UD);g.seed();g.call(0x5323f274,g.UD);assert(!writeFailFiles.has(GOLD_PATH));g.guards();g.close();failures.push('writer-failure-native-may-delete-previous-file');
 const report={combined_plan_sha256:process.expectedPlanSha256,status:finalMode?'PASS_APDATA13_FINAL_PAYLOAD':'PASS_APDATA13_MEMORY_PATCH_PROTOTYPE',memory_patches_applied:!finalMode,custom_control_positions:8*4*3*9,payload_sha256:SHA(payload),patches,cases,failures,limitations:[finalMode?'Final ROM executes as-is; no code or module patches are injected.':'Prototype mode patches emulator memory only; source ROM remains unchanged.','Filesystem, heap primitives, singleton, libc and default-prefix/application-refresh fixtures are substituted.','Native 13-file bundle build, import and cache attachment/read execute.','Native filesystem repair callback 53825eb0 is modeled for writer-failure testing.', 'No real flash submission, power interruption, camera task stack watermark or physical reboot tested.']};
 if(outputPath)fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(err=>{console.error(err);process.exitCode=1;});

}
