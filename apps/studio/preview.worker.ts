/// <reference lib="webworker" />
import {fitPreview} from '../../packages/firmware-fit/src/preview.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
// Persistent: the main thread sends one fit at a time and drops superseded requests itself.
scope.onmessage=async({data}:MessageEvent<{lut:ArrayBuffer;size:number}>)=>{
  try{scope.postMessage({recipe:await fitPreview(new Float32Array(data.lut),data.size)});}
  catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)});}
};
