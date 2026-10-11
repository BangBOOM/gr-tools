/** Why a one-shot Worker task ended without a result. */
export type WorkerTaskOutcome='cancelled'|'timeout'|'failed';
export class WorkerTaskError extends Error {
  readonly outcome:WorkerTaskOutcome;
  constructor(message:string,outcome:WorkerTaskOutcome){super(message);this.name='WorkerTaskError';this.outcome=outcome;}
}
export type WorkerTask<T>={result:Promise<T>;cancel():void};
type Settle<T>={done(value:T):void;fail(error:Error):void};
/**
 * Post one message to a Worker the caller just constructed. Construct it at the call site as
 * `new Worker(new URL('./x.worker.ts', import.meta.url), {type:'module'})` so that Vite bundles it.
 * The Worker terminates on every settlement:
 * `done`, `fail`, a Worker error, `cancel`, or the timeout. Messages after settlement are ignored.
 * `onMessage` handles progress itself and calls `done` or `fail` to settle.
 */
export function runWorkerTask<T>(worker:Worker,message:unknown,options:{name:string;timeoutMs:number;transfer?:Transferable[];onMessage(data:any,settle:Settle<T>):void}):WorkerTask<T>{
  let cancel!:()=>void;
  const result=new Promise<T>((resolve,reject)=>{
    let settled=false;
    const finish=(action:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();action();};
    const settle:Settle<T>={done:value=>finish(()=>resolve(value)),fail:error=>finish(()=>reject(error))};
    const timer=setTimeout(()=>settle.fail(new WorkerTaskError(`${options.name} timed out`,'timeout')),options.timeoutMs);
    cancel=()=>settle.fail(new WorkerTaskError(`${options.name} cancelled`,'cancelled'));
    worker.onerror=event=>settle.fail(new WorkerTaskError(event.message||`${options.name} stopped`,'failed'));
    worker.onmessageerror=()=>settle.fail(new WorkerTaskError(`${options.name} returned unreadable data`,'failed'));
    worker.onmessage=({data})=>{if(!settled)options.onMessage(data,settle);};
    try{worker.postMessage(message,options.transfer??[]);}catch(error){settle.fail(new WorkerTaskError(error instanceof Error?error.message:String(error),'failed'));}
  });
  return {result,cancel};
}
