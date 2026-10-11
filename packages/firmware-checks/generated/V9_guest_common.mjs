// Generated from re/tools/V9_guest_common.cjs SHA256 8f234c0bec5a7e001cfd69b1b2914bebe87a9990839fdad66051dec576970de5
export default function(require, Buffer, process, console, __dirname, module, exports) {
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const R=path.resolve(__dirname,'..'),source=fs.readFileSync(R+'/extract/unpackedFW');
const off=a=>a-0x53000000+0x10870,sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const v7bytes=fs.readFileSync(R+'/build/CH-adjustable-gold/plan.json'),v7=JSON.parse(v7bytes);
const combinedPath=process.argv[2],combinedBytes=combinedPath?fs.readFileSync(combinedPath):null,combined=combinedBytes?JSON.parse(combinedBytes):null;
function branch(a,t,link=false){const d=t-a-8;assert.equal(d%4,0);assert(d>=-(1<<25)&&d<(1<<25));const b=Buffer.alloc(4);b.writeUInt32LE(((link?0xeb000000:0xea000000)|((d/4)&0xffffff))>>>0);return b;}
function moduleInfo(name){const dir=R+'/build/V9-'+name,p=JSON.parse(fs.readFileSync(dir+'/manifest.json'));return{dir,p,raw:fs.readFileSync(path.isAbsolute(p.rawfile)?p.rawfile:dir+'/'+p.rawfile)};}
function apply(e,name){const{p,raw}=moduleInfo(name);assert.equal(sha(raw),p.sha256);const placed=combined?combined.modules.find(m=>m.name===name):null;const base=Number(placed?placed.base:p.base);if(combined){assert(placed,'final module registry missing '+name);assert.equal(sha(fs.readFileSync(R+'/build/V9-'+name+'/manifest.json')),placed.manifest_sha256,'final manifest mismatch '+name);assert.equal(sha(raw),process.isCandidate?placed.raw_sha256:placed.source_raw_sha256,'final source module mismatch '+name);assert.equal(sha(Buffer.from(e.mem_read(base,raw.length))),placed.raw_sha256,'final relocated module mismatch '+name);}else e.mem_write(base,raw);for(const h of p.hooks){const b=branch(Number(h.va),base+p.symbols[h.target_symbol],h.link);if(combined)assert(Buffer.from(e.mem_read(Number(h.va),4)).equals(b),'final ROM hook mismatch '+name+' '+h.va);else e.mem_write(Number(h.va),b);}for(const m of p.mutations||[]){const b=Buffer.from(m.new_hex,'hex');if(combined)assert(Buffer.from(e.mem_read(Number(m.va),b.length)).equals(b),'final ROM mutation mismatch '+name+' '+m.va);else e.mem_write(Number(m.va),b);}return p;}
function load(e,withV7=true){e.mem_write(0x53000000,source.subarray(0x10870,0x10870+0x1400000));e.mem_write(0x55000000,source.subarray(off(0x5407b540),off(0x5407b540)+0x3a080));if(withV7&&process.finalPayload)e.mem_write(0x53000000,process.finalPayload.subarray(0x10870,0x10870+0x1400000));else if(withV7)for(const p of (combined||v7).patches){if(combined)assert.equal(source.subarray(off(Number(p.va)),off(Number(p.va))+p.old_hex.length/2).toString('hex'),p.old_hex);e.mem_write(Number(p.va),Buffer.from(p.new_hex,'hex'));}}
const reportDir=name=>R+'/analysis/V9-'+name+(combined?'-final-arm':'-arm');
module.exports={fs,path,assert,crypto,R,source,off,sha,v7,v7bytes,branch,moduleInfo,apply,load,combined,combinedBytes,reportDir};

}
