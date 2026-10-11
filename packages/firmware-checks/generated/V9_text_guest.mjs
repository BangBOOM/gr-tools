// Generated from re/tools/V9_text_guest.cjs SHA256 79e77a4b13b3a58c641635957d078ef73375db141f2ae87cddf4d0264ff9660b
export default function(require, Buffer, process, console, __dirname, module, exports) {
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const root=__dirname+'/../',M=require(root+'analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const planPath=process.argv[2]||root+'build/V9-text/manifest.json',planBytes=fs.readFileSync(planPath),input=JSON.parse(planBytes),combined=Array.isArray(input.modules),mi=combined?input.modules.find(x=>x.name==='text'):null;
const fw=fs.readFileSync(root+'extract/unpackedFW'),payload=Buffer.from(process.finalPayload||fw),off=a=>a-0x53000000+0x10870,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let m,raw;
if(combined){assert(mi);if(!process.finalPayload)for(const p of input.patches)Buffer.from(p.new_hex,'hex').copy(payload,off(Number(p.va)));assert.equal(sha(payload.subarray(off(mi.base),off(mi.base)+mi.bytes)),mi.raw_sha256);m={base:mi.base,branches:{}};}
else{m=input;raw=fs.readFileSync(root+m.rawfile);assert.equal(sha(raw),m.sha256);m.branches=Object.fromEntries(m.hooks.map(h=>[h.va,m.base+m.symbols[h.target_symbol]]));}
return M().then(u=>{
 const e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM),UD=0x56001000,DATA=0x56002000,OBJ=0x56004000,TEXT=0x56005000,SP=0x5601f000,RET=0x56000000;
 for(let [a,n] of [[0x53000000,0x1400000],[0x56000000,0x20000],...(!combined?[[m.base,0x1000]]:[])])e.mem_map(a,n,u.PROT_ALL);
 e.mem_write(0x53000000,payload.subarray(0x10870,0x10870+0x1400000));if(!combined)e.mem_write(m.base,raw);
 const write=(a,v,n=4)=>{let b=Buffer.alloc(n);n===1?b.writeUInt8(v):b.writeUInt32LE(v>>>0);e.mem_write(a,b);};
 const cstr=a=>{let b=[];for(let i=0;i<1000;i++){let c=e.mem_read(a+i,1)[0];if(!c)return Buffer.from(b).toString();b.push(c);}throw Error('unterminated');};
 const ret=v=>{const lr=e.reg_read_i32(u.ARM_REG_LR)>>>0;e.reg_write_i32(u.ARM_REG_R0,v);let cpsr=e.reg_read_i32(u.ARM_REG_CPSR)>>>0;e.reg_write_i32(u.ARM_REG_CPSR,(cpsr&~32)|(lr&1?32:0));e.reg_write_i32(u.ARM_REG_PC,lr&~1);};
 for(let [pc,t] of Object.entries(m.branches)){pc=Number(pc);let d=(t-pc-8)/4;assert(Number.isInteger(d)&&d>=-0x800000&&d<0x800000);write(pc,(0xea000000|(d&0xffffff))>>>0);}
 write(UD+4,DATA);write(OBJ+12,TEXT);let captured=[],printed=[];
 for(let a of [0x5320ad88,0x5320b31c])e.hook_add(u.HOOK_CODE,()=>ret(UD),{},a,a);
 for(let [a,s] of [[0x5327b394,0],[0x5327b3b4,1],[0x5327b3d4,2]])e.hook_add(u.HOOK_CODE,()=>{let v=e.reg_read_i32(u.ARM_REG_R1)>>>0;write(DATA+0x1c2+2*s,v,1);captured.push({slot:s,value:v});ret(1);},{},a,a);
 e.hook_add(u.HOOK_CODE,()=>{printed.push(cstr(e.reg_read_i32(u.ARM_REG_R0)>>>0));ret(0);},{},0x536b8150,0x536b8150);
 function call(pc,machine=e){machine.mem_write(SP-0x1000,Buffer.alloc(16,0xa5));machine.mem_write(SP,Buffer.alloc(16,0x5a));machine.reg_write_i32(u.ARM_REG_CPSR,0xa80a0010);for(const r of[2,3,4,5,6,7,8,9,10,11,12])machine.reg_write_i32(u['ARM_REG_R'+r],0x11000000+r);machine.reg_write_i32(u.ARM_REG_R0,UD);machine.reg_write_i32(u.ARM_REG_R1,OBJ);machine.reg_write_i32(u.ARM_REG_SP,SP);machine.reg_write_i32(u.ARM_REG_LR,RET);machine.emu_start(pc,RET,0,100000);assert.equal(machine.reg_read_i32(u.ARM_REG_PC)>>>0,RET);for(let r=4;r<=11;r++)assert.equal(machine.reg_read_i32(u['ARM_REG_R'+r])>>>0,0x11000000+r);assert.equal(machine.reg_read_i32(u.ARM_REG_SP)>>>0,SP);assert(Buffer.from(machine.mem_read(SP-0x1000,16)).equals(Buffer.alloc(16,0xa5)));assert(Buffer.from(machine.mem_read(SP,16)).equals(Buffer.alloc(16,0x5a)));return machine.reg_read_i32(u.ARM_REG_R0)>>>0;}
 // Independent original-ROM reference engine: same primitive stubs, no patches.
 const reference=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);for(const[a,n]of[[0x53000000,0x1400000],[0x56000000,0x20000]])reference.mem_map(a,n,u.PROT_ALL);reference.mem_write(0x53000000,fw.subarray(0x10870,0x10870+0x1400000));
 const rw=(a,v,n=4)=>{const b=Buffer.alloc(n);n===1?b.writeUInt8(v):b.writeUInt32LE(v>>>0);reference.mem_write(a,b);};rw(UD+4,DATA);rw(OBJ+12,TEXT);
 const rr=v=>{reference.reg_write_i32(u.ARM_REG_R0,v);const lr=reference.reg_read_i32(u.ARM_REG_LR)>>>0;reference.reg_write_i32(u.ARM_REG_PC,lr&~1);reference.reg_write_i32(u.ARM_REG_CPSR,(reference.reg_read_i32(u.ARM_REG_CPSR)&~32)|(lr&1?32:0));};let referencePrinted=[],referenceCaptured=[];
 for(const a of[0x5320ad88,0x5320b31c])reference.hook_add(u.HOOK_CODE,()=>rr(UD),{},a,a);
 for(const[a,slot]of[[0x5327b394,0],[0x5327b3b4,1],[0x5327b3d4,2]])reference.hook_add(u.HOOK_CODE,()=>{const value=reference.reg_read_i32(u.ARM_REG_R1)>>>0;rw(DATA+0x1c2+2*slot,value,1);referenceCaptured.push({slot,value});rr(1);},{},a,a);
 reference.hook_add(u.HOOK_CODE,()=>{const a=reference.reg_read_i32(u.ARM_REG_R0)>>>0;let b=[];for(let i=0;i<1000;i++){const c=reference.mem_read(a+i,1)[0];if(!c)break;b.push(c);}referencePrinted.push(Buffer.from(b).toString());rr(0);},{},0x536b8150,0x536b8150);
 const stateA=[],stateB=[],continuations=[0x532e8830,0x532e8a94,0x532e8cf8,0x53356d50,0x53356e6c,0x53356f88];
 for(const[machine,states]of[[e,stateA],[reference,stateB]])for(const pc of continuations)machine.hook_add(u.HOOK_CODE,()=>states.push({pc,registers:Array.from({length:13},(_,i)=>machine.reg_read_i32(u['ARM_REG_R'+i])>>>0),apsr:machine.reg_read_i32(u.ARM_REG_CPSR)>>>0}),{},pc,pc);
 let baselineCases=0;
 const names=['Standard','Vivid','Monotone','SoftMonotone','HardMonotone','HighContrastBW','NegativeFilm','PositiveFilm','BleechBypass','Retro','HdrCuisine','CrossProcess','Gold200','Cine800T','Ektar100','Metropolis'];
 const values=[11,12,13,14,15,16,22,17,18,19,20,21,25,26,27,28];
 const imports=[0x532e882c,0x532e8a90,0x532e8cf4],exports=[0x53356d34,0x53356e50,0x53356f6c];let rows=[];
 // Native spellings are taken from original serializer output, independently of
 // guessed names above. Export and import the emitted line stripped of newline.
 for(let slot=0;slot<3;slot++)for(let i=0;i<values.length;i++){
  write(DATA+0x1c2+2*slot,values[i],1);printed=[];assert.equal(call(exports[slot]),0);assert.equal(printed.length,1);
  const line=printed[0];assert(line.endsWith('\n'));if(values[i]===25)assert.equal(line,(process.expectedTokens?.[0] || 'Gold200')+'\n');if(values[i]===26)assert.equal(line,(process.expectedTokens?.[1] || 'Cine800T')+'\n');if(values[i]===27)assert.equal(line,(process.expectedTokens?.[2] || 'Ektar100')+'\n');if(values[i]===28)assert.equal(line,(process.expectedTokens?.[3] || 'Metropolis')+'\n');
  write(DATA+0x1c2+2*slot,11,1);e.mem_write(TEXT,Buffer.from(line.slice(0,-1)+'\0'));captured=[];
  assert.equal(call(imports[slot]),0);assert.deepEqual(captured,[{slot,value:values[i]}]);assert.equal(e.mem_read(DATA+0x1c2+2*slot,1)[0],values[i]);
  if(values[i]<25){rw(DATA+0x1c2+2*slot,values[i],1);referencePrinted=[];stateA.length=0;stateB.length=0;printed=[];call(exports[slot]);assert.equal(call(exports[slot],reference),0);assert.deepEqual(printed,referencePrinted);assert.deepEqual(stateA,stateB);
   reference.mem_write(TEXT,Buffer.from(line.slice(0,-1)+'\0'));rw(DATA+0x1c2+2*slot,11,1);referenceCaptured=[];captured=[];stateA.length=0;stateB.length=0;assert.equal(call(imports[slot]),call(imports[slot],reference));assert.deepEqual(captured,referenceCaptured);assert.deepEqual(stateA,stateB);baselineCases+=2;}
  rows.push({slot,value:values[i],line,roundtrip:true});
 }
 let unknown=[];for(let slot=0;slot<3;slot++)for(let s of ['Gold','Gold200x','gold200','Gold20','','Cine800','Cine800Tx','cine800t','Cine800T\n','Gold200\n','Ektar','Ektar100x','ektar100','Ektar100\n','Metropoli','MetropolisX','metropolis','Metropolis\n']){
  e.mem_write(TEXT,Buffer.from(s+'\0'));captured=[];let result=call(imports[slot]);assert.equal(result,0xffffffff);assert.equal(captured.length,0);reference.mem_write(TEXT,Buffer.from(s+'\0'));referenceCaptured=[];assert.equal(call(imports[slot],reference),result);assert.deepEqual(referenceCaptured,[]);unknown.push({slot,input:s,rejected:true});
 }
 const result={status:'PASS',scope:'Final ROM original ARM style text handlers + shared Gold200/Cine800T extension',combined_plan_sha256:combined?sha(planBytes):null,module_sha256:combined?mi.raw_sha256:m.sha256,rows,unknown,original_rom_comparisons:baselineCases,original_continuation_abi_apsr_exact:true,stack_canaries_checked:true,
 limitations:['App/UserData access and style setter are stubs; setter writes known style byte only',
 'Original serializer printing is captured, no storage file written or reloaded',
 'No actual restart, U/register-box restore, binary integrity or task notifications',
 'Actual original strcmp ARM/Thumb executes, not a JS comparison stub',combined?'Final ROM base verified; still no physical camera execution':'Guest addresses are not camera placement']};
 const reportDir=root+(combined?'analysis/V9-text-final-arm':'analysis/V9-text-arm');fs.mkdirSync(reportDir,{recursive:true});fs.writeFileSync(reportDir+'/checks.json',JSON.stringify(result,null,2)+'\n');reference.close();e.close();console.log(JSON.stringify({status:result.status,roundtrips:rows.length,unknown:unknown.length}));
}).catch(err=>{console.error(err);process.exitCode=1;});

}
