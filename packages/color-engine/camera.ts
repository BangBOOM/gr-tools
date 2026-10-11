/** Camera chain shared by the author function, the fit evaluator, the fitter, the RAW worker and GR Preview (reports 58, 59, CJ, CK, CL).
 *
 * Camera RGB (LibRaw `outputColor:0`: white balanced, Clip highlights) → `Bstd × D` → the Standard matrix output `z` (signed). A slot
 * programmed with `(M, F)` renders `z` as: `M·Bstd⁻¹`, MultiAxial, clip, working table `H = F∘G`, YCbCrOperation. The developed photo is the
 * Standard rendering (`M = Bstd`, `F` identity). `latent` inverts that rendering so the author function and the fit evaluator can start
 * from the developed photo. A color the camera cannot produce (dark or bright with high chroma) takes the slot's change extrapolated linearly
 * from its projection onto the camera's range (same luma, reduced chroma; `cameraPixel`), so the Standard slot is the identity on the whole cube. */
import MODEL from './assets/model.json' with { type: 'json' };
/** Standard's own matrix (mode 11, firmware `0x53dc2754`). */
export const BSTD_Q13:number[][]=MODEL.bstd_q13;
/** The common matrix D (`0x53dc2b58`, report S). `Bstd × D` equals the DNG `ColorMatrix2`. */
export const D_Q13:number[][]=MODEL.d_q13;
type Piecewise={knots:number[];values:number[];slopes:number[];divisor:number};
function inverse3(m:number[][]):number[][] {
  const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  return [[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];
}
function product(a:number[][],b:number[][]):number[][] {return a.map(row=>[0,1,2].map(j=>(row[0]*b[0][j]+row[1]*b[1][j])+row[2]*b[2][j]));}
function apply(m:number[][],v:ArrayLike<number>):number[] {return [(m[0][0]*v[0]+m[0][1]*v[1])+m[0][2]*v[2],(m[1][0]*v[0]+m[1][1]*v[1])+m[1][2]*v[2],(m[2][0]*v[0]+m[2][1]*v[1])+m[2][2]*v[2]];}
const clip=(v:number)=>Math.min(1,Math.max(0,v));
export const BSTD_INVERSE=inverse3(BSTD_Q13.map(r=>r.map(v=>v/8192)));
/** `Bstd × D`: white-balanced camera RGB to the Standard matrix output. */
export const STANDARD_MATRIX=product(BSTD_Q13.map(r=>r.map(v=>v/8192)),D_Q13.map(r=>r.map(v=>v/8192)));
const R0=MODEL.multiaxial.r0_q10.map(r=>r.map(v=>v/1024)),YCC=MODEL.ycbcr.matrix_q8.map(r=>r.map(v=>v/256)),YCC_INVERSE=inverse3(YCC);
/** Segment `k` starts at `knots[k]` with `values[k]` and slope `slopes[k]/divisor`. */
function piecewise(x:number,p:Piecewise):number {let k=0;while(k+1<p.knots.length&&p.knots[k+1]<=x)k++;return p.values[k]+p.slopes[k]*(x-p.knots[k])/p.divisor;}
function multiaxialWeight(z:readonly number[]):number {
  return piecewise(Math.min(4095,Math.max(0,Math.floor(4095*(Math.max(z[0],z[1],z[2])-Math.min(z[0],z[1],z[2]))))),MODEL.multiaxial)/2048;
}
/** MultiAxial record 0 blended by the chroma curve `h` on the signed matrix output (report CL §3). */
export function multiaxial(z:readonly number[]):number[] {const w=multiaxialWeight(z),r=apply(R0,z);return [z[0]+w*(r[0]-z[0]),z[1]+w*(r[1]-z[1]),z[2]+w*(r[2]-z[2])];}
/** Fixed-point inverse of `multiaxial`: the blend weight is at most 0.33, so eight iterations settle within 3e-4. */
function multiaxialInverse(y:readonly number[]):number[] {
  let z:number[]=[y[0],y[1],y[2]];
  for(let i=0;i<8;i++){const w=multiaxialWeight(z),r=apply(R0,z);z=[y[0]-w*(r[0]-z[0]),y[1]-w*(r[1]-z[1]),y[2]-w*(r[2]-z[2])];}
  return z;
}
/** YCbCrOperation: Cb and Cr scaled by `c(Y′)/512` over the 10-bit tone-curve luma, then clip (report CL §2). */
export function ycbcrOperation(rgb:readonly number[]):number[] {
  const ycc=apply(YCC,rgb),c=Math.max(0,piecewise(Math.floor(1023*ycc[0]+.5),MODEL.ycbcr))/512;
  return apply(YCC_INVERSE,[ycc[0],ycc[1]*c,ycc[2]*c]).map(clip);
}
/** Inverse YCbCrOperation at constant Y′. A color the camera cannot produce (its tone-curve input would leave 0..1) keeps its luma and is
 * desaturated to the gamut boundary, so the round trip is a projection onto the camera's range. */
export function ycbcrInverse(rgb:readonly number[]):number[] {
  const ycc=apply(YCC,rgb),c=piecewise(Math.floor(1023*ycc[0]+.5),MODEL.ycbcr)/512,luma=ycc[0];
  const y=apply(YCC_INVERSE,c>0?[luma,ycc[1]/c,ycc[2]/c]:ycc),d=[y[0]-luma,y[1]-luma,y[2]-luma];
  let s=1;for(const v of d){if(v>0)s=Math.min(s,(1-luma)/v);else if(v<0)s=Math.min(s,-luma/v);}
  return [luma+s*d[0],luma+s*d[1],luma+s*d[2]];
}
function interp(x:number,xs:readonly number[],ys:readonly number[]):number {
  if(x<=xs[0])return ys[0];const n=xs.length-1;if(x>=xs[n])return ys[n];
  let lo=0,hi=n;while(hi-lo>1){const mid=(lo+hi)>>1;if(xs[mid]<=x)lo=mid;else hi=mid;}
  return ys[lo]+(x-xs[lo])*((ys[hi]-ys[lo])/(xs[hi]-xs[lo]));
}
/** The developed photo back to the Standard matrix output in 0..1: inverse YCbCrOperation, inverse gamma (plateau midpoints), inverse MultiAxial. */
export function latent(rgb:readonly number[]):number[] {
  return multiaxialInverse(ycbcrInverse([clip(rgb[0]),clip(rgb[1]),clip(rgb[2])]).map(v=>interp(v,MODEL.inverse_x,MODEL.inverse_y)));
}
/** `(M/scale) · Bstd⁻¹`: the matrix a slot programmed with `M` applies to the Standard matrix output. */
export function cameraMatrix(matrix:number[][],scale=8192):number[][] {
  return matrix.map(row=>[0,1,2].map(j=>(row[0]*BSTD_INVERSE[0][j]+row[1]*BSTD_INVERSE[1][j]+row[2]*BSTD_INVERSE[2][j])/scale));
}
/** Firmware working tables `H_c[k] = F_c(G[k])`, 257 entries in 0..1, from Q14 curve values (floats in 0..1 when `scale` is 1).
 * 257-node hook `0x536e8708`: `i=v>>6, t=v&63, (ΔF·t+32)>>6`; 65-node `four49_curve65`: `i=v>>8, t=v&255, (ΔF·t+128)>>8`. The hardware then interpolates `H` over the clipped MultiAxial output. */
export function workingTables(curves:number[][],scale=16384):number[][] {
  return curves.map(curve=>{
    const F=curve.map(v=>Math.round(v*16384/scale)),n=F.length,shift=n===257?6:8,half=1<<(shift-1),mask=(1<<shift)-1;
    return MODEL.gamma.map(g=>{const v=Math.min(16384,Math.round(g*16384));if(v>=16384)return F[n-1]/16384;const i=Math.min(v>>shift,n-2),t=v&mask;return (F[i]+Math.floor(((F[i+1]-F[i])*t+half)/(mask+1)))/16384;});
  });
}
export type CameraChain={matrix:number[][];tables:number[][]};
export function cameraChain(matrix_q13:number[][],curves_q14:number[][]):CameraChain {return {matrix:cameraMatrix(matrix_q13),tables:workingTables(curves_q14)};}
function table(x:number,H:readonly number[]):number {const z=clip(x)*256,i=Math.min(Math.floor(z),255);return H[i]+(z-i)*(H[i+1]-H[i]);}
/** The slot matrix and MultiAxial on a Standard matrix output; unclipped. */
export function matrixStage(z:ArrayLike<number>,chain:CameraChain):number[] {return multiaxial(apply(chain.matrix,z));}
/** Clip, working tables and YCbCrOperation on a MultiAxial output. */
export function toneStage(m:readonly number[],chain:CameraChain):number[] {return ycbcrOperation([table(m[0],chain.tables[0]),table(m[1],chain.tables[1]),table(m[2],chain.tables[2])]);}
/** A Standard matrix output through a slot. */
export function renderLatent(z:ArrayLike<number>,chain:CameraChain):number[] {return toneStage(matrixStage(z,chain),chain);}
/** The slot's change relative to the Standard rendering of the same latent; zero for the Standard slot. */
function change(x:readonly number[],chain:CameraChain):number[] {const z=latent(x),s=renderLatent(z,STANDARD_CHAIN),y=renderLatent(z,chain);return [y[0]-s[0],y[1]-s[1],y[2]-s[2]];}
/** One developed-photo value (0..1 each) through a slot: the input plus the slot's change. A color outside the camera's range (its projection `p`
 * keeps the luma and reduces the chroma) extrapolates the change linearly from `p` along the inward direction, so the Standard slot is the identity
 * and other slots stay smooth. */
export function cameraPixel(rgb:readonly number[],chain:CameraChain):number[] {
  const x=[clip(rgb[0]),clip(rgb[1]),clip(rgb[2])],z=latent(x),p=renderLatent(z,STANDARD_CHAIN),y=renderLatent(z,chain),d=[x[0]-p[0],x[1]-p[1],x[2]-p[2]],span=Math.max(Math.abs(d[0]),Math.abs(d[1]),Math.abs(d[2]));
  if(span<=1e-3)return [clip(x[0]+(y[0]-p[0])),clip(x[1]+(y[1]-p[1])),clip(x[2]+(y[2]-p[2]))];
  const t=Math.min(1,(1/32)/span),g=change(p,chain),h=change([p[0]-t*d[0],p[1]-t*d[1],p[2]-t*d[2]],chain);
  return [clip(x[0]+g[0]+(g[0]-h[0])/t),clip(x[1]+g[1]+(g[1]-h[1])/t),clip(x[2]+g[2]+(g[2]-h[2])/t)];
}
const IDENTITY_CURVES=[0,1,2].map(()=>Array.from({length:257},(_,i)=>i*64));
/** The Standard rendering: `M = Bstd`, identity curves (`H = G`). */
export const STANDARD_CHAIN=cameraChain(BSTD_Q13,IDENTITY_CURVES);
/** The developed photo from white-balanced camera RGB. */
export function developStandard(cameraRGB:readonly number[]):number[] {return renderLatent(apply(STANDARD_MATRIX,cameraRGB),STANDARD_CHAIN);}
