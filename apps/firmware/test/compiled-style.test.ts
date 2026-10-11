import {test} from 'node:test';
import {prepareBuildInput} from '../src/build-input.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fitCube} from '../../../packages/firmware-fit/src/index.ts';
import {createStylePackage,inspectStylePackage} from '../../../packages/style-contract/src/index.ts';
import {sha256} from '../../../packages/firmware-core/src/platform.ts';
import {resolveSlots} from '../../../packages/firmware-core/src/candidate.ts';
import {PROJECT_PLATFORM,REFERENCE_STYLES,FACTORY_ORDER,defaultSlots,importStyle,reusableCompiledFit,selection,exportProject,importProject} from '../src/project.ts';
const fixture=new Uint8Array(await readFile(new URL('../../../stylepack/fixtures/asymmetric-v2.grstyle',import.meta.url)));
const original=await inspectStylePackage(fixture);
const wasm=await readFile(new URL('../../../packages/firmware-fit/wasm/gr_firmware_fit_bg.wasm',import.meta.url));
const fit=await fitCube(original.cubeBytes,{nodes:65,wasmBytes:wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength)});
const options={cube:original.cubeBytes,name:original.manifest.name,style_id:original.manifest.id,version:'3.0.0',author:'Test',license:'NOASSERTION',icon:original.icon};
const bytes=await createStylePackage({...options,camera:{platform:PROJECT_PLATFORM,fit}});
const platform=JSON.parse(await readFile(new URL('../../../packages/firmware-core/platform/platform.json',import.meta.url),'utf8'));
const style=await importStyle(bytes,'compiled.grstyle');
const slots=[style.id,...defaultSlots().slice(1)];
function candidate(selected=structuredClone(style.compiledFit!)){
 selected.acceptedFitHash=selected.report.fit_sha256;
 return selection([...REFERENCE_STYLES,style],slots,FACTORY_ORDER,{[style.id]:selected});
}
test('matching compiled package reuses independently verified recipe and requires installation acceptance',async()=>{
 assert.equal(style.compiledFit?.origin,'compiled-style');
 assert.equal(style.compiledFit?.acceptedFitHash,undefined);
 assert.equal(reusableCompiledFit(style,257),undefined);
 assert.equal(reusableCompiledFit(style,65)?.report.fit_sha256,fit.report.fit_sha256);
 const unaccepted=selection([...REFERENCE_STYLES,style],slots,FACTORY_ORDER,{[style.id]:style.compiledFit!});
 await assert.rejects(()=>resolveSlots(unaccepted as any,platform),/accepted/);
 const resolved=await resolveSlots(candidate() as any,platform);
 assert.equal(resolved[0].fitOrigin,'compiled-style');assert.deepEqual(resolved[0].recipe.matrix_q13,fit.matrix_q13);
 const restored=await importProject(exportProject('Compiled',null,[...REFERENCE_STYLES,style],slots,FACTORY_ORDER));
 assert.equal(restored.styles.at(-1)?.compiledFit?.report.fit_sha256,fit.report.fit_sha256);
 assert.equal(restored.styles.at(-1)?.compiledFit?.acceptedFitHash,undefined);
});
test('platform mismatch and self-hashed false holdout metrics are rejected at import',async()=>{
 const wrong=await createStylePackage({...options,camera:{platform:{...PROJECT_PLATFORM,sha256:'0'.repeat(64)},fit}});
 await assert.rejects(()=>importStyle(wrong,'wrong.grstyle'),/platform/);
 const changed=structuredClone(fit);changed.report.holdout.rmse_8bit=0;
 changed.report.fit_sha256=await sha256(new TextEncoder().encode(JSON.stringify({...changed.report,fit_sha256:undefined})));
 const forged=await createStylePackage({...options,camera:{platform:PROJECT_PLATFORM,fit:changed}});
 await assert.rejects(()=>importStyle(forged,'forged.grstyle'),/independently evaluated/);
});
test('final candidate binds embedded report and recipe; explicit refit requires changed nodes',async()=>{
 const selected=structuredClone(style.compiledFit!);
 selected.report.float_candidate.rmse_8bit=0;
 selected.report.fit_sha256=await sha256(new TextEncoder().encode(JSON.stringify({...selected.report,fit_sha256:undefined})));
 await assert.rejects(()=>resolveSlots(candidate(selected) as any,platform),/differs from compiled style/);
 const falseRefit=structuredClone(style.compiledFit!);falseRefit.origin='explicit-refit';
 await assert.rejects(()=>resolveSlots(candidate(falseRefit) as any,platform),/different node count/);
 const refit=await fitCube(original.cubeBytes,{nodes:257});
 const resolved=await resolveSlots(candidate({...refit,origin:'explicit-refit'}) as any,platform);
 assert.equal(resolved[0].recipe.curves_q14[0].length,257);assert.equal(resolved[0].fitOrigin,'explicit-refit');
 const dense=await importStyle(await createStylePackage({...options,camera:{platform:PROJECT_PLATFORM,fit:refit}}),'dense.grstyle');
 const prepared=await prepareBuildInput(selection([...REFERENCE_STYLES,dense],slots,FACTORY_ORDER),()=>{});
 const reused=await resolveSlots(prepared as any,platform);
 assert.equal(reused[0].recipe.curves_q14[0].length,257);
 assert.equal(reused[0].fitOrigin,'compiled-style');
 assert.equal(reused[0].fitReport.fit_sha256,refit.report.fit_sha256);
});
test('frozen reference slots and v2 exact-CUBE fit remain compatible',async()=>{
 const references=await resolveSlots({profile:'V9.2-four-slot',slots:[{reference:'gold'},{reference:'tungsten'},{reference:'ektar'},{reference:'metropolis'}]},platform);
 assert.equal(references.length,4);assert.ok(references.every(s=>!s.fitReport&&!s.packageSha256));
 const legacy=await importStyle(fixture,'legacy.grstyle');assert.equal(legacy.compiledFit,undefined);
 const fits={[legacy.id]:{...fit,acceptedFitHash:fit.report.fit_sha256}};
 const selected=selection([...REFERENCE_STYLES,legacy],[legacy.id,...defaultSlots().slice(1)],FACTORY_ORDER,fits);
 assert.equal((await resolveSlots(selected as any,platform))[0].acceptedFitHash,fit.report.fit_sha256);
});

test('build prepares legacy fits and binds compiled recipes without changing the submitted snapshot',async()=>{
 const legacy=await importStyle(fixture,'legacy.grstyle');
 for(const source of [legacy,style]){
  const input=selection([...REFERENCE_STYLES,source],[source.id,...defaultSlots().slice(1)],FACTORY_ORDER);
  const snapshot=structuredClone(input),events:any[]=[];
  const prepared=await prepareBuildInput(input,event=>events.push(event));
  assert.deepEqual(input,snapshot);
  const resolved=await resolveSlots(prepared as any,platform);
  assert.deepEqual(resolved[0].recipe.matrix_q13,fit.matrix_q13);
  assert.equal(resolved[0].acceptedFitHash,fit.report.fit_sha256);
  assert.equal(resolved[0].fitOrigin,source===style?'compiled-style':undefined);
  assert.equal(events[0].phase,'prepare-style');
 }
 const wrong=candidate();(wrong as any).slots[0].recipe.matrix_q13[0][0]++;
 await assert.rejects(()=>prepareBuildInput(wrong,event=>{}).then(prepared=>resolveSlots(prepared as any,platform)),/Invalid Q13 matrix/);
});
