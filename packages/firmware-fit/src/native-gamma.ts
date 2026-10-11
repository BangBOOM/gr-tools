/** Versioned scalar transcription of isolated native gamma 0x536e7b64.
 * Not a full ISP, a native CPU emulator or a camera accuracy claim.
 */
import model from '../fixtures/native-gamma-model.json' with {type:'json'};
export const NATIVE_GAMMA_VERSION='gr3-native-gamma-scalar/v1';
export const NATIVE_GAMMA_MODEL=model;
export type NativeGammaOptions={key?:number;contrast?:number;highlight?:number;shadow?:number;flag?:number;exposure?:number};
function integer(value:number,low:number,high:number):number {if(typeof value!=='number'||!Number.isInteger(value)||value<low||value>high)throw new Error('Native gamma integer parameter outside bounds');return value;}
function mix(a:number,b:number,weight:number):number{return Math.floor((weight*a+(512-weight)*b+256)/512);}
export function generateNativeGamma(input:NativeGammaOptions={}):Uint16Array {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['key','contrast','highlight','shadow','flag','exposure'].includes(k)))throw new Error('Invalid native gamma parameters');
  const {key=0,contrast=0,highlight=0,shadow=0,flag=0,exposure=8832}=input;
  for(const knob of [key,contrast,highlight,shadow])integer(knob,-4,4);integer(flag,0,1);integer(exposure,1,65535);
  const seed=model.key_seeds[key+4],pivot=Math.max(128,Math.min(2048,Math.floor(seed*(flag?1:2)*exposure/8192))),lo=pivot<256?0:pivot<512?1:pivot<1024?2:3,hi=lo+1,anchor=pivot===2048?128:Math.floor(pivot/16),constant=model.normalization_constant;
  const shapes=[highlight,0,-shadow].map(adjustment=>{
    const t=2*contrast+adjustment;let g0:number,g1:number,weight:number;
    if(t>12){g0=0;g1=1;weight=512;}else if(t>0){g0=0;g1=1;weight=Math.trunc(t*512/12);}else if(t>=-12){g0=1;g1=2;weight=Math.trunc((t+12)*512/12);}else{g0=1;g1=2;weight=0;}
    const a=model.families[g0][lo].map((v,i)=>mix(v,model.families[g1][lo][i],weight)),b=model.families[g0][hi].map((v,i)=>mix(v,model.families[g1][hi][i],weight)),av=a[anchor],bv=b[anchor],target=(118*constant)&65535;
    const cross=av>bv?(bv>=target?0:Math.trunc((target-bv)*512/(av-bv))):512;
    return a.slice(0,256).map((v,i)=>mix(v,b[i],cross));
  });
  const output=new Uint16Array(256),denominator=0x3f02*Math.floor(constant/64);
  if(!denominator)throw new Error('Native gamma normalization is zero');
  for(let i=0;i<256;i++){
    const x=i*16,other=shapes[pivot>=x?2:0][i];let y=shapes[1][i];
    if(pivot<x&&highlight){if(x>=4*pivot)y=other;else{const index=Math.max(0,Math.min(96,Math.trunc(i*2*256/pivot)-32)),weight=model.blend_q11[index];y=Math.floor((weight*other+(2048-weight)*y+1024)/2048);}}
    if(pivot>x&&shadow){if(x<=Math.floor(pivot/4))y=other;else{const index=Math.max(0,Math.min(96,Math.trunc(pivot*32/x)-32)),weight=model.blend_q11[index];y=Math.floor((weight*other+(2048-weight)*y+1024)/2048);}}
    const q=Math.min(16384,Math.trunc(y*16384/denominator));if(q<0||!Number.isFinite(q))throw new Error('Native gamma output outside Q14 bounds');output[i]=q;
  }
  return output;
}
