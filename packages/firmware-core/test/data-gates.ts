import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeIndependent} from '../src/decoder.ts';
import {createCandidate,type FourSlotSelection} from '../src/candidate.ts';
import {customSelection} from './selection.ts';
import {fitCube,parseCube} from '../../firmware-fit/src/index.ts';
import {createStylePackage,inspectStylePackage,renderIcon} from '../../style-contract/src/index.ts';
import {DEFAULT_STYLES,FACTORY_ORDER,defaultSlots,selection} from '../../../apps/firmware/src/project.ts';
import {verifyCandidateReadback} from '../src/readback.ts';
import {assetBytes} from '../src/platform.ts';
const root=new URL('../../../',import.meta.url),source=decodeIndependent(new Uint8Array(await readFile(new URL('fwdc239b.bin',root)))).payload,platform=JSON.parse(await readFile(new URL('packages/firmware-core/platform/platform.json',root),'utf8'));
const base:FourSlotSelection={profile:'V9.2-four-slot',historicalDngPolicy:'fixed-slot-reinterpretation',persistencePolicy:'reset-on-registry-change',slots:['gold','tungsten','ektar','metropolis'].map(reference=>({reference:reference as any}))};
const reordered=structuredClone(base);reordered.displayOrder=Array.from({length:18},(_,i)=>i);await assert.rejects(()=>createCandidate(source,platform,reordered),/preserves frozen/);
const duplicate=structuredClone(base);duplicate.slots[1]={reference:'gold'};await assert.rejects(()=>createCandidate(source,platform,duplicate),/duplicate installed UUID/);
const missingPolicy=structuredClone(base);[missingPolicy.slots[0],missingPolicy.slots[1]]=[missingPolicy.slots[1],missingPolicy.slots[0]];delete missingPolicy.persistencePolicy;await assert.rejects(()=>createCandidate(source,platform,missingPolicy),/explicit persistencePolicy/);
const bare=structuredClone(base);bare.slots[0]={uuid:'11111111-2222-4333-8444-555555555555',recipe:{matrix_q13:[[8192,0,0],[0,8192,0],[0,0,8192]],curves_q14:Array.from({length:3},()=>Array.from({length:65},(_,i)=>i*256))}};await assert.rejects(()=>createCandidate(source,platform,bare),/require a bound/);
const override=structuredClone(base);override.slots[0].recipe=bare.slots[0].recipe;await assert.rejects(()=>createCandidate(source,platform,override),/only exact pinned/);
const badIcon=structuredClone(base);badIcon.slots[0].icon={pixels_hex:'00'.repeat(4096)};await assert.rejects(()=>createCandidate(source,platform,badIcon),/only exact pinned/);
const labels=selection(DEFAULT_STYLES,defaultSlots(),FACTORY_ORDER) as FourSlotSelection;
const iconVariant=await createCandidate(source,platform,labels);
assert.equal(iconVariant.registryChanged,false,'icon-only changes preserve saved-control identity');
assert.equal(verifyCandidateReadback(source,iconVariant.beforeChecksum,platform,iconVariant).status,'PASS');
for(let i=0;i<4;i++){
 const frozen=JSON.parse(new TextDecoder().decode(assetBytes(platform,`/re/build/V9-backend/${['gold','800t','ektar','metro'][i]}-recipe.json`)));
 assert.deepEqual(iconVariant.slots[i].recipe.matrix_q13,frozen.matrix_q13);
 assert.deepEqual(iconVariant.slots[i].recipe.curves_q14,frozen.curves_q14);
 assert.equal(iconVariant.slots[i].uuid,frozen.uuid);
 assert.deepEqual(iconVariant.slots[i].icon,renderIcon(DEFAULT_STYLES[i].icon));
}
assert.ok(iconVariant.slots.reduce((n,s)=>n+s.compressedIcon.length,0)<=852);
const wrongPixels=structuredClone(labels);wrongPixels.slots[0].icon!.pixels_hex='00'.repeat(4096);await assert.rejects(()=>createCandidate(source,platform,wrongPixels),/definition differs/);
const wrongDefinition=structuredClone(labels);(wrongDefinition.slots[0].icon!.definition as any).top_text='TOOLONG';await assert.rejects(()=>createCandidate(source,platform,wrongDefinition),/Invalid film-label/);
const wrongIdentity=structuredClone(labels);wrongIdentity.slots[0].uuid='11111111-2222-4333-8444-555555555555';await assert.rejects(()=>createCandidate(source,platform,wrongIdentity),/only exact pinned/);
const wrongColor=structuredClone(labels);wrongColor.slots[0].recipe=bare.slots[0].recipe;await assert.rejects(()=>createCandidate(source,platform,wrongColor),/only exact pinned/);
const real=await customSelection();
const wrongPackage=structuredClone(real);wrongPackage.slots[0].packageSha256='0'.repeat(64);await assert.rejects(()=>createCandidate(source,platform,wrongPackage),/package fingerprint/);
const noAccept=structuredClone(real);delete noAccept.slots[0].acceptedFitHash;await assert.rejects(()=>createCandidate(source,platform,noAccept),/exact fit must be accepted/);
const badRecipe=structuredClone(real);badRecipe.slots[0].recipe!.curves_q14[0][1]=16000;await assert.rejects(()=>createCandidate(source,platform,badRecipe),/monotone/);
// Four separately fitted 257-node targets must fit their exact serialized arenas;
// no zero-search or neighboring native-data borrowing is permitted.
const overflow=structuredClone(base),original=parseCube(real.slots[0].cubeBytes!);overflow.slots=[];
for(let slot=0;slot<4;slot++){
 const rows=[];for(let i=0;i<original.values.length;i+=3)rows.push([0,1,2].map(ch=>Math.pow(original.values[i+ch],.65+slot*.13+ch*.07).toFixed(9)).join(' '));
 const cubeBytes=new TextEncoder().encode('LUT_3D_SIZE '+original.size+'\n'+rows.join('\n')+'\n'),packageBytes=await createStylePackage({cube:cubeBytes,name:'Capacity '+slot,style_id:`11111111-2222-4333-8444-55555555555${slot}`,version:'1.0',author:'test',license:'CC0'}),style=await inspectStylePackage(packageBytes),fit=await fitCube(cubeBytes,{nodes:257});
 overflow.slots.push({uuid:style.manifest.id,label:style.manifest.name,recipe:fit,fitReport:fit.report,acceptedFitHash:fit.report.fit_sha256,packageBytes,packageSha256:style.package_sha256,cubeBytes,cubeSha256:style.manifest.look.sha256,icon:{pixels_hex:Buffer.from(renderIcon(style.icon)).toString('hex')}});
}
await assert.rejects(()=>createCandidate(source,platform,overflow),/second ROM arena capacity exceeded/);
const swapped=structuredClone(base);[swapped.slots[0],swapped.slots[1]]=[swapped.slots[1],swapped.slots[0]];const candidate=await createCandidate(source,platform,swapped);assert.equal(verifyCandidateReadback(source,candidate.beforeChecksum,platform,candidate).status,'PASS');assert.equal(candidate.slots[0].label,'Tungsten 800');assert.equal(candidate.slots[0].styleName,'Tungsten 800');assert.equal(candidate.slots[0].token,'Gold200');
console.log('PASS: fixed menu, duplicate identity, registry policy, actual fitted curve capacity, package/acceptance, monotonicity, and matching-display-name recipe swap with stable text-I/O tokens');
