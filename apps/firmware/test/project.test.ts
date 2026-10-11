import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_STYLES,REFERENCE_STYLES,FACTORY_ORDER,defaultSlots,selection,isReferenceSelection,isReferenceRecipeSelection,exportProject,importProject,importStyle} from '../src/project.ts';
import {renderIcon} from '../../../packages/style-contract/src/index.ts';
const fixture=new Uint8Array(await readFile(new URL('../../../stylepack/fixtures/asymmetric-v2.grstyle',import.meta.url)));
const styles=structuredClone(REFERENCE_STYLES),slots=defaultSlots();
test('project retains exact portable package and base hash, never BIN or transient recipes',async()=>{
 const added=await importStyle(fixture,'asymmetric.grstyle'),mapped=[added.id,...slots.slice(1)];
 const bytes=exportProject('Test',{name:'base.bin',sha256:'a'.repeat(64)},[...styles,added],mapped,FACTORY_ORDER,257);
 const restored=await importProject(bytes);
 assert.equal(restored.name,'Test');assert.equal(restored.nodes,257);assert.deepEqual(restored.slots,mapped);assert.deepEqual(restored.styles.at(-1)?.packageBytes,fixture);
 assert.deepEqual({...restored.base},{name:'base.bin',sha256:'a'.repeat(64)});
 assert.ok(!new TextDecoder().decode(bytes).includes('matrix_q13'));
 const requested=selection(restored.styles,restored.slots,restored.order);
 assert.equal(requested.profile,'V9.2-four-slot');
 if(requested.profile==='V9.2-four-slot')assert.equal(requested.slots[1].icon.definition,undefined,'legacy reference slots retain their original report shape');
 const encoded=JSON.parse(new TextDecoder().decode(bytes));
 assert.equal(encoded.platform.id,'gr3-hdf-v210-v9.2');
 assert.match(encoded.platform.sha256,/^[a-f0-9]{64}$/);
 assert.match(encoded.fitter.wasm_sha256,/^[a-f0-9]{64}$/);
 const reordered=structuredClone(encoded);reordered.platform=Object.fromEntries(Object.entries(reordered.platform).reverse());
 assert.deepEqual((await importProject(new TextEncoder().encode(JSON.stringify(reordered)))).slots,mapped);
 const previous=structuredClone(encoded);previous.platform.id='gr3-hdf-v210-v9.1';previous.platform.sha256='af0801924602658c5117fd5d62e7e3fd3f172ff44937a69b5f238af9d7d872a5';
 const original=JSON.stringify(previous),migrated=await importProject(new TextEncoder().encode(original));
 assert.equal(selection(migrated.styles,migrated.slots,migrated.order).profile,'V9.2-four-slot');
 assert.equal(migrated.migratedPlatformFrom,previous.platform.sha256);assert.deepEqual(migrated.slots,mapped);assert.deepEqual(migrated.styles.at(-1)?.packageBytes,fixture);
 assert.equal(JSON.stringify(previous),original,'migration never modifies original project');
 const latestPrevious=structuredClone(previous);latestPrevious.platform.sha256='d026b65784cf82657293d8b13dc42cf5682bc8a656f2a5dc492b494b1553dad2';assert.equal((await importProject(new TextEncoder().encode(JSON.stringify(latestPrevious)))).migratedPlatformFrom,latestPrevious.platform.sha256);
 for (const mutate of [(p:any)=>p.platform.sha256='0'.repeat(64),(p:any)=>p.fitter.evaluator_sha256='0'.repeat(64),(p:any)=>delete p.platform,(p:any)=>p.platform.extra=true]) {
   const changed=structuredClone(encoded);mutate(changed);await assert.rejects(()=>importProject(new TextEncoder().encode(JSON.stringify(changed))));
 }
});
test('reference selection preserves frozen profile and canonical menu is explicit',()=>{
 assert.ok(isReferenceSelection(styles,slots,FACTORY_ORDER));assert.deepEqual(selection(styles,slots,FACTORY_ORDER),{profile:'V9.2-reference'});
 const order=[...FACTORY_ORDER];[order[0],order[1]]=[order[1],order[0]];
 assert.throws(()=>selection(styles,slots,order),/menu order/);
});
test('film-label defaults preserve reference recipes and round-trip exact icons without changing legacy projects',async()=>{
 assert.ok(isReferenceRecipeSelection(DEFAULT_STYLES,slots,FACTORY_ORDER));
 assert.ok(!isReferenceSelection(DEFAULT_STYLES,slots,FACTORY_ORDER));
 const requested=selection(DEFAULT_STYLES,slots,FACTORY_ORDER);
 assert.equal(requested.profile,'V9.2-four-slot');
 if(requested.profile!=='V9.2-four-slot')throw new Error('Expected resource variant');
 requested.slots.forEach((slot,i)=>{
  assert.equal(slot.reference,REFERENCE_STYLES[i].reference);assert.equal(slot.uuid,REFERENCE_STYLES[i].id);
  assert.deepEqual(slot.icon.definition,DEFAULT_STYLES[i].icon);
  assert.equal(slot.icon.pixels_hex,Buffer.from(renderIcon(DEFAULT_STYLES[i].icon)).toString('hex'));
  assert.equal(slot.recipe,undefined);
 });
 const bytes=exportProject('New icons',null,DEFAULT_STYLES,slots,FACTORY_ORDER);
 const encoded=JSON.parse(new TextDecoder().decode(bytes));assert.equal(encoded.schema,'gr-firmware-project/v2');
 assert.deepEqual((await importProject(bytes)).styles,DEFAULT_STYLES);
 const reordered=structuredClone(encoded);reordered.styles[0]={icon:reordered.styles[0].icon,reference:reordered.styles[0].reference};
 assert.deepEqual((await importProject(new TextEncoder().encode(JSON.stringify(reordered)))).styles,DEFAULT_STYLES);
 const legacy=exportProject('Legacy',null,REFERENCE_STYLES,slots,FACTORY_ORDER);
 assert.equal(JSON.parse(new TextDecoder().decode(legacy)).schema,'gr-firmware-project/v1');
 const restored=await importProject(legacy);assert.deepEqual(restored.styles,REFERENCE_STYLES);
 assert.equal(selection(restored.styles,restored.slots,restored.order).profile,'V9.2-reference');
 const swapped=[slots[1],slots[0],...slots.slice(2)];assert.ok(!isReferenceRecipeSelection(DEFAULT_STYLES,swapped,FACTORY_ORDER));
 for(const mutate of [(p:any)=>delete p.styles[0].icon,(p:any)=>p.styles[0].icon.top_text='TOOLONG',(p:any)=>p.styles[0].icon.extra=true,(p:any)=>p.schema='gr-firmware-project/v1']){
  const changed=structuredClone(encoded);mutate(changed);await assert.rejects(()=>importProject(new TextEncoder().encode(JSON.stringify(changed))));
 }
});
test('project rejects duplicate identities, duplicate slot assignment, changed fixed Custom positions and unknown fields',async()=>{
 const project=JSON.parse(new TextDecoder().decode(exportProject('Test',null,styles,slots,FACTORY_ORDER)));
 for(const mutate of [(p:any)=>p.styles.push(p.styles[0]),(p:any)=>p.slots[1]=p.slots[0],(p:any)=>[p.menu_order[15],p.menu_order[16]]=[p.menu_order[16],p.menu_order[15]],(p:any)=>p.native_recipe={}]){
  const altered=structuredClone(project);mutate(altered);await assert.rejects(()=>importProject(new TextEncoder().encode(JSON.stringify(altered))));
 }
 await assert.rejects(()=>importProject(new TextEncoder().encode('{"schema":"x","schema":"y"}')));
});
