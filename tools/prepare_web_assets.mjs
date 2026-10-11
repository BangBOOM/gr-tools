import { UNICORN_RUNTIME_SHA256 } from '../packages/firmware-checks/vendor/source-build-2026-10-09/pin.ts';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const unicorn = await readFile(new URL('../packages/firmware-checks/vendor/source-build-2026-10-09/unicorn_arm.mjs', import.meta.url));
if (createHash('sha256').update(unicorn).digest('hex') !== UNICORN_RUNTIME_SHA256) throw new Error('Unicorn runtime differs from its source-build pin');
const licenses = new URL('../public/licenses/', import.meta.url);
await mkdir(licenses, { recursive: true });
await rm(new URL('GR-Tools-MIT.txt', licenses), { force: true });
await cp(new URL('../LICENSE', import.meta.url), new URL('GR-Tools-AGPL-3.0.txt', licenses));
await cp(new URL('../NOTICE', import.meta.url), new URL('GR-Tools-NOTICE.txt', licenses));
await cp(new URL('../FIRMWARE-LICENSE', import.meta.url), new URL('GR-Firmware-LICENSE.txt', licenses));
const target = new URL('../public/vendor/libraw/', import.meta.url);
await mkdir(target, { recursive: true });
const rawRuntime = new URL('../packages/raw-web/runtime/source-build-2026-10-09/', import.meta.url);
const source = JSON.parse(await readFile(new URL('SOURCE.json', rawRuntime)));
for (const output of source.outputs) {
  const file = output.file.replace('libraw-threaded/', '');
  const bytes = await readFile(new URL(file, rawRuntime));
  if (createHash('sha256').update(bytes).digest('hex') !== output.sha256) throw new Error('LibRaw source-build output differs: ' + file);
  await cp(new URL(file, rawRuntime), new URL(file, target));
}
await writeFile(new URL('provenance.json', target), JSON.stringify({
  runtime: 'gr-libraw-source-build/2026-10-09', variant: 'pthread',
  wasm_sha256: source.outputs.find(output => output.file.endsWith('/libraw.wasm')).sha256,
  wrapper_version: source.sources.wrapper.version,
  upstream_commit: source.sources.wrapper.commit,
  source: 'https://github.com/ybouane/LibRaw-Wasm',
  build: source,
}, null, 2));
await cp(new URL('../node_modules/libraw-wasm/readme.md', import.meta.url), new URL('README.md', target));
