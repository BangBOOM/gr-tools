/** Fixed development verifier: evidence integrity plus actual final-ROM readback. */
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyReportIntegrity,canonicalReportJSON} from '../packages/firmware-core/src/report.ts';
import {decodeIndependent,bytesEqual,additiveSum} from '../packages/firmware-core/src/decoder.ts';
import {createCandidate} from '../packages/firmware-core/src/candidate.ts';
import {verifyCandidateReadback,decodeBlocked} from '../packages/firmware-core/src/readback.ts';
import {payloadOffset,sha256} from '../packages/firmware-core/src/platform.ts';
import {PLATFORM_SHA256} from '../packages/firmware-core/platform/pin.ts';
import {importProject,selection} from '../apps/firmware/src/project.ts';
const [reportPath,candidatePath,basePath,projectPath,expectedReportSha,expectedCandidateSha,expectedProjectSha]=process.argv.slice(2);
const hash=b=>createHash('sha256').update(b).digest('hex');
const requireThat=(test,message)=>{if(!test)throw Error(message);};
async function boundedFile(path,limit){
 const handle=await open(path,'r');
 try{const info=await handle.stat();requireThat(info.isFile()&&info.size<=limit,'verifier input type/size bound');const data=Buffer.alloc(info.size+1);let at=0;while(at<data.length){const {bytesRead}=await handle.read(data,at,data.length-at,null);if(!bytesRead)break;at+=bytesRead;}requireThat(at===info.size,'verifier input changed while reading');return data.subarray(0,at);}finally{await handle.close();}
}
try{
 requireThat(reportPath&&candidatePath&&basePath&&projectPath&&expectedReportSha&&expectedCandidateSha&&expectedProjectSha,'missing exact verification inputs');
 const [reportBytes,candidate,base,projectBytes,platformBytes]=await Promise.all([[reportPath,8*1024*1024],[candidatePath,32*1024*1024],[basePath,32*1024*1024],[projectPath,64*1024*1024],[new URL('../packages/firmware-core/platform/platform.json',import.meta.url),4*1024*1024]].map(([path,limit])=>boundedFile(path,limit)));
 requireThat(hash(reportBytes)===expectedReportSha&&hash(candidate)===expectedCandidateSha&&hash(projectBytes)===expectedProjectSha,'verification inputs changed');
 const report=JSON.parse(reportBytes);
 requireThat(await verifyReportIntegrity(report,candidate),'strict current report/artifact verification failed');
 requireThat(hash(base)===report.baseSha256&&hash(platformBytes)===PLATFORM_SHA256,'official base/platform binding');
 const platform=JSON.parse(platformBytes),project=await importProject(new Uint8Array(projectBytes));
 requireThat(project.base?.sha256===report.baseSha256,'installation project official base binding');
 const source=decodeIndependent(base).payload,decoded=decodeIndependent(candidate).payload;
 requireThat(await sha256(decoded)===report.payloadSha256,'actual final payload/report binding');
 const version=report.buildProfile.startsWith('V9.2-')?'V9.2':'V9.1';
 if(report.buildProfile.endsWith('-four-slot')){
  // Recipes are recovered from the final ROM, then validated against the original
  // package/CUBE and independently recomputed fit metrics by createCandidate.
  // Untrusted report placement is used only for bounded extraction; the rebuilt
  // placement, hashes, code and every final byte must subsequently match.
  const backend=report.candidate.modules.find(m=>m.name==='backend');
  const start=payloadOffset(backend.base),end=start+backend.bytes;
  requireThat(Number.isSafeInteger(start)&&start>=0&&end<=decoded.length,'backend read bounds');
  const raw=decoded.subarray(start,end),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),fits={};
  for(let i=0;i<4;i++){
   const slot=report.candidate.slots[i],id=project.slots[i],style=project.styles.find(s=>s.id===id);
   requireThat(style&&style.name===slot.styleName,'project slot identity/name binding');
   if(!slot.fit)continue;
   requireThat(!style.reference&&project.nodes===slot.nodes,'custom project curve-node binding');
   const matrix_q13=Array.from({length:3},(_,r)=>Array.from({length:3},(_,c)=>view.getInt16(2152+i*104+(r*3+c)*2,true)));
   const curves_q14=Array.from({length:3},(_,channel)=>{
    const at=2500+(i*3+channel)*8,offset=view.getUint32(at,true)-backend.base,length=view.getUint16(at+4,true),kind=view.getUint16(at+6,true);
    requireThat(offset>=2596&&offset+length<=raw.length&&[0,1].includes(kind),'final curve directory bounds');
    const data=raw.subarray(offset,offset+length);
    if(kind===0)return decodeBlocked(data);
    requireThat(length===130,'65-node curve exact extent');
    const values=new DataView(data.buffer,data.byteOffset,data.byteLength);return Array.from({length:65},(_,j)=>values.getUint16(j*2,true));
   });
   // createCandidate binds this claimed origin to the independently verified
   // embedded v3 recipe, or requires a verified refit with different nodes.
   fits[id]={matrix_q13,curves_q14,report:slot.fit,acceptedFitHash:slot.acceptedFitHash,origin:slot.fitOrigin};
  }
  const installed={...selection(project.styles,project.slots,project.order,fits),profile:version+'-four-slot'};
  requireThat(installed.profile===report.buildProfile,'project profile/report mismatch');
  const rebuilt=await createCandidate(source,platform,installed);
  verifyCandidateReadback(source,decoded,platform,rebuilt);
  requireThat(canonicalReportJSON({candidate:rebuilt.report})===canonicalReportJSON({candidate:report.candidate}),'final installed package/recipe/module report differs from independently reconstructed project');
  requireThat(await sha256(rebuilt.assets.get(platform.plans[version]))===report.planSha256,'independently reconstructed plan binding');
  const expected=rebuilt.beforeChecksum.slice(),v=new DataView(expected.buffer);v.setUint32(expected.length-4,(-additiveSum(expected.subarray(0,-4)))>>>0,true);
  requireThat(bytesEqual(expected,decoded),'exact reconstructed full final payload mismatch');
 }else{
  requireThat(selection(project.styles,project.slots,project.order).profile.endsWith('-reference'),'reference installation project mismatch');
 }
 console.log(JSON.stringify({valid:true,reportFileSha256:expectedReportSha,candidateSha256:expectedCandidateSha,projectSha256:expectedProjectSha,independentFinalReadback:true,freshNativeArmRun:false}));
}catch(error){console.error(String(error));process.exitCode=1;}
