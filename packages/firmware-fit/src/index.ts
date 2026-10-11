/** Exact-cube camera approximation. Rust fits; TypeScript evaluates holdouts. */
import initialize,{fit_cube,training_points} from '../wasm/gr_firmware_fit.js';
import {validateCube,decodeUTF8} from '../../style-contract/src/cube.ts';
import {MODEL} from '../../color-engine/index.ts';
import {FIT_WASM_SHA256,FIT_RUST_SOURCE_SHA256,FIT_EVALUATOR_SOURCE_SHA256} from '../wasm/pin.ts';
import {BSTD_INVERSE,STANDARD_CHAIN,cameraMatrix,workingTables,latent,matrixStage,toneStage,renderLatent,cameraPixel,ycbcrInverse,type CameraChain} from '../../color-engine/camera.ts';
/** Matrix seeds for the fitter: the eight camera base matrices. */
export const SEED_MATRICES_Q13=Object.values(MODEL.matrices).map(m=>m.matrix_q13);
export type Recipe={matrix_q13:number[][];curves_q14:number[][]};
export type Metrics={rmse_8bit:number;p95_8bit:number;max_8bit:number;clipped_channel_fraction:number;samples:number};
export type Limits={rmse_8bit?:number;p95_8bit?:number;max_8bit?:number;clipped_channel_fraction?:number};
export type FitReport={schema:'gr-native-cube-fit/v1';input_cube_sha256:string;recipe_sha256:string;fit_sha256:string;model_sha256:string;method:string;reference_kind:'exact_serialized_cube_trilinear';review_required:true;camera_calibrated:false;holdout:Metrics;endpoints:Metrics;float_candidate:Metrics;quantization:Metrics;training_samples:number;holdout_seed:number;samples_sha256:string;limits_pass?:boolean;limitations:string[];[key:string]:unknown};
export type FitResult=Recipe&{report:FitReport};
export type FitOptions={nodes?:65|257;wasmUrl?:string|URL;wasmBytes?:ArrayBuffer;limits?:Limits};
export type ParsedCube={size:number;values:Float64Array;bytes:Uint8Array};
const CLIP=(v:number)=>Math.min(1,Math.max(0,v));
const LIMITATIONS=['Host camera model (reports 58, 59, CL): MultiAxial record selection and highlights above raw white are not modelled; fitting and evaluation use the camera\'s range (colors a Standard rendering can contain); outside it the slot\'s change is extrapolated linearly from the range boundary','Hue-selective, raised-black and nonmonotone cube functions may fit poorly','Holdout random colors never select parameters; endpoints are separately reported'];
const METHOD='bounded Q13 row-sum search + weighted isotonic 65/257-node Q14 curves; Rust/WASM v3; camera chain: inverse YCbCrOperation/gamma/MultiAxial latent, M·Bstd⁻¹, MultiAxial, firmware working tables H=F∘G, YCbCrOperation; holdout and endpoints on the camera\'s range';
let initialized:Promise<unknown>|undefined;
async function ready(options:FitOptions) {
  initialized??=(async()=>{
    const bytes=options.wasmBytes??await (async()=>{
      const response=await fetch(options.wasmUrl??new URL('../wasm/gr_firmware_fit_bg.wasm',import.meta.url));
      if(!response.ok)throw new Error(`Fit WASM fetch failed: ${response.status}`);
      return response.arrayBuffer();
    })();
    if(await sha256(new Uint8Array(bytes))!==FIT_WASM_SHA256)throw new Error('Fit WASM integrity differs');
    return initialize({module_or_path:bytes});
  })().catch(error=>{initialized=undefined;throw error;});
  await initialized;
}
async function sha256(bytes:Uint8Array):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),b=>b.toString(16).padStart(2,'0')).join('');}
function tokens(line:string):string[] {
  const out:string[]=[];let token='',started=false,quote='';
  for(let i=0;i<line.length;i++){
    const c=line[i];if(quote){if(c===quote){quote='';continue;}if(c==='\\'&&quote==='"'&&(line[i+1]==='"'||line[i+1]==='\\')){token+=line[++i];continue;}token+=c;continue;}
    if(c==='#')break;if(/\s/.test(c)){if(started){out.push(token);token='';started=false;}continue;}
    started=true;if(c==='"'||c==="'"){quote=c;continue;}if(c==='\\'){token+=line[++i];continue;}token+=c;
  }
  if(started)out.push(token);return out;
}
/** Validates the product subset first, then keeps original rows as float64. */
export function parseCube(input:string|Uint8Array):ParsedCube {
  const bytes=typeof input==='string'?new TextEncoder().encode(input):input.slice();const metadata=validateCube(bytes),values=new Float64Array(metadata.row_count*3);let i=0;
  for(const line of decodeUTF8(bytes).split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)){
    const parts=tokens(line);if(!parts.length||['TITLE','LUT_3D_SIZE','DOMAIN_MIN','DOMAIN_MAX'].includes(parts[0]))continue;
    for(const value of parts)values[i++]=Number(value);
  }
  if(i!==values.length||values.some(x=>!Number.isFinite(x)||x<0||x>1))throw new Error('Invalid exact cube rows');
  return {size:metadata.size,values,bytes};
}
/** Exact file samples, R-fastest trilinear interpolation; no author-state path. */
export function sampleCube(cube:Pick<ParsedCube,'size'|'values'>,rgb:ArrayLike<number>):Float64Array {
  if(rgb.length%3)throw new Error('RGB length must be a multiple of three');
  const out=new Float64Array(rgb.length),n=cube.size;
  for(let at=0;at<rgb.length;at+=3){
    const z=[rgb[at],rgb[at+1],rgb[at+2]].map(v=>{if(!Number.isFinite(v))throw new Error('Nonfinite RGB');return CLIP(v)*(n-1);}),i=z.map(v=>Math.min(Math.floor(v),n-2)),t=z.map((v,c)=>v-i[c]);
    for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++){
      const weight=(r?t[0]:1-t[0])*(g?t[1]:1-t[1])*(b?t[2]:1-t[2]),index=(((i[2]+b)*n+i[1]+g)*n+i[0]+r)*3;
      for(let c=0;c<3;c++)out[at+c]+=weight*cube.values[index+c];
    }
  }
  return out;
}
function interp(x:number,xs:number[],ys:number[]):number {
  if(x<=xs[0])return ys[0];const n=xs.length-1;if(x>=xs[n])return ys[n];let lo=0,hi=n;while(hi-lo>1){const mid=(hi+lo)>>1;if(xs[mid]<=x)lo=mid;else hi=mid;}return ys[lo]+(x-xs[lo])*(ys[hi]-ys[lo])/(xs[hi]-xs[lo]);
}
function grid(x:number,ys:number[]):number{const z=CLIP(x)*(ys.length-1),i=Math.min(Math.floor(z),ys.length-2);return ys[i]+(z-i)*(ys[i+1]-ys[i]);}
/** Mandatory numeric constraints before any recipe enters firmware generation. */
export function validateRecipe(input:Recipe):Recipe {
  if(!input||!Array.isArray(input.matrix_q13)||input.matrix_q13.length!==3||!Array.isArray(input.curves_q14)||input.curves_q14.length!==3)throw new Error('Expected 3x3 matrix and three equal-length 65/257-node curves');
  for(const row of input.matrix_q13){if(!Array.isArray(row)||row.length!==3||row.some(v=>!Number.isInteger(v)||v< -32768||v>32767)||row.reduce((a,b)=>a+b,0)!==8192)throw new Error('Invalid Q13 matrix or neutral-axis row sum');}
  for(const row of input.curves_q14){if(!Array.isArray(row)||![65,257].includes(row.length)||row.length!==input.curves_q14[0].length||row[0]!==0||row.some((v,i)=>!Number.isInteger(v)||v<0||v>16384||(i>0&&(v<row[i-1]||v-row[i-1]>65536/(row.length-1)))))throw new Error('Invalid monotone/slope-bounded Q14 curve');}
  return {matrix_q13:input.matrix_q13.map(r=>r.slice()),curves_q14:input.curves_q14.map(r=>r.slice())};
}
export async function recipeHash(recipe:Recipe):Promise<string>{
  const valid=validateRecipe(recipe),bytes=new Uint8Array(9*2+valid.curves_q14.flat().length*2),view=new DataView(bytes.buffer);let i=0;
  for(const v of valid.matrix_q13.flat()){view.setInt16(i,v,true);i+=2;}for(const v of valid.curves_q14.flat()){view.setUint16(i,v,true);i+=2;}return sha256(bytes);
}
/** The camera chain on a display value of the developed photo: inverse gamma -> `M·Bstd⁻¹` -> clip -> working table `H=F∘G`. `matrix` is scaled to 1, `curves` to 0..1. */
function evaluate(rgb:ArrayLike<number>,matrix:number[][],curves:number[][]):{values:Float64Array;clipped:number} {
  const values=new Float64Array(rgb.length),chain:CameraChain={matrix:cameraMatrix(matrix,1),tables:workingTables(curves,1)};let clipped=0;
  for(let at=0;at<rgb.length;at+=3){
    const x=[rgb[at],rgb[at+1],rgb[at+2]];for(const v of matrixStage(latent(x),chain))if(v<0||v>1)clipped++;
    values.set(cameraPixel(x,chain),at);
  }
  return {values,clipped};
}
/** The chain from Standard matrix outputs (the RAW worker's latent) instead of developed-photo values; GR Preview renders this on the GPU. */
export function evaluateLatent(z:ArrayLike<number>,recipe:Recipe):Float64Array {
  if(z.length%3||Array.from(z).some(v=>!Number.isFinite(v)))throw new Error('Invalid latent input');const checked=validateRecipe(recipe),chain:CameraChain={matrix:cameraMatrix(checked.matrix_q13),tables:workingTables(checked.curves_q14)},values=new Float64Array(z.length);
  for(let at=0;at<z.length;at+=3)values.set(toneStage(matrixStage([z[at],z[at+1],z[at+2]],chain),chain),at);
  return values;
}
/** Fitter inputs for a cube: each training color's latent, mapped by `Bstd⁻¹`, and the cube's value at the color the camera renders from that latent
 * (the color itself when the camera can produce it, otherwise its projection), with YCbCrOperation inverted; the Rust search then runs on the matrix
 * and curve stages only. */
