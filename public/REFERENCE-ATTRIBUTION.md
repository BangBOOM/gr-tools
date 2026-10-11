# Reference asset attribution

This notice applies to bundled reference data. It does not license user-owned LUTs, photos, imported style packages, or Ricoh firmware. It does not close the public release gate in [LICENSING.md](LICENSING.md#public-release-gate).

## Gold reference

The Gold reference derives from `kodak_gold_200` profile data by **Andrea Volpato**, from [spektrafilm](https://github.com/andreavolpato/spektrafilm), under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Retain the [verbatim upstream notice and license](licenses/spektrafilm/SPEKTRAFILM_LICENSE.txt) and [verbatim inherited attribution](licenses/spektrafilm/ATTRIBUTION.md). Statements about another repository in the inherited notice apply to that repository; they do not license GR Tools or Ricoh firmware.

The exact intermediary source is [Film Lab HaldCLUT at revision 81aa35ccfd88c8b9125f26a5ac79542ba588af2e](https://github.com/thedevmark/film-lab/blob/81aa35ccfd88c8b9125f26a5ac79542ba588af2e/luts/open/kodak_gold_200.png). Its SHA256 is `92eca554b7a572e5e9459bcf9efa6e856f02bad6b3188009b6f287733dc7b01a`.

Film Lab baked the profile into a 512×512 level-8 HaldCLUT with sRGB input/output and `kodak_portra_endura` print profile. It changed `stops_above_midgray` from `auto` to `2.47`. GR3 firmware lab converts the HaldCLUT to a CUBE reference and fits compact matrix/curve representations. The Gold host model and native recipe store signed Q13 matrix coefficients and unsigned Q14 curves. These are modifications of the reference representation; they are not a claim of physical film calibration. The Gold reference data retains CC BY-SA 4.0 attribution and ShareAlike terms; the application code has its separately stated license.

The research archive records the conversion chain and its generators; it is not part of this repository. Runtime datasets include `packages/color-engine/assets/model.json` (`gold_matrix_q13`, `gold_curves_q14`) and the embedded `/re/build/V9-backend/gold-recipe.json` in `packages/firmware-core/platform/platform.json`. Historical Gold patch plans in that platform also contain derived data. The matching release source archive must retain these provenance records.

## Other reference recipes

The research manifest records the Ektar numerical recipe as artist-created under `CC0-1.0`, based on qualitative descriptions with no external LUT or digitized sensitometry. The platform embeds it as `/re/build/V9-backend/ektar-recipe.json`.

The research manifest records the Metropolis numerical recipe by GR3 firmware lab under `CC0-1.0`. It states that no source LUT or assets were copied. The platform embeds it as `/re/build/V9-backend/metro-recipe.json`. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) describes these recorded recipe grants. These grants do not cover the surrounding firmware code or recovered factory data.

The platform's Tungsten recipe `/re/build/V9-backend/800t-recipe.json` derives from a CineStill-referenced research recipe. Its wrapper says that original assets retain their own rights. A complete source-specific license decision remains pending.

## Icons and firmware-derived material

A research-archive generator creates four 32×32 geometric icons with simple 3×5 glyphs: G200, T800, E100, and MTRO. The platform embeds the resulting `.abgr32` and `.lz4` files under `/re/build/V9-icon/`. These current icons are project-generated artwork. Earlier patch plans contain separate historical image material; this statement does not cover that material.

The platform still embeds original Ricoh byte-matching fields, modified instruction bytes, recovered factory parameters, and historical patch material. The project license and reference notices grant no Ricoh rights. Per-asset review and the release gate remain pending.
