/** Bounded TIFF sniffing before native/WASM decoding. Only DNG enters Studio. */
export function validateDNG(bytes: Uint8Array): void {
  if(bytes.length<16 || bytes.length>100*1024*1024) throw new Error('DNG has an invalid size (maximum 100 MB)');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), le=bytes[0]===73&&bytes[1]===73;
  if(!le&&!(bytes[0]===77&&bytes[1]===77))throw new Error('Photo must be DNG RAW');
  if(v.getUint16(2,le)!==42)throw new Error('Unsupported TIFF / DNG container');
  const off=v.getUint32(4,le);
  if(off<8||off+2>bytes.length)throw new Error('Corrupt DNG directory');
  const count=v.getUint16(off,le);
  if(count>4096||off+2+count*12+4>bytes.length)throw new Error('Corrupt DNG directory');
  for(let i=0;i<count;i++){const p=off+2+i*12;
    if(v.getUint16(p,le)===50706){
      if(v.getUint16(p+2,le)!==1||v.getUint32(p+4,le)!==4||bytes[p+8]!==1)throw new Error('Invalid DNGVersion');
      return;
    }
  }
  throw new Error('Missing DNGVersion; JPEG, PNG, and ordinary TIFF files cannot be imported');
}
export type RawSettings={exposure:number;wb:'camera'|'auto'|'custom';temperature:number;tint:number};
export const rawDefaults:RawSettings={exposure:0,wb:'camera',temperature:0,tint:0};
export function validateSettings(input:RawSettings):RawSettings {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['exposure','wb','temperature','tint'].includes(k))||!['camera','auto','custom'].includes(input.wb)||Object.entries({exposure:[-2,3],temperature:[-100,100],tint:[-100,100]}).some(([k,[lo,hi]])=>typeof input[k as keyof RawSettings]!=='number'||!Number.isFinite(input[k as keyof RawSettings])||Number(input[k as keyof RawSettings])<lo||Number(input[k as keyof RawSettings])>hi))throw new Error('Invalid RAW settings');
  return {...input};
}
export function cropGeometry(m:any,width:number,height:number) {
  let x=0,y=0,w=width,h=height;
  const c=m.raw_inset_crops?.find((p:any)=>p.cwidth>0&&p.cheight>0&&p.cleft!==65535&&p.ctop!==65535);
  if(c){x=c.cleft-m.left_margin;y=c.ctop-m.top_margin;w=c.cwidth;h=c.cheight;}
  if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>width||y+h>height)throw new Error('DNG Default crop exceeds the active image');
  const flip=m.flip||0;
  if(![0,3,5,6].includes(flip))throw new Error('Mirrored DNG orientation is not supported');
  return {x,y,w,h,flip,width:flip===5||flip===6?h:w,height:flip===5||flip===6?w:h};
}
export function sourceXY(g:ReturnType<typeof cropGeometry>,x:number,y:number):[number,number]{
  if(g.flip===3)return [g.x+g.w-1-x,g.y+g.h-1-y];
  if(g.flip===5)return [g.x+g.w-1-y,g.y+x];
  if(g.flip===6)return [g.x+y,g.y+g.h-1-x];
  return [g.x+x,g.y+y];
}
/** The LibRaw WASM runtime ignores `gamm` and always encodes its RGB16 output with LibRaw's default gamma curve (power 2.222, toe slope 4.5; `gamma_curve` mode 2). Decode it to linear before the camera chain. */
export function decodeLibRaw(y:number){return y<0.0812257006?y/4.5:((y+0.0992578062)/1.0992578062)**2.222;}
export function sampleLut(lut:Float32Array,size:number,r:number,g:number,b:number,out:Float64Array){
  r=Math.max(0,Math.min(1,r))*(size-1);g=Math.max(0,Math.min(1,g))*(size-1);b=Math.max(0,Math.min(1,b))*(size-1);
  const lr=Math.floor(r),lg=Math.floor(g),lb=Math.floor(b),fr=r-lr,fg=g-lg,fb=b-lb;out.fill(0);
  for(let z=0;z<2;z++)for(let y=0;y<2;y++){
    const w=(z?fb:1-fb)*(y?fg:1-fg),i=(Math.min(lb+z,size-1)*size+Math.min(lg+y,size-1))*size*3,a=i+lr*3,c=i+Math.min(lr+1,size-1)*3;
    for(let k=0;k<3;k++)out[k]+=w*(lut[a+k]*(1-fr)+lut[c+k]*fr);
  }
}
/** Reject dimensions before LibRaw allocates/demosaics a sensor-sized result. */
export function validateDimensions(...dimensions:number[]):void {
  if(dimensions.length%2||dimensions.some(v=>!Number.isSafeInteger(v)||v<=0))throw new Error('DNG Invalid image dimensions');
  for(let i=0;i<dimensions.length;i+=2)if(dimensions[i]*dimensions[i+1]>120000000)throw new Error('DNG Resolution exceeds 120 MP');
}
/** Matches the old decoder's camera/daylight fallback and RGBG custom-WB policy. */
export function whiteBalanceOptions(metadata:any,settings:RawSettings):{useCameraWb:boolean;useAutoWb:boolean;userMul?:number[];wb_fallback_daylight:boolean} {
  const s=validateSettings(settings);
  if(s.wb==='auto')return {useCameraWb:false,useAutoWb:true,wb_fallback_daylight:false};
  const camera=metadata?.color_data?.cam_mul,daylight=metadata?.color_data?.pre_mul;
  const valid=(v:any)=>v&&v.length>=3&&[0,1,2].every(i=>typeof v[i]==='number'&&Number.isFinite(v[i])&&v[i]>0);
  const cameraValid=valid(camera),baseline=cameraValid?camera:daylight;
  if(!valid(baseline))throw new Error('DNG No usable as-shot or daylight white balance');
  if(s.wb==='camera'&&cameraValid)return {useCameraWb:true,useAutoWb:false,wb_fallback_daylight:false};
  if(s.wb==='custom'&&(typeof metadata.cdesc!=='string'||!metadata.cdesc.startsWith('RGB')))throw new Error('sensor channels do not support custom white balance; use as-shot or auto');
  const t=s.temperature/100,q=s.tint/100,shift=s.wb==='custom'?[.55*t+.18*q,-.2*q,-.55*t+.18*q,-.2*q]:[0,0,0,0];
  const userMul=shift.map((v,i)=>(Number.isFinite(baseline[i])&&baseline[i]>0?baseline[i]:baseline[1])/baseline[1]*2**v);
  if(userMul.some(v=>!Number.isFinite(v)||v<=0))throw new Error('DNG White balance multipliers are out of range');
  return {useCameraWb:false,useAutoWb:false,userMul,wb_fallback_daylight:!cameraValid};
}
export function validateLut(lut:Float32Array,size:number):void {
  if(!(lut instanceof Float32Array)||![17,33,65].includes(size)||lut.length!==size**3*3||lut.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid export LUT');
}
