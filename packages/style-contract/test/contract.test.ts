import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, unzipSync } from "fflate";
import { createStylePackage, inspectStylePackage, renderIcon, defaultIcon, strictJSON, validateCube, sha256 } from "../src/index.ts";

const fixtures = new URL("../../../stylepack/fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, fixtures)));
const cube = bytes("asymmetric.cube"), id = "84556270-dd3c-48bb-8958-7a9395997cfb";
const encode = (text: string) => new TextEncoder().encode(text);
const create = (overrides = {}) => createStylePackage({ cube, name: "Asymmetric", style_id: id, version: "1.0.0", author: "Test author", license: "CC-BY-4.0", source: "https://example.invalid/look", ...overrides });

test("reads Python v1/v2 fixtures with exact asymmetric cube, no v1 mutation", async () => {
  for (const version of [1, 2]) {
    const result = await inspectStylePackage(bytes(`asymmetric-v${version}.grstyle`));
    assert.equal(result.manifest.schema, `gr-style-package/v${version}`);
    assert.deepEqual(result.cubeBytes, cube);
    assert.equal(result.cube.size, 17);
    assert.equal(result.icon.template, "text-border-v1");
    if (result.icon.template === "text-border-v1") assert.equal(result.icon.text, "ASYM");
    assert.equal(Object.hasOwn(result.manifest, "icon"), version === 2);
  }
});
test("creates deterministic v2 preserving all cube bytes", async () => {
  const result = await inspectStylePackage(await create());
  assert.equal(result.manifest.schema, "gr-style-package/v2");
  assert.deepEqual(result.cubeBytes, cube);
  assert.deepEqual(await create(), await create());
});
test("four V9 labels match original RGBA byte for byte", () => {
  const rows = JSON.parse(readFileSync(new URL("icons.json", fixtures), "utf8"));
  for (const row of rows) assert.deepEqual(renderIcon(row.icon), bytes(row.rgba_file));
  const font = JSON.parse(readFileSync(new URL("icon-font.json", fixtures), "utf8"));
  assert.equal(Object.keys(font).length, 36);
  for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") assert.equal(renderIcon({ template: "text-border-v1", text: char, border_color: "#E5B828" }).length, 4096);
  assert.equal(defaultIcon("胶片", id).text, "8455");
});
test("strict JSON rejects duplicate keys including escaped collisions and all nonfinite forms", () => {
  for (const text of ['{"name":1,"name":2}', '{"name":1,"na\\u006de":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":1e999}', '{} trailing', '[1,]', '{"a":1,}', '"bad\u0001"']) assert.throws(() => strictJSON(text));
  assert.equal((strictJSON('{"__proto__":1,"a":[true,null,1.5]}') as Record<string, unknown>).__proto__, 1);
});
test("cube rejects invalid domain, rows, headers and numeric values", () => {
  const source = new TextDecoder().decode(cube);
  const invalid = [source + "0 0 0\n", source.replace("LUT_3D_SIZE 17", "LUT_1D_SIZE 17"), source.replace("DOMAIN_MIN 0 0 0", "DOMAIN_MIN -1 0 0"), source.replace("DOMAIN_MAX 1 1 1", "UNKNOWN 1 1 1"), source.replace("0.00000000 0.00000000 1.00000000", "NaN 0 1"), source.replace("0.00000000 0.00000000 1.00000000", "0 0 1.1"), source.replace("0.00000000 0.00000000 1.00000000", "1e999 0 1"), source.split("\n").slice(0, -2).join("\n")];
  for (const text of invalid) assert.throws(() => validateCube(encode(text)));
});
test("archive traversal, duplicate/extra files, checksum and v1 extra icon rejected", async () => {
  const data = await create(), files = unzipSync(data);
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "../look.cube": cube })));
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "profiles/recipe.json": encode("{}") })));
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "look.cube": encode(new TextDecoder().decode(cube) + "# change\n") })));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"])); manifest.schema = "gr-style-package/v1";
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "manifest.json": encode(JSON.stringify(manifest)) })));
  // Rewrite the central directory to repeat the first member name.
  const corrupted = data.slice(), view = new DataView(corrupted.buffer);
  const end = corrupted.length - 22, start = view.getUint32(end + 16, true);
  const second = start + 46 + view.getUint16(start + 28, true) + view.getUint16(start + 30, true) + view.getUint16(start + 32, true);
  view.setUint16(second + 8, view.getUint16(second + 8, true) | 1, true);
  await assert.rejects(inspectStylePackage(corrupted));
});
test("metadata and icons remain strict", async () => {
  for (const overrides of [{ style_id: "invalid" }, { icon: { template: "text-border-v1", text: "abc", border_color: "#E5B828" } }, { license: "" }]) await assert.rejects(create(overrides));
});

