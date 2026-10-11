# Exact cube → native camera recipe

`fitCube` approximates the original serialized `.cube` using a Q13 3×3 matrix and three monotone Q14 curves. Rust/WASM performs deterministic fitting; an independent TypeScript evaluator measures the resulting recipe against the exact cube's trilinear function. Both use the camera chain of `packages/color-engine/camera.ts`: `latent` inverts the camera's Standard rendering of the cube input (inverse YCbCrOperation, gamma and MultiAxial); the slot matrix `M` acts as `M·Bstd⁻¹`; MultiAxial record 0 follows; the firmware interpolates the working table `H_c[k]=F_c(G[k])` over the clipped result; YCbCrOperation scales chroma by a luma-indexed gain. The identity cube therefore fits to `M=Bstd` with near-identity curves. The fitter works on the matrix and curve stages: `fitInputs` precomputes `Bstd⁻¹`-mapped latents and the cube's values at the colors the camera renders from those latents with YCbCrOperation inverted. Fitting and evaluation use the camera's range (colors a Standard rendering can contain); the holdout and endpoint colors are projected onto it. Outside the range the slot's change is extrapolated linearly from the range boundary (`cameraPixel`).

```ts
import { fitCube, verifyFitResult } from './src/index.ts';
const fit = await fitCube(originalCubeBytes, { nodes: 257 });
// Show fit.report.holdout and obtain acceptance of this cube + fit hash.
await verifyFitResult(fit, originalCubeBytes);
const recipe = { matrix_q13: fit.matrix_q13, curves_q14: fit.curves_q14 };
```

Input may be the original UTF-8 text or `Uint8Array`. Bytes are preferable when binding an imported package. Product cube validation restricts input to pure 3D 17/33/65, unit domain, finite outputs in [0,1], R-fastest ordering and trilinear interpolation. The input SHA covers the original serialized bytes, including comments and whitespace.

`nodes` defaults to 257. Choosing 65 explicitly runs a separate fit with 65-node curves throughout its loss/search and independent evaluation. It can reduce firmware storage use; the fitter never silently changes an accepted 257-node recipe. `validateRecipe` requires signed-int16 Q13, exact row sums 8192, three equal-length 65/257 Q14 curves, exact black zero, monotonicity and maximum slope 4. A full-white endpoint is not required.

The bounded search tries five matrix seeds (identity, Gold, Nega, Posi, Standard `Bstd`), preserves row sums, and alternates matrix coefficients with weighted isotonic curves. Training uses a 9³ lattice, 2048 deterministic random colors and 257 grays (3034 colors). Independent evaluation uses 4096 separately seeded random colors; eight endpoints are reported separately. The new xorshift32 sample sequence is fixed and hash-bound; it is deliberately versioned separately from the historical NumPy fitter.

`report` binds original cube SHA, packed Q13/Q14 recipe SHA, model SHA, Rust/WASM/evaluator source identities, holdout sample SHA and the complete report SHA. It includes `holdout`, `endpoints`, `float_candidate`, and `quantization` metrics: RMSE, per-pixel RGB RMSE p95, maximum absolute channel error (all in 8-bit display-sRGB code values), plus fraction of matrix-stage channels clipped. `quantization` compares the selected floating candidate with the final quantized matrix and refitted/quantized curves, so it includes the final curve refit. `verifyFitResult` rejects stale cube, changed recipe, changed report or implementation identity. The WASM bytes are checked against their generated integrity pin before initialization.

`review_required` remains true in the v1 report format. It identifies a camera approximation, not recorded human approval. Studio displays the metrics before export. Firmware keeps them in the build report and binds the fit automatically at build submission. These are host-model errors; input calibration and real-camera output remain unmeasured. Arbitrary hue-selective, raised-black or nonmonotone targets can fit poorly. No arbitrary aesthetic threshold blocks fitting by default. Optional `limits` returns `limits_pass` for fixture/CI quality gates; it does not silently turn a poor fit into camera accuracy.

Run fitting in a Worker. WASM is single threaded and needs no SharedArrayBuffer. It uses local bundled assets and does not upload the cube. `wasmBytes` or `wasmUrl` can override loading, but the binary must still match the pinned build. The caller owns cancellation by terminating its worker and accepting/reporting the current fit identity.

```sh
node packages/firmware-fit/scripts/build-wasm.mjs
cargo test --locked --manifest-path packages/firmware-fit/rust/Cargo.toml
node --experimental-strip-types packages/firmware-fit/test/fit.test.ts
node --experimental-strip-types packages/firmware-fit/test/preview.test.ts
```

`src/preview.ts` `fitPreview` returns the same quantized 65-node recipe from Studio's float LUT. It skips CUBE text parsing, the report, and hashing, so it serves live preview only. It lives outside `src/index.ts` so that `FIT_EVALUATOR_SOURCE_SHA256` and existing reports stay valid. `test/preview.test.ts` checks recipe equality with `fitCube`.

The committed WASM and JS glue allow normal app builds without installing Rust. Rebuilding uses the pinned Cargo lockfile and wasm-bindgen 0.2.103. Generated source/binary pins update together.

Current regression examples: identity fits to `M=Bstd` with holdout RMSE 0.033 and maximum 0.97 (the isotonic curve deviates from identity by up to 21 Q14 units); the Gold 33³ cube has holdout RMSE 0.589, maximum 17.59, where the maximum is the cube's trilinear representation of the chain's clip kinks, not the fitter. A deliberately nonmonotone artistic target reports RMSE 45.39 and maximum 152.73, demonstrating why the report must preserve approximation error. The research-archive Python oracle independently verifies exact cube sampling, native prediction, reported metrics and hashes; maximum RGB discrepancy is 4.44e-16. These examples are numerical fixtures, not real-camera quality measurements.

`verifyFitResult` independently recomputes the installed quantized recipe's holdout and endpoint metrics from the original cube, and validates sample identities, evaluation scope and optional quality limits. Rehashing forged error figures cannot make them pass. The selected floating candidate is not serialized, so `float_candidate` and `quantization` remain structurally checked diagnostics rather than independently reproduced evidence; they never decide final-recipe quality limits.

## Native gamma release CI

`src/native-gamma.ts` and Rust `native_gamma` are versioned scalar transcriptions of isolated routine `0x536e7b64`, using only extracted fixed tables. The fixed release corpus covers all 9⁴ = 6561 combinations of integer key/contrast/highlight/shadow −4..4, ordinary flag 0 and synthetic internal exposure 8832, with 256 Q14 outputs each. TypeScript, Rust/WASM and the unchanged Python instruction-derived scalar model agree exactly on every output. The concatenated little-endian SHA256 is `ab21f53ab4f06b9f35dd2dfdccdf89fa4ef1d931abd7e7dac3f38a6e07fcabca`; all these outputs are monotone and in 0..16384.

Sixteen joint corners have separately frozen outputs from the independent bounded ARM instruction interpreter (24,508–27,956 interpreted instructions each). These fixtures support the separate browser native-boundary suite. The 6561 scalar checks are release CI, not 6561 browser/Unicorn executions or real-camera tests. Exposure is an internal integer; it is not EV, ISO or a calibrated camera range.

```sh
# No firmware required: compare both execution cores with frozen exact goldens.
node --experimental-strip-types packages/firmware-fit/test/full_controls.ts
```

New guards use explicit exceptions; normal and optimized Python runs have identical validation behavior. Historical research files remain unmodified. The production Studio author asset remains minimal; the extra native generator tables live separately in this package's release fixtures.
