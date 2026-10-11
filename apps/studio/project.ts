/** Pure project-file boundary; UI state stays in editor/, storage in services.ts. */
import {MODEL,normalizeState} from '../../packages/color-engine/index.ts';
import type {State} from '../../packages/color-engine/index.ts';
import {importLegacyProject} from '../../packages/color-engine/legacy.ts';
import {defaultIcon,validateIcon,sha256} from '../../packages/style-contract/src/index.ts';
import type {StyleIcon} from '../../packages/style-contract/src/index.ts';
import {rawDefaults,validateSettings} from '../../packages/raw-web/core.ts';
import type {RawSettings} from '../../packages/raw-web/core.ts';
export type StyleIdentity={id:string;version:string;author:string;license:string;icon:StyleIcon;provenance:unknown};
export type RawContext={filename:string;source_sha256:string;settings:RawSettings};
export type StudioProject=StyleIdentity&{schema:'gr-studio-project/v1';name:string;model_sha256:string;state:State;raw_development:RawContext|null;content_sha256:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** Sort recursively; reject values that JSON.stringify would silently discard. */
export function canonicalJSON(value:unknown,depth=0):string {
  if(depth>100)throw new Error('Style project nesting is too deep');
  if(value===null)return 'null';
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Style project contains invalid numbers');return JSON.stringify(value);}
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(v=>canonicalJSON(v,depth+1)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON((value as Record<string,unknown>)[k],depth+1)).join(',')+'}';
  throw new Error('Style project contains unsupported data');
}
function text(value:unknown):asserts value is string {
  if(typeof value!=='string'||!value.trim()||value.length>1024||/[\x00-\x1f\x7f]/.test(value))throw new Error('Invalid style name or author');
}
function identity(value:StyleIdentity):void {
  if(typeof value.id!=='string'||!UUID.test(value.id))throw new Error('Invalid style UUID');
  for(const k of ['author','license','version'] as const)text(value[k]);validateIcon(value.icon);canonicalJSON(value.provenance);
}
/** RAW context never contributes to the portable cube and applies by photo SHA. */
export function normalizeRawContext(value:unknown,legacy=false):RawContext|null {
  if(value===null||value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid photo identity');
  const c=value as Record<string,any>;
  if(typeof c.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(c.source_sha256))throw new Error('Invalid photo identity');
  const filename=legacy&&c.filename===undefined?'photo.dng':c.filename;
  if(typeof filename!=='string'||filename.length>1024||/[\x00-\x1f\x7f]/.test(filename))throw new Error('Invalid photo filename');
  let settings=c.settings;
  if(legacy){if(settings===undefined)settings={};if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('Invalid RAW settings');settings={...rawDefaults,...settings};}
  return {filename,source_sha256:c.source_sha256,settings:validateSettings(settings)};
}
export async function createProject(state:unknown,name:string,context:unknown,style:StyleIdentity):Promise<StudioProject> {
  identity(style);if(typeof name!=='string')throw new Error('Invalid style name');const cleanedName=name.trim()||'Untitled Style';text(cleanedName);
  const body={schema:'gr-studio-project/v1' as const,id:style.id,version:style.version,name:cleanedName,author:style.author,license:style.license,model_sha256:MODEL.model_sha256,state:normalizeState(state),icon:structuredClone(style.icon),raw_development:normalizeRawContext(context),provenance:structuredClone(style.provenance)};
  return {...body,content_sha256:await sha256(new TextEncoder().encode(canonicalJSON(body)))};
}
export async function importProject(input:unknown):Promise<{state:State;identity:StyleIdentity;raw_development:RawContext|null;name:string}> {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid style project format');const p=input as Record<string,any>;
  if(p.schema==='gr-studio-project/v1'){
    const keys=['schema','id','version','name','author','license','model_sha256','state','icon','raw_development','provenance','content_sha256'];
    if(Object.keys(p).sort().join()!==keys.sort().join()||p.model_sha256!==MODEL.model_sha256)throw new Error('Style project format or model identity mismatch');
    const style:StyleIdentity={id:p.id,version:p.version,author:p.author,license:p.license,icon:p.icon,provenance:p.provenance};identity(style);text(p.name);
    const {content_sha256,...body}=p;if(typeof content_sha256!=='string'||await sha256(new TextEncoder().encode(canonicalJSON(body)))!==content_sha256)throw new Error('Style project integrity check failed');
    return {state:normalizeState(p.state),identity:structuredClone(style),raw_development:normalizeRawContext(p.raw_development),name:p.name};
  }
  const state=await importLegacyProject(p),raw_development=normalizeRawContext(p.raw_development,true),id=crypto.randomUUID(),name=String(p.name||'Imported Style').slice(0,1024);
  return {state,name,raw_development,identity:{id,version:'1.0.0',author:'Unknown',license:'UNSPECIFIED',icon:defaultIcon(name,id),provenance:{schema:p.schema,look_sha256:p.look_sha256??null,builtin_model_sha256:p.state.builtin_model_sha256??null,matrix_model_sha256:p.state.matrix?.model_sha256??null}}};
}
