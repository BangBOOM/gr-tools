# Licensing and distribution boundaries

## Original work

Original GR Tools code and maintained documentation whose authors have the right to license them use the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`). The canonical root [license](licenses/GR-Tools-AGPL-3.0.txt) and [copyright notice](licenses/GR-Tools-NOTICE.txt) are copied here by asset preparation. Commercial use and charging are permitted. Redistribution requires compliance with the license's source and notice obligations. Section 13 also requires modified versions that support remote network interaction to offer their corresponding source to those users. The license includes warranty and liability disclaimers.

GR Firmware selects a separate GPL-2.0-only alternative grant for its original components and conveys its combination with Unicorn under GPL-2.0-only. The [alternative grant](licenses/GR-Firmware-LICENSE.txt) lists the covered source paths. Shared original code can use either grant; Studio selects AGPL-3.0-only. Firmware distribution still requires corresponding source, but GPL-2.0 does not add AGPL section 13 network source obligations.

The grants do not replace the licenses or rights listed below. A file's upstream notice takes precedence for upstream material. Do not describe the complete browser or desktop distribution as AGPL-only.

| Material | Boundary |
| --- | --- |
| Original Studio application and remaining original project work | AGPL-3.0-only; exclude imported code and data |
| Original Firmware application, shared components, and covered build scripts | AGPL-3.0-only or GPL-2.0-only under the alternative grant; Firmware selects GPL-2.0-only |
| `packages/firmware-checks/vendor/` | Unicorn GPL-2.0; retain `LICENSE` and `SOURCE.json` |
| Runtime dependencies and generated JS/WASM from them | Their upstream licenses; see [runtime notices](THIRD-PARTY-NOTICES.md) |
| `packages/firmware-core/platform/`, firmware-derived bytes in probes and generated fixtures | Outside both original-code grants; provenance and redistribution rights require review |
| `packages/color-engine/assets/`, reference recipes, LUTs, and profile derivatives | Outside both original-code grants for data; retain source-specific terms and establish provenance before redistribution |
| User DNGs, imported styles, official or generated camera firmware | The tool license grants no rights to these inputs or outputs |

The Gold reference uses third-party profile/LUT material with CC BY-SA 4.0 terms. Imported Spektrafilm notices remain attached to those materials. Some copied notices describe an upstream directory or repository; they do not license GR Tools or Ricoh firmware. Do not remove attribution, change those frozen notices, or assume fitted/derived data adopts the project code license. The [reference attribution](REFERENCE-ATTRIBUTION.md) records the source chain, changes, and runtime data. Verbatim inherited notices are served at `licenses/spektrafilm/ATTRIBUTION.md` and `licenses/spektrafilm/SPEKTRAFILM_LICENSE.txt`.

## User-created content

.grstyle packages and photos are content, not application code. Using GR Tools does not place user-owned LUTs, `.grstyle` packages, `.grstyle.json` configurations, or exported photos under AGPL or GPL. Users may keep their original content private, sell it, or choose its license. This is an explanation of license scope, not an additional exception to AGPL. See [AGPL section 2](https://opensource.org/license/agpl-3.0).

Third-party reference content keeps its existing terms. Importing, editing, or exporting it does not remove attribution or ShareAlike obligations where they apply. Generated firmware can contain project code and Ricoh material; it is not covered by a blanket user-content exclusion.

## Source availability and earlier revisions

Private use and private modification do not require public source publication. Distributors must supply corresponding source under the applicable terms. Operators of modified AGPL Studio versions with remote network interaction must offer corresponding source to those users. GPL-2.0 Firmware has distribution source obligations, without AGPL section 13. These requirements do not require an unrelated application or all company code to become AGPL.

The current static products convey JS/WASM to browsers, so distribution obligations apply even without a compute backend. Minified JS or WASM alone is not the preferred source for modification. A release must provide the matching source revision, dependency materials, and required build/install scripts. The [source repository](https://github.com/BangBOOM/gr-tools) is public. Each formal release must still identify its matching source revision and native dependency materials.

Original work previously licensed under MIT, including revision `cf209c9` of the earlier private repository, retains that grant for recipients who obtained it under MIT. This change does not revoke those rights or third-party permissions. The project does not offer the current version under both MIT and AGPL.

Contributors must have the right to submit their work under the applicable license. Preserve upstream notices for imported work and record its source.

## Combined distributions

GR Firmware imports the GPL-2.0 Unicorn executor. The pinned npm package declares `GPL-2.0`; its README describes GPLv2, and its license supplies the GPLv2 text. These declarations do not establish an explicit permission to use GPLv3 or AGPLv3. The license's illustrative "any later version" template is not a grant for the package itself. Firmware therefore selects the original authors' explicit GPL-2.0-only alternative grant. This permission does not relicense Unicorn. Preserve the recorded upstream license and binary identity.

The alternative grant resolves the conflict between the original Firmware code and GPL-2.0-only Unicorn for the Web combination. Select the MIT option for dependencies that offer MIT/Apache-2.0 alternatives, including wasm-bindgen. Retain every applicable dependency notice. Do not infer compatibility from Worker boundaries or claim that every desktop dependency is covered. The future mygo Firmware shell includes Apache-2.0-only purego and needs a separate compatibility route before distribution.

The npm source revision is `560284c59c11c8d6c94d537f4354339f069ddcdf`; its Unicorn submodule points to `8028ec436f2d9376525352dd38ed9ed6b9f6be10`. The [pinned package declaration](https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/package.json), [README](https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/README.md), and source repository's `packages/firmware-checks/vendor/SOURCE.json` identify this review. These npm identities remain frozen reference evidence. The active Web executor is the distinct `source-build-2026-10-09` build. Its source/patch/adapter metadata and corresponding-source archive hashes live in `packages/firmware-checks/vendor/source-build-2026-10-09/` and `distribution/native/unicorn-arm/`. Two clean builds and the complete production browser checks pass for that distinct runtime; they do not prove the old npm binary's source correspondence.

Supply the complete corresponding source, adaptations, build instructions, and required notices for the exact distributed dependencies. A dependency link or a license text alone is not that source package.

Studio's LibRaw WASM contains separately licensed native dependencies. Establish the chosen upstream license route and its source, build, and modification obligations for the exact binary. The wrapper's ISC declaration does not relicense LibRaw, Little CMS, or the JPEG port. The active LibRaw source build selects LGPL-2.1 for LibRaw, retains source-specific terms, and supplies reproduction materials for relinking. Its preferred source and all required build/install materials must remain available with the public runtime. A future desktop shell adds its own dependencies; review their compatibility with the combined runtime before distribution.

## Firmware and project identity

GR Tools is an independent project. Ricoh does not sponsor, endorse, or support it. Product and brand names identify compatibility; this project grants no trademark rights.

The project license grants no permission to modify or redistribute Ricoh firmware and does not guarantee protection from claims. The [official GR III firmware agreement](https://www.ricoh-imaging.co.jp/english/support/digital/gr3_s.html) restricts modification/reverse engineering in clause 4 and transfer to third parties in clause 6. Applicable law and exceptions depend on jurisdiction; this guide does not resolve them.

Users supply the official base locally. Do not publish official or complete modified firmware through the project. The platform currently contains original-byte matching data and firmware-derived material even though it omits a complete official BIN. Local input processing does not establish redistribution rights for those embedded assets.

Firmware updates can damage a camera or affect saved settings and old DNG rendering. Offline verification does not establish hardware safety, warranty coverage, or device acceptance. Each new candidate needs its own camera tests. These limits do not waive mandatory statutory rights.

## Public release gate

Studio uses AGPL-3.0-only. The original authors grant covered Firmware components the GPL-2.0-only alternative. These decisions do not establish rights to third-party assets or complete source correspondence. A formal public Web release, an announced corresponding-source archive, and a desktop release remain pending the following evidence:

| Required evidence | Current gap |
| --- | --- |
| Rights/provenance map for shipped platform, probe bytes, color assets, and reference styles | Embedded firmware-derived and reference-derived material needs a per-asset decision; remove or replace material that cannot be distributed |
| Exact native dependency source and reproducible build materials | New Unicorn and LibRaw runtimes are source-built and verified; matching component archives are staged privately. Review the complete source and notice inventory and supply the approved matching archives publicly |
| Combined-distribution license review | The original-code/Unicorn conflict has a GPL-2.0 alternative route. Verify all shipped dependency terms and exact native build materials. Desktop compatibility remains separate; notices alone do not establish compliance |
| Corresponding source for the project release | The source repository is public; bind each release to its matching source revision and native build materials |
| Software IP review | Obtain qualified review of actual release contents and the Ricoh agreement in the intended jurisdictions |

Do not mark a release ready until these gaps are closed. This gate applies before a formal public release, an announced corresponding-source archive, or an installer. The public source repository is not that formal corresponding-source package. Existing local research and offline checks do not close it. Distribution must carry this guide, the project license, and the applicable upstream notices.

The Web asset preparation step copies the canonical root license and notice to `licenses/GR-Tools-AGPL-3.0.txt` and `licenses/GR-Tools-NOTICE.txt`. It also copies the alternative grant to `licenses/GR-Firmware-LICENSE.txt`; `licenses/Unicorn-GPL-2.0.txt` contains the full GPL-2.0 text. The static build carries this guide and [public notice page](legal.html). A future desktop package must embed the same static files and its own dependency notices. This packaging preserves notices; it does not resolve the release gaps above.
