/** Browser-safe, deterministic author function on the eight camera starting styles. No camera fitting. */
import asset from './assets/model.json' with { type: 'json' };
export const MODEL = asset;
import {cameraChain,cameraPixel} from './camera.ts';
import type {CameraChain} from './camera.ts';
export const PRESETS = asset.presets;
export const PALETTES = asset.palettes;
export const VALUE_KEYS = ['brightness','contrast','saturation','warmth','tint','shadows','highlights','vibrance','whites','blacks','fade'] as const;
export const FILM_KEYS = ['highlight_softness','shadow_depth','chroma_compression','shadow_saturation','midtone_saturation','highlight_saturation'] as const;
export const MIXER_KEYS = ['red','orange','yellow','green','aqua','blue','purple','magenta'] as const;
export const CURVE_KEYS = ['master','red','green','blue'] as const;
const BASES = Object.keys(asset.matrices);
const ZONES = ['shadows','midtones','highlights'] as const;
const AXIS = [0,.25,.5,.75,1];
const WEIGHTS = [.2126,.7152,.0722];
export type Base = 'original'|'vivid'|'nega'|'posi'|'gold'|'tungsten'|'ektar'|'metro';
export type Matrix = {from: Base; to: Base; mix: number; offset: number[]; neutral_lock: boolean; model_sha256: string};
export type State = {base: Base; values: Record<typeof VALUE_KEYS[number],number>; curves: Record<typeof CURVE_KEYS[number],number[]>; curve_interpolation: 'linear'|'smooth'; film: Record<typeof FILM_KEYS[number],number>; mixer: Record<typeof MIXER_KEYS[number],{hue:number;saturation:number;luminance:number}>; grading: {balance:number;shadows:{hue:number;saturation:number};midtones:{hue:number;saturation:number};highlights:{hue:number;saturation:number}}; style:{palette:keyof typeof PALETTES;tone:number;color:number;intensity:number};strength:number;builtin_model_sha256?:string;matrix?:Matrix};
type Obj = Record<string, any>;
const get = (d:Obj,k:string,fallback:any):any => Object.hasOwn(d,k)?d[k]:fallback;
const clip = (x:number) => Math.min(1,Math.max(0,x));
const mod = (x:number,n:number) => ((x%n)+n)%n;
const dot = (a:ArrayLike<number>,b:ArrayLike<number>) => (a[0]*b[0]+a[1]*b[1])+a[2]*b[2];
function object(x:unknown, keys?:readonly string[]):Obj {
  if (!x || typeof x!=='object' || Array.isArray(x) || (keys && Object.keys(x).some(k=>!keys.includes(k)))) throw new Error('Invalid color object');
  return x as Obj;
}
/** Python round(float, 6): round the exact IEEE binary value, ties to even. */
export function round6(x:number):number {
  if (x===0) return x;
  const buffer = new ArrayBuffer(8), view = new DataView(buffer);
  view.setFloat64(0,Math.abs(x));
  const bits = view.getBigUint64(0), exponent = Number((bits>>52n)&2047n);
  let mantissa = bits & ((1n<<52n)-1n);
  if (exponent) mantissa |= 1n<<52n;
  const power = (exponent ? exponent-1023 : -1022)-52;
  let numerator = mantissa*1000000n, denominator = 1n;
  if (power>=0) numerator <<= BigInt(power); else denominator <<= BigInt(-power);
  let q = numerator/denominator;
  const twice = (numerator%denominator)*2n;
  if (twice>denominator || (twice===denominator && (q&1n)===1n)) q++;
  const result = Number(q)/1000000;
  return x<0 ? -result : result;
}
function number(x:unknown,low=-100,high=100):number {
  if(typeof x!=='number'||!Number.isFinite(x)||x<low||x>high) throw new Error(`Color number must be ${low}..${high}`);
  return round6(x);
}
function numbers(input:Obj, keys:readonly string[], low=-100):Obj { return Object.fromEntries(keys.map(k=>[k,number(get(input,k,0),low)])); }
/** Normalize old editor states; absent interpolation intentionally remains linear. */
export function normalizeState(input:unknown):State {
  const d=object(input), base=get(d,'base','original');
  if(!BASES.includes(base)) throw new Error('Unknown base');
  const values=numbers(object(get(d,'values',{}),VALUE_KEYS),VALUE_KEYS);
  const c=object(get(d,'curves',{}),CURVE_KEYS), curves:Obj={};
  for(const k of CURVE_KEYS) {
    const points=get(c,k,AXIS);
    if(!Array.isArray(points)||points.length!==5) throw new Error('Each curve needs five points');
    curves[k]=points.map(p=>number(p,0,1));
  }
  const interpolation=get(d,'curve_interpolation','linear');
  if(!['linear','smooth'].includes(interpolation)) throw new Error('Unknown curve interpolation');
  const f=object(get(d,'film',{}),FILM_KEYS), film:Obj={};
  for(const k of FILM_KEYS) film[k]=number(get(f,k,0),['highlight_softness','chroma_compression'].includes(k)?0:-100);
  const mx=object(get(d,'mixer',{}),MIXER_KEYS), mixer:Obj={};
  for(const k of MIXER_KEYS) mixer[k]=numbers(object(get(mx,k,{}),['hue','saturation','luminance']),['hue','saturation','luminance']);
  const g=object(get(d,'grading',{}),[...ZONES,'balance']), grading:Obj={balance:number(get(g,'balance',0))};
  for(const k of ZONES) {const p=object(get(g,k,{}),['hue','saturation']);grading[k]={hue:number(get(p,'hue',0),0,360),saturation:number(get(p,'saturation',0),0,100)};}
  const s=object(get(d,'style',{}),['palette','tone','color','intensity']), palette=get(s,'palette','neutral');
  if(!Object.hasOwn(PALETTES,palette)) throw new Error('Unknown palette');
  const state:Obj={base,values,curves,curve_interpolation:interpolation,film,mixer,grading,style:{palette,tone:number(get(s,'tone',0)),color:number(get(s,'color',0)),intensity:number(get(s,'intensity',100),0,100)},strength:number(get(d,'strength',100),0,100)};
  if(base==='nega'||base==='posi') {
    if((get(d,'builtin_model_sha256',MODEL.legacy.builtin_model_sha256))!==MODEL.legacy.builtin_model_sha256) throw new Error('Native model identity differs');
    state.builtin_model_sha256=MODEL.legacy.builtin_model_sha256;
  }
  if(Object.hasOwn(d,'matrix')) {
    const m=object(d.matrix,['from','to','mix','offset','neutral_lock','model_sha256']);
    const left=get(m,'from',base), right=get(m,'to',base);
    if(!BASES.includes(left)||!BASES.includes(right)) throw new Error('Unknown matrix');
    const offset=get(m,'offset',Array(9).fill(0));
    if(!Array.isArray(offset)||offset.length!==9) throw new Error('Matrix offset needs nine numbers');
    const lock=get(m,'neutral_lock',true);
    if(typeof lock!=='boolean') throw new Error('Neutral lock must be boolean');
    if((get(m,'model_sha256',MODEL.legacy.matrix_model_sha256))!==MODEL.legacy.matrix_model_sha256) throw new Error('Matrix model identity differs');
    state.matrix={from:left,to:right,mix:number(get(m,'mix',0),0,100),offset:offset.map(x=>number(x,-4,4)),neutral_lock:lock,model_sha256:MODEL.legacy.matrix_model_sha256};
    effectiveMatrix(state.matrix);
  }
  return state as State;
}
/** Fresh UI defaults differ deliberately from missing-field legacy defaults. */
export function defaultState():State {return normalizeState({curve_interpolation:'smooth'});}
export function effectiveMatrix(config:Matrix):number[][] {
  const a=MODEL.matrices[config.from].matrix_q13,b=MODEL.matrices[config.to].matrix_q13,t=config.mix/100;
  const q=a.map((row,i)=>row.map((v,j)=>Math.floor((((1-t)*v+t*b[i][j])/8192+config.offset[i*3+j])*8192+.5)));
  if(config.neutral_lock) for(let i=0;i<3;i++) q[i][i]=8192-q[i].reduce((s,v,j)=>s+(j===i?0:v),0);
  if(q.flat().some(v=>v< -32768||v>32767)) throw new Error('Matrix exceeds Q13 int16 range');
  return q;
}
export type Recipe = {state:State;matrix_q13:number[][];curves_q14:number[][]};
/** Author values as a Q13/Q14 recipe on top of the camera starting style: saturation in the matrix, tone in the curves. */
export function baseRecipe(input:unknown):Recipe {
  const state=normalizeState(input),v=Object.fromEntries(VALUE_KEYS.map(k=>[k,state.values[k]/100]));
  const sat=1+.65*v.saturation, q=[0,1,2].map(i=>[0,1,2].map(j=>Math.floor((sat*(i===j?1:0)+(1-sat)*WEIGHTS[j])*8192+.5)));
  for(let i=0;i<3;i++) q[i][i]=8192-q[i].reduce((s,x,j)=>s+(j===i?0:x),0);
  const gain=2**(1.25*v.brightness),balances=[2**(.22*v.warmth+.09*v.tint),2**(-.14*v.tint),2**(-.22*v.warmth+.09*v.tint)],exponent=2**(.65*v.contrast);
  const f=[0,1,2].map(channel=>{
    let maximum=0;
    return Array.from({length:257},(_,i)=>{
      let z=i/256;
      const a=z**exponent,b=(1-z)**exponent;
      z=a/Math.max(a+b,1e-12);
      z=z+.65*v.shadows*z*(1-z)**2+.65*v.highlights*z**2*(1-z);
      maximum=Math.max(maximum,clip(z*gain*balances[channel]));
      return i===0?0:Math.floor(maximum*16384+.5);
    });
  });
  return {state,matrix_q13:q,curves_q14:f};
}
function interp(x:number,xs:readonly number[],ys:readonly number[]):number {
  if(x<=xs[0])return ys[0];const n=xs.length-1;if(x>=xs[n])return ys[n];
  let lo=0,hi=n;while(hi-lo>1){const mid=(lo+hi)>>1;if(xs[mid]<=x)lo=mid;else hi=mid;}
  return ys[lo]+(x-xs[lo])*((ys[hi]-ys[lo])/(xs[hi]-xs[lo]));
}
function gridInterp(x:number,ys:readonly number[]):number {
  if(x<=0)return ys[0];if(x>=1)return ys[256];const z=x*256,i=Math.floor(z);return ys[i]+(z-i)*(ys[i+1]-ys[i]);
}
function recipeTransform(x:number[],recipe:Recipe):number[] {
  const m=recipe.matrix_q13,curves=recipe.curves_q14;
  if(m.every((r,i)=>r.every((v,j)=>v===(i===j?8192:0)))&&curves.every(r=>r.every((v,i)=>v===i*64)))return x.map(clip);
  const latent=x.map(v=>interp(v,MODEL.inverse_x,MODEL.inverse_y)),z=m.map(row=>gridInterp(clip(dot(latent,row)/8192),MODEL.gamma));
  return z.map((v,c)=>gridInterp(v,curves[c])/16384);
}
export function rgbToHsl(rgb:ArrayLike<number>):number[] {
  const high=Math.max(...Array.from(rgb)),low=Math.min(...Array.from(rgb)),delta=high-low,l=(high+low)/2;
  const s=delta>1e-12&&l>0&&l<1?delta/(1-Math.abs(2*l-1)):0;let h=0;
  for(const [channel,offset] of [[2,4],[1,2],[0,0]]) if(rgb[channel]===high&&delta>1e-12) h=((rgb[(channel+1)%3]-rgb[(channel+2)%3])/Math.max(delta,1e-12)+offset)/6;
  return [mod(h,1),clip(s),l];
}
function hsl(h:number,s:number,l:number):number[] {
  const chroma=(1-Math.abs(2*l-1))*s,hh=h*6,second=chroma*(1-Math.abs(mod(hh,2)-1)),c=[[chroma,second,0],[second,chroma,0],[0,chroma,second],[0,second,chroma],[second,0,chroma],[chroma,0,second]];
  return c[mod(Math.floor(hh),6)].map(v=>v+l-chroma/2);
}
export function curve(x:number,points:readonly number[],interpolation:'linear'|'smooth'='linear'):number {
  if(points.every((p,i)=>p===AXIS[i]))return x;
  if(interpolation==='linear')return interp(x,AXIS,points);
  const d=points.slice(1).map((v,i)=>(v-points[i])*4),slopes=[0,0,0,0,0];
  for(let i=1;i<4;i++)if(d[i-1]*d[i]>0)slopes[i]=2*d[i-1]*d[i]/(d[i-1]+d[i]);
  for(const [i,first,second] of [[0,d[0],d[1]],[4,d[3],d[2]]]){const slope=(3*first-second)/2;slopes[i]=slope*first<=0?0:Math.sign(first)*Math.min(Math.abs(slope),3*Math.abs(first));}
  const z=clip(x)*4,i=Math.min(Math.trunc(z),3),t=z-i;
  return (2*t**3-3*t**2+1)*points[i]+(t**3-2*t**2+t)*slopes[i]/4+(-2*t**3+3*t**2)*points[i+1]+(t**3-t**2)*slopes[i+1]/4;
}
function gamut(delta:number[],light:number,upper=1):number {
  return Math.min(upper,...delta.map(v=>Math.abs(v)>1e-12?(v>0?1-light:light)/Math.abs(v):Infinity));
}
function filmResponse(rgb:number[],controls:State['film']):number[] {
  if(!FILM_KEYS.some(k=>controls[k]))return rgb;
  let result=rgb.slice();const depth=controls.shadow_depth/100,softness=controls.highlight_softness/100;
  if(depth||softness){
    const light=dot(result,WEIGHTS);let target=light-.65*depth*light*(1-light)**3;
    if(softness&&target>.6)target=.6+.4*Math.log1p(2*softness*Math.max(target-.6,0)/.4)/(2*softness);
    result=result.map(v=>v*(light>1e-12?target/light:1));
    const delta=result.map(v=>v-target),scale=gamut(delta,target);result=delta.map(v=>target+v*scale);
  }
  if(FILM_KEYS.slice(2).some(k=>controls[k])){
    const light=dot(result,WEIGHTS),delta=result.map(v=>v-light),zone=[(1-light)**2,2*light*(1-light),light**2],amounts=FILM_KEYS.slice(3).map(k=>controls[k]/100);
    let desired=Math.max(0,1+.8*dot(zone,amounts));
    desired/=1+2*(controls.chroma_compression/100)*Math.max(...delta.map(Math.abs))*desired;
    desired=Math.min(desired,gamut(delta,light,Infinity));result=delta.map(v=>light+v*desired);
  }
  return result.map(clip);
}
/** The starting style: the camera's rendering of the base recipe, with an authored matrix replacing the base matrix. */
function startingChain(state:State):CameraChain {
  const base=MODEL.matrices[state.base];
  return cameraChain(state.matrix?effectiveMatrix(state.matrix):base.matrix_q13,base.curves_q14);
}
function pixel(original:number[],state:State,recipe:Recipe,chain:CameraChain):number[] {
  if(state.strength===0)return original;
  let y=recipeTransform(cameraPixel(original,chain),recipe);const v=Object.fromEntries(VALUE_KEYS.map(k=>[k,state.values[k]/100]));
  y=y.map(z=>clip(z+.22*v.blacks*(1-z)**3+.22*v.whites*z**3+.18*v.fade*(1-z)**2));
  if(v.vibrance||MIXER_KEYS.some(k=>Object.values(state.mixer[k]).some(Boolean))){
    let [h,s,l]=rgbToHsl(y);const chromatic=Math.min(s*3,1);s*=1+.9*v.vibrance*(1-s);
    const centers=[0,30,60,120,180,240,275,315].map(x=>x/360),weights=centers.map(c=>Math.max(1-Math.abs(mod(h-c+.5,1)-.5)/(55/360),0)**2),sum=Math.max(weights.reduce((a,b)=>a+b,0),1e-12);
    const correction=['hue','saturation','luminance'].map(k=>weights.reduce((total,w,i)=>total+(w/sum)*(state.mixer[MIXER_KEYS[i]][k as 'hue']/100),0));
    h=mod(h+correction[0]/12,1);s=clip(s*(1+correction[1]));l=clip(l+.2*correction[2]*chromatic);y=hsl(h,s,l);
  }
  const g=state.grading;
  if(ZONES.some(k=>g[k].saturation)){
    const luma=dot(y,WEIGHTS),zone=clip(luma-.18*g.balance/100),weights=[(1-zone)**2,2*zone*(1-zone),zone**2];
    const tints=ZONES.map(k=>{const tint=hsl(mod(g[k].hue/360,1),1,.5),lum=dot(tint,WEIGHTS);return tint.map(t=>(t-lum)*(.22*g[k].saturation/100));});
    y=y.map((z,i)=>clip(z+weights.reduce((total,w,k)=>total+w*tints[k][i],0)*(.25+.75*4*luma*(1-luma))));
  }
  y=y.map((z,i)=>curve(z,state.curves[CURVE_KEYS[i+1]],state.curve_interpolation));
  y=y.map(z=>curve(z,state.curves.master,state.curve_interpolation));
  const style=state.style;
  if(style.intensity&&(style.tone||style.color||style.palette!=='neutral')){
    const tone=style.tone/100,color=style.color/100;let styled=y.map(z=>clip(z+.2*tone*z*(1-z)+.1*tone*(1-z)**2));
    const lum=dot(styled,WEIGHTS),tint=PALETTES[style.palette].color,tintLum=dot(tint,WEIGHTS);
    styled=styled.map((z,i)=>clip(lum+(z-lum)*(1+.65*color)+.065*(tint[i]-tintLum)*(.4+.6*(1-lum))));
    y=y.map((z,i)=>z+(styled[i]-z)*style.intensity/100);
  }
  y=filmResponse(y.map(clip),state.film);
  return y.map((z,i)=>clip(state.strength===100?z:original[i]+(clip(z)-original[i])*state.strength/100));
}
/** Flat RGB input (RGBRGB...), including Float32Array/Float64Array. Copies output. */
export function transformRGB(rgb:ArrayLike<number>,input:unknown):Float64Array {
  if(rgb.length%3!==0)throw new Error('RGB length must be a multiple of three');
  const recipe=baseRecipe(input),state=recipe.state,chain=startingChain(state),output=new Float64Array(rgb.length);
  for(let i=0;i<rgb.length;i+=3){const x=[rgb[i],rgb[i+1],rgb[i+2]];if(x.some(v=>!Number.isFinite(v)))throw new Error('RGB must be finite');output.set(pixel(x.map(clip),state,recipe,chain),i);}
  return output;
}
/** Bake interleaved RGB floats, red coordinate fastest, then green, then blue. */
export function bakeLut(input:unknown,size=33):Float32Array {
  if(![17,33,65].includes(size))throw new Error('LUT size must be 17, 33 or 65');
  const recipe=baseRecipe(input),state=recipe.state,chain=startingChain(state),output=new Float32Array(size**3*3);let i=0;
  for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){output.set(pixel([r/(size-1),g/(size-1),b/(size-1)],state,recipe,chain),i);i+=3;}
  return output;
}
