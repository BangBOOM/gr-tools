// Generated from re/tools/V9_icon_arm.cjs SHA256 82dd9abbdf93d28dc2ff0189b805e9a47faba220c1db0b551f53761702a9faa5
export default function(require, Buffer, process, console, __dirname, module, exports) {
// Offline real ARM icon getters/native renderer/copy/shared LZ4 decoder.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto'),R=__dirname+'/../';
const M=require(R+'analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const C=require('./V9_guest_common.cjs'),source=C.source,planbytes=C.v7bytes,plan=C.v7;
const off=a=>a-0x53000000+0x10870,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
return M().then(u=>{
 const SP=0x5601e000,RET=0x56000000,MAN=0x56001000,SURF=0x56002000,PARAM=0x56003000,DST=0x56004000,PIX=0x57000000,USER=0x56012000,SCRATCH=USER+0xc78;
 function setup(p){let e=new u.Unicorn(u.ARCH_ARM,u.MODE_ARM);
  for(let[a,n]of[[0x53000000,0x1400000],[0x54800000,0x100000],[0x55000000,0x400000],[0x56000000,0x20000],[PIX,0x1200000]])e.mem_map(a,n,u.PROT_ALL);
  e.mem_write(0x53000000,source.subarray(0x10870,0x10870+0x1400000));e.mem_write(0x55000000,source.subarray(off(0x5407b540),off(0x5407b540)+0x3a080));
  e.mem_write(PIX,source.subarray(0x21284d0,0x21284d0+0x1181314));for(let x of p.patches)e.mem_write(Number(x.va),Buffer.from(x.new_hex,'hex'));
  const w=(a,v,n=4)=>{let b=Buffer.alloc(n);n===1?b.writeUInt8(v):n===2?b.writeUInt16LE(v):b.writeUInt32LE(v>>>0);e.mem_write(a,b);};
  const read=(a,n)=>Buffer.from(e.mem_read(a,n));
  function call(pc,...args){e.reg_write_i32(u.ARM_REG_CPSR,0x10);for(let [i,a]of args.entries())e.reg_write_i32(u['ARM_REG_R'+i],a);e.reg_write_i32(u.ARM_REG_SP,SP);e.reg_write_i32(u.ARM_REG_LR,RET);try{e.emu_start(pc,RET,0,500000);}catch(err){console.error({call_pc:pc.toString(16),args,at_pc:(e.reg_read_i32(u.ARM_REG_PC)>>>0).toString(16),lr:(e.reg_read_i32(u.ARM_REG_LR)>>>0).toString(16)});throw err;}assert.equal(e.reg_read_i32(u.ARM_REG_PC)>>>0,RET);assert.equal(e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);return e.reg_read_i32(u.ARM_REG_R0)>>>0;}
  const state={pixelBaseZero:false,userdataNull:false,loads:0};
  function render(id,width,height,rotation=0){w(MAN,state.pixelBaseZero?0:PIX);w(MAN+4,0);w(SURF+2,5,1);w(SURF+8,DST);w(SURF+0x18,96,2);w(SURF+0x1a,96,2);w(PARAM,SURF);
   for(let start of[4,0x14])for(let[i,v]of[5,7,width,height].entries())w(PARAM+start+4*i,v);
   w(PARAM+0x24,id,2);w(PARAM+0x28,rotation);e.mem_write(DST-16,Buffer.alloc(16,0x6d));e.mem_write(DST,Buffer.alloc(96*96*4,0xa5));e.mem_write(DST+96*96*4,Buffer.alloc(16,0x7d));try{call(0x5320a7a8,MAN,PARAM);}catch(err){console.error({render_id:id.toString(16),rotation,state});throw err;}
   assert(read(DST-16,16).equals(Buffer.alloc(16,0x6d)));assert(read(DST+96*96*4,16).equals(Buffer.alloc(16,0x7d)));return read(DST,96*96*4);
  }
  w(0x56011000+4,USER);
  for(let pc of [0x5320ad88,0x5320b31c])e.hook_add(u.HOOK_CODE,()=>{w(0x56011004,state.userdataNull?0:USER);e.reg_write_i32(u.ARM_REG_R0,0x56011000);e.reg_write_i32(u.ARM_REG_PC,e.reg_read_i32(u.ARM_REG_LR));},{},pc,pc);
  e.hook_add(u.HOOK_CODE,()=>{state.loads++;},{},0x53627bdc,0x53627bdc);
  return {e,w,read,call,render,state};
 }
 const iconManifest=JSON.parse(fs.readFileSync(R+'build/V9-icon/manifest.json')),assets=iconManifest.icons.map(x=>({...x,id:Number(x.icon_id),pixels:fs.readFileSync(R+'build/V9-icon/'+x.rawfile)}));
 const nativeIDs=[0x17,0x166,0x224,0x162,0x165,0x15e,0x160,0xe8,0x15a,0x164,0x15f,0x32,0x15b,0x15c],rotations=[-90,90,180];
 let baseline=setup(plan),sizes=[];for(let id=0;id<=0x29e;id++)sizes.push([baseline.call(0x53209fb8,MAN,id),baseline.call(0x53209fec,MAN,id)]);
 let native=nativeIDs.map(id=>{const[w,h]=sizes[id];return{id,w,h,pixels:baseline.render(id,w,h)};});
 const oldRot=rotations.map(rotation=>({rotation,pixels:baseline.render(0x17,40,40,rotation)}));
 baseline.w(0x550020fc+0x17*4,0x56010000);baseline.w(0x56010000,32,2);baseline.w(0x56010002,32,2);baseline.w(0x56010004,0);
 for(let asset of assets){baseline.e.mem_write(PIX,asset.pixels);asset.oracles=rotations.map(rotation=>({rotation,pixels:baseline.render(0x17,32,32,rotation)}));}baseline.e.close();
 let fixed=setup(plan);if(C.combined)C.load(fixed.e);const menu=C.apply(fixed.e,'menu'),icon=C.apply(fixed.e,'icon');const placed=C.combined?C.combined.modules.find(m=>m.name==='icon'):null,base=Number(placed?placed.base:icon.base);
 for(let id=0;id<=0x29e;id++)assert.deepEqual([fixed.call(0x53209fb8,MAN,id),fixed.call(0x53209fec,MAN,id)],sizes[id]);
 for(let row of native)assert(fixed.render(row.id,row.w,row.h).equals(row.pixels),'old native render '+row.id);
 for(let row of oldRot)assert(fixed.render(0x17,40,40,row.rotation).equals(row.pixels),'old Nega rotation');
 for(let asset of assets){assert.equal(fixed.call(0x53209fb8,MAN,asset.id),32);assert.equal(fixed.call(0x53209fec,MAN,asset.id),32);
  const expected=Buffer.alloc(96*96*4,0xa5);for(let y=0;y<32;y++)for(let x=0;x<32;x++){let value=asset.pixels.readUInt32LE((y*32+x)*4);if(value>>>24)expected.writeUInt32LE(value,((y+7)*96+x+5)*4);}asset.expected=expected;
  fixed.e.mem_write(SCRATCH-16,Buffer.alloc(16,0x4a));fixed.e.mem_write(SCRATCH+4096,Buffer.alloc(16,0x4b));
  assert(fixed.render(asset.id,32,32).equals(expected),asset.label+' full framebuffer');assert(fixed.read(SCRATCH,4096).equals(asset.pixels),'decompress pixels');
  assert(fixed.read(SCRATCH-16,16).equals(Buffer.alloc(16,0x4a)));assert(fixed.read(SCRATCH+4096,16).equals(Buffer.alloc(16,0x4b)));
  for(let row of asset.oracles)assert(fixed.render(asset.id,32,32,row.rotation).equals(row.pixels),asset.label+' native rotation');
  assert.equal(fixed.call(0x532935dc,0,asset.style),asset.id);assert.equal(fixed.call(0x532a9988,0,asset.style),asset.id);
 }
 assert.equal(fixed.call(0x532935dc,0,22),0x17);assert.equal(fixed.call(0x532a9988,0,22),0x17);
 fixed.state.pixelBaseZero=true;for(let asset of assets)assert(fixed.render(asset.id,32,32).equals(asset.expected),'new lazy bypass');assert.equal(fixed.state.loads,0);fixed.state.pixelBaseZero=false;
 fixed.state.userdataNull=true;for(let asset of assets)assert(fixed.render(asset.id,32,32).equals(Buffer.alloc(96*96*4,0xa5)),'no UserData clean failure');fixed.state.userdataNull=false;
 // Corrupt all four compressed pointers' bytes in guest only; valid span,
 // zero-distance match rejected. Shared destination may change internally,
 // but failed decode must leave original framebuffer entirely untouched.
 for(let asset of assets){const address=base+icon.symbols[asset.compressed_symbol],before=fixed.read(address,asset.compressed_bytes);fixed.e.mem_write(address,Buffer.alloc(asset.compressed_bytes));assert(fixed.render(asset.id,32,32).equals(Buffer.alloc(96*96*4,0xa5)),'bad block clean framebuffer');fixed.e.mem_write(address,before);}
 const DECSRC=0x56017000,DECDST=0x56018000;let truncations=0;
 for(let asset of assets){const compressed=fs.readFileSync(R+'build/V9-icon/'+asset.asset_name+'.lz4');fixed.e.mem_write(DECSRC,compressed);
  for(let length=0;length<compressed.length;length++){
   fixed.e.mem_write(DECDST-16,Buffer.alloc(16,0xac));fixed.e.mem_write(DECDST+4096,Buffer.alloc(16,0xbc));
   for(let r=4;r<=10;r++)fixed.e.reg_write_i32(u['ARM_REG_R'+r],0x61200000+r);
   assert.equal(fixed.call(base+icon.symbols.V9_decode,DECDST,DECSRC,DECSRC+length,DECDST+4096),1,'truncated decode accepted');
   for(let r=4;r<=10;r++)assert.equal(fixed.e.reg_read_i32(u['ARM_REG_R'+r])>>>0,0x61200000+r);
   assert(fixed.read(DECDST-16,16).equals(Buffer.alloc(16,0xac)));assert(fixed.read(DECDST+4096,16).equals(Buffer.alloc(16,0xbc)));truncations++;
  }
  assert.equal(fixed.call(base+icon.symbols.V9_decode,DECDST,DECSRC,DECSRC+compressed.length,DECDST+4096),0);assert(fixed.read(DECDST,4096).equals(asset.pixels));
 }
 // Strict icon bounds fall through exactly the existing native continuation;
 // stopping there avoids exercising nonexistent original resource assets.
 fixed.e.hook_add(u.HOOK_CODE,()=>fixed.e.emu_stop(),{},0x5320a804,0x5320a804);
 const outside=[0,0x17,0x29e,0x2a3,0xffff];for(let id of outside){fixed.w(0x56016000,0xabcdef00);fixed.e.reg_write_i32(u.ARM_REG_R9,0x56016000);fixed.e.reg_write_i32(u.ARM_REG_R3,id);fixed.e.reg_write_i32(u.ARM_REG_SP,SP);fixed.e.reg_write_i32(u.ARM_REG_CPSR,0x10);try{fixed.e.emu_start(base+icon.symbols.V9_render,0x5320a804,0,1000);}catch(err){console.error({guard_id:id,pc:(fixed.e.reg_read_i32(u.ARM_REG_PC)>>>0).toString(16),base,symbol:icon.symbols.V9_render});throw err;}assert.equal(fixed.e.reg_read_i32(u.ARM_REG_PC)>>>0,0x5320a804);assert.equal(fixed.e.reg_read_i32(u.ARM_REG_LR)>>>0,0xabcdef00);assert.equal(fixed.e.reg_read_i32(u.ARM_REG_SP)>>>0,SP);}
 fixed.e.close();
 const result={status:'PASS',scope:'Real native ARM getter/renderer/copy/shared bounded decode, synthetic surface, UserData acquisition shim only',combined_plan_sha256:C.combinedBytes?sha(C.combinedBytes):undefined,final_rom_only:!!C.combined,menu_sha256:menu.sha256,icon_sha256:icon.sha256,v7_plan_sha256:sha(planbytes),old_dimension_pairs:sizes.length,old_native_renders:native.length,old_Nega_rotations:rotations,assets:assets.map(a=>({style:a.style,icon_id:a.icon_id,label:a.label,pixel_sha256:sha(a.pixels),rotations,full_framebuffer_pixels:96*96,compressed_bytes:a.compressed_bytes})),decoder_truncated_blocks_rejected:truncations,decoder_callee_saved_r4_r10_and_sp_checked:true,old_guard_fallback_ids:outside.map(x=>'0x'+x.toString(16)),new_assets_bypass_lazy_loader:true,null_UserData_failure_frames:4,malformed_lz4_failure_frames:4,framebuffer_and_scratch_canaries_checked:true,scratch_offset:'0xc78',shared_decode:true,limitations:['Synthetic display surface; no actual camera framebuffer timing, thread ordering or UI events','0 and right-angle rotations only; arbitrary rotation unverified','Failed compressed decode may partially modify its dedicated scratch; framebuffer is unchanged','All simple icon assets replace prior Gold/800T imagery']};
 fs.mkdirSync(C.reportDir('icon'),{recursive:true});fs.writeFileSync(C.reportDir('icon')+'/checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});

}
