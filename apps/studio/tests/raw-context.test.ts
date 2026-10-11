/** Exercise the editor's photo-bound RAW context without a DOM. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeRawContext} from '../project.ts';
// Run the module body as a script; the context supplies its imports as globals.
const source=readFileSync(new URL('../editor/raw.js',import.meta.url),'utf8').replace(/^(import|export) \{[^}]*\}( from '[^']*')?;$/gm,'');
const shaA='a'.repeat(64),shaB='b'.repeat(64),defaults={exposure:0,wb:'camera',temperature:0,tint:0};
const a={id:'A',name:'same.dng',raw:{source_sha256:shaA,settings:{...defaults}}},b={id:'B',name:'same.dng',raw:{source_sha256:shaB,settings:{...defaults}}};
const context=vm.createContext({photos:[a,b],activePhoto:b,clone:(v:unknown)=>JSON.parse(JSON.stringify(v)),calls:[]});
vm.runInContext(source,context);
vm.runInContext('scheduleRaw = photo => calls.push(photo.id); syncRawPanel = () => {}; selectPhoto = photo => { activePhoto=photo; };',context);
const target={filename:'same.dng',source_sha256:shaA,settings:{exposure:1,wb:'custom',temperature:20,tint:-10}};
context.target=target;vm.runInContext('applyRawContext(target)',context);
assert.deepEqual(b.raw.settings,defaults);assert.deepEqual(context.calls,[]);assert.equal(vm.runInContext('pendingRawContext.source_sha256',context),shaA);
context.activePhoto=a;vm.runInContext('applyRawContext(pendingRawContext)',context);
assert.deepEqual(JSON.parse(JSON.stringify(a.raw.settings)),target.settings);assert.deepEqual(context.calls,['A']);assert.equal(vm.runInContext('pendingRawContext',context),null);
vm.runInContext('applyRawContext(null)',context);assert.equal(vm.runInContext('pendingRawContext',context),null);
context.snapshot={photoId:'B',settings:{...defaults,exposure:-1}};vm.runInContext('restoreRawSnapshot(snapshot)',context);assert.equal(context.activePhoto,b);assert.equal(b.raw.settings.exposure,-1);assert.equal(a.raw.settings.exposure,1);
context.snapshot={photoId:'missing',settings:{...defaults,exposure:2}};vm.runInContext('restoreRawSnapshot(snapshot)',context);assert.equal(b.raw.settings.exposure,-1);
assert.throws(()=>normalizeRawContext({...target,source_sha256:shaB,settings:{...target.settings,exposure:99}}));assert.equal(b.raw.settings.exposure,-1);
context.target=normalizeRawContext({source_sha256:shaB,settings:{exposure:2}},true);vm.runInContext('applyRawContext(target)',context);
assert.deepEqual(JSON.parse(JSON.stringify(b.raw.settings)),{...defaults,exposure:2});assert.equal(a.raw.settings.exposure,1);
console.log('Studio RAW context: photo SHA binding, pending restore, same-name isolation and per-photo undo PASS');
