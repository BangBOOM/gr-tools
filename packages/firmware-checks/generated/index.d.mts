type Probe = (require: (name:string)=>any, Buffer:any, process:any, console:any, dirname:string, module:any, exports:any)=>Promise<void> | void;
export const common: Probe;
export const probes: Record<string, Probe>;
