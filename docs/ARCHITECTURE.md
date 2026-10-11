# Internal architecture

The [README](../README.md#architecture) owns the product vision and top-level architecture. This document owns module boundaries and data contracts. Platform limits and final-artifact gates belong to the [firmware core](../packages/firmware-core/README.md); acceptance evidence belongs to [implementation status](IMPLEMENTATION-STATUS.md).

## Modules

| Path | Responsibility |
| --- | --- |
| `apps/studio/` | Studio editor, runtime services, author configuration, color Worker, and camera preparation Worker; see the [Studio README](../apps/studio/README.md). |
| `apps/firmware/` | Style library, fixed-slot mapping, frozen tasks, progress, and gated downloads |
| `packages/color-engine/` | Minimal author model, integer/float transforms, and legacy configuration migration |
| `packages/raw-web/` | DNG validation, LibRaw lifecycle, crop/orientation, preview, and full-size export |
| `packages/style-contract/` | JSON/ZIP/CUBE contracts, style packages, and fixed-font icons |
| `packages/firmware-fit/` | Rust/WASM recipe fitting and independent holdout evaluation |
| `packages/firmware-core/` | Firmware codec, platform plans, candidates, final readback, and reports |
| `packages/firmware-checks/` | Unicorn WASM, native ARM suites, and controlled probe host adapters |
| `packages/host/` | File selection, bounded reads, output saves, local storage, cancellation, and one-shot Worker tasks |
| `stylepack/`, `gr_firmware/` | Python style-package reference and independent final-artifact verification |

Inputs are read-only; outputs become available after validation.

WASM and model/platform assets are prebuilt and pinned. Browsers do not carry Python, Clang, Rust compilers, or full SDKs. Static runtime resources contain no complete official ROM or input DNG. See [hosting and asset preparation](WEB-DEVELOPMENT.md).

## Data contracts

| File | Owner and meaning |
| --- | --- |
| `.grstyle.json` | `apps/studio/project.ts`: editable author configuration, UUID, version, model identity, icon, optional photo-bound RAW context, provenance, and content hash |
| `.grstyle` | `packages/style-contract/`: Studio exports `gr-style-package/v3` with exact `look.cube`, compiled camera recipe, platform identity, and fit report; Web readers retain strict v1/v2 support |
| `.cube` | Display-sRGB target with R-fastest axis order and trilinear interpolation; it cannot restore author controls, identity, or icon |
| Installation record | `apps/firmware/src/project.ts`: base/platform identity, original packages, slot mapping, and fitting version; retained for development compatibility, without product Project UI |
| Build report | `packages/firmware-core/src/report.ts`: candidate/input/tool hashes, exact gate outcomes, coverage, and separate device acceptance |

Studio prepares a camera approximation from the exact serialized CUBE, then exports both the complete creative target and the reviewed recipe. Firmware independently verifies the embedded recipe and error metrics without fitting again. Legacy packages and bare CUBE inputs still fit in Firmware. RAW exposure and White Balance belong to the source photo and must not enter a LUT or native recipe.

New configuration hashes use sorted object keys and JavaScript JSON number serialization. Legacy v1/v2 configurations migrate valid state. Legacy v3/v4 configurations first validate historical Python look/model identities, then migrate and retain provenance. Do not replace legacy identities with new-model hashes. See [Studio configuration code](../apps/studio/project.ts) and [style packages](../stylepack/README.md).

The [style package specification](../stylepack/README.md#icon) owns `text-border-v1` and `film-label-v1`, their font, defaults, and identity rules. Studio uses fixed layouts, text, and background colors. It has no image upload or freehand icon editor.

## Color and RAW

The author model starts from the eight camera styles rendered through the camera chain (`packages/color-engine/camera.ts`), then applies author values and creative stages; it is not the camera ISP. Model assets retain their source identity; a model change invalidates saved `gr-studio-project/v1` projects by `model_sha256`. Creative and fitted native results remain separate.

Studio camera preparation uses the pinned `CAMERA_TARGET` and 65-node curves. Its Worker evaluates the exact LUT and native recipe directly for the comparison preview. Bind results to author state, name, icon, and photo ownership. Terminate the Worker on completion, cancellation, failure, or timeout. An exact CUBE hash permits reuse of the last checked recipe; a new preview still uses the current photo. See [fitting](../packages/firmware-fit/README.md) and [package contracts](../stylepack/README.md).

GR Preview shows the fitted recipe on the main photo. `fitPreview` runs on a persistent Worker; at most one fit runs, and only the latest queued profile starts. It returns the same recipe that export fits, without a report. WebGL2 (`apps/studio/gr-preview.ts`) evaluates the recipe per pixel from the photo's float32 latent with the camera chain of `packages/color-engine/camera.ts`: `M·Bstd⁻¹`, MultiAxial record 0, clip, firmware working table `H=F∘G`, YCbCrOperation chroma gain, clip. `evaluate` in `packages/firmware-fit/src/index.ts` runs the same chain from the developed photo through `latent`. The chain reproduces zero-control camera JPEGs of all eight styles to 1.0–1.3 codes at 8×8 blocks under daylight and a highlight scene to 1.7 (Standard) and 1.1 (Metropolis) codes at 40×40 blocks; MultiAxial record selection, non-zero camera controls and highlights above raw white are not modelled, so `camera_calibrated` stays false. Export still runs `fitCube` and `verifyFitResult`.

Run one RAW task at a time. Bind settings to the DNG content SHA and results to the task generation. Releasing a photo cancels only its jobs and frees its owned idle cache. Global cancellation terminates the RAW Worker. Discard stale responses. Color edits rebake the LUT without decoding the DNG again.

LibRaw develops sensor data to RGB16 with Clip highlights (`highlight:0`); its DNG `ColorMatrix2` equals the camera's Standard matrix `Bstd × D`. The WASM runtime ignores `gamm` and always applies LibRaw's default gamma (power 2.222, toe slope 4.5), so the worker decodes that curve (`decodeLibRaw`) to obtain linear values. LibRaw outputs camera RGB (`outputColor:0`, white balanced, no matrix). Apply default crop and orientation, then the Standard matrix `Bstd × D` (`STANDARD_MATRIX`) to obtain the signed latent `z`, and the camera's Standard rendering `developStandard` (`renderLatent(z, STANDARD_CHAIN)`) for the creative LUT; `gain` is 2 when DNG `BaselineExposure` is positive, which is DynamicRangeExpansion On. The worker posts both the developed float32 RGB and the float32 latent; GR Preview renders from the latent. The developed photo therefore equals the in-camera Standard JPEG apart from the unmodelled stages above. Preview uses float32 RGB; JPEG/PNG export uses 8-bit sRGB at preview or full size. A failed full-size allocation must report failure rather than silently reduce resolution.

Retain RGB16 and necessary output buffers instead of a permanent full-size float32 copy. Browser memory evidence must state its measurement scope; JS heap is not total WASM/process memory.

## Firmware and history

The current platform uses fixed native slot numbers, menu order, and serialized text-I/O tokens. Display names, icons, and recipes follow assigned styles. Unknown modified firmware is not a patch base. The [firmware core](../packages/firmware-core/README.md) owns supported revisions and exact gate inventories.

`DEFAULT_STYLES` uses film labels with the frozen reference recipes and UUIDs. These resource variants use the four-slot candidate path. Icon changes alone preserve the registry and saved controls. `REFERENCE_STYLES` retains the old icons for frozen builds and legacy installation records. Internal `gr-firmware-project/v2` records store reference icon definitions; v1 records reconstruct their original icons. Firmware exposes no Project UI.

Changing a fixed slot can reinterpret old DNGs. A changed registry can reset saved custom controls; this is not automatic UUID migration. The tool binds the user's policy acknowledgment to the submitted inputs. Build submission binds each prepared fit hash; this binding does not record human review of fit metrics. Numeric fit results do not establish camera color accuracy.

Future menu management must separate style UUID, native number, and display order. Sorting preserves native numbers. Hidden styles retain recipes and capacity until an explicit reset releases them. Expansion beyond the current platform requires research and independent device acceptance; see the [roadmap](IMPLEMENTATION-PLAN.md).
