import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeIndependent} from '../../firmware-core/src/decoder.ts';
import {runReferenceChecks} from '../src/index.ts';
import {createCandidate,type FourSlotSelection} from '../../firmware-core/src/candidate.ts';
const root=new URL('../../../',import.meta.url);
const source=decodeIndependent(new Uint8Array(await readFile(new URL('fwdc239b.bin',root)))).payload;
const platform=JSON.parse(await readFile(new URL('packages/firmware-core/platform/platform.json',root),'utf8'));
function check(result:any,labels:string[]){
 assert.equal(result.status,'PASS',result.error);
 const evidence=Object.values(result.reports)[0] as any;
 assert.equal(evidence.native_label_cases.length,168);
 for(const row of evidence.native_label_cases){const label=labels[row.id-0x312];assert.equal(row.label,label);assert.equal(row.utf16_hex,Buffer.from(label+'\0','utf16le').toString('hex'));}
 assert.equal(evidence.main_and_adj_candidate_name_cases,8);assert.equal(evidence.raw_candidate_icon_cases.length,8);
}
check((await runReferenceChecks(source,platform,{names:['V9_menu_arm']}))[0],['Gold 200','Tungsten 800','Ektar 100','Metropolis']);
const selection:FourSlotSelection={profile:'V9.1-four-slot',historicalDngPolicy:'fixed-slot-reinterpretation',persistencePolicy:'reset-on-registry-change',slots:[{reference:'tungsten',label:'T800'},{reference:'gold',label:'ABCD'},{reference:'ektar',label:'中文配方'},{reference:'metropolis',label:'X'.repeat(252)+'😀'}]};
const candidate=await createCandidate(source,platform,selection);
check((await runReferenceChecks(source,platform,{names:['V9_menu_arm'],candidate,finalPayload:candidate.beforeChecksum}))[0],candidate.slots.map(s=>s.label));
assert.deepEqual(candidate.slots.map(s=>s.token),['Gold200','Cine800T','Ektar100','Metropolis']);
console.log('PASS: reference and candidate native menu names, equal-length different names, Chinese, supplementary Unicode, maximum UTF16 descriptor length, and RAW icon resource bindings');
// Alter only a UTF16 character in the executed ROM, preserving descriptor length.
// The fixture and candidate expectations deliberately remain unchanged.
const menu=candidate.plan.modules.find((m:any)=>m.name==='menu')!;
const payloadView=new DataView(candidate.beforeChecksum.buffer,candidate.beforeChecksum.byteOffset,candidate.beforeChecksum.byteLength);
const romOffset=(address:number)=>address-0x53000000+0x10870;
const descriptor=payloadView.getUint32(romOffset(menu.base+1436),true);
const text=payloadView.getUint32(romOffset(descriptor+4),true);
const damaged=candidate.beforeChecksum.slice();damaged[romOffset(text)]^=1;
const rejected=(await runReferenceChecks(source,platform,{names:['V9_menu_arm'],candidate,finalPayload:damaged}))[0];
assert.equal(rejected.status,'FAIL');assert.match(rejected.error!,/final relocated module mismatch menu|native UTF16 label/);
console.log('PASS: one-byte UTF16 corruption in final executed candidate ROM fails despite unchanged candidate fixtures');
