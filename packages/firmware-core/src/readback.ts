/** Independent final-ROM resource decoder. Does not import builder encoders. */
import { bytesEqual } from './decoder.ts';
import { assetBytes, fromHex, getPlan, payloadOffset, type Platform } from './platform.ts';
import type { Candidate } from './candidate.ts';
const fail=(s:string):never=>{throw new Error(`independent readback: ${s}`);};
function requireThat(v:unknown,s:string):asserts v {if(!v)fail(s);}
const parse=(p:Platform,name:string)=>JSON.parse(new TextDecoder().decode(assetBytes(p,name)));
const number=(v:any)=>Number(v);
const align=(v:number,k=4)=>Math.ceil(v/k)*k;
function rawAsset(platform:Platform,name:string,m:any){let path=m.rawfile;const index=path.indexOf('/re/');path=index>=0?path.slice(index):path.startsWith('build/')?'/re/'+path:`/re/build/V9-${name}/`+path;return assetBytes(platform,path);}
/** Independent bounded LZ4 block decoder, including overlap and exact input/output ends. */
export function decodeLz4(bytes:Uint8Array,outputLength=4096){const out=new Uint8Array(outputLength);let p=0,z=0;
  const byte=()=>{if(p>=bytes.length)fail('truncated LZ4');return bytes[p++];};
  const length=(n:number)=>{if(n!==15)return n;let x;do{x=byte();n+=x;}while(x===255);return n;};
  while(p<bytes.length){const token=byte(),literals=length(token>>>4);requireThat(p+literals<=bytes.length&&z+literals<=out.length,'LZ4 literal bounds');out.set(bytes.subarray(p,p+literals),z);p+=literals;z+=literals;if(p===bytes.length)break;
    const distance=byte()|byte()<<8;requireThat(distance>0&&distance<=z,'LZ4 match distance');const count=length(token&15)+4;requireThat(z+count<=out.length,'LZ4 output bounds');for(let i=0;i<count;i++){out[z]=out[z-distance];z++;}
  }requireThat(p===bytes.length&&z===out.length,'LZ4 exact lengths');return out;
}
/** Independent blocked257 parser, strict block boundaries and two-byte varints. */
export function decodeBlocked(bytes:Uint8Array):number[]{requireThat(bytes.length>=68,'blocked257 header');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out:number[]=[];let prior=0;
  for(let block=0;block<17;block++){const offset=v.getUint16(block*2,true),end=block===16?bytes.length-34:v.getUint16((block+1)*2,true);requireThat(offset===prior&&end>offset&&34+end<=bytes.length,'blocked directory span');let p=34+offset;requireThat(p+2<=34+end,'blocked anchor');let value=v.getUint16(p,true);p+=2;out.push(value);const count=block===16?1:16;
    for(let i=1;i<count;i++){requireThat(p<34+end,'blocked varint truncated');const a=bytes[p++];let delta=a&127;if(a&128){requireThat(p<34+end,'blocked second byte missing');const b=bytes[p++];requireThat(!(b&128),'blocked varint exceeds native two bytes');delta|=b<<7;}value+=delta;requireThat(value<=16384,'blocked Q14 overflow');out.push(value);}
    requireThat(p===34+end,'blocked trailing bytes');prior=end;
  }requireThat(out.length===257,'blocked node count');return out;
}
function ror(n:number,k:number){return k?((n>>>k)|(n<<(32-k)))>>>0:n>>>0;}
function adrTarget(word:number,at:number){const op=word>>>21&15;requireThat((word&0x0e000000)===0x02000000&&(word>>>16&15)===15&&(op===2||op===4),'ADR instruction encoding');return at+8+(op===4?1:-1)*ror(word&255,(word>>>8&15)*2);}
function branchTarget(word:number,at:number){requireThat([0xea,0xeb].includes(word>>>24),'expected native branch');let delta=word&0xffffff;if(delta&0x800000)delta-=0x1000000;return at+8+delta*4;}

