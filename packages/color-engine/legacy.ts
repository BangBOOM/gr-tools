/** Read-only compatibility boundary for historical Python editor exports. */
import {MODEL,normalizeState,effectiveMatrix} from './index.ts';
import type {State} from './index.ts';
function pythonNumber(n:number):string {
  if(!Number.isFinite(n))throw new Error('Non-finite JSON number');
  if(Object.is(n,-0))return '-0.0';
  if(n===0)return '0.0';
  const a=Math.abs(n);
  if(a<1e-4||a>=1e16){
    const [coefficient,exponent]=n.toExponential().split('e'),e=Number(exponent);
    return `${coefficient}e${e<0?'-':'+'}${Math.abs(e).toString().padStart(2,'0')}`;
  }
  return Number.isInteger(n)?`${n}.0`:n.toString();
}
function quoted(s:string):string {
  // Python json.dumps defaults to ensure_ascii=True, including surrogate pairs.
  return JSON.stringify(s).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
}
/** Canonical *state* JSON only: Python validate converts all numeric leaves to float. */
export function pythonStateJSON(value:unknown):string {
  if(value===null)return 'null';
  if(typeof value==='number')return pythonNumber(value);
  if(typeof value==='boolean')return value?'true':'false';
  if(typeof value==='string')return quoted(value);
  if(Array.isArray(value))return '['+value.map(pythonStateJSON).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>quoted(k)+':'+pythonStateJSON((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('Unsupported state JSON value');
}
export async function sha256(bytes:Uint8Array):Promise<string> {
  const buffer=new Uint8Array(bytes).buffer;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
}
/** Exact historical look SHA; separate from the browser implementation identity. */
export async function legacyLookHash(input:unknown):Promise<string> {
  const canonical:Record<string,any>=normalizeState(input);let version='gr-lut-v3';
  if(canonical.matrix)version='gr-lut-v5';
  else if(canonical.base==='nega'||canonical.base==='posi')version='gr-lut-v4';
  else if(!Object.values(canonical.film).some(Boolean)&&canonical.curve_interpolation==='linear'){
    delete canonical.film;delete canonical.curve_interpolation;version='gr-lut-v2';
  }
  return sha256(new TextEncoder().encode(version+'\n'+pythonStateJSON(canonical)));
}
function stable(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function matrixInfo(state:State):Record<string,unknown> {
  return {model:'base-matrix-q13-blend-v1',model_sha256:MODEL.legacy.matrix_model_sha256,matrix_q13:state.matrix?effectiveMatrix(state.matrix):MODEL.matrices[state.base].matrix_q13,baseline_q13:MODEL.matrices[state.base].matrix_q13,config:state.matrix??null,tone_base:state.base,domain:'inverse synthetic Standard gamma → matrix → retained base tone',scope:'Authored matrix only; not a 3D LUT or complete camera ISP'};
}
/** Legacy v1/v2 restore state snapshots. v3/v4 require exported provenance. */
export async function importLegacyProject(input:unknown):Promise<State> {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a GR Color Studio project');
  const p=input as Record<string,any>;
  if(!p.state||typeof p.state!=='object'||Array.isArray(p.state))throw new Error('Project state missing');
  if(['gr-color-studio/v1','gr-color-studio/v2'].includes(p.schema))return normalizeState(p.state);
  if(!['gr-color-studio/v3','gr-color-studio/v4'].includes(p.schema))throw new Error('Unsupported legacy project schema');
  const hasMatrix=Object.hasOwn(p.state,'matrix');
  if(hasMatrix!==(p.schema==='gr-color-studio/v4'))throw new Error('Project schema differs from matrix state');
  if(p.firmware_target!=='V7'||p.input_space!=='sRGB')throw new Error('Expected V7 display-sRGB project contract');
  if(p.preview_base_plan_sha256!==MODEL.legacy.preview_plan_sha256)throw new Error('Preview platform identity differs');
  if(typeof p.name!=='string'||!p.name.trim())throw new Error('Project name missing');
  const state=normalizeState(p.state);
  if(p.look_sha256!==await legacyLookHash(state))throw new Error('Project look identity differs');
  if(state.base==='nega'||state.base==='posi'){
    if(p.state.builtin_model_sha256!==MODEL.legacy.builtin_model_sha256||stable(p.base_source)!==stable(MODEL.native[state.base].provenance))throw new Error('Native provenance differs');
  }else if(Object.hasOwn(p,'base_source'))throw new Error('Native provenance on different base');
  if(hasMatrix){
    if(p.state.matrix.model_sha256!==MODEL.legacy.matrix_model_sha256||stable(p.authored_matrix)!==stable(matrixInfo(state)))throw new Error('Matrix provenance differs');
  }else if(Object.hasOwn(p,'authored_matrix'))throw new Error('Matrix provenance without matrix');
  return state;
}
