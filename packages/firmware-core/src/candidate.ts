/** Fixed four-slot platform data linker. ARM code comes only from pinned assets. */
import { bytesEqual } from './decoder.ts';
import { applyFrozenPlan, assetBytes, fromHex, getPlan, payloadOffset, sha256, type FrozenPlan, type Platform } from './platform.ts';
import { verifyFitResult } from '../../firmware-fit/src/index.ts';
import { inspectStylePackage,renderIcon,type StyleIcon } from '../../style-contract/src/index.ts';
import { validCameraName } from './display-name.ts';
import { PLATFORM_SHA256 } from '../platform/pin.ts';

export type Recipe = { matrix_q13: number[][]; curves_q14: number[][] };
export type SlotInput = {
  reference?: 'gold' | 'tungsten' | 'ektar' | 'metropolis'; uuid?: string; label?: string;
  recipe?: Recipe; icon?: { pixels_hex: string; definition?: StyleIcon }; fitReport?: any; acceptedFitHash?: string; fitOrigin?:'compiled-style'|'explicit-refit'; cubeSha256?:string; cubeBytes?:Uint8Array; packageBytes?:Uint8Array; packageSha256?:string;
};
export type FourSlotSelection = { profile:'V9.1-four-slot'|'V9.2-four-slot'; slots:SlotInput[]; displayOrder?:number[];
  historicalDngPolicy?:'fixed-slot-reinterpretation'; persistencePolicy?:'reset-on-registry-change'; };