export function verifyCandidateReadback(source:Uint8Array,body:Uint8Array,platform:Platform,candidate:Candidate){
  requireThat(source.length===body.length,'payload length');const plan=candidate.plan,modules=Object.fromEntries(plan.modules.map(m=>[m.name,m]));
  const read=(address:number,count:number)=>{const at=payloadOffset(address);requireThat(Number.isSafeInteger(at)&&at>=0&&at+count<=body.length,'ROM read bounds');return body.subarray(at,at+count);};
  const u32=(address:number)=>new DataView(read(address,4).buffer,body.byteOffset+payloadOffset(address),4).getUint32(0,true);
  const assets:Record<string,any>={};
  for(const name of ['menu','text','icon','storage','backend','raw']){
    const m=modules[name];requireThat(m&&Number.isInteger(m.base)&&m.base%4===0&&m.end===m.base+m.bytes,'module placement');requireThat((m.base>=0x53000d50&&m.end<=0x53002000)||(m.base>=0x53002080&&m.end<=0x53004000),'module exceeds approved arena');
    const pinned=parse(platform,`/re/build/${name==='storage'&&candidate.version==='V9.2'?'V9-2-storage':'V9-'+name}/${name==='storage'?'plan':'manifest'}.json`),original=rawAsset(platform,name,pinned);assets[name]={m,pinned,original,actual:read(m.base,m.bytes)};
  }
  const sorted=Object.values(assets).map(x=>x.m).sort((a,b)=>a.base-b.base);for(let i=1;i<sorted.length;i++)requireThat(sorted[i-1].end<=sorted[i].base,'module overlap');
  const frozen=getPlan(platform,candidate.version),allowed=new Uint8Array(source.length);
  for(const p of frozen.patches)allowed.fill(1,payloadOffset(p.va),payloadOffset(p.va)+p.old_hex.length/2);
  allowed.fill(1,payloadOffset(0x53000d50),payloadOffset(0x53002000));allowed.fill(1,payloadOffset(0x53002080),payloadOffset(0x53004000));allowed.fill(1,source.length-4);
  for(const {pinned} of Object.values(assets)){
    for(const h of pinned.hooks??[])allowed.fill(1,payloadOffset(h.va),payloadOffset(h.va)+4);
    for(const r of pinned.external_movw_movt_refs??[])for(const key of ['movw_va','movt_va'])allowed.fill(1,payloadOffset(r[key]),payloadOffset(r[key])+4);
  }
  // The official whitelist outside the approved arenas is immutable except
  // reviewed existing hook targets and MOVW/MOVT immediates below.
  const outside=applyWhitelistedSource(source,frozen);
  for(let i=0;i<body.length;i++)if(!allowed[i])requireThat(body[i]===source[i],`unowned full-payload difference at${i.toString(16)}`);
  for(const [address,n]of frozen.protected_ranges??[])requireThat(bytesEqual(read(Number(address),n),source.subarray(payloadOffset(address),payloadOffset(address)+n)),'protected native data');
  const mutableOutside=new Set<number>();
  for(const name of Object.keys(assets)){const {m,pinned}=assets[name],symbols=pinned.symbol_offsets??pinned.symbols;
    for(const h of pinned.hooks??[]){const at=Number(h.va),word=u32(at);requireThat(word>>>24===(h.link?0xeb:0xea)&&branchTarget(word,at)===m.base+symbols[h.target_symbol],'native hook target/link mismatch');for(let i=0;i<4;i++)mutableOutside.add(payloadOffset(at)+i);}
    for(const r of pinned.external_movw_movt_refs??[]){const target=m.base+m.symbols[r.target_symbol];for(const [key,high]of [['movw_va',false],['movt_va',true]]as const){const at=Number(r[key]),w=u32(at),old=new DataView(outside.buffer).getUint32(payloadOffset(at),true);requireThat((w&~0xf0fff)===(old&~0xf0fff)&&(w>>>12&15)===r.register,'MOV pair opcode/register mismatch');const immediate=((w>>>4)&0xf000)|(w&0xfff);requireThat(immediate===(high?target>>>16:target&65535),'MOV pair target mismatch');for(let i=0;i<4;i++)mutableOutside.add(payloadOffset(at)+i);}}
  }
  for(let i=0;i<body.length-4;i++)if(allowed[i]&&!(i>=payloadOffset(0x53000d50)&&i<payloadOffset(0x53002000))&&!(i>=payloadOffset(0x53002080)&&i<payloadOffset(0x53004000))&&!mutableOutside.has(i))requireThat(body[i]===outside[i],'pinned native mutation changed');
  // Each arena byte is owned by a validated module or must remain zero.
  for(const [a,z]of [[0x53000d50,0x53002000],[0x53002080,0x53004000]])for(let address=a;address<z;address++)if(!sorted.some(m=>address>=m.base&&address<m.end))requireThat(read(address,1)[0]===0,'nonzero unowned arena gap');
  function code(name:string,end:number,extra:number[]=[]){const {m,pinned,original,actual}=assets[name],skip=new Set(extra);for(const r of pinned.self_relocations??[])if(r.offset<end&&!extra.includes(r.offset)){for(let i=0;i<4;i++)skip.add(r.offset+i);const target=r.target_offset??r.symbol_offset+r.addend;requireThat(new DataView(actual.buffer,actual.byteOffset,actual.byteLength).getUint32(r.offset,true)===m.base+target,'precompiled literal relocation mismatch');}
    for(let i=0;i<end;i++)if(!skip.has(i))requireThat(actual[i]===original[i],`${name} code byte changed at${i}`);
  }
  const labels=candidate.slots.map(s=>s.label),tokens=candidate.slots.map(s=>s.token),menu=assets.menu,menuView=new DataView(menu.actual.buffer,menu.actual.byteOffset,menu.actual.byteLength),order=candidate.report.displayOrder;
  code('menu',1436,Array.from({length:36},(_,i)=>980+i));
  for(let i=0;i<18;i++){requireThat(menu.actual[980+i]===order[i]&&menu.actual[998+i]===order.indexOf(i),'menu permutation/inverse mismatch');}
  let cursor=1452;
  for(let i=0;i<4;i++){requireThat(menuView.getUint32(1436+i*4,true)===menu.m.base+cursor,'menu descriptor directory');requireThat(menu.actual[cursor]===labels[i].length+1&&menu.actual[cursor+1]===1&&menu.actual[cursor+2]===0&&menu.actual[cursor+3]===0,'label descriptor');requireThat(menuView.getUint32(cursor+4,true)===menu.m.base+cursor+8,'label string pointer');
    for(let j=0;j<=labels[i].length;j++)requireThat(menuView.getUint16(cursor+8+j*2,true)===(j===labels[i].length?0:labels[i].charCodeAt(j)),'UTF16 label');cursor+=align(8+(labels[i].length+1)*2);
  }requireThat(menu.m.bytes===cursor+8&&bytesEqual(menu.actual.subarray(cursor),Uint8Array.from([32,0,32,0,0,0,0,0])),'menu exact data extent');
  const text=assets.text,layout=parse(platform,'/re/web/module-layout.json').text,textView=new DataView(text.actual.buffer,text.actual.byteOffset,text.actual.byteLength),adrOffsets:number[]=[];
  const lineTargets:number[]=[];cursor=512+tokens.reduce((s,t)=>s+t.length+1,0);for(const t of tokens){lineTargets.push(cursor);cursor+=t.length+2;}
  const targets=[512,...lineTargets],oldTargets=[512,layout.gold_line,layout.line_800t,layout.line_ektar,layout.line_metropolis];
  for(let at=0;at<512;at+=4){const w=new DataView(text.original.buffer,text.original.byteOffset).getUint32(at,true);if((w&0x0e000000)!==0x02000000||(w>>>16&15)!==15||![2,4].includes(w>>>21&15))continue;const target=adrTarget(w,at),index=oldTargets.indexOf(target);if(index>=0){requireThat(adrTarget(textView.getUint32(at,true),at)===targets[index],'text ADR target');for(let i=0;i<4;i++)adrOffsets.push(at+i);}}
  requireThat(adrOffsets.length===20,'five text ADR relocations');const expectedText=new TextEncoder().encode(tokens.map(t=>t+'\0').join('')+tokens.map(t=>t+'\n\0').join('')),pool=align(512+expectedText.length);let literalCount=0;
  for(let at=0;at<512;at+=4){const w=new DataView(text.original.buffer,text.original.byteOffset).getUint32(at,true);if((w&0x0f7f0000)!==0x051f0000)continue;const target=at+8+((w&0x800000)?1:-1)*(w&4095);if(target!==592)continue;const actual=textView.getUint32(at,true);requireThat((actual&~0x800fff)===(w&~0x800fff)&&at+8+((actual&0x800000)?1:-1)*(actual&4095)===pool,'native text printf literal relocation');for(let j=0;j<4;j++)adrOffsets.push(at+j);literalCount++;}
  requireThat(literalCount===1&&bytesEqual(text.actual.subarray(pool),text.original.subarray(592)),'native text literal pool');code('text',512,adrOffsets);
  requireThat(bytesEqual(text.actual.subarray(512,512+expectedText.length),expectedText)&&text.m.bytes===pool+4,'text identity store and exact extent');
  const backend=assets.backend,bv=new DataView(backend.actual.buffer,backend.actual.byteOffset,backend.actual.byteLength);code('backend',2068);const recipeNodes:number[]=[];
  let curveEnd=2596;
  for(let i=0;i<4;i++){const descriptor=2068+i*104,mat=descriptor+84;requireThat(bv.getUint32(2484+i*4,true)===backend.m.base+descriptor&&bv.getUint32(descriptor+4,true)===backend.m.base+mat,'descriptor matrix binding');const native=source.subarray(payloadOffset(0x5407b540+0x19534),payloadOffset(0x5407b540+0x19534)+84);for(let j=0;j<84;j++)if(j<4||j>=8)requireThat(backend.actual[descriptor+j]===native[j],'native descriptor clone changed');
    const recipe=candidate.slots[i].recipe;for(let j=0;j<9;j++)requireThat(bv.getInt16(mat+j*2,true)===recipe.matrix_q13.flat()[j],'Q13 matrix readback');
    for(let ch=0;ch<3;ch++){const at=2500+(i*3+ch)*8,pointer=bv.getUint32(at,true)-backend.m.base,n=bv.getUint16(at+4,true),kind=bv.getUint16(at+6,true);requireThat(pointer>=2596&&pointer+n<=backend.m.bytes&&[0,1].includes(kind),'curve directory bounds/kind');const data=backend.actual.subarray(pointer,pointer+n),nodes=kind===0?decodeBlocked(data):(()=>{requireThat(n===130,'raw65 bytes');const v=new DataView(data.buffer,data.byteOffset,data.byteLength);return Array.from({length:65},(_,j)=>v.getUint16(j*2,true));})();requireThat(nodes.length===recipe.curves_q14[ch].length&&nodes.every((x,j)=>x===recipe.curves_q14[ch][j]),'all native curve samples match requested recipe');recipeNodes.push(nodes.length);curveEnd=Math.max(curveEnd,pointer+n);}
  }
  const tone=align(curveEnd);requireThat(backend.m.symbols.V9_tone_vector===tone&&backend.m.symbols.V9_tone_parser===tone+64&&backend.m.bytes===tone+79,'tone table placement/exact extent');requireThat(bytesEqual(backend.actual.subarray(tone,tone+48),source.subarray(payloadOffset(0x53d2b6f4),payloadOffset(0x53d2b6f4)+48)),'factory tone vector');for(let i=0;i<4;i++){requireThat(backend.actual[tone+48+i*4]===25+i&&bv.getUint16(tone+50+i*4,true)===268+i,'added tone vector identity');requireThat(backend.actual[tone+64+11+i]===25+i,'added tone parser');}requireThat(bytesEqual(backend.actual.subarray(tone+64,tone+75),source.subarray(payloadOffset(0x53d2d920),payloadOffset(0x53d2d920)+11)),'factory tone parser');
  const icon=assets.icon,iv=new DataView(icon.actual.buffer,icon.actual.byteOffset,icon.actual.byteLength),skip:number[]=[];for(let i=0;i<4;i++)for(let j=0;j<8;j++)skip.push(456+i*8+j);code('icon',488,skip);cursor=488;
  for(let i=0;i<4;i++){const ptr=iv.getUint32(456+i*8,true)-icon.m.base,n=iv.getUint32(460+i*8,true);requireThat(ptr===cursor&&n>0&&ptr+n<=icon.m.bytes,'icon compressed directory');requireThat(bytesEqual(decodeLz4(icon.actual.subarray(ptr,ptr+n)),candidate.slots[i].icon),'decoded native icon differs from requested pixels');cursor+=n;}requireThat(cursor===icon.m.bytes,'icon exact data extent');
  const storage=assets.storage,storageView=new DataView(storage.actual.buffer,storage.actual.byteOffset,storage.actual.byteLength),codeSkip:number[]=[];
  if(candidate.registryChanged){let found=0;for(let at=336;at<408;at+=4){const original=new DataView(storage.original.buffer,storage.original.byteOffset).getUint32(at,true);if(original===0xe3500f42||original===0xe3001230){const branchAt=at+(original===0xe3500f42?4:8);requireThat(new DataView(storage.original.buffer,storage.original.byteOffset).getUint32(branchAt,true)>>>24===0x0a&&storageView.getUint32(branchAt,true)===0xe1a00000,'legacy registry mismatch must disable unsafe ordinal migration');for(let i=0;i<4;i++)codeSkip.push(branchAt+i);found++;}}requireThat(found===2,'legacy instruction variant closure');}
  code('storage',900,codeSkip);requireThat(storage.m.bytes===storage.original.length,'storage length');for(let i=900;i<storage.m.bytes;i++){const uuidField=i>=924&&i<1004&&(i-924)%20<16;if(!uuidField)requireThat(storage.actual[i]===storage.original[i],'storage header schema or legacy tail changed');}
  for(let i=0;i<4;i++)requireThat(bytesEqual(storage.actual.subarray(924+i*20,940+i*20),fromHex(candidate.slots[i].uuid.replaceAll('-',''))),'persistent UUID descriptor');code('raw',assets.raw.original.length);requireThat(assets.raw.actual.length===assets.raw.original.length,'raw module exact extent');
  return {status:'PASS',fullPayloadOwnership:true,precompiledCodeCompared:true,curveSamplesCompared:recipeNodes.reduce((s,n)=>s+n,0),matrixCoefficientsCompared:36,iconPixelsCompared:4096,displayPermutationChecked:true,uuidHeaderChecked:true,factoryTablesPreserved:true};
}
function applyWhitelistedSource(source:Uint8Array,plan:any){const out=Uint8Array.from(source);for(const p of plan.patches)out.set(fromHex(p.new_hex),payloadOffset(p.va));return out;}
