import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignStyle, libraryEntries, moveSlot, unassignSlot} from '../src/slot-mapping.ts';
import {REFERENCE_STYLES} from '../src/project.ts';
const slots = ['gold','tungsten','ektar','metro'], available = [...slots,'custom'];

test('sortable movement inserts a card and preserves intervening styles', () => {
  assert.deepEqual(moveSlot(slots,0,2),['tungsten','ektar','gold','metro']);
  assert.deepEqual(moveSlot(slots,3,1),['gold','metro','tungsten','ektar']);
  assert.deepEqual(moveSlot(moveSlot(slots,0,3),3,0),slots);
  assert.deepEqual(moveSlot(slots,1,1),slots);
  assert.deepEqual(slots,['gold','tungsten','ektar','metro']);
});
test('the available pool inserts into spare capacity or replaces a full target', () => {
  assert.deepEqual(assignStyle(slots,'custom',0,available),['custom','tungsten','ektar','metro']);
  assert.deepEqual(assignStyle(['gold','ektar','metro',''],'tungsten',1,available),slots);
  assert.deepEqual(assignStyle(['gold','','',''],'custom',3,available),['gold','custom','','']);
  assert.throws(()=>assignStyle(slots,'gold',2,available),/already assigned/);
  assert.throws(()=>assignStyle(slots,'gold',0,available),/already assigned/);
});
test('returning any style closes the gap and keeps empty positions at the end', () => {
  assert.deepEqual(unassignSlot(slots,0),['tungsten','ektar','metro','']);
  const partial=unassignSlot(slots,1);
  assert.deepEqual(partial,['gold','ektar','metro','']);
  assert.deepEqual(unassignSlot(slots,3),['gold','tungsten','ektar','']);
  assert.deepEqual(assignStyle(partial,'tungsten',1,available),slots);
  const fewer=unassignSlot(partial,1);
  assert.deepEqual(fewer,['gold','metro','','']);
  assert.deepEqual(moveSlot(fewer,0,3),['metro','gold','','']);
  assert.deepEqual(unassignSlot(['gold','','ektar','metro'],2),['gold','metro','','']);
});
test('library shows only unassigned styles and retains original icon/delete indices', () => {
  const ids=REFERENCE_STYLES.map(s=>s.id);
  assert.deepEqual(libraryEntries(REFERENCE_STYLES,ids),[]);
  const entries=libraryEntries(REFERENCE_STYLES,unassignSlot(ids,1));
  assert.deepEqual(entries.map(e=>[e.style.id,e.index]),[[ids[1],1]]);
});
test('bad indices, unknown styles and corrupt mappings cannot reach firmware state', () => {
  for(const index of [-1,4,1.5,NaN]){
    assert.throws(()=>moveSlot(slots,index,0));assert.throws(()=>moveSlot(slots,0,index));
    assert.throws(()=>assignStyle(slots,'custom',index,available));assert.throws(()=>unassignSlot(slots,index));
  }
  assert.throws(()=>assignStyle(slots,'external',0,available));assert.throws(()=>assignStyle(slots,'',0,available));
  assert.throws(()=>moveSlot(['gold','','ektar','metro'],1,0));
  for(const invalid of [['gold','gold','',''],['gold'],['gold',null,'ektar','metro'] as unknown as string[]]){
    assert.throws(()=>assignStyle(invalid,'custom',0,available));assert.throws(()=>unassignSlot(invalid,0));
  }
});