// Used by the Python compatibility test, without depending on ZIP byte equality.
if (process.env.GR_STYLE_TEST_OUTPUT) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.GR_STYLE_TEST_OUTPUT, await create());
}

const camera = {
  platform: { id: "gr3-v1", sha256: "a".repeat(64) },
  fit: { matrix_q13: [[8192, 0, 0], [0, 8192, 0], [0, 0, 8192]], curves_q14: Array.from({ length: 3 }, () => Array.from({ length: 65 }, (_, i) => i * 256)), report: { input_cube_sha256: "b".repeat(64), nested: { values: [true, null, 0.5] } } },
};
test("v3 preserves exact cube and compiled fit with deterministic camera identity", async () => {
  const data = await create({ camera }), result = await inspectStylePackage(data);
  assert.equal(result.manifest.schema, "gr-style-package/v3");
  assert.deepEqual(JSON.parse(JSON.stringify(result.camera)), camera);
  assert.deepEqual(result.cubeBytes, cube);
  assert.deepEqual(data, await create({ camera }));
  assert.deepEqual(Object.keys(unzipSync(data)).sort(), ["camera.json", "look.cube", "manifest.json"]);
  assert.equal(result.manifest.camera?.path, "camera.json");
});
test("v3 rejects altered camera, platform fields, schema member mismatch and unknown entries", async () => {
  const files = unzipSync(await create({ camera }));
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "camera.json": encode(JSON.stringify({ ...camera.fit, report: {} })) })), /checksum/);
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "unknown.json": encode("{}") })));
  await assert.rejects(inspectStylePackage(zipSync({ "manifest.json": files["manifest.json"], "look.cube": cube })));
  const legacy = unzipSync(await create());
  await assert.rejects(inspectStylePackage(zipSync({ ...legacy, "camera.json": files["camera.json"] })), /members mismatch/);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  manifest.camera.platform.extra = true;
  await assert.rejects(inspectStylePackage(zipSync({ ...files, "manifest.json": encode(JSON.stringify(manifest)) })), /platform/);
});
test("compiled input validates bounded structural recipe and report without algorithm checks", async () => {
  for (const fit of [
    { ...camera.fit, extra: true }, { ...camera.fit, report: [] },
    { ...camera.fit, matrix_q13: [[32768, 0, 0], ...camera.fit.matrix_q13.slice(1)] },
    { ...camera.fit, curves_q14: [camera.fit.curves_q14[0], [], camera.fit.curves_q14[2]] },
    { ...camera.fit, curves_q14: Array.from({ length: 3 }, () => Array(65).fill(16385)) },
    { ...camera.fit, report: { value: Infinity } },
    { ...camera.fit, report: { payload: "x".repeat(256 * 1024) } },
  ]) await assert.rejects(create({ camera: { ...camera, fit } }));
  await assert.rejects(create({ camera: { ...camera, platform: { id: "gr3", sha256: "invalid" } } }));
  const unconstrained = { ...camera.fit, matrix_q13: Array.from({ length: 3 }, () => [0, 0, 0]), curves_q14: Array.from({ length: 3 }, () => Array(65).fill(1)) };
  assert.deepEqual(JSON.parse(JSON.stringify((await inspectStylePackage(await create({ camera: { ...camera, fit: unconstrained } }))).camera?.fit)), unconstrained);
});

test("v3 rejects malformed payload even when its checksum is updated", async () => {
  const files = unzipSync(await create({ camera }));
  for (const source of [
    JSON.stringify({ ...camera.fit, unknown: 1 }),
    JSON.stringify({ ...camera.fit, report: [] }),
    JSON.stringify({ ...camera.fit, matrix_q13: [[0, 0], [0, 0, 0], [0, 0, 0]] }),
    JSON.stringify({ ...camera.fit, curves_q14: Array.from({ length: 3 }, () => Array(65).fill(-1)) }),
    '{"matrix_q13":[],"matrix_q13":[],"curves_q14":[],"report":{}}',
    JSON.stringify({ ...camera.fit, report: { value: 0 } }).replace('"value":0', '"value":1e999'),
  ]) {
    const payload = encode(source), manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    manifest.camera.sha256 = await sha256(payload);
    await assert.rejects(inspectStylePackage(zipSync({ ...files, "camera.json": payload, "manifest.json": encode(JSON.stringify(manifest)) })));
  }
});

test("v3 preserves report field order used by independent fit identity", async () => {
  const report = { z_identity: 1, a_evidence: { z_value: 2, a_value: 3 } };
  const result = await inspectStylePackage(await create({ camera: { ...camera, fit: { ...camera.fit, report } } }));
  assert.equal(JSON.stringify(result.camera?.fit.report), JSON.stringify(report));
});