export function fitInputs(cube:Pick<ParsedCube,'size'|'values'>):{latent:Float64Array;target:Float64Array} {
  const points=training_points(),latents=new Float64Array(points.length),target=new Float64Array(points.length);
  for(let at=0;at<points.length;at+=3){
    const z=latent([points[at],points[at+1],points[at+2]]);
    for(let c=0;c<3;c++)latents[at+c]=(BSTD_INVERSE[c][0]*z[0]+BSTD_INVERSE[c][1]*z[1])+BSTD_INVERSE[c][2]*z[2];
    target.set(ycbcrInverse(Array.from(sampleCube(cube,renderLatent(z,STANDARD_CHAIN)))),at);
  }
  return {latent:latents,target};
}
export const MULTIAXIAL_CONSTANTS=new Float64Array([...MODEL.multiaxial.r0_q10.flat().map(v=>v/1024),...MODEL.multiaxial.knots,...MODEL.multiaxial.values,...MODEL.multiaxial.slopes,MODEL.multiaxial.divisor]);
export function evaluateRecipe(rgb:ArrayLike<number>,recipe:Recipe):Float64Array {
  if(rgb.length%3||Array.from(rgb).some(v=>!Number.isFinite(v)))throw new Error('Invalid RGB input');const checked=validateRecipe(recipe);
  return evaluate(rgb,checked.matrix_q13.map(r=>r.map(v=>v/8192)),checked.curves_q14.map(r=>r.map(v=>v/16384))).values;
}
export function metrics(candidate:ArrayLike<number>,target:ArrayLike<number>,clipped=0):Metrics {
  if(candidate.length!==target.length||!candidate.length||candidate.length%3)throw new Error('Invalid metric vectors');
  let squared=0,maximum=0;const perPixel:number[]=[];
  for(let at=0;at<candidate.length;at+=3){let pixel=0;for(let c=0;c<3;c++){const error=(candidate[at+c]-target[at+c])*255;if(!Number.isFinite(error))throw new Error('Nonfinite fit evaluation');squared+=error*error;pixel+=error*error;maximum=Math.max(maximum,Math.abs(error));}perPixel.push(Math.sqrt(pixel/3));}
  perPixel.sort((a,b)=>a-b);const position=(perPixel.length-1)*.95,i=Math.floor(position),p95=perPixel[i]+(position-i)*((perPixel[i+1]??perPixel[i])-perPixel[i]);
  return {rmse_8bit:Math.sqrt(squared/candidate.length),p95_8bit:p95,max_8bit:maximum,clipped_channel_fraction:clipped/candidate.length,samples:candidate.length/3};
}
/** 4096 xorshift32 colors projected onto the camera's range (`onRange`). */
export function holdoutSamples(seed=72226,count=4096):Float64Array {
  let state=seed>>>0;const out=new Float64Array(count*3);
  for(let i=0;i<out.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;out[i]=(state+.5)/4294967296;}
  return onRange(out);
}
/** Evaluation colors on the camera's range: each color replaced by the Standard rendering of its latent (itself when the camera can produce it). */
function onRange(rgb:Float64Array):Float64Array {
  const out=new Float64Array(rgb.length);
  for(let at=0;at<rgb.length;at+=3)out.set(renderLatent(latent([rgb[at],rgb[at+1],rgb[at+2]]),STANDARD_CHAIN),at);
  return out;
}
const endpoints=onRange(new Float64Array([0,0,0,1,0,0,0,1,0,0,0,1,1,1,0,1,0,1,0,1,1,1,1,1]));
/** Rust fitting plus independent holdout/endpoint evaluation against exact cube. */
export async function fitCube(input:string|Uint8Array,options:FitOptions={}):Promise<FitResult> {
  const cube=parseCube(input),nodes=options.nodes??257;if(![65,257].includes(nodes))throw new Error('Curve nodes must be 65 or 257');await ready(options);
  const inputs=fitInputs(cube),result=fit_cube(inputs.latent,inputs.target,nodes,new Float64Array(MODEL.gamma),MULTIAXIAL_CONSTANTS,new Float64Array(SEED_MATRICES_Q13.flat(2)));
  if(result.length!==18+6*nodes||result.some(v=>!Number.isFinite(v)))throw new Error('Fitter did not produce a finite recipe');
  const rows=(offset:number,width:number)=>Array.from({length:3},(_,i)=>Array.from(result.slice(offset+i*width,offset+(i+1)*width)));
  const floatMatrix=rows(0,3),floatCurves=rows(9,nodes),recipe=validateRecipe({matrix_q13:rows(9+3*nodes,3),curves_q14:rows(18+3*nodes,nodes)});
  const samples=holdoutSamples(),target=sampleCube(cube,samples),float=evaluate(samples,floatMatrix,floatCurves),quantized=evaluate(samples,recipe.matrix_q13.map(r=>r.map(v=>v/8192)),recipe.curves_q14.map(r=>r.map(v=>v/16384))),ends=evaluate(endpoints,recipe.matrix_q13.map(r=>r.map(v=>v/8192)),recipe.curves_q14.map(r=>r.map(v=>v/16384)));
  const holdout=metrics(quantized.values,target,quantized.clipped),limits=options.limits;
  if(limits&&Object.entries(limits).some(([k,v])=>!['rmse_8bit','p95_8bit','max_8bit','clipped_channel_fraction'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('Invalid fit quality limits');
  const report:FitReport={schema:'gr-native-cube-fit/v1',input_cube_sha256:await sha256(cube.bytes),recipe_sha256:await recipeHash(recipe),fit_sha256:'',model_sha256:MODEL.model_sha256,wasm_sha256:FIT_WASM_SHA256,rust_source_sha256:FIT_RUST_SOURCE_SHA256,evaluator_source_sha256:FIT_EVALUATOR_SOURCE_SHA256,method:METHOD,reference_kind:'exact_serialized_cube_trilinear',review_required:true,camera_calibrated:false,
    holdout,endpoints:metrics(ends.values,sampleCube(cube,endpoints),ends.clipped),float_candidate:metrics(float.values,target,float.clipped),quantization:metrics(quantized.values,float.values),training_samples:3034,holdout_seed:72226,samples_sha256:await sha256(new Uint8Array(samples.buffer)),cube_size:cube.size,curve_nodes:nodes,
    ...(limits?{quality_limits:{...limits},limits_pass:Object.entries(limits).every(([k,v])=>holdout[k as keyof Limits]<=v!)}:{}),
    quantization_scope:'Matrix quantization, final curve refit and Q14 quantization vs selected floating candidate',
    metric:'display-sRGB 8-bit code values; p95 per-pixel RGB RMSE, max absolute channel error; not DeltaE',
    constraints:['signed int16 Q13; matrix row sums exactly 8192',`${nodes} monotone Q14 nodes, black=0, max node step=${65536/(nodes-1)}; white need not be 16384`],
    limitations:LIMITATIONS};
  report.fit_sha256=await sha256(new TextEncoder().encode(JSON.stringify({...report,fit_sha256:undefined})));
  return {...recipe,report};
}
/** Bind an accepted approximation to its exact cube, recipe and implementation. */
export async function verifyFitResult(result:FitResult,input:string|Uint8Array):Promise<void> {
  const cube=parseCube(input),report=result.report;
  if(!report||report.schema!=='gr-native-cube-fit/v1'||report.model_sha256!==MODEL.model_sha256||report.wasm_sha256!==FIT_WASM_SHA256||report.rust_source_sha256!==FIT_RUST_SOURCE_SHA256||report.evaluator_source_sha256!==FIT_EVALUATOR_SOURCE_SHA256)throw new Error('Fit implementation/model identity differs');
  if(report.input_cube_sha256!==await sha256(cube.bytes)||report.recipe_sha256!==await recipeHash(result)||report.curve_nodes!==result.curves_q14[0].length)throw new Error('Fit cube or recipe identity differs');
  const hash=await sha256(new TextEncoder().encode(JSON.stringify({...report,fit_sha256:undefined})));
  if(report.fit_sha256!==hash)throw new Error('Fit report identity differs');
  // A self-hash cannot establish the truth of imported error figures.
  const nodes=result.curves_q14[0].length,samples=holdoutSamples();
  const predict=(rgb:Float64Array)=>evaluate(rgb,result.matrix_q13.map(r=>r.map(v=>v/8192)),result.curves_q14.map(r=>r.map(v=>v/16384)));
  const prediction=predict(samples),ends=predict(endpoints);
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const validMetric=(value:any,count:number)=>value&&Object.keys(value).sort().join(',')==='clipped_channel_fraction,max_8bit,p95_8bit,rmse_8bit,samples'&&value.samples===count&&['rmse_8bit','p95_8bit','max_8bit','clipped_channel_fraction'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0)&&value.clipped_channel_fraction<=1&&value.rmse_8bit<=value.max_8bit&&value.p95_8bit<=value.max_8bit;
  const sameMetric=(value:any,expected:Metrics)=>validMetric(value,expected.samples)&&Object.entries(expected).every(([key,v])=>value[key]===v);
  if(!sameMetric(report.holdout,metrics(prediction.values,sampleCube(cube,samples),prediction.clipped))||!sameMetric(report.endpoints,metrics(ends.values,sampleCube(cube,endpoints),ends.clipped)))throw new Error('Fit independently evaluated error metrics differ');
  if(report.method!==METHOD||report.reference_kind!=='exact_serialized_cube_trilinear'||report.review_required!==true||report.camera_calibrated!==false||report.training_samples!==3034||report.holdout_seed!==72226||report.samples_sha256!==await sha256(new Uint8Array(samples.buffer))||report.cube_size!==cube.size)throw new Error('Fit evaluation scope or sample identity differs');
  if(report.quantization_scope!=='Matrix quantization, final curve refit and Q14 quantization vs selected floating candidate'||report.metric!=='display-sRGB 8-bit code values; p95 per-pixel RGB RMSE, max absolute channel error; not DeltaE'||!same(report.constraints,['signed int16 Q13; matrix row sums exactly 8192',`${nodes} monotone Q14 nodes, black=0, max node step=${65536/(nodes-1)}; white need not be 16384`])||!same(report.limitations,LIMITATIONS))throw new Error('Fit metric definition or limitations differ');
  // Floating candidate parameters are not serialized. These diagnostics are
  // structurally checked but never decide the installed recipe's limits.
  if(!validMetric(report.float_candidate,4096)||!validMetric(report.quantization,4096))throw new Error('Invalid floating-candidate diagnostic metrics');
  const limits=report.quality_limits;
  if(limits!==undefined){if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.entries(limits).some(([k,v])=>!['rmse_8bit','p95_8bit','max_8bit','clipped_channel_fraction'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<0)||report.limits_pass!==Object.entries(limits).every(([k,v])=>report.holdout[k as keyof Limits]<=Number(v)))throw new Error('Fit quality limits or result differ');}
  else if(report.limits_pass!==undefined)throw new Error('Fit quality result has no limits');
}
