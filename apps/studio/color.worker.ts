/// <reference lib="webworker" />
import {bakeLut,normalizeState} from '../../packages/color-engine/index.ts';
import {legacyLookHash} from '../../packages/color-engine/legacy.ts';
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async({data})=>{try{
  const state=normalizeState(data.state),lut=bakeLut(state,33);
  scope.postMessage({id:data.id,lut:lut.buffer,size:33,mode:'full',recipe:{state},look_sha256:await legacyLookHash(state)},[lut.buffer]);
}catch(error){scope.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}};
