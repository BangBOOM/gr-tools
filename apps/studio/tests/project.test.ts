import assert from 'node:assert/strict';
import {createProject,importProject,canonicalJSON,normalizeRawContext} from '../project.ts';
import {MODEL,normalizeState} from '../../../packages/color-engine/index.ts';
import {legacyLookHash,matrixInfo} from '../../../packages/color-engine/legacy.ts';
import {defaultIcon,sha256,strictJSON} from '../../../packages/style-contract/src/index.ts';
const id='aabbccdd-1111-2222-3333-444455556666',style={id,version:'1.0.0',author:'Unknown',license:'UNSPECIFIED',icon:defaultIcon('AB Sunset',id),provenance:null};
const raw={filename:'same.dng',source_sha256:'a'.repeat(64),settings:{exposure:1,wb:'custom' as const,temperature:20,tint:-10}};
const original=await createProject({base:'gold',matrix:{to:'posi',mix:29},film:{highlight_softness:15}},'AB Sunset',raw,style);
const restored=await importProject(original),again=await createProject(restored.state,restored.name,restored.raw_development,restored.identity);assert.deepEqual(again,original);
function reverseKeys(value:any):any{if(Array.isArray(value))return value.map(reverseKeys);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverseKeys(v)]));return value;}
const reordered=reverseKeys(original);assert.equal(canonicalJSON(original),canonicalJSON(reordered));assert.deepEqual(await importProject(reordered),restored);
assert.deepEqual(await importProject(strictJSON(JSON.stringify(original))),restored);
restored.identity.icon.text='ZZ';assert.notEqual(restored.identity.icon.text,original.icon.text);
for(const mutate of [
  (p:any)=>p.state.values.brightness=30,(p:any)=>p.icon.text='XY',(p:any)=>p.raw_development.settings.exposure=2,(p:any)=>p.provenance={changed:true},(p:any)=>p.content_sha256='0'.repeat(64),
]){const p=structuredClone(original);mutate(p);await assert.rejects(importProject(p));}
async function resign(p:any){const {content_sha256,...body}=p;p.content_sha256=await sha256(new TextEncoder().encode(canonicalJSON(body)));return p;}
for(const mutate of [
  (p:any)=>p.id='-'.repeat(36),(p:any)=>p.id=p.id.toUpperCase(),(p:any)=>p.name='bad\nname',(p:any)=>p.author='',(p:any)=>p.license=17,(p:any)=>p.version=' '.repeat(4),(p:any)=>p.state.values.extra=1,(p:any)=>p.model_sha256='0'.repeat(64),(p:any)=>p.raw_development.settings.exposure=99,(p:any)=>p.raw_development.source_sha256='wrong',(p:any)=>p.extra=true,
]){const p=structuredClone(original);mutate(p);await assert.rejects(importProject(await resign(p)));}
for(const x of [undefined,NaN,Infinity,()=>1,{missing:undefined},Array(101).fill(0).reduce(v=>[v],0 as any)])assert.throws(()=>canonicalJSON(x));
for(const invalid of [null,[],{},'string'])await assert.rejects(importProject(invalid));
for(const schema of ['gr-color-studio/v1','gr-color-studio/v2']){
  const legacy=await importProject({schema,name:'Old Gold',state:{base:'gold'},raw_development:{source_sha256:'b'.repeat(64),settings:{exposure:-1}}});
  assert.equal(legacy.state.curve_interpolation,'linear');assert.equal(legacy.raw_development?.filename,'photo.dng');assert.equal(legacy.raw_development?.settings.exposure,-1);assert.equal(legacy.raw_development?.settings.wb,'camera');assert.deepEqual(legacy.identity.icon,defaultIcon(legacy.name,legacy.identity.id));
  const exported=await createProject(legacy.state,legacy.name,legacy.raw_development,legacy.identity);assert.equal((await importProject(exported)).identity.id,legacy.identity.id);
}
for(const input of [{},{base:'nega'},{base:'gold',matrix:{to:'posi',mix:29}},{base:'posi',matrix:{}}]){
  const state=normalizeState(input),p:any={schema:state.matrix?'gr-color-studio/v4':'gr-color-studio/v3',name:'Legacy',state,look_sha256:await legacyLookHash(state),firmware_target:'V7',input_space:'sRGB',preview_base_plan_sha256:MODEL.legacy.preview_plan_sha256};
  if(state.base==='nega'||state.base==='posi')p.base_source=MODEL.native[state.base].provenance;
  if(state.matrix)p.authored_matrix=matrixInfo(state);
  const legacy=await importProject(p);assert.deepEqual(legacy.state,state);assert.equal((legacy.identity.provenance as any).look_sha256,p.look_sha256);
  p.look_sha256='0'.repeat(64);await assert.rejects(importProject(p));
}
assert.deepEqual(normalizeRawContext(null),null);assert.throws(()=>normalizeRawContext({...raw,settings:{...raw.settings,extra:1}}));
await assert.rejects(createProject({},'Bad\nName',null,style));await assert.rejects(createProject({},'OK',null,{...style,author:'bad\u0000'}));
console.log('Studio projects: canonical hashes, strict metadata, mutation/provenance checks, v1–v4 migration and photo-bound RAW context PASS');
