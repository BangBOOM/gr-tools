/// <reference lib="webworker" />
import {fitCube,verifyFitResult,evaluateRecipe,parseCube,sampleCube} from '../../packages/firmware-fit/src/index.ts';
import type {FitResult} from '../../packages/firmware-fit/src/index.ts';
import {CAMERA_CURVE_NODES} from '../../packages/firmware-fit/src/target.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async({data}:MessageEvent<{cube:Uint8Array;fit?:FitResult;pixels?:Uint8Array}>)=>{
  try{
    scope.postMessage({phase:data.fit?'Checking cached recipe…':'Fitting GR camera recipe…'});
    const fit=data.fit??await fitCube(data.cube,{nodes:CAMERA_CURVE_NODES});
    scope.postMessage({phase:'Independently checking approximation…'});
    await verifyFitResult(fit,data.cube);
    let authored:ArrayBuffer|undefined,camera:ArrayBuffer|undefined;
    if(data.pixels){
      scope.postMessage({phase:'Rendering comparison…'});
      const rgb=new Float64Array(data.pixels.length/4*3);
      for(let p=0,q=0;p<data.pixels.length;p+=4,q+=3)for(let c=0;c<3;c++)rgb[q+c]=data.pixels[p+c]/255;
      const rgba=(values:Float64Array)=>{const pixels=new Uint8ClampedArray(values.length/3*4);for(let p=0,q=0;p<values.length;p+=3,q+=4){for(let c=0;c<3;c++)pixels[q+c]=Math.round(values[p+c]*255);pixels[q+3]=255;}return pixels.buffer;};
      authored=rgba(sampleCube(parseCube(data.cube),rgb));camera=rgba(evaluateRecipe(rgb,fit));
    }
    scope.postMessage({fit,authored,camera},[...(authored?[authored]:[]),...(camera?[camera]:[])]);
  }catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)});}
};
