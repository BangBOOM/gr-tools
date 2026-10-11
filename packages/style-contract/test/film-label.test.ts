import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { defaultFilmLabel, renderIcon, validateIcon, sha256, createStylePackage, inspectStylePackage } from "../src/index.ts";
const fixtures = new URL("../../../stylepack/fixtures/", import.meta.url);
const rows = JSON.parse(readFileSync(new URL("film-labels.json", fixtures), "utf8"));
const id = "84556270-dd3c-48bb-8958-7a9395997cfb";
test("film labels share Python hashes for layouts, empty bottom and contrast threshold", async () => {
  for (const row of rows) assert.equal(await sha256(renderIcon(row.icon)), row.sha256);
  const solid = rows[0].icon;
  const pixel = (color: string) => [...renderIcon({...solid, top_color: color}).slice((5 * 32 + 7) * 4, (5 * 32 + 7) * 4 + 4)];
  assert.deepEqual(pixel("#757575"), [248,244,235,255]);
  assert.deepEqual(pixel("#767676"), [24,24,24,255]);
  assert.deepEqual([...renderIcon({...solid,layout:"band"}).slice((27*32+2)*4,(27*32+2)*4+4)], [66,45,40,255]);
});
test("film defaults separate the trailing number group and preserve UUID fallback", () => {
  assert.deepEqual(defaultFilmLabel("Gold 200", id), {...rows[0].icon,layout:"split",top_color:"#E8B640"});
  assert.equal(defaultFilmLabel("胶片",id).top_text,"8455");
  assert.equal(defaultFilmLabel("123456",id).bottom_text,"1234");
  assert.equal(defaultFilmLabel("Gold 20 extra",id).bottom_text,"");
});
test("film fields reject missing, extra, lowercase and invalid values", () => {
 const icon = rows[0].icon;
 for (const changes of [{layout:"other"},{top_text:"A\n"},{top_color:"#FFFFFF\n"},{top_text:""},{top_text:"ABCDE"},{bottom_text:"abc"},{top_color:"#abcdef"},{bottom_color:123},{text:"GOLD"},{template:"film-label-v2"}]) assert.throws(()=>validateIcon({...icon,...changes}));
 for (const key of Object.keys(icon)) { const missing={...icon}; delete missing[key]; assert.throws(()=>validateIcon(missing)); }
});
test("film icon changes preserve original cube and compiled payload bytes", async () => {
 const cube = new Uint8Array(readFileSync(new URL("asymmetric.cube",fixtures)));
 const camera = {platform:{id:"test",sha256:"a".repeat(64)},fit:{matrix_q13:[[8192,0,0],[0,8192,0],[0,0,8192]],curves_q14:Array.from({length:3},()=>Array.from({length:65},(_,i)=>i*256)),report:{source:"unchanged"}}};
 const input={cube,name:"Gold 200",style_id:id,version:"1",author:"Test",license:"CC-BY-4.0",camera};
 const before=unzipSync(await createStylePackage(input));
 for (const row of rows) { const data=await createStylePackage({...input,icon:row.icon}); const after=unzipSync(data); assert.deepEqual(after["look.cube"],cube); assert.deepEqual(after["camera.json"],before["camera.json"]); assert.deepEqual(JSON.parse(JSON.stringify((await inspectStylePackage(data)).camera)),camera); }
});