export type ResolvedSlot = { uuid:string; label:string; styleName:string; token:string; recipe:Recipe; icon:Uint8Array; iconDefinition?:StyleIcon; compressedIcon:Uint8Array; fitReport?:any; acceptedFitHash?:string; fitOrigin?:'compiled-style'|'explicit-refit'; packageSha256?:string; cubeSha256?:string; iconSha256:string; recipeSha256:string };
type Module = { name:string; base:number; raw:Uint8Array; manifest:any };
export type Candidate = { version:'V9.1'|'V9.2'; beforeChecksum:Uint8Array; plan:FrozenPlan; assets:Map<string,Uint8Array>; slots:ResolvedSlot[]; registryChanged:boolean; report:any };
const NAMES = ['gold','800t','ektar','metro'];
const ICONS = ['gold','tungsten','ektar','metropolis'];
const FACTORY = [22,17,11,12,13,14,15,16,18,19,20,21];
const DEFAULT_ORDER = [4,5,0,1,2,3,6,7,8,9,10,11,12,13,14,15,16,17];
const ARENAS = [[0x53000d50,0x53002000],[0x53002080,0x53004000]];
const encoder = new TextEncoder();
const json = (v:any) => encoder.encode(JSON.stringify(v));
const parse = (p:Platform,path:string) => JSON.parse(new TextDecoder().decode(assetBytes(p,path)));
const view = (a:Uint8Array) => new DataView(a.buffer,a.byteOffset,a.byteLength);
const align = (n:number,k=4) => Math.ceil(n/k)*k;
const hex = (a:Uint8Array) => Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
function concatenate(parts:Uint8Array[]) {const a=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let n=0;for(const p of parts){a.set(p,n);n+=p.length;}return a;}
function packed16(values:number[],signed=false){const a=new Uint8Array(values.length*2),v=view(a);values.forEach((x,i)=>signed?v.setInt16(i*2,x,true):v.setUint16(i*2,x,true));return a;}
function rotateRight(n:number,k:number){return k ? ((n>>>k)|(n<<(32-k)))>>>0 : n>>>0;}
function immediate(n:number){for(let rot=0;rot<16;rot++){const x=rotateRight(n,32-2*rot);if(x<=255)return (rot<<8)|x;}throw new Error(`ARM immediate cannot encode ${n}`);}
function branch(a:number,t:number,link=false){const d=t-a-8;ensure(d%4===0 && d>=-(1<<25)&&d<(1<<25),'branch range or alignment');const b=new Uint8Array(4);view(b).setUint32(0,((link?0xeb000000:0xea000000)|((d/4)&0xffffff))>>>0,true);return b;}
function movImmediate(word:number,n:number){return ((word&~0xf0fff)|((n&0xf000)<<4)|(n&0xfff))>>>0;}
function uuidBytes(uuid:string){ensure(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(uuid),'canonical nonzero UUID required');return fromHex(uuid.replaceAll('-',''));}
export function validateRecipe(recipe:Recipe){
  ensure(recipe && Array.isArray(recipe.matrix_q13)&&recipe.matrix_q13.length===3&&recipe.matrix_q13.every(r=>Array.isArray(r)&&r.length===3&&r.every(v=>Number.isInteger(v)&&v>=-32768&&v<=32767)),'matrix must contain nine signed16 Q13 integers');
  const n=recipe.curves_q14?.[0]?.length;
  ensure((n===65||n===257)&&recipe.curves_q14.length===3,'exactly three 65 or257 node Q14 curves required');
  for(const row of recipe.curves_q14){ensure(Array.isArray(row)&&row.length===n&&row.every(v=>Number.isInteger(v)&&v>=0&&v<=16384),'Q14 samples out of range');ensure(row.every((v,i)=>!i||v>=row[i-1]),'curves must be monotone');if(n===257)ensure(row.every((v,i)=>!i||i%16===0||v-row[i-1]<=16383),'blocked257 within-block delta exceeds native two-byte limit');}
  return n;
}
export function encodeBlocked(row:number[]):Uint8Array {
  ensure(row.length===257,'blocked257 length');const blocks:Uint8Array[]=[],offsets:number[]=[];let bytes=0;
  for(let start=0;start<257;start+=16){const values=row.slice(start,start+16),b=[values[0]&255,values[0]>>>8];for(let i=1;i<values.length;i++){let d=values[i]-values[i-1];ensure(d>=0&&d<=16383,'blocked delta');while(d>=128){b.push((d&127)|128);d>>>=7;}b.push(d);}offsets.push(bytes);blocks.push(Uint8Array.from(b));bytes+=b.length;}
  return concatenate([packed16(offsets),...blocks]);
}
/** Deterministic LZ4 block, with final five literal bytes; no frame wrapper. */
export function compressIcon(input:Uint8Array):Uint8Array {
  ensure(input.length===4096,'icon must be4096 native ABGR bytes');
  const output:number[]=[],last=new Map<number,number[]>();let at=0,anchor=0;
  const key=(p:number)=>(input[p]|input[p+1]<<8|input[p+2]<<16|input[p+3]<<24)>>>0;
  const remember=(p:number)=>{const k=key(p),chain=last.get(k)??[];chain.push(p);if(chain.length>64)chain.shift();last.set(k,chain);};
  const extension=(n:number)=>{while(n>=255){output.push(255);n-=255;}output.push(n);};
  while(at<=input.length-12){const k=key(at),chain=last.get(k)??[];let old=-1,count=0;
    for(let j=chain.length-1;j>=0;j--){const previous=chain[j];if(at-previous>65535)break;let n=4;while(at+n<input.length-5&&input[previous+n]===input[at+n])n++;if(n>count){old=previous;count=n;if(at+n===input.length-5)break;}}
    remember(at);if(old<0){at++;continue;}
    const literals=at-anchor,stored=count-4;output.push((Math.min(literals,15)<<4)|Math.min(stored,15));if(literals>=15)extension(literals-15);
    for(let p=anchor;p<at;p++)output.push(input[p]);const distance=at-old;output.push(distance&255,distance>>>8);if(stored>=15)extension(stored-15);
    for(let p=at+1;p<at+count;p++)if(p+3<input.length)remember(p);
    at+=count;anchor=at;
  }
  const n=input.length-anchor;output.push(Math.min(n,15)<<4);if(n>=15)extension(n-15);for(let p=anchor;p<input.length;p++)output.push(input[p]);return Uint8Array.from(output);
}
const FONT:Record<string,string[]>={
  A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['111','100','100','100','111'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['111','100','101','101','111'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','111'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['101','111','111','101','101'],N:['101','111','111','111','101'],O:['111','101','101','101','111'],P:['110','101','110','100','100'],Q:['111','101','101','111','001'],R:['110','101','110','101','101'],S:['111','100','111','001','111'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['101','101','111','111','101'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],'3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],'6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111'],' ':['000','000','000','000','000']};
