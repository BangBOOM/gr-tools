/// <reference lib="webworker" />
import {validateDNG,validateSettings,cropGeometry,sourceXY,decodeLibRaw,sampleLut,whiteBalanceOptions,validateDimensions,validateLut} from './core.ts';
import {STANDARD_MATRIX,STANDARD_CHAIN,renderLatent} from '../color-engine/camera.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let cached:any=null;
async function decode(file:File,settings:any){
  validateSettings(settings);const bytes=new Uint8Array(await file.arrayBuffer());validateDNG(bytes);
  const source_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const key=source_sha256+JSON.stringify(settings);if(cached?.key===key)return cached;
  cached=null;
  const url=new URL('/vendor/libraw/index.js',scope.location.origin).href;const {default:LibRaw}=await import(/* @vite-ignore */ url);const raw=new LibRaw();
  try{
    const options:any={outputBps:16,userQual:3,useCameraWb:settings.wb!=='auto',useAutoWb:settings.wb==='auto',noAutoBright:true,outputColor:0,userFlip:0,highlight:0,expCorrec:true,expShift:2**settings.exposure,expPreser:0};
    await raw.open(bytes,options);let m=await raw.metadata(true);
    validateDimensions(m.raw_width,m.raw_height,m.width,m.height);
    const wb=whiteBalanceOptions(m,settings);
    if(wb.userMul){
      options.useCameraWb=wb.useCameraWb;options.useAutoWb=wb.useAutoWb;options.userMul=wb.userMul;
      await raw.open(new Uint8Array(await file.arrayBuffer()),options);m=await raw.metadata(true);
      validateDimensions(m.raw_width,m.raw_height,m.width,m.height);
    }
    const image=await raw.imageData();if(image.bits!==16||image.colors!==3||!(image.data instanceof Uint16Array))throw new Error('Decoder did not return RGB16');
    validateDimensions(image.width,image.height);
    if(image.data.length!==image.width*image.height*3)throw new Error('Invalid developed RGB16 pixel count');
    const g=cropGeometry(m,image.width,image.height);
    // DynamicRangeExpansion On: the camera exposes the sensor 1 EV lower and doubles the developed value; the DNG BaselineExposure is then positive (report 59).
    const gain=m.color_data.dng_levels.baseline_exposure>0?2:1;
    cached={key,image,g,gain,source_sha256,settings,sensor_width:m.raw_width,sensor_height:m.raw_height,wb_fallback_daylight:wb.wb_fallback_daylight,applied_wb:wb.userMul??null,decoder:'LibRaw WASM 1.6.0 / RGB16',camera:`${m.camera_make} ${m.camera_model}`};return cached;
  }finally{raw.dispose();}
}
/** The Standard matrix output of one developed RGB16 pixel: LibRaw's gamma decoded, the DR gain, `Bstd × D`. Signed and unclipped. */
function latentAt(c:any,p:number,out:Float64Array){
  const r=decodeLibRaw(c.image.data[p]/65535)*c.gain,g=decodeLibRaw(c.image.data[p+1]/65535)*c.gain,b=decodeLibRaw(c.image.data[p+2]/65535)*c.gain,m=STANDARD_MATRIX;
  out[0]=(m[0][0]*r+m[0][1]*g)+m[0][2]*b;out[1]=(m[1][0]*r+m[1][1]*g)+m[1][2]*b;out[2]=(m[2][0]*r+m[2][1]*g)+m[2][2]*b;
}
/** Preview: the latent (Standard matrix output) and the developed photo (its Standard rendering), both float32 RGB. Export: the LUT on the developed photo, RGBA8. */
function pixels(c:any,width:number,height:number,lut?:Float32Array,size=33){
  const latent=lut?null:new Float32Array(width*height*3),rgb=lut?new Uint8ClampedArray(width*height*4):new Float32Array(width*height*3),z=new Float64Array(3),out=new Float64Array(3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [sx,sy]=sourceXY(c.g,Math.min(c.g.width-1,Math.floor((x+.5)*c.g.width/width)),Math.min(c.g.height-1,Math.floor((y+.5)*c.g.height/height)));
    latentAt(c,(sy*c.image.width+sx)*3,z);const d=renderLatent(z,STANDARD_CHAIN);
    if(lut){sampleLut(lut,size,d[0],d[1],d[2],out);const i=(y*width+x)*4;for(let k=0;k<3;k++)rgb[i+k]=Math.round(out[k]*255);rgb[i+3]=255;}
    else {const i=(y*width+x)*3;latent!.set(z,i);rgb[i]=d[0];rgb[i+1]=d[1];rgb[i+2]=d[2];}
  }
  return {latent,rgb};
}
scope.onmessage=async({data:d})=>{try{
  const c=await decode(d.file,d.settings);
  if(d.type==='decode'){
    const scale=Math.min(1,1600/Math.max(c.g.width,c.g.height)),width=Math.round(c.g.width*scale),height=Math.round(c.g.height*scale),{latent,rgb}=pixels(c,width,height);
    scope.postMessage({id:d.id,buffer:rgb.buffer,latent:latent!.buffer,meta:{width,height,source_width:c.g.width,source_height:c.g.height,source_sha256:c.source_sha256,settings:c.settings,decoder:c.decoder,camera:c.camera,sensor_width:c.sensor_width,sensor_height:c.sensor_height,orientation:c.g.flip,camera_gain:c.gain,wb_fallback_daylight:c.wb_fallback_daylight,applied_wb:c.applied_wb,decoded_from:'RAW sensor mosaic; no embedded thumbnail',developed_from:'camera RGB (LibRaw outputColor 0, Clip highlights) through Bstd x D and the Standard rendering (packages/color-engine/camera.ts)'}},[rgb.buffer,latent!.buffer]);
  }else if(d.type==='export'){
    validateLut(d.lut,d.size);if(!['jpeg','png'].includes(d.format))throw new Error('Invalid photo export format');
    const rgba=pixels(c,c.g.width,c.g.height,d.lut,d.size).rgb as Uint8ClampedArray<ArrayBuffer>;
    const canvas=new OffscreenCanvas(c.g.width,c.g.height),context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw new Error('Cannot create a full-size canvas; insufficient memory');
    context.putImageData(new ImageData(rgba,c.g.width,c.g.height),0,0);
    const blob=await canvas.convertToBlob({type:d.format==='png'?'image/png':'image/jpeg',quality:.95});
    const rgba_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))).map(x=>x.toString(16).padStart(2,'0')).join('');
    scope.postMessage({id:d.id,blob,width:c.g.width,height:c.g.height,rgba_sha256});canvas.width=canvas.height=1;
  }else throw new Error('Unknown RAW task');
}catch(error){scope.postMessage({id:d.id,error:error instanceof Error?error.message:String(error)});}};
