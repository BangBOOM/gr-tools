/** Studio runtime services: Workers, style identity, storage, RAW, and packaging. The editor calls them through `services`. */
import {PRESETS,PALETTES,normalizeState,transformRGB} from '../../packages/color-engine/index.ts';
import {createProject,importProject as parseProject} from './project.ts';
import type {StyleIdentity} from './project.ts';
import {createStylePackage,defaultFilmLabel,renderIcon,strictJSON,sha256} from '../../packages/style-contract/src/index.ts';
import type {StyleIcon} from '../../packages/style-contract/src/index.ts';
import {createHost} from '../../packages/host/src/desktop.ts';
import {runWorkerTask,WorkerTaskError} from '../../packages/host/src/worker-task.ts';
import {RawEngine} from '../../packages/raw-web/index.ts';
import type {FitResult,Recipe} from '../../packages/firmware-fit/src/index.ts';
import {createGRPreview} from './gr-preview.ts';
import {presetCopy} from './presets.ts';
import {CAMERA_TARGET} from '../../packages/firmware-fit/src/target.ts';
// Presentation copy is separate from the historical, hashed color model.
const displayPresets=Object.fromEntries(Object.entries(presetCopy).map(([id,{name,caption}])=>[id,{...PRESETS[id as keyof typeof PRESETS],name,caption}]));
const host=createHost(),raw=new RawEngine(),files=new Map<string,File>();
const initialId=crypto.randomUUID();let customIcon=false;
let identity:StyleIdentity={id:initialId as string,version:'1.0.0',author:'Unknown',license:'UNSPECIFIED',icon:defaultFilmLabel('',initialId),provenance:null as unknown};
/** A baked creative LUT. `lut` is the cached R-fastest float32 table; copy it before transferring. */
export type Profile={id:number;lut:Float32Array;size:number;mode:string;recipe:unknown;look_sha256:string};
let colorWorker:Worker|null=null,colorId=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>(),cache=new Map<string,Profile>();
function failColorWorker(worker:Worker,error:Error){
  if(worker!==colorWorker)return;worker.terminate();colorWorker=null;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();
}
function ensureColorWorker():Worker {
  if(colorWorker)return colorWorker;
  const worker=new Worker(new URL('./color.worker.ts',import.meta.url),{type:'module'});colorWorker=worker;
  worker.onmessage=({data})=>{if(worker!==colorWorker)return;const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data);};
  worker.onerror=e=>failColorWorker(worker,new Error(e.message||'Color worker failed'));
  worker.onmessageerror=()=>failColorWorker(worker,new Error('Could not read color worker response'));return worker;
}
async function profile(input:unknown):Promise<Profile>{const state=normalizeState(input),key=JSON.stringify(state);if(cache.has(key))return cache.get(key)!;
  const p:any=await new Promise((resolve,reject)=>{const worker=ensureColorWorker(),id=++colorId;
    const timer=setTimeout(()=>failColorWorker(worker,new Error('Color task timed out')),120000);pending.set(id,{resolve,reject,timer});
    try{worker.postMessage({id,state});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
  p.lut=new Float32Array(p.lut);cache.set(key,p);if(cache.size>12)cache.delete(cache.keys().next().value!);return p;
}
async function config(state:unknown,name:string,context:any){
  if(!customIcon)identity.icon=defaultFilmLabel(name,identity.id);
  return createProject(state,name,context,identity);
}
let importEpoch=0;
function startStyle(name:string){
  const id=crypto.randomUUID();importEpoch++;customIcon=false;identity={id,version:'1.0.0',author:'Unknown',license:'UNSPECIFIED',icon:defaultFilmLabel(name,id),provenance:null};syncIcon();return id;
}
async function importConfig(p:any,isCurrent=()=>true){
  const epoch=++importEpoch,restored=await parseProject(p);
  if(epoch!==importEpoch||!isCurrent())throw new DOMException('Style import superseded by a newer operation','AbortError');
  identity=restored.identity;customIcon=true;syncIcon();return {...p,name:restored.name,state:restored.state,raw_development:restored.raw_development};
}
async function cube(state:any,name:string){const lut=(await profile(state)).lut;
  const lines=[`TITLE "${name.replace(/["\r\n\\]/g,' ').slice(0,100)}"`,'LUT_3D_SIZE 33','DOMAIN_MIN 0 0 0','DOMAIN_MAX 1 1 1'];
  for(let i=0;i<lut.length;i+=3)lines.push(`${lut[i].toFixed(9)} ${lut[i+1].toFixed(9)} ${lut[i+2].toFixed(9)}`);
  return new TextEncoder().encode(lines.join('\n')+'\n');
}
type PreparedCamera={cube:Uint8Array;name:string;identity:StyleIdentity;fit:FitResult;authored?:ArrayBuffer;camera?:ArrayBuffer};
let cameraGeneration=0,cancelCameraTask:(()=>void)|null=null,cameraCache:{cubeSha256:string;fit:FitResult}|null=null;
function cancelCamera(){cameraGeneration++;cancelCameraTask?.();}
async function prepareCamera(state:unknown,name:string,pixels?:Uint8Array,onProgress?:(phase:string)=>void):Promise<PreparedCamera>{
  cancelCamera();const generation=cameraGeneration;
  const frozen=structuredClone(identity);if(!customIcon)frozen.icon=defaultFilmLabel(name,frozen.id);
  const target=normalizeState(state),bytes=await cube(target,name),cubeSha256=await sha256(bytes);
  if(generation!==cameraGeneration)throw new DOMException('Camera preparation superseded','AbortError');
  const task=runWorkerTask<{fit:FitResult;authored?:ArrayBuffer;camera?:ArrayBuffer}>(new Worker(new URL('./camera.worker.ts',import.meta.url),{type:'module'}),
    {cube:bytes,fit:cameraCache?.cubeSha256===cubeSha256?cameraCache.fit:undefined,pixels},
    {name:'Camera preparation',timeoutMs:180000,onMessage:(data,{done,fail})=>data.phase?onProgress?.(data.phase):data.error?fail(new Error(data.error)):done(data)});
  cancelCameraTask=task.cancel;let value;
  try{value=await task.result;}
  catch(error){throw error instanceof WorkerTaskError&&error.outcome==='cancelled'?new DOMException('Camera preparation canceled','AbortError'):error;}
  finally{if(cancelCameraTask===task.cancel)cancelCameraTask=null;}
  if(generation!==cameraGeneration)throw new DOMException('Camera preparation superseded','AbortError');
  cameraCache={cubeSha256,fit:value.fit};return {cube:bytes,name,identity:frozen,...value};
}
// GR Preview fits on a persistent Worker. At most one fit runs; a queued request
// starts only if it is still the latest, so drags never build a backlog.
const previewFits=new WeakMap<object,Recipe>();
let previewWorker:Worker|null=null,previewTail:Promise<unknown>=Promise.resolve(),previewLatest:object|null=null;
function runPreviewFit(p:Profile):Promise<Recipe>{
  previewWorker??=new Worker(new URL('./preview.worker.ts',import.meta.url),{type:'module'});const worker=previewWorker;
  return new Promise((resolve,reject)=>{
    const fail=(error:Error)=>{worker.terminate();if(previewWorker===worker)previewWorker=null;reject(error);};
    worker.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data.recipe);
    worker.onerror=event=>fail(new Error(event.message||'GR Preview worker failed'));
    worker.onmessageerror=()=>fail(new Error('Could not read GR Preview result'));
    const lut=p.lut.slice().buffer;worker.postMessage({lut,size:p.size},[lut]);
  });
}
/** Fit the camera recipe for a `profile` result. Rejects with AbortError when a newer profile replaces a queued request. */
function cameraPreview(p:Profile):Promise<Recipe>{
  const known=previewFits.get(p);if(known)return Promise.resolve(known);previewLatest=p;
  const run=previewTail.then(async()=>{
    if(previewLatest!==p)throw new DOMException('GR Preview superseded','AbortError');
    const recipe=await runPreviewFit(p);previewFits.set(p,recipe);return recipe;
  });
  previewTail=run.catch(()=>{});return run;
}
async function packageCamera(prepared:PreparedCamera){
  const style=prepared.identity;
  return createStylePackage({cube:prepared.cube,name:prepared.name,style_id:style.id,version:style.version,author:style.author,license:style.license,icon:style.icon,camera:{platform:CAMERA_TARGET,fit:prepared.fit}});
}
async function pickColor(state:any,rgb:number[]){
  if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw new Error('Pick a valid color in the photo');
  const stage={...normalizeState(state),strength:100,film:{},curves:{},mixer:{},grading:{},style:{intensity:0}},c=Array.from(transformRGB(rgb,stage)),max=Math.max(...c),min=Math.min(...c),delta=max-min,l=(max+min)/2;
  const s=delta===0?0:delta/(1-Math.abs(2*l-1));if(s<.07||l<.025||l>.975)throw new Error('Pick a more saturated area with moderate brightness');
  let h=delta===0?0:max===c[0]?((c[1]-c[2])/delta)%6:max===c[1]?(c[2]-c[0])/delta+2:(c[0]-c[1])/delta+4;h=(h*60+360)%360;
  const centers=[0,30,60,120,180,240,275,315],distance=centers.map(v=>Math.abs((h-v+540)%360-180));return {band:['red','orange','yellow','green','aqua','blue','purple','magenta'][distance.indexOf(Math.min(...distance))],rgb,stage_rgb:c};
}
/** Load valid saved styles; skip corrupt or foreign storage entries. */
async function listProjects(){
  const ids=await host.storage.list();const projects=[];
  for(const id of ids){const text=await host.storage.load(id);try{const p:any=text?strictJSON(text):null;if(p?.schema==='gr-studio-project/v1'){await parseProject(p);projects.push(p);}}catch{continue;}}
  return projects;
}
function drawStyleIcon(canvas:HTMLCanvasElement,icon:StyleIcon){canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(renderIcon(icon)),32,32),0,0);}
function syncIcon(){drawStyleIcon(document.querySelector<HTMLCanvasElement>('#style-identity-icon')!,identity.icon);}
type IdentitySnapshot={identity:StyleIdentity;customIcon:boolean};
/** Store the submitted identity, even if the user selects another style during hashing. */
async function saveStyle(state:unknown,name:string,context:unknown,snapshot:IdentitySnapshot){
  const style=structuredClone(snapshot.identity);if(!snapshot.customIcon)style.icon=defaultFilmLabel(name,style.id);
  const project=await createProject(state,name,context,style);await host.storage.save(project.id,JSON.stringify(project));return project;
}
/**
 * The editor's only path to runtime services. It is a mutable object so that
 * `tools/test_web.mjs` can replace a method (for example `saveStyle`) to inject failures.
 */
