// Generated from re/tools/V9_1_shared_pages_arm.cjs SHA256 9dd23624e7182eec8d8edb888ec1f9747a07952fde50082ce136ad6fac562f68
export default function(require, Buffer, process, console, __dirname, module, exports) {
// All nine RAW primary parameter pages: native live count must fit native constructed capacity.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const R=path.resolve(__dirname,'..'),M=require(R+'/analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const bytes=fs.readFileSync(R+'/build/V9-1-integrated/unpackedFW.before-checksum.bin'),pb=fs.readFileSync(R+'/build/V9-1-integrated/plan.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),(process.expectedPayloadSha256 || '4332e9babb26aea76cebd3a28a9dd46572f152d83de1f33ef42bf1b0b4aebd84'));
return M().then(u=>{const e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM),RAW=0x56001000,CTRL=0x56002000,SP=0x560ff000,RET=0x56000000;let page=0x04000021,lastPC=0;
 e.mem_map(0x53000000,0x1400000,u.PROT_ALL);e.mem_map(0x56000000,0x100000,u.PROT_ALL);e.mem_write(0x53000000,bytes.subarray(0x10870,0x10870+0x1400000));
 e.hook_add(u.HOOK_CODE,(_e,a)=>{lastPC=Number(a);});
 const pointer=Buffer.alloc(4);pointer.writeUInt32LE(0x56003000);e.mem_write(RAW+0x24,pointer);e.mem_write(0x56004000,pointer);pointer.writeUInt32LE(0x56004000);e.mem_write(RAW+0x18,pointer);
 const crop=Buffer.alloc(4);crop.writeFloatLE(1);e.mem_write(0x56003000+0x7b8,crop);e.reg_write_i32(u.ARM_REG_FPEXC,0x40000000);
 const ret=v=>{e.reg_write_i32(u.ARM_REG_R0,v);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));};
 for(const[a,f]of[[0x5320ad88,()=>ret(0)],[0x5320b37c,()=>ret(RAW)],[0x5316d8d4,()=>ret(page)]])e.hook_add(u.HOOK_CODE,f,{},a,a);
 const call=pc=>{e.reg_write_i32(u.ARM_REG_R0,CTRL);e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);try{e.emu_start(pc,RET,0,10000);}catch(err){console.error({page:page.toString(16),lastPC:lastPC.toString(16),r0:e.reg_read_i32(u.ARM_REG_R0)>>>0,sp:e.reg_read_i32(u.ARM_REG_SP)>>>0});throw err;}assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);return e.reg_read_i32(u.ARM_REG_R0)>>>0;};
 const capacity=call(0x53189b38);assert.equal(capacity,19);const rows=[];
 for(let flag=0;flag<2;flag++){e.mem_write(RAW+5,Buffer.from([flag]));for(page=0x04000021;page<=0x04000029;page++){const live=call(0x53189ca0);assert(live<=capacity);rows.push({page:'0x'+page.toString(16),original:flag,live,constructed:capacity});}}
 const out={status:'PASS_ALL_NINE_RAW_PAGE_CAPACITY_CONTRACTS',combined_plan_sha256:sha(pb),candidate_payload_sha256:sha(bytes),cases:rows,limitations:['Native capacity and page count dispatch execute; manager acquisition mocked, no physical GUI rendering or camera.']};const O=R+'/analysis/V9-1-shared-pages';fs.mkdirSync(O,{recursive:true});fs.writeFileSync(O+'/checks.json',JSON.stringify(out,null,2)+'\n');e.close();console.log(JSON.stringify({status:out.status,cases:rows.length}));
}).catch(e=>{console.error(e);process.exitCode=1;});

}
