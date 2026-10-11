import test from "node:test";
import assert from "node:assert/strict";
import { checkCancelled, createLocalProjectStorage } from "../src/index.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear() { values.clear(); }, key(index) { return [...values.keys()][index] ?? null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
test("project storage isolates namespace and preserves Unicode projects", async () => {
  const memory = memoryStorage(), storage = createLocalProjectStorage(memory);
  memory.setItem("other:secret", "hidden");
  await storage.save("胶片", '{"name":"胶片"}');
  assert.deepEqual(await storage.list(), ["胶片"]);
  assert.equal(await storage.load("胶片"), '{"name":"胶片"}');
  await storage.remove("胶片"); assert.equal(await storage.load("胶片"), null);
});
test("cancelled operations never write", async () => {
  const signal = AbortSignal.abort(), storage = createLocalProjectStorage(memoryStorage());
  assert.throws(() => checkCancelled(signal), { name: "AbortError" });
  await assert.rejects(storage.save("x", "bad", signal), { name: "AbortError" });
  assert.deepEqual(await storage.list(), []);
  await assert.rejects(storage.save("", "bad"));
});
