# Browser author color engine

This package reproduces the Python author function without a server, Python, firmware image or research directory at runtime. The eight starting styles are the camera's own recipes (Standard, Vivid, Nega, Posi and the four installed V9 slots) rendered through the camera chain of `camera.ts`: `latent` (inverse YCbCrOperation, gamma and MultiAxial), `M·Bstd⁻¹`, MultiAxial record 0, clip, firmware working table `H=F∘G`, YCbCrOperation chroma gain, clip. Author values follow as a host sandwich. A color the camera cannot produce (dark or bright with high chroma) takes the slot's change extrapolated linearly from its projection onto the camera's range, so the Standard slot is the identity on the whole cube. MultiAxial record selection and non-zero camera controls are not modelled; this engine does not claim camera JPEG parity.

```ts
import { defaultState, normalizeState, transformRGB, bakeLut, MODEL } from './index.ts';
import { importLegacyProject, legacyLookHash } from './legacy.ts';

const state = defaultState();
state.values.warmth = 24;
const normalized = normalizeState(state);
const output = transformRGB(new Float64Array([.2, .4, .6]), normalized);
const lut = bakeLut(normalized); // Float32Array, 33³ interleaved RGB, R-fastest
const restored = await importLegacyProject(oldJSON);
const oldHash = await legacyLookHash(restored);
```

`transformRGB` accepts flat RGB arrays and typed arrays, rejects nonfinite values and clips finite input to [0,1]. It returns a new `Float64Array`. `bakeLut` supports 17, 33 and 65. Both operations are synchronous; use a Worker for interactive editing. Input is the developed photo in the camera's Standard rendering (`developStandard` in `camera.ts`, applied by `packages/raw-web/worker.ts`); output is the same encoding.

`normalizeState` preserves Python validation and six-decimal rounding. Missing interpolation means `linear` for historical compatibility. `defaultState()` starts a new UI state with `smooth`. Unknown nested parameter keys, invalid ranges, incompatible model identities and matrices outside int16 Q13 are rejected. `baseRecipe()` exposes the exact legacy Q13/Q14 starting recipe; this is not a fitted representation of all creative edits. `effectiveMatrix`, `rgbToHsl` and `curve` are also exported for the editor.

`MODEL.implementation` identifies this browser author-function version. `MODEL.model_sha256` identifies the development-generated model payload (Python sorted compact UTF-8 JSON before adding that field). `MODEL.legacy` contains frozen identities needed to restore existing exports. The browser implementation is not relabeled as the historical Python implementation.

Historical v1/v2 projects restore state snapshots. v3/v4 projects require their original look hash, V7/display-sRGB boundary, preview-platform identity, model identity and full native/matrix provenance; v4 requires matrix state and v3 forbids it. The SHA serializer preserves Python float notation, six-decimal binary rounding and negative zero. This compatibility API does not define the new browser project's file schema.

The model asset contains fixed synthetic gamma at exposure 8832, its plateau midpoint inverse, `Bstd`, the eight base matrices and curves (`matrices`), presets, palettes and the Nega/Posi provenance that legacy imports compare. No firmware bytes or patch plans are embedded. The development generator and the Python regression oracle belong to the research archive, which is not part of this repository.

The research-archive regression generates temporary Python references and runs dependency-free Node TypeScript tests. It checks 111 state combinations, exact Q13/Q14, historical SHA values, strict project provenance and seven 33³ LUTs. Acceptance remains float64 absolute error ≤1e-10 and float32 LUT error ≤1e-7. Current maximum errors: 6.55e-15 and 8.4e-17. Changes to the frozen Python/model inputs require a new asset identity. Browser implementation changes must rerun this suite; they do not change the model payload identity. Camera/RAW processing and fit accuracy have separate acceptance tests.
