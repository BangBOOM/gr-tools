# Browser firmware core

This package takes a user's local official GR III BIN, builds locally in a Worker,
and returns a BIN only after every required software gate passes. No complete ROM
is distributed. Runtime has no Python, shell, assembler, filesystem or network
service dependency. Static asset fetches and WebAssembly initialization are the
only initial I/O.

```ts
const core = await createFirmwareCore();
const identity = await core.inspect(baseArrayBuffer);
const plan = await core.plan(baseArrayBuffer, selection);
const result = await core.build(baseArrayBuffer, selection, {onProgress});
if (await verifyReportIntegrity(result.report, result.firmware)) { /* save */ }
```

Use a dedicated Worker. Cancellation and the watchdog terminate the Worker;
Unicorn's instruction execution is synchronous. Transfer or copy the resulting
ArrayBuffer only after report integrity validation. `verify(...,{runArm:false})`
produces a blocked report and cannot authorize a download.

The only accepted build base is official GR III 2.10, SHA256
`d6a3c9c288d784080e7b283222ecdd8752adfeed6faa36dab44f73115354bfd4`.
Known V7, defective V9, V9.1 and V9.2 reference files can be identified; identification does not
imply support as build bases. Unknown files fail closed.

## First version scope

The default `V9.2-reference` reproduces the separately reviewed V9.2 persistence
repair BIN byte for byte. `V9.2-four-slot` replaces four recipes and four native
32×32 ABGR icons using that repaired platform. `V9.1-reference` remains an explicit
historical byte-for-byte regression target; it is not the app's build default. Native
slot numbers and V9.1 menu order remain fixed. Display names follow each installed
style alongside its recipe and icon. UTF-16 descriptors are validated byte by
byte in both native resource paths across all 21 languages. Names must contain
at most 254 UTF-16 units plus the NUL terminator; malformed text and resource
capacity overflows fail before output. Actual glyph availability needs camera
verification. Text-I/O tokens retain their historical ordinal identity, separately
from display names, so a name change does not reinterpret serialized controls.
Reference recipes can be assigned to any of the four slots. Every custom or changed recipe requires its original style package, original
CUBE, bound independent fit report and acceptance. Only an exact pinned reference
recipe and UUID may omit fitting. A reference icon variant must bind its pixels to
a validated `StyleIcon` definition. It still passes compression, capacity, final
readback, and ARM rendering gates. The frozen reference profile retains its
original icons and BIN identity. Custom recipes use a
signed Q13 3×3 matrix and three monotonic Q14 curves, each with 65 or 257 nodes.

A CUBE is a target appearance, not a native recipe. `firmware-fit` explicitly fits
the chosen node count, evaluates independent holdouts, and binds the report to the
original CUBE bytes and recipe. Acceptance is per fit hash. No camera calibration
or exact CUBE reproduction is claimed. Capacity is checked before and after
serialization; unsupported sizes or invalid numeric values fail closed.

Compiled v3 style packages carry Studio's reviewed recipe and pinned platform.
Firmware verifies the exact CUBE, recipe, implementation, and independent metrics
at import and at the final-candidate boundary. Matching recipes skip fitting.
The build request binds the fit hash through `acceptedFitHash`; this field does
not establish human review. Firmware prepares missing legacy fits with 65 nodes
and reuses embedded compiled recipes. Core plan checks them before packing.
Programmatic refits must change the node count and record `fitOrigin`.

The custom registry records stable style UUIDs. Replacing the registry requires
explicit acknowledgement of fixed-slot historical DNG reinterpretation and reset
of persisted custom controls. Old registry headers are rejected; there is no
claim of UUID migration across existing ordinal camera records.

## Download gates

- Independent Rust and TypeScript container decoders agree, enforce framing,
  bounded back references, header, terminators and additive checksums.
- The final decoded candidate matches its requested plan. Independent resource
  readback checks every matrix, curve, icon, UUID header, fixed menu metadata,
  approved code relocation and every changed payload byte. Arena slack stays zero.
- Thirteen native ARM suites run against the **final decoded candidate**, retaining
  factory regressions and the defective V9 native capacity negative controls.
- The two new persistence gates run final code as-is: stock APData11 and custom
  APData12 coexist in the native 13-file bundle, and Still refresh applies custom
  controls to resolved/requested properties. The relocated refresh hook must match
  its actual final-ROM branch target. Strict coverage inventories include failure
  cases, both writer orders, all eight banks and neutral/factory fallbacks.
- Candidate native codec checks exercise all twelve installed curves across the
  complete Q14 input domain, malformed blocked tables and ABI/guard invariants.
- A semantic canonical JSON report binds required exact gate inventory, exact
  native outcomes, counts, source/toolchain/platform/plan/payload and candidate
  hashes. A missing, duplicate, stale, failed or unknown gate blocks download.

A report hash is an integrity binding, not a signature. These checks establish
software invariants in the exercised model. Hardware ISP output, update/boot,
physical camera timing, actual RAW/JPEG/rendering and eight-bank persistence still
require the separate real-camera acceptance checklist. Reports always state
`REQUIRES_DEVICE_TEST`.

## Development verification

```sh
node packages/firmware-core/scripts/build-wasm.mjs
cargo test --release --manifest-path packages/firmware-core/rust/Cargo.toml -- --include-ignored
node --experimental-strip-types packages/firmware-core/test/reference.ts
node --experimental-strip-types packages/firmware-core/test/build-candidate.ts
node --experimental-strip-types packages/firmware-core/test/data-gates.ts
node --experimental-strip-types packages/firmware-core/test/curves-257.ts
node --experimental-strip-types packages/firmware-checks/test/fail-closed.ts
node tools/test_firmware_web.mjs
```

The ignored Rust roundtrip and full integration tests require the user's local
`fwdc239b.bin`; it is never copied into the package. Platform regeneration reads
frozen research assets and independent instruction-interpreter fixtures, records
their source hashes, and fails if source adapters no longer match exactly. The
Rust codec and independent TypeScript decoder share no decompression routines.