export function generateIcon(label:string,ordinal:number){const a=new Uint8Array(4096),v=view(a);const colors=[0xff28b8e5,0xffb8ad38,0xff4761d9,0xffaaa392];const pixel=(x:number,y:number,c:number)=>v.setUint32((y*32+x)*4,c,true);
  for(let y=3;y<29;y++)for(let x=2;x<30;x++)if(x===2||x===29||y===3||y===28)pixel(x,y,colors[ordinal%4]);
  const title=label.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,' ');
  for(let k=0;k<4;k++)for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(FONT[title[k]][y][x]==='1')pixel(4+k*6+x,12+y,0xffe1edf5);return a;
}
export async function resolveSlots(selection:FourSlotSelection,platform:Platform):Promise<ResolvedSlot[]> {
  ensure(Array.isArray(selection.slots)&&selection.slots.length===4,'platform requires exactly four installed slots');
  const result:ResolvedSlot[]=[];
  for(const [i,s] of selection.slots.entries()){
    const ref=s.reference,idx=ref?ICONS.indexOf(ref):-1;ensure(!ref||idx>=0,'unknown reference style');
    const original=ref?parse(platform,`/re/build/V9-backend/${NAMES[idx]}-recipe.json`):undefined;
    const recipe=s.recipe??original;validateRecipe(recipe);
    const uuid=ref&&s.uuid?.startsWith('reference:')?original.uuid:s.uuid??original?.uuid;uuidBytes(uuid);
    const styleName=s.label??(ref?['Gold 200','Tungsten 800','Ektar 100','Metropolis'][idx]:`Style ${i+1}`);ensure(typeof styleName==='string'&&styleName.trim().length>0&&[...styleName].length<=1024&&!/[\x00-\x1f\x7f]/.test(styleName),'style name must contain1..1024 characters without controls');
    ensure(validCameraName(styleName),'Camera names must be valid UTF-16, at most 254 code units, with no control characters. Shorten the style name.');
    const label=styleName;
    if(s.fitReport){ensure(s.acceptedFitHash===s.fitReport.fit_sha256,'this exact fit must be accepted before build');ensure(s.cubeBytes instanceof Uint8Array,'original cube bytes required to verify fitted recipe');ensure(s.cubeSha256===s.fitReport.input_cube_sha256&&await sha256(s.cubeBytes)===s.cubeSha256,'input cube fingerprint differs from accepted fit');await verifyFitResult({...recipe,report:s.fitReport},s.cubeBytes);}
    ensure(!!ref||!!s.fitReport,'custom recipes require a bound original package, CUBE and accepted fit');
    const icon=s.icon?fromHex(s.icon.pixels_hex):ref?assetBytes(platform,`/re/build/V9-icon/${ICONS[idx]}.abgr32`):generateIcon(styleName,i);ensure(icon.length===4096,'icon dimensions');
    if(!s.fitReport){
      ensure(!!ref&&uuid===original.uuid&&JSON.stringify(recipe.matrix_q13)===JSON.stringify(original.matrix_q13)&&JSON.stringify(recipe.curves_q14)===JSON.stringify(original.curves_q14),'only exact pinned reference recipe and UUID may omit a fit');
      // A resource-only variant needs no color fit. Bind its pixels to a validated
      // icon definition; layout, compression, readback and ARM gates still apply.
      if(s.icon?.definition)ensure(bytesEqual(icon,renderIcon(s.icon.definition)),'reference icon definition differs from installed pixels');
      else ensure(bytesEqual(icon,assetBytes(platform,`/re/build/V9-icon/${ICONS[idx]}.abgr32`)),'only exact pinned reference icon may omit an icon definition');
    }
    let packageSha256:string|undefined;
    if(s.fitReport||s.packageBytes){
      ensure(s.packageBytes instanceof Uint8Array,'original style package bytes required for custom fitted style');
      const inspected=await inspectStylePackage(s.packageBytes);
      if(inspected.camera){
        ensure(selection.profile==='V9.2-four-slot'&&inspected.camera.platform.id==='gr3-hdf-v210-v9.2'&&inspected.camera.platform.sha256===PLATFORM_SHA256,'compiled style platform differs from candidate platform');
        await verifyFitResult(inspected.camera.fit as Parameters<typeof verifyFitResult>[0],inspected.cubeBytes);
        if(s.fitOrigin==='explicit-refit') {
          ensure(recipe.curves_q14[0].length!==inspected.camera.fit.curves_q14[0].length,'explicit refit must select a different node count from the compiled style');
        } else {
          ensure(s.fitOrigin==='compiled-style','compiled style recipe origin is required');
          ensure(JSON.stringify(recipe.matrix_q13)===JSON.stringify(inspected.camera.fit.matrix_q13)&&JSON.stringify(recipe.curves_q14)===JSON.stringify(inspected.camera.fit.curves_q14)&&JSON.stringify(s.fitReport)===JSON.stringify(inspected.camera.fit.report),'selected recipe or report differs from compiled style');
        }
      }
      ensure(s.packageSha256===inspected.package_sha256,'style package fingerprint mismatch');
      ensure(inspected.manifest.name===styleName,'style package author name differs from reported style mapping');
      ensure(inspected.manifest.id===uuid&&inspected.manifest.look.sha256===s.cubeSha256&&s.cubeBytes&&bytesEqual(inspected.cubeBytes,s.cubeBytes),'style package identity or original CUBE differs from fitted selection');
      ensure(bytesEqual(renderIcon(inspected.icon),icon),'style package rendered icon differs from installed pixels');
      packageSha256=inspected.package_sha256;
    }
    const compressedIcon=ref&&bytesEqual(icon,assetBytes(platform,`/re/build/V9-icon/${ICONS[idx]}.abgr32`))?assetBytes(platform,`/re/build/V9-icon/${ICONS[idx]}.lz4`):compressIcon(icon);
    // Visible names follow the installed style. Historical text-I/O tokens keep
    // their fixed ordinal meaning independently from displayed text and UUIDs.
    result.push({uuid,label,styleName,token:['Gold200','Cine800T','Ektar100','Metropolis'][i],recipe,icon,iconDefinition:!s.fitReport?s.icon?.definition:undefined,compressedIcon,fitReport:s.fitReport,acceptedFitHash:s.acceptedFitHash,fitOrigin:s.fitOrigin,packageSha256,cubeSha256:s.cubeSha256,iconSha256:await sha256(icon),recipeSha256:await sha256(concatenate([packed16(recipe.matrix_q13.flat(),true),packed16(recipe.curves_q14.flat())]))});
  }
  ensure(new Set(result.map(s=>s.uuid)).size===4,'duplicate installed UUID');ensure(new Set(result.map(s=>s.token)).size===4,'duplicate serialized text identity');return result;
}
function frozenModule(platform:Platform,name:string,version='V9.1'):Module {
  const path=`/re/build/${name==='storage'&&version==='V9.2'?'V9-2-storage':'V9-'+name}/${name==='storage'?'plan':'manifest'}.json`,m=parse(platform,path);
  let rawpath=m.rawfile;const at=rawpath.indexOf('/re/');if(at>=0)rawpath=rawpath.slice(at);else if(rawpath.startsWith('build/'))rawpath='/re/'+rawpath;else rawpath=`/re/build/V9-${name}/`+rawpath;
  return {name,base:Number(m.base),raw:assetBytes(platform,rawpath),manifest:{...m,symbols:{...(m.symbol_offsets??m.symbols)}}};
}
function makeMenu(module:Module,slots:ResolvedSlot[],displayOrder:number[]){
  const m=module.manifest,start=m.symbols.text_descriptors as number,parts:Uint8Array[]=[module.raw.slice(0,start),new Uint8Array(16)];let pos=start+16;const rel=m.self_relocations.filter((r:any)=>r.offset<start),symbols={...m.symbols};
  for(let i=0;i<4;i++){const label=slots[i].label,desc=pos;const text=new Uint8Array((label.length+1)*2);for(let j=0;j<label.length;j++)view(text).setUint16(j*2,label.charCodeAt(j),true);
    const d=new Uint8Array(8);d[0]=label.length+1;d[1]=1;parts.push(d,text,new Uint8Array(align(text.length+8)-text.length-8));
    rel.push({offset:start+i*4,target_offset:desc},{offset:desc+4,target_offset:desc+8});pos+=align(text.length+8);
  }
  symbols.icon_descriptor=pos;parts.push(Uint8Array.from([32,0,32,0,0,0,0,0]));const raw=concatenate(parts);
  raw.set(displayOrder,symbols.display_to_canonical);const reverse=displayOrder.map((_,i)=>displayOrder.indexOf(i));raw.set(reverse,symbols.canonical_to_display);
  m.symbols=symbols;m.self_relocations=rel.map((r:any)=>({offset:r.offset,target_offset:r.target_offset??r.symbol_offset+r.addend}));
  m.display_to_canonical=displayOrder;m.canonical_to_display=reverse;
  const canonical=[...m.base_order.map((selector:number)=>({kind:'style',selector})),{kind:'slot',slot:1},{kind:'slot',slot:2}];m.typed_display_rows=displayOrder.map(i=>canonical[i]);module.raw=raw;
}
function makeText(module:Module,slots:ResolvedSlot[],layout:any){
  const offsets={...layout},parts:Uint8Array[]=[module.raw.slice(0,layout.name_store)];let pos=layout.name_store;
  parts.push(encoder.encode(slots.map(s=>s.token+'\0').join('')));pos+=parts[1].length;
  for(const [i,name] of ['gold_line','line_800t','line_ektar','line_metropolis'].entries()){offsets[name]=pos;const b=encoder.encode(slots[i].token+'\n\0');parts.push(b);pos+=b.length;}
  const pool=align(pos);parts.push(new Uint8Array(pool-pos),module.raw.slice(592));const raw=concatenate(parts),v=view(raw),allowed=[],literalRelocations=[];
  for(let at=0;at<layout.name_store;at+=4){const w=v.getUint32(at,true),op=(w>>>21)&15;if((w&0x0e000000)!==0x02000000||((w>>>16)&15)!==15||![2,4].includes(op))continue;
    const n=rotateRight(w&255,((w>>>8)&15)*2),target=at+8+(op===4?n:-n),name=Object.keys(offsets).find(k=>layout[k]===target&&['name_store','gold_line','line_800t','line_ektar','line_metropolis'].includes(k));
    if(!name)continue;const delta=offsets[name]-at-8;v.setUint32(at,((w&~0x01e00fff)|((delta>=0?4:2)<<21)|immediate(Math.abs(delta)))>>>0,true);allowed.push(at);
  }
  for(let at=0;at<layout.name_store;at+=4){const w=v.getUint32(at,true);if((w&0x0f7f0000)!==0x051f0000)continue;const old=at+8+((w&0x800000)?1:-1)*(w&4095);if(old!==592)continue;const delta=pool-at-8;ensure(Math.abs(delta)<=4095,'text literal range');v.setUint32(at,((w&~0x800fff)|(delta>=0?0x800000:0)|Math.abs(delta))>>>0,true);literalRelocations.push(at);}
  ensure(allowed.length===5&&literalRelocations.length===1,'text ADR/literal relocation closure');module.manifest.data_layout=offsets;module.manifest.adr_relocations=allowed;module.manifest.literal_relocations=literalRelocations;module.raw=raw;
}
function makeIcons(module:Module,slots:ResolvedSlot[]){
  const m=module.manifest,raw=concatenate([module.raw.slice(0,488),...slots.map(s=>s.compressedIcon)]),rel=m.self_relocations.filter((r:any)=>r.offset<456).map((r:any)=>({offset:r.offset,target_offset:r.symbol_offset+r.addend}));let pos=488;
  m.icons=slots.map((s,i)=>{const name=ICONS[i],symbol=name+'_compressed';m.symbols[symbol]=pos;rel.push({offset:456+i*8,target_offset:pos});view(raw).setUint32(460+i*8,s.compressedIcon.length,true);pos+=s.compressedIcon.length;return{style:25+i,icon_id:'0x'+(0x29f+i).toString(16),label:s.label,asset_name:name,rawfile:name+'.abgr32',compressed_bytes:s.compressedIcon.length,compressed_symbol:symbol};});m.self_relocations=rel;module.raw=raw;
}
async function makeBackend(module:Module,slots:ResolvedSlot[],source:Uint8Array){
  const m=module.manifest,parts:Uint8Array[]=[module.raw.slice(0,2596)],rawPrefix=parts[0],v=view(rawPrefix);const rel=m.self_relocations.filter((r:any)=>r.offset<2500);let pos=2596;const unique=new Map<string,number>();
  for(let i=0;i<4;i++){const recipe=slots[i].recipe,n=recipe.curves_q14[0].length;rawPrefix.set(packed16(recipe.matrix_q13.flat(),true),2152+i*104);
    for(let ch=0;ch<3;ch++){const bytes=n===257?encodeBlocked(recipe.curves_q14[ch]):packed16(recipe.curves_q14[ch]),key=hex(bytes);let target=unique.get(key);
      if(target===undefined){const aligned=align(pos,2);parts.push(new Uint8Array(aligned-pos),bytes);pos=aligned;target=pos;unique.set(key,target);pos+=bytes.length;}
      const at=2500+(i*3+ch)*8;rel.push({offset:at,target_offset:target});v.setUint16(at+4,bytes.length,true);v.setUint16(at+6,n===257?0:1,true);
    }
  }
  const toneAt=align(pos);parts.push(new Uint8Array(toneAt-pos),module.raw.slice(m.symbols.V9_tone_vector,m.symbols.V9_tone_vector+64),module.raw.slice(m.symbols.V9_tone_parser,m.symbols.V9_tone_parser+15));
  m.symbols.V9_tone_vector=toneAt;m.symbols.V9_tone_parser=toneAt+64;m.self_relocations=rel;m.registry=[];
  for(let i=0;i<4;i++)m.registry.push({ordinal:i,uuid:slots[i].uuid,logical:25+i,raw:13+i,tone:268+i,recipe_sha256:await sha256(concatenate([packed16(slots[i].recipe.matrix_q13.flat(),true),packed16(slots[i].recipe.curves_q14.flat())])),descriptor_symbol:'V9_desc_'+NAMES[i],curve_nodes:slots[i].recipe.curves_q14[0].length});
  module.raw=concatenate(parts);
}
function makeStorage(module:Module,slots:ResolvedSlot[],layout:any,registryChanged:boolean){
  const m=module.manifest,raw=module.raw.slice();for(let i=0;i<4;i++)raw.set(uuidBytes(slots[i].uuid),layout.v9_header+24+i*20);
  m.header.uuids=slots.map(s=>s.uuid);m.header_hex=hex(raw.subarray(layout.v9_header,layout.v9_header+104));m.data_layout=layout;m.legacy_disabled=registryChanged;
  if(registryChanged){let cmp=0,mov=0;const v=view(raw),cmpWord=(0xe3500000|immediate(264))>>>0;
    for(let at=m.symbols.v9_load;at<layout.load_alloc;at+=4){const w=v.getUint32(at,true);if(w===cmpWord){ensure(v.getUint32(at+4,true)>>>24===0x0a,'V7 legacy entry branch');v.setUint32(at+4,0xe1a00000,true);cmp++;}if(w===movImmediate(0xe3001000,560)){ensure(v.getUint32(at+8,true)>>>24===0x0a,'V8 legacy entry branch');v.setUint32(at+8,0xe1a00000,true);mov++;}}
    ensure(cmp===1&&mov===1,'legacy identity migration gate instruction binding');
  }
  module.raw=raw;
}
function relocate(module:Module,base:number){
  const m=module.manifest;for(const r of m.self_relocations??[]){const target=r.target_offset??r.symbol_offset+r.addend;ensure(Number.isInteger(target)&&target>=0&&target<module.raw.length&&r.offset+4<=module.raw.length,'relocation outside module');view(module.raw).setUint32(r.offset,base+target,true);}
  m.base=base;m.guest_base=base;m.size=module.raw.length;m.bytes=module.raw.length;
  if(m.symbol_offsets)m.symbol_offsets={...m.symbols};module.base=base;
}
function diffPlan(source:Uint8Array,body:Uint8Array,template:FrozenPlan):FrozenPlan {const patches:any[]=[];let start=-1;
  for(let i=0;i<body.length-4;i++){if(body[i]!==source[i]&&start<0)start=i;if(body[i]===source[i]&&start>=0){patches.push({va:'0x'+(start-0x10870+0x53000000).toString(16),old_hex:hex(source.subarray(start,i)),new_hex:hex(body.subarray(start,i)),component:'web fixed four-slot linked candidate'});start=-1;}}
  if(start>=0){const end=body.length-4;patches.push({va:'0x'+(start-0x10870+0x53000000).toString(16),old_hex:hex(source.subarray(start,end)),new_hex:hex(body.subarray(start,end))});}
  return {...template,kind:'WEB_FIXED_FOUR_SLOT_CANDIDATE',patches,modules:[]};
}
export async function createCandidate(source:Uint8Array,platform:Platform,selection:FourSlotSelection):Promise<Candidate>{
  const version=selection.profile==='V9.2-four-slot'?'V9.2':'V9.1';
  const slots=await resolveSlots(selection,platform),referenceRegistry=getPlan(platform,version).registry;
  const registryChanged=slots.some((s,i)=>s.uuid!==referenceRegistry[i].uuid);
  if(registryChanged){ensure(selection.historicalDngPolicy==='fixed-slot-reinterpretation','Changing slot UUID requires explicit historicalDngPolicy fixed-slot-reinterpretation');ensure(selection.persistencePolicy==='reset-on-registry-change','Changing registry requires explicit persistencePolicy reset-on-registry-change');}
  const order=selection.displayOrder??DEFAULT_ORDER;ensure(order.length===18&&order.every((x,i)=>x===DEFAULT_ORDER[i]),'P1 preserves frozen V9.1 metadata numbers and display order; menu reordering requires later device acceptance');
  const modules=['menu','text','icon','storage','backend','raw'].map(name=>frozenModule(platform,name,version)),by=Object.fromEntries(modules.map(m=>[m.name,m])),layout=parse(platform,version==='V9.2'?'/re/web/module-layout-v92.json':'/re/web/module-layout.json');
  makeMenu(by.menu,slots,order);makeText(by.text,slots,layout.text);makeIcons(by.icon,slots);makeStorage(by.storage,slots,layout.storage,registryChanged);await makeBackend(by.backend,slots,source);
  let cursor=ARENAS[0][0];for(const name of ['menu','text','icon','storage']){relocate(by[name],align(cursor));cursor=by[name].base+by[name].raw.length;}
  ensure(cursor<=ARENAS[0][1],`first ROM arena capacity exceeded by${cursor-ARENAS[0][1]} bytes`);
  cursor=ARENAS[1][0];for(const name of ['backend','raw']){relocate(by[name],align(cursor));cursor=by[name].base+by[name].raw.length;}
  ensure(cursor<=ARENAS[1][1],`second ROM arena capacity exceeded by${cursor-ARENAS[1][1]} bytes; explicitly fit65-node curves or simplify/deduplicate data`);
  const frozen=getPlan(platform,version),body=applyFrozenPlan(source,frozen),assets=new Map<string,Uint8Array>();
  for(const [a,z]of ARENAS)body.fill(0,payloadOffset(a),payloadOffset(z));
  const write=(a:number,b:Uint8Array)=>{ensure(a>=0x53000000&&payloadOffset(a)+b.length<source.length-4,'invalid linked write');body.set(b,payloadOffset(a));};
  for(const module of modules){const m=module.manifest,base=module.base;m.sha256=await sha256(module.raw);m.raw_sha256=m.sha256;m.rawfile=`/re/build/V9-${module.name}/${module.name==='menu'||module.name==='icon'||module.name==='raw'?module.name+'.bin':module.name+'.raw'}`;
    write(base,module.raw);for(const h of m.hooks??[])write(Number(h.va),branch(Number(h.va),base+m.symbols[h.target_symbol],h.link));
    // Native mutations from pinned module metadata. Menu stays at original base.
    for(const p of m.mutations??[])write(Number(p.va),fromHex(p.new_hex));
    for(const r of m.external_movw_movt_refs??[]){const target=base+m.symbols[r.target_symbol];for(const [field,value]of [['movw_va',target&65535],['movt_va',target>>>16]]as const){const at=Number(r[field]),p=payloadOffset(at),word=view(body).getUint32(p,true);ensure((word>>>12&15)===r.register,'native MOVW/MOVT register mismatch');view(body).setUint32(p,movImmediate(word,value),true);}}
    assets.set(m.rawfile,module.raw);assets.set(`/re/build/V9-${module.name}/manifest.json`,json(m));if(module.name==='storage')assets.set('/re/build/V9-storage/plan.json',json(m));
  }
  const plan=diffPlan(source,body,frozen);plan.registry=by.backend.manifest.registry;
  for(const module of modules){const m=module.manifest;plan.modules.push({name:module.name,base:module.base,end:module.base+module.raw.length,bytes:module.raw.length,guest_base:module.base,symbols:m.symbols,raw_sha256:m.sha256,source_raw_sha256:await sha256(frozenModule(platform,module.name,version).raw),manifest_sha256:await sha256(assets.get(`/re/build/V9-${module.name}/manifest.json`)!)});}
  for(let i=0;i<4;i++){assets.set(`/re/build/V9-backend/${NAMES[i]}-recipe.json`,json({...slots[i].recipe,uuid:slots[i].uuid,name:slots[i].label}));assets.set(`/re/build/V9-icon/${ICONS[i]}.abgr32`,slots[i].icon);assets.set(`/re/build/V9-icon/${ICONS[i]}.lz4`,slots[i].compressedIcon);}
  assets.set(platform.plans[version],json(plan));assets.set('/re/build/'+(version==='V9.2'?'V9-2':'V9-1')+'-integrated/unpackedFW.before-checksum.bin',body);
  return {version,beforeChecksum:body,plan,assets,slots,registryChanged,report:{mode:'fixed-four-slots',displayOrder:order,registryChanged,historicalDngPolicy:'fixed-slot-reinterpretation',persistencePolicy:registryChanged?'reset-on-registry-change':'same-registry-retains-controls',modules:plan.modules.map(m=>({name:m.name,base:m.base,end:m.end,bytes:m.bytes,sha256:m.raw_sha256,sourceSha256:m.source_raw_sha256})),moduleBytes:modules.reduce((s,m)=>s+m.raw.length,0),arenas:ARENAS.map(([a,z])=>({start:a,end:z,used:Math.max(...modules.filter(m=>m.base>=a&&m.base<z).map(m=>m.base+m.raw.length))-a,bytes:z-a})),slots:slots.map((s,i)=>({uuid:s.uuid,nativeLabel:s.label,styleName:s.styleName,token:s.token,logical:25+i,raw:13+i,tone:268+i,nodes:s.recipe.curves_q14[0].length,iconBytes:s.compressedIcon.length,iconSha256:s.iconSha256,iconDefinition:s.iconDefinition,recipeSha256:s.recipeSha256,packageSha256:s.packageSha256,cubeSha256:s.cubeSha256,acceptedFitHash:s.acceptedFitHash,fitOrigin:s.fitOrigin,fit:s.fitReport}))}};
}
