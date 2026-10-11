# GR Firmware

A local-browser product at `/apps/firmware/`, sharing portable style packages with
Studio. No Python process, HTTP upload or native bridge is used.
The current audited build base is the exact official GR III v2.10 BIN. Known
research firmware can be identified without automatically becoming a build base.

`src/main.ts` owns user actions and file selection. `src/view.ts` and
`src/mapping-ui.ts` render the page with lit-html; templates escape every
interpolation and keep DOM nodes across renders. `src/tasks.ts` owns task state
and the inspect/build lifecycle without DOM access. Each submitted task freezes
its base and selection into a new module Worker through `runWorkerTask`
(`packages/host/src/worker-task.ts`). `src/worker.ts` invokes the Rust/WASM
fitter or audited firmware core. Cancelling terminates the Worker; an external
timer also terminates stalled work. A build buffer becomes downloadable only when
the core returns a complete PASS report.

Imported packages retain exact cube bytes and their UUID. A bare cube requires
explicit display-sRGB color interpretation, author, license declaration and icon.
Fit review shows 4096 holdout samples with 8-bit RGB RMSE, P95 per-pixel RMSE,
maximum channel error and clipping fraction. Choosing 65 or 257 curve nodes always
requires a new fit. Acceptance binds the exact cube and fit hash; these are host
model approximations and carry no camera-calibration claim.

Custom candidates require acknowledgment of fixed-slot reinterpretation (old DNG
slot identities may now develop using the new assigned style) and storage reset
on registry change. Custom 1/2 remain the final menu entries. Unsupported layouts,
capacity overflow, failed fit validation or incomplete ARM checks block export.

The product has no Project workflow: choose a base, import styles into the
library, arrange four slots and build. Batch style import is deferred.
`src/project.ts` retains the strict historical project codec for development
verification and compatibility tests; it is not exposed in the Web UI. Existing
saved data and project files are left untouched.

```sh
node --experimental-strip-types --test apps/firmware/test/project.test.ts
npm run build
# Serve dist locally, with production worker assets and COOP/COEP headers.
GR_FIRMWARE_TEST_URL=http://127.0.0.1:5185 node tools/test_firmware_web.mjs
```

The browser test uses installed system Chrome by default (`GR_BROWSER_CHANNEL`
overrides it). It runs the full frozen reference ARM suite unless
`GR_SKIP_REFERENCE_BUILD=1` is explicitly set. Browser evidence is written under
`apps/firmware/test/artifacts/`; local test firmware never enters the public assets.