export const services={
  bootstrap(){return {presets:displayPresets,palettes:PALETTES};},
  profile,cameraPreview,cameraRenderer:createGRPreview(),raw,files,host,strictJSON,config,importConfig,cube,startStyle,prepareCamera,packageCamera,cancelCamera,cameraTarget:CAMERA_TARGET,
  pickColor,listProjects,saveStyle,drawStyleIcon,syncIcon,
  deleteProject(id:string){return host.storage.remove(id);},
  identitySnapshot():IdentitySnapshot{return structuredClone({identity,customIcon});},
  restoreIdentity(snapshot:IdentitySnapshot){importEpoch++;identity=structuredClone(snapshot.identity);customIcon=snapshot.customIcon;syncIcon();},
  /** Apply a validated Film label. Returns false when the icon is unchanged. */
  applyIcon(icon:StyleIcon){if(JSON.stringify(identity.icon)===JSON.stringify(icon))return false;customIcon=true;identity.icon=icon;syncIcon();return true;},
  /** Keep the default Film label in step with the style name until the user customizes it. */
  renameStyle(name:string){if(!customIcon){identity.icon=defaultFilmLabel(name,identity.id);syncIcon();}},
  async rawImport(file:File){const id=crypto.randomUUID(),source_sha256=await sha256(new Uint8Array(await file.arrayBuffer()));files.set(id,file);return {id,source_sha256};},
  async rawPixels(id:string,settings:any){const file=files.get(id);if(!file)throw new Error('DNG file has been released');return raw.decode(file,settings);},
  async releasePhotos(ids:string[]){for(const id of ids){const file=files.get(id);if(file)raw.release(file);files.delete(id);}},
  async exportRaw(id:string,settings:any,state:any,format:'jpeg'|'png'){const generation=raw.generation,p=await profile(state);if(generation!==raw.generation)throw new DOMException('RAW export canceled','AbortError');const file=files.get(id);if(!file)throw new Error('Import the DNG again');return raw.export(file,settings,p.lut,format);},
  /** Stop every Worker this module owns. */
  dispose(){raw.cancel();cancelCamera();previewWorker?.terminate();if(colorWorker)failColorWorker(colorWorker,new DOMException('Color task canceled','AbortError'));},
};
export type {IdentitySnapshot};
