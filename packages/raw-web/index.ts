import type {RawSettings} from './core.ts';
/** One task at a time; termination cancels native/WASM work and drops retained pixels. */
export class RawEngine {
  private worker:Worker|null=null;private tail:Promise<unknown>=Promise.resolve();private serial=0;
  private reject:((reason:Error)=>void)|null=null;private epoch=0;private timer:ReturnType<typeof setTimeout>|undefined;
  private workerFile:File|null=null;private released=new WeakSet<File>();
  get generation(){return this.epoch;}
  private stop(){clearTimeout(this.timer);this.timer=undefined;this.worker?.terminate();this.worker=null;this.workerFile=null;const reject=this.reject;this.reject=null;reject?.(new DOMException('RAW task canceled','AbortError'));}
  cancel(){this.epoch++;this.stop();}
  /** Invalidate only this photo's queued work; preserve other photos' tasks. */
  release(file:File){this.released.add(file);if(this.workerFile===file)this.stop();}
  private async run(type:string,file:File,settings:RawSettings,extra:object={}){
    const epoch=this.epoch;
    const result=this.tail.catch(()=>{}).then(()=>new Promise<any>((resolve,reject)=>{
      if(epoch!==this.epoch||this.released.has(file)){reject(new DOMException('RAW task canceled','AbortError'));return;}
      this.worker??=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
      const w=this.worker,id=++this.serial;this.reject=reject;this.workerFile=file;
      const current=()=>epoch===this.epoch&&this.worker===w;
      // Successful tasks retain this photo's decoded pixels in the worker.
      const done=()=>{if(current()){clearTimeout(this.timer);this.timer=undefined;this.reject=null;}};
      const fail=(error:Error)=>{if(!current())return;done();w.terminate();this.worker=null;this.workerFile=null;reject(error);};
      this.timer=setTimeout(()=>{if(current())this.cancel();},120000);
      w.onmessage=({data})=>{if(!current()||data.id!==id)return;done();data.error?reject(new Error(data.error)):resolve(data);};
      w.onerror=e=>fail(new Error(e.message||'Development worker failed'));
      w.onmessageerror=()=>fail(new Error('Could not read development worker response'));
      try{w.postMessage({id,type,file,settings,...extra});}catch(error){fail(error instanceof Error?error:new Error(String(error)));}
    }));this.tail=result;return result;
  }
  decode(file:File,settings:RawSettings){return this.run('decode',file,settings);}
  export(file:File,settings:RawSettings,lut:Float32Array,format:'jpeg'|'png'){return this.run('export',file,settings,{lut,size:33,format});}
}
