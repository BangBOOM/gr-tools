import {checkCancelled,createBrowserHost} from './index.ts';
import type {Host,HostFile,ProjectStorage} from './index.ts';
/** A shell supplies only named capabilities. No product code imports its framework. */
export interface DesktopRPC {call(method:string,...args:unknown[]):Promise<any>}
const CHUNK=256*1024;
function decode(value:unknown):Uint8Array {if(typeof value!=='string'||value.length>Math.ceil(CHUNK/3)*4)throw Error('Invalid native chunk');const text=atob(value);if(text.length>CHUNK)throw Error('Oversize native chunk');return Uint8Array.from(text,c=>c.charCodeAt(0));}
function encode(bytes:Uint8Array):string{let text='';for(let at=0;at<bytes.length;at+=32768)text+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(text);}
export function createDesktopHost(rpc:DesktopRPC):Host {
 async function read(file:HostFile,offset:number,length:number,signal?:AbortSignal):Promise<Uint8Array>{
  checkCancelled(signal);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset>file.size||length>file.size-offset)throw Error('Invalid native read range');
  const output=new Uint8Array(length);for(let at=0;at<length;at+=CHUNK){checkCancelled(signal);const size=Math.min(CHUNK,length-at),chunk=decode(await rpc.call('ReadRange',file.id,offset+at,size));checkCancelled(signal);if(chunk.length!==size)throw Error('Native chunk length mismatch');output.set(chunk,at);}return output;
 }
 async function write(id:string,bytes:Uint8Array,signal?:AbortSignal){
  try{checkCancelled(signal);for(let at=0;at<bytes.length;at+=CHUNK){checkCancelled(signal);await rpc.call('SaveChunk',id,at,encode(bytes.subarray(at,at+CHUNK)));checkCancelled(signal);}await rpc.call('SaveCommit',id);}catch(e){await rpc.call('SaveCancel',id).catch(()=>{});throw e;}
 }
 const storage:ProjectStorage={
  async load(key,signal){checkCancelled(signal);const file=await rpc.call('ProjectRead',key) as HostFile|null;if(!file)return null;try{if(file.size>64*1024*1024)throw Error('Native project exceeds64MiB');return new TextDecoder('utf-8',{fatal:true}).decode(await read(file,0,file.size,signal));}finally{await rpc.call('Release',file.id)}},
  async save(key,value,signal){checkCancelled(signal);const bytes=new TextEncoder().encode(value),id=await rpc.call('ProjectBegin',key,bytes.length);await write(id,bytes,signal);},
  async remove(key,signal){checkCancelled(signal);await rpc.call('ProjectRemove',key);checkCancelled(signal);},
  async list(signal){checkCancelled(signal);const keys=await rpc.call('ProjectList');checkCancelled(signal);if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string'))throw Error('Invalid native project list');return keys;},
 };
 return {kind:'desktop',storage,
  async pickFile(options={}){checkCancelled(options.signal);const file=await rpc.call('Pick',options.accept??'') as HostFile|null;if(options.signal?.aborted){if(file)await rpc.call('Release',file.id);checkCancelled(options.signal);}if(file&&(!file.id||!file.name||!Number.isSafeInteger(file.size)||file.size<0||file.size>1024*1024*1024))throw Error('Invalid native file capability');return file;},
  readRange:read,releaseFile(file){void rpc.call('Release',file.id).catch(()=>{});},
  async saveFile(name,bytes,options={}){checkCancelled(options.signal);const id=await rpc.call('SaveBegin',name,bytes.length);if(!id)throw new DOMException('Save cancelled','AbortError');await write(id,bytes,options.signal);},
 };
}
export function createHost():Host {
 const rpc=(globalThis as typeof globalThis&{__GR_HOST_RPC__?:DesktopRPC}).__GR_HOST_RPC__;
 return rpc?createDesktopHost(rpc):createBrowserHost();
}
