# Portable style contract

Pure TypeScript color-target exchange for the Web Studio and desktop adapter.
Import `src/index.ts`: `createStylePackage`, `inspectStylePackage`, `validateCube`,
`strictJSON`, `defaultIcon`, `defaultFilmLabel`, `validateIcon`, `renderIcon`. Creation and inspection
are asynchronous because SHA256 uses Web Crypto. The input UUID field is `style_id`.

Optional `camera: {platform: {id, sha256}, fit: {matrix_q13, curves_q14, report}}`
selects v3 creation. Inspection returns the same optional `camera` shape.
Creation without `camera` preserves v2. The contract validates structure and hashes;
Firmware independently verifies fit evidence before installation.

The schema and compatibility policy are in [stylepack/README.md](../../stylepack/README.md).
This module has no native framework or firmware builder imports. ZIP processing
uses fflate after bounded central-directory validation; package metadata never
establishes camera calibration or legal rights. Rendering returns raw RGBA pixels.

Tests use the same original V9 icon pixels, Python-created v1/v2 archives and
asymmetric cube as the Python implementation. Run from the repository root:

```sh
node --test packages/style-contract/test/*.test.ts
```

`GR_STYLE_TEST_OUTPUT=/path/to/ts-v2.grstyle` additionally exports a TS-created
fixture for the Python compatibility check. ZIP bytes need not match between
compressors; cube bytes, metadata, icon pixels and their hashes must match.

## Versioned icon templates

`StyleIcon` accepts `LegacyStyleIcon` and `FilmLabelIcon`. The [icon specification](../../stylepack/README.md#icon) owns fields, geometry, contrast, and defaults. TypeScript and Python use shared pixel-hash fixtures. Firmware resource capacity remains a separate installation gate.
