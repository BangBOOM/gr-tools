import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../../../packages/color-engine/index.ts';
import {presetCardsHTML, presetCopy} from '../presets.ts';

test('presentation copy covers exactly the model presets', () => {
  assert.deepEqual(Object.keys(presetCopy).sort(), Object.keys(PRESETS).sort());
});
test('cards render in pages of four with every preset once', () => {
  const html = presetCardsHTML();
  assert.equal(html.match(/class="starting-page"/g)?.length, Math.ceil(Object.keys(presetCopy).length / 4));
  assert.deepEqual([...html.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]), Object.keys(presetCopy));
});
