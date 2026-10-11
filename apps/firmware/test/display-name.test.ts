import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validCameraName} from '../../../packages/firmware-core/src/display-name.ts';

test('camera text counts UTF-16 units including a bounded NUL descriptor',()=>{
  for(const name of ['T800','Tungsten 800','胶片 800','Café','🎞️ Film','A'.repeat(254),'😀'.repeat(127)]) assert.equal(validCameraName(name),true,name);
  for(const name of ['', '   ', 'A'.repeat(255), '😀'.repeat(128), 'bad\0name', 'bad\nname', '\ud800', '\udc00', 'a\ud800b', 'a\udc00b', null, 123]) assert.equal(validCameraName(name),false,String(name));
});
