// Generated from re/tools/four49_curve65_arm.cjs SHA256 66d04d235952ea83fe6780bd425b6f3715d8c12601dbcae6c960c41d8f5c9c93
export default function(require, Buffer, process, console, __dirname, module, exports) {
// Isolated real ARM interpolation; no firmware patch, hardware or SD writes.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const R=path.resolve(__dirname,'..'),O=R+'/analysis/four49',M=require(R+'/analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const code=fs.readFileSync(O+'/curve65.bin');
const candidates=['ektar46','metropolis47'].map(p=>({name:p,recipe:JSON.parse(fs.readFileSync(R+'/analysis/'+p+'/recipe.json'))}));
const fixtures=[{name:'identity',row:Array.from({length:65},(_,i)=>i*256)},{name:'black-step',row:[0,...Array(64).fill(16384)]},{name:'white-step',row:[...Array(64).fill(0),16384]}];
fixtures.push({name:'compressed-white',row:Array.from({length:65},(_,i)=>Math.round(i*13500/64))});
const curves=[...fixtures,...candidates.flatMap(x=>x.recipe.curves_q14.map((row,ch)=>({name:x.name+'/'+ch,row})))];
for(const {row} of curves){assert.equal(row.length,65);assert.equal(row[0],0);assert(row[64]<=16384);assert(row.every(x=>Number.isInteger(x)&&x>=0&&x<=16384));assert(row.slice(1).every((x,i)=>x>=row[i]));}
return M().then(u=>{const e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM),CODE=0x100000,DATA=0x200000,STACK=0x300000,SP=STACK+2048,RET=CODE+0xf00,ptr=DATA+4096-130;
 for(const a of[CODE,DATA,STACK])e.mem_map(a,4096,u.PROT_ALL);e.mem_write(CODE,code);
 const regs=Array.from({length:8},(_,i)=>u['ARM_REG_R'+(i+4)]),canaries=regs.map((_,i)=>0xacdc0000+i);
 const call=x=>{e.reg_write_i32(u.ARM_REG_R0,ptr);e.reg_write_i32(u.ARM_REG_R1,x);e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);regs.forEach((r,i)=>e.reg_write_i32(r,canaries[i]));e.emu_start(CODE,RET,0,30);assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);assert.deepEqual(regs.map(r=>e.reg_read_i32(r)>>>0),canaries);return e.reg_read_i32(u.ARM_REG_R0)>>>0;};
 const rows=[];let calls=0;
 for(const {name,row} of curves){const b=Buffer.alloc(130);row.forEach((v,i)=>b.writeUInt16LE(v,i*2));e.mem_write(ptr,b);let previous=-1;
  for(let x=0;x<=16384;x++){const i=Math.min(x>>>8,64),f=x&255,expected=x>=16384?row[64]:row[i]+Math.floor(((row[i+1]-row[i])*f+128)/256);const actual=call(x);calls++;assert.equal(actual,expected,`${name}/${x}`);assert(actual>=previous&&actual<=16384);previous=actual;}
  for(const x of[16385,65535,0xffffffff]){assert.equal(call(x),row[64]);calls++;}
  assert.deepEqual(Buffer.from(e.mem_read(ptr,130)),b);rows.push({name,full_domain_exact:true,saturating_inputs_exact:true,table_sha256:crypto.createHash('sha256').update(b).digest('hex')});
 }
 e.close();const report={status:'PASS_REAL_ARM_65_INTERPOLATION',code_bytes:code.length,code_sha256:crypto.createHash('sha256').update(code).digest('hex'),actual_arm_calls:calls,rows,abi:'r4-r11/SP unchanged; r0 return; r1-r3/r12/APSR clobbered',stack_bytes:0,guard:'130B table immediately before unmapped following page',limits:['Standalone validated static tables only; no runtime table length check','Not V8 hook, gamma generator, ISP matrix order, cache, firmware or camera timing','Non-monotone or malformed assets must be rejected by build registry'],firmware_generated:false,sd_written:false};fs.writeFileSync(O+'/arm-checks.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,code_bytes:code.length,calls,curves:rows.length}));
}).catch(err=>{console.error(err);process.exitCode=1});

}
