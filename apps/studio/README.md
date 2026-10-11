# GR Studio

A local-browser product at `/apps/studio/`. It develops a DNG, edits an author configuration, and exports a `.grstyle` package for Firmware. [Architecture](../../docs/ARCHITECTURE.md) owns module boundaries and data contracts; [development](../../docs/WEB-DEVELOPMENT.md) owns UI behavior and verification.

## Files

| Path | Responsibility |
| --- | --- |
| `index.html` | The complete static layout and copy, including hidden legacy controls that sync code still writes. It links the styles. `vite.config.ts` fills the shared header and the Starting Style cards at build time |
| `main.ts` | Entry: start the editor, wire the Film label dialog, expose `window.studio`, stop Workers on `pagehide` |
| `services.ts` | Runtime services: color Worker and LUT cache, camera preparation, GR Preview fit queue, style identity, local storage, RAW engine, packaging |
| `presets.ts` | Starting Style names, captions, monograms, display order, and card markup |
| `project.ts` | `.grstyle.json` codec |
| `gr-preview.ts` | WebGL2 GR Preview renderer |
| `color.worker.ts`, `camera.worker.ts`, `preview.worker.ts` | LUT bake, camera recipe preparation, GR Preview fit |
| `editor/app.js` | Editor state, undo history, save queue, preview scheduling, photo strip, export dialog |
| `editor/advanced.js` | Editor tabs, Fine Tune controls, curve editor, fit summary |
| `editor/color-touch.js` | Color pad and photo color pick |
| `editor/intent-light.js` | Light pad, tone zones, and per-color brightness |
| `editor/flow.js` | Starting Style browsing and the overall color pad |
| `editor/context-tools.js` | Shared curve placement per tab and selected-color values |
| `editor/interface.js` | Help popovers and the gesture coach |
| `editor/matrix.js` | Hold-to-compare base color |
| `editor/raw.js` | DNG import, RAW development scheduling, photo removal |
| `editor/icon-dialog.ts` | Film label dialog |
| `editor/automation.js` | `window.studio` automation seam |
| `editor/render.worker.js` | R-fastest trilinear LUT render of photo pixels |
| `editor/style.css` | Studio styles; shared tokens come from `packages/ui/theme.css` |

## Rules

- `index.html` is the final layout. Startup code binds events and fills data lists (`#project-list`, photo strip, additional adjustments); it must not create, move, or remove static structure or rewrite static copy. `tools/test_web.mjs` fails on any such startup mutation. Change layout or copy in `index.html`.
- Editor files are ES modules. Import every name from another module explicitly. `npm run check` type-checks the editor JS through `editor/tsconfig.json` and fails on a missing import or unknown name.
- A module owns its `let` bindings. Imports are read-only; another module changes a binding only through the owner's setter, for example `setState` or `setActivePhoto` in `editor/app.js`.
- The editor reaches Workers, storage, and RAW only through `services`. Do not add `window` globals.
- `window.studio` exists only for `tools/test_web.mjs`. Editor code must not read it. When a test needs another live binding, add a getter in `editor/automation.js`.
- `Profile.lut` is the cached `Float32Array`. Copy it before a transfer (`lutBuffer` in `editor/app.js`).

## Verification

```sh
npm run check
npm run test:unit
npm run build
npm run test:web
```

`apps/studio/tests/raw-context.test.ts` runs `editor/raw.js` in a `vm` context with its imports supplied as globals; keep that module's import and export statements on single lines.
