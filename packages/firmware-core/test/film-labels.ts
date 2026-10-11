import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createStylePackage,inspectStylePackage,renderIcon,type FilmLabelIcon} from '../../style-contract/src/index.ts';
import {fitCube} from '../../firmware-fit/src/index.ts';
import {createCandidate,compressIcon} from '../src/candidate.ts';
import {decodeLz4,verifyCandidateReadback} from '../src/readback.ts';
import {createFirmwareCore,verifyReportIntegrity} from '../src/index.ts';
import {payloadOffset} from '../src/platform.ts';
import {decodeIndependent} from '../src/decoder.ts';
import {PROJECT_PLATFORM,importStyle,reusableCompiledFit,selection,FACTORY_ORDER} from '../../../apps/firmware/src/project.ts';

const root=new URL('../../../',import.meta.url);
const platform=JSON.parse(await readFile(new URL('packages/firmware-core/platform/platform.json',root),'utf8'));
const source=decodeIndependent(new Uint8Array(await readFile(new URL('fwdc239b.bin',root)))).payload;
const original=await inspectStylePackage(new Uint8Array(await readFile(new URL('stylepack/fixtures/asymmetric-v2.grstyle',root))));
const fitWasm=await readFile(new URL('packages/firmware-fit/wasm/gr_firmware_fit_bg.wasm',root));
const fit=await fitCube(original.cubeBytes,{nodes:65,wasmBytes:fitWasm.buffer.slice(fitWasm.byteOffset,fitWasm.byteOffset+fitWasm.byteLength)});
const icons:FilmLabelIcon[]=[
 {template:'film-label-v1',layout:'solid',top_text:'GOLD',bottom_text:'200',top_color:'#E5B828',bottom_color:'#E5B828'},
 {template:'film-label-v1',layout:'split',top_text:'CINE',bottom_text:'800T',top_color:'#38ADB8',bottom_color:'#D96147'},
 {template:'film-label-v1',layout:'band',top_text:'EKT',bottom_text:'100',top_color:'#D96147',bottom_color:'#E5B828'},
 {template:'film-label-v1',layout:'split',top_text:'MET',bottom_text:'400',top_color:'#92A3AA',bottom_color:'#38ADB8'},
];
const names=['Gold 200','Tungsten 800','Ektar 100','Metropolis'];
const styles=[];
for(let i=0;i<4;i++){
 const bytes=await createStylePackage({cube:original.cubeBytes,name:names[i],style_id:`11111111-2222-4333-8444-55555555555${i}`,version:'3.0.0',author:'Test',license:'NOASSERTION',icon:icons[i],camera:{platform:PROJECT_PLATFORM,fit}});
 const style=await importStyle(bytes,`film-label-${i}.grstyle`);
 assert.deepEqual({...style.icon},icons[i]);
 const reused=reusableCompiledFit(style,65)!;
 assert.equal(reused.origin,'compiled-style');
 assert.deepEqual(reused.matrix_q13,fit.matrix_q13);
 assert.deepEqual(reused.curves_q14,fit.curves_q14);
 assert.equal(reused.report.fit_sha256,fit.report.fit_sha256);
 const pixels=renderIcon(style.icon),compressed=compressIcon(pixels);
 assert.deepEqual(decodeLz4(compressed),pixels);
 styles.push(style);
}
const fits=Object.fromEntries(styles.map(style=>[style.id,{...reusableCompiledFit(style,65)!,acceptedFitHash:fit.report.fit_sha256}]));
const requested=selection(styles,styles.map(style=>style.id),FACTORY_ORDER,fits);
const candidate=await createCandidate(source,platform,requested as any);
const compressedBytes=candidate.slots.map(slot=>slot.compressedIcon.length);
assert.ok(compressedBytes.reduce((n,x)=>n+x,0)<=852,'four film labels must fit the current reference-name icon budget');
assert.equal(verifyCandidateReadback(source,candidate.beforeChecksum,platform,candidate).status,'PASS');
for(let i=0;i<4;i++){
 assert.deepEqual(candidate.slots[i].icon,renderIcon(icons[i]));
 assert.equal(candidate.slots[i].fitOrigin,'compiled-style');
 assert.deepEqual(candidate.slots[i].recipe.matrix_q13,fit.matrix_q13);
 assert.deepEqual(candidate.slots[i].recipe.curves_q14,fit.curves_q14);
}
// Valid dense glyphs can exceed the combined icon budget. The gate must reject.
const denseIcon:FilmLabelIcon={template:'film-label-v1',layout:'band',top_text:'KRE5',bottom_text:'SRQ5',top_color:'#123456',bottom_color:'#ABCDEF'};
assert.ok(compressIcon(renderIcon(denseIcon)).length*4>852);
const overflowStyles=[];
for(let i=0;i<4;i++){
 const bytes=await createStylePackage({cube:original.cubeBytes,name:names[i],style_id:styles[i].id,version:'3.0.0',author:'Test',license:'NOASSERTION',icon:denseIcon,camera:{platform:PROJECT_PLATFORM,fit}});
 overflowStyles.push(await importStyle(bytes,`overflow-${i}.grstyle`));
}
const overflow=selection(overflowStyles,overflowStyles.map(style=>style.id),FACTORY_ORDER,fits);
await assert.rejects(()=>createCandidate(source,platform,overflow as any),/first ROM arena capacity exceeded/);
// Independent readback must reject changed final icon data.
const damaged=candidate.beforeChecksum.slice(),iconModule=candidate.plan.modules.find((module:any)=>module.name==='icon');
// ROM addresses use the same payload mapping as the core, not a file offset.
damaged[payloadOffset(iconModule.base+488)]^=1;
assert.throws(()=>verifyCandidateReadback(source,damaged,platform,candidate));
const coreWasm=await readFile(new URL('packages/firmware-core/wasm/gr_firmware_core_bg.wasm',root));
const core=await createFirmwareCore({platform,wasmBytes:coreWasm.buffer.slice(coreWasm.byteOffset,coreWasm.byteOffset+coreWasm.byteLength)});
const base=await readFile(new URL('fwdc239b.bin',root));
const result=await core.build(base.buffer.slice(base.byteOffset,base.byteOffset+base.byteLength),requested as any,{onProgress:console.log});
assert.equal(result.report.status,'PASS');
assert.equal(result.report.deviceAcceptance,'REQUIRES_DEVICE_TEST');
assert.ok(await verifyReportIntegrity(result.report,result.firmware));
const suites=(result.report.gates.find(g=>g.id==='native-arm')!.evidence as any[]);
assert.equal(suites.length,13);
const iconSuite=suites.find(s=>s.name==='V9_icon_arm');
const evidence=Object.values(iconSuite.reports)[0] as any;
assert.equal(evidence.assets.length,4);
assert.ok(evidence.assets.every((asset:any)=>asset.rotations.length===3));
await writeFile('/tmp/gr-film-label-report.json',JSON.stringify(result.report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',compressedBytes,totalCompressedBytes:compressedBytes.reduce((n,x)=>n+x,0),candidateSha256:result.report.candidateSha256,reportSha256:result.report.reportSha256,gates:result.report.gates.length,nativeSuites:suites.length,deviceAcceptance:result.report.deviceAcceptance}));
