# `.grstyle` exchange protocol

This is the canonical protocol and icon specification for Web Studio and Firmware. The Python standard-library implementation and pure TypeScript `packages/style-contract` implementation share fixtures.

## Container and identity

Web Studio exports `gr-style-package/v3` with a compiled camera payload. TypeScript creation without that payload and Python creation export v2. Readers preserve strict v1/v2 compatibility. v1/v2 ZIP files contain exactly:

```text
manifest.json
look.cube
```

The v1 manifest contains `schema/id/name/version/author/license/source/color_contract/look`. v2 adds required `icon`; it does not widen the v1 field set. `id` is a canonical lowercase UUID. Preserve the ID and change the version for a revision of the same style. `look.sha256` binds the original CUBE bytes. Packages are reproducible within an implementation; different language compressors need not produce identical ZIP bytes.

v3 adds required `camera` to the v2 manifest and exactly one ZIP member, `camera.json`:

```json
"camera": {"platform": {"id": "platform-id", "sha256": "64 lowercase hex digits"}, "path": "camera.json", "sha256": "64 lowercase hex digits"}
```

`camera.sha256` binds the exact `camera.json` bytes. `platform.sha256` binds the platform asset bytes. `camera.json` contains exactly `matrix_q13`, `curves_q14`, and `report`. The matrix contains three rows of three signed 16-bit integers. The curves contain three equal-length arrays of 65 or 257 integers in 0..16384. `report` is a JSON object. Preserve report field order because fit identity uses `JSON.stringify({...report, fit_sha256: undefined})` with its existing insertion order. The shared contract checks structure and identity; Firmware independently checks the recipe, report, exact CUBE, and platform before installation.

v3 is the current Web-only compiled exchange. The Python legacy reader and exporter support v1/v2 until their implementation adds v3. Do not pass a v3 package to those Python tools.

## Icon

```json
"icon": {"template": "text-border-v1", "text": "G200", "border_color": "#E5B828"}
```

`text` must contain 1–4 characters from `A-Z0-9`. `border_color` must use uppercase `#RRGGBB`. `text-border-v1` renders fixed 32×32 transparent RGBA pixels:

| Element | Definition |
| --- | --- |
| Border | x=2/29, y=3/28 |
| Text color | `#F5EDE1` |
| Font | Repository 3×5 bitmap glyphs; no system fonts |
| Character origins | x=4/10/16/22, y=12 |
| Short text | Starts at x=4 |
| Default text | First four valid characters of the uppercase name; first four UUID characters if none exist |
| Default border | `#E5B828` |

The complete A–Z/0–9 font preserves the V9 G200/T800/E100/MTRO pixel results. See `fixtures/icons.json` and the raw `.rgba` oracles.

Reading v1 returns an effective icon from these defaults. It must not modify the original manifest, CUBE, or package hash. Icon metadata and the color target remain separate; an icon does not change the CUBE hash.

### Film labels

`film-label-v1` is a second versioned template. Existing text-border icons keep their exact pixels. The new template does not change the package schema, original CUBE bytes, or compiled camera payload.

```json
"icon": {"template": "film-label-v1", "layout": "split", "top_text": "GOLD", "bottom_text": "200", "top_color": "#E8B640", "bottom_color": "#422D28"}
```

The icon has exactly these six fields. `layout` is `solid`, `split`, or `band`. `top_text` contains 1–4 uppercase `A-Z0-9` characters. `bottom_text` contains 0–4. Both colors use uppercase `#RRGGBB`.

The transparent 32×32 RGBA fill occupies x2..29 and y3..28 inclusive. `solid` uses `top_color`. `split` uses `bottom_color` at y16..28. `band` uses `bottom_color` at y17..27. The frozen [font](fixtures/icon-font.json) uses 3×5 glyphs with each row doubled vertically. Top glyphs start at y5 and bottom glyphs start at y18. Glyph origins differ by five pixels. Each line starts at `floor((32 - (3 + (length - 1) * 5)) / 2)`. Ink is `[24,24,24,255]` when the effective background's linear sRGB luminance exceeds `0.179`; otherwise ink is `[248,244,235,255]`. Empty `bottom_text` draws no glyphs. The [shared hashes](fixtures/film-labels.json) cover every layout, both sides of the contrast threshold, and empty bottom lines.

`defaultFilmLabel` / `default_film_label` create a split label with the colors above. The trailing ASCII number group becomes `bottom_text`. Both lines are truncated to four characters. The UUID prefix replaces an empty `top_text`. `defaultIcon` / `default_icon` retain the legacy default and v1 fallback.

## Color and content boundaries

The fixed color contract is `display-srgb-unmeasured`: developed display-sRGB input/output, unit domain 0..1, pure 17/33/65³ 3D LUT, red channel fastest, and trilinear interpolation. Camera-input calibration is incomplete. Reject other color spaces, 1D shapers, mixed LUTs, non-unit DOMAIN, NaN/Inf, and out-of-range outputs. Do not reinterpret them silently.

Packages must not contain firmware, executable scripts, RAW photos, or complete editor projects. v1/v2 must not contain camera recipes; v3 permits only the compiled payload above. A plain `.cube` is a color target. Legacy `.grstyle.json` is a Studio project. Neither is this ZIP format.

`license` and `source` are author declarations, not a rights determination by the tool. `NOASSERTION` does not grant redistribution. This protocol does not support full custom license text or attachments. Preserve original source materials when third-party attribution requires them. The package does not replace those obligations. Additional resources require a protocol version change.

## APIs and validation

`create_package(..., icon=None)` returns ZIP bytes. `inspect_package(bytes)` returns the manifest, CUBE metadata, effective icon, and package hash. TypeScript async `createStylePackage` / `inspectStylePackage` use the same fields; inspection also returns exact `cubeBytes`. TypeScript creation accepts optional `camera: {platform: {id, sha256}, fit: {matrix_q13, curves_q14, report}}`; inspection returns that same optional shape. Supplying `camera` selects v3; omitting it preserves v2 creation. `render_icon` / `renderIcon` return 4096 RGBA bytes.

Inspection does not extract files or execute content. Compressed input and decoded content each have a 32 MiB limit; the manifest has a 64 KiB limit, and `camera.json` has a 256 KiB limit. Reject duplicate members, unknown files, links, path traversal, encryption, CRC/hash errors, and malformed JSON.

A valid package does not establish camera installability. For v3, Firmware must independently verify the compiled fit against the **exact CUBE** and the identified platform, allocate resources, and pass the [complete firmware gates](../packages/firmware-core/README.md#download-gates).

Legacy v1/v2 import still requires an explicit fit before installation.

```sh
uv run python -m unittest stylepack.test_package
uv run python -O -m unittest stylepack.test_package
```
