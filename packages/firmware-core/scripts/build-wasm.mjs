import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const [cmd, args] of [
  ['cargo', ['build', '--locked', '--manifest-path', `${root}rust/Cargo.toml`, '--release', '--target', 'wasm32-unknown-unknown']],
  ['wasm-bindgen', [`${root}rust/target/wasm32-unknown-unknown/release/gr_firmware_core.wasm`, '--target', 'web', '--out-dir', `${root}wasm`, '--out-name', 'gr_firmware_core']],
]) {
  const p = spawnSync(cmd, args, { stdio: 'inherit' });
  if (p.status !== 0) process.exit(p.status ?? 1);
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(`${root}wasm/pin.ts`, `// Generated WASM and source integrity pins.\nexport const CORE_WASM_SHA256 = '${hash(`${root}wasm/gr_firmware_core_bg.wasm`)}';\nexport const CORE_RUST_SOURCE_SHA256 = '${hash(`${root}rust/src/lib.rs`)}';\n`);
