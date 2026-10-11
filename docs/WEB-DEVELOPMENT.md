# Development

## Local Web workflow

Use Node 24+ and the locked npm dependencies:

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

Open `/apps/studio/` and `/apps/firmware/` at the printed server URL. `dist/` contains the static product.

`tools/prepare_web_assets.mjs` verifies and copies the versioned LibRaw source-build runtime into ignored `public/vendor/`. It also checks the active Unicorn runtime pin before Vite bundles it. Reproduction materials for the source-built runtimes are under `distribution/native/`. Vite includes the pinned platform and Rust WASM assets. Edit `apps/studio/editor/` for browser interactions. The [Studio README](../apps/studio/README.md) owns the Studio file layout and module rules.

## Workspace UI

`packages/ui/app-header.ts` and its CSS own the shared Tabbar. `vite.config.ts` injects it into Studio's static HTML; Firmware renders it in its template. It contains the brand and Studio/Firmware navigation only. Studio places the icon, Style name, and Modify above the editor, Undo/Redo above the photo, and Export at the editor footer.

Modify opens Film label. Layout, two text lines, and background colors edit a draft with magnified and native-size previews. Done applies the icon and adds one undo entry; Cancel, Escape, and outside clicks discard the draft. Existing text-border icons remain unchanged until Done. The [icon contract](../stylepack/README.md#icon) owns rendering and compatibility.

The Starting Styles are the eight camera styles; `apps/studio/presets.ts` owns their copy and order. An untouched Starting Style creates no local entry. The first name, author-control, or icon edit saves a style to My Styles after a short debounce. Further edits update its UUID. Saves freeze author state, name, identity, and photo context and execute serially. Failed snapshots remain available through Retry, including after a style switch. Skip an old retry when a newer revision for the same owner is submitted. Saved-card and configuration imports reject obsolete selections. Read local projects through the configuration validation boundary before rendering their icons.

`packages/ui/theme.css` owns the shared system font, neutral dark surfaces, muted gold action color, and 64px header height. Keep color-engine swatches independent from interface colors. Export Format and Size use native radio groups styled as segmented controls; preserve keyboard selection and disabled states.

Studio Starting Styles uses one horizontally scrollable strip with four cards per page in a two-column grid. Trackpad scrolling, previous/next buttons, and keyboard focus reach all styles. Each placeholder has a style-specific palette; a developed DNG replaces it with the actual preview. My Styles remains the local saved-style grid. Each saved card has a Delete control; the browser confirm dialog guards it. Deleting the open style keeps the editor state under a new identity, so the next edit saves a new entry. GR Preview is the default preview mode when WebGL 2 is available.

The photo stage accepts file drops in both empty and loaded states. Highlight only the photo stage while a file is over it. File drops use `acceptFiles` and the same DNG validation and RAW lifecycle as file selection.

Start contains style selection only. Color's primary pad and numeric Values edit selected-color Hue and Saturation. Edited-color dots exclude brightness. Reset and Compare preserve the selected color's brightness. The brightness link selects the same band in Light. Overall color groups Warmth & Tint with global saturation controls. Split toning applies color by tone range. Overall color, Split toning, and RGB Curves are peer disclosures with top dividers. Active legacy adjustments appear below them. Base palette, mixing controls, matrix editing, and diagnostic swatches have no UI. Preserve imported `state.matrix` in configuration, LUT evaluation, and exports. Selecting a Starting Style replaces the complete author state.

Light displays Tone Curve without a disclosure. Highlights & Blacks contains Highlight Rolloff and Black Point. The curve editor remains shared with Color RGB Curves; tab changes move its existing nodes and select the appropriate channel without changing saved parameters.

Light defaults to All colors. Color-family brightness edits use the existing `state.mixer[band].luminance` field. Each band keeps its value when selection changes; a dot marks an edited band. Photo picking selects a color family and vertical photo dragging edits its brightness. The picker rejects stale results after photo, state, or selection changes. Tone Curve and Highlights & Blacks remain global.

Studio Export offers one style format: `Style for Firmware` (`.grstyle`). My Styles retains editable configurations on this device; existing `.grstyle.json` configuration import remains available. Photo export uses one action with JPEG/PNG and Full size/Preview selectors; the default is full-size JPEG. Style export works without a DNG. Photo export requires a DNG and locks its controls during full-size RAW processing.

The Export dialog edits the current Style name. Renaming invalidates the prepared recipe and cancels pending preparation. `Style for Firmware` prepares the camera recipe before enabling `Download style`. The download action does not leave a second download link. The review shows independent error metrics and, with a DNG, the authored LUT beside the camera approximation. Firmware imports the reviewed recipe without fitting again. Build firmware prepares legacy inputs automatically and checks the installation plan before packing. The page has no separate plan, fit-review, or node-count controls. Build reports retain fit metrics and hashes. Recipe preparation does not change the authored photo preview or JPEG/PNG export. The [architecture](ARCHITECTURE.md#color-and-raw) owns task identity and cancellation rules.

Firmware uses a dark desktop workspace that fits the viewport. Wide windows use source/library, mapping, and build columns. Narrow desktop windows combine the left regions. Long content scrolls inside panels. Progress stays at the top of the build panel; build/cancel/download actions stay at its bottom. Renders retain scroll positions and expanded details. Phone layout is deferred.

The style library shows unassigned styles only. A drop into a spare slot inserts and shifts later styles. A drop into a full mapping replaces the target and returns the displaced style to the library. Returning a mapped style compacts the list; empty slots remain at the end. Slot-to-slot drops reorder by insertion. Click assignment and keyboard movement remain available. Mapping changes invalidate the old candidate and policy acceptance. Empty slots block builds; active tasks lock editing.

Project UI is deferred. The historical codec remains available for development verification. Batch style import is a future task. English UI copy is current; [Chinese localization](LOCALIZATION-TODO.md) has a separate backlog.

Progress follows completed stages and native suites. Remaining time is an estimate based on observed work and local successful runs. Completion reaches 100% only after the final report and firmware hash pass verification. Cancellation or failure cannot complete the progress bar.

Worker progress updates modify existing progress, phase, checklist, and log nodes. Do not call the full page renderer for these events. Keep the task heading and overview geometry fixed; truncate long phase text with its full text in `title`. The checklist records actual completed milestones. Camera checks require all 13 suites; final artifact completion waits for main-thread verification. Keep the editing lock across Worker completion and result verification. Technical logs remain in a disclosure.

## Verification

| Change | Checks |
| --- | --- |
| Author model or configuration | `npm run test:unit` |
| CUBE fitting or native numeric model | `node packages/firmware-fit/test/fit.test.ts`, `node packages/firmware-fit/test/full_controls.ts`; package-specific native checks |
| Style protocol | TypeScript contract tests; Python package tests in normal and optimized modes |
| DNG lifecycle or exports | RAW unit tests, production Studio browser test, photo ownership/cancel/stale-result coverage |
| Firmware platform or gate | Core/probe tests, production Firmware browser test, independent final-artifact verification in normal and optimized Python |
| Documentation only | Changed-file diff, local links, and command/path references; no runtime rebuild |

Common commands:

```sh
npm run test:unit
node packages/firmware-fit/test/full_controls.ts
uv run python -m unittest discover -s stylepack -t . -p 'test_*.py'
uv run python -O -m unittest discover -s stylepack -t . -p 'test_*.py'
npm run build
npm run test:smoke
npm run test:web
npm run test:firmware:web
node packages/firmware-core/test/data-gates.ts
node packages/firmware-core/test/film-labels.ts
uv run python -m unittest gr_firmware.test_release_gate
uv run python -O -m unittest gr_firmware.test_release_gate
```

Browser tests serve the actual `dist/` through a temporary read-only server. Studio requires a real DNG; `GR_DNG_PATH` selects it. `GR_STUDIO_TEST_URL` selects an external static origin; otherwise the test starts its own server. `CHROME_PATH` selects its Chrome executable. Firmware and the firmware package tests read the official base from `fwdc239b.bin` at the repository root; `GR_BROWSER_CHANNEL` selects the browser channel. Missing required inputs fail. Run large RAW and ARM suites sequentially when measuring resource use.

The Firmware browser test writes a development-only `exported-project.json` after a successful custom build. The independent Python gate uses that record, the actual candidate, and its report; this does not restore Project UI. See [release gate inputs](../gr_firmware/README.md) and package READMEs for detailed checks.

## Static hosting

`wrangler.jsonc` uses Workers Static Assets. `npm run deploy:check` performs a dry run. `public/_headers` and Vite dev/preview provide COOP `same-origin`, COEP `require-corp`, and WASM MIME handling for the threaded LibRaw runtime. A dry run is not deployment acceptance; follow the [Cloudflare deployment workflow](CLOUDFLARE-DEPLOYMENT.md).

The products fetch static resources on first use. There is no complete service-worker offline installation. Do not promise a first launch without network access after caches are cleared.

## Assets and reproduction

Git stores source, contracts, small platform assets, and versioned browser runtime assets. Official firmware, generated firmware, RAW inputs, caches, and native installation bundles remain outside Git and public static resources.

The color model (`packages/color-engine/assets/`), platform (`packages/firmware-core/platform/`), generated ARM probes (`packages/firmware-checks/generated/`), and native gamma fixtures (`packages/firmware-fit/fixtures/`) are prebuilt and pinned. Their generators, frozen inputs, and Python numeric oracles belong to the research archive, which is not part of this repository. Do not edit these assets by hand. A regenerated asset changes identities: update the corresponding pins and rerun the relevant numeric and final-candidate checks. Do not reuse old PASS records.

Studio uses AGPL-3.0-only. Firmware selects the GPL-2.0-only alternative for its original components and Unicorn combination. User-owned LUTs and photos remain outside the code licenses. Preserve original third-party licenses and provenance. Public distribution requires matching source/build materials, complete dependency compatibility, asset-rights decisions, and legal review; follow the [distribution gates](../public/LICENSING.md#public-release-gate).
