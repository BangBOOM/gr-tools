# Runtime component sources and notices

Studio uses AGPL-3.0-only. Firmware selects the GPL-2.0-only alternative for its original components and Unicorn combination. The [licensing guide](LICENSING.md) defines their scope and pending public release gates. Upstream terms remain unchanged. These notices do not license supplied firmware, LUTs, or the research archive.

| Component | Active source / version | Terms and notices |
| --- | --- | --- |
| LibRaw WASM wrapper | 1.6.0 source, commit `32fd36a9883a10c1632bc20073f1ea88cc60487a`; distinct `source-build-2026-10-09` runtime | ISC declared by upstream package; no standalone upstream LICENSE file |
| LibRaw | 0.22.1, commit `b860248a89d9082b8e0a1e202e516f46af9adb29` | Select LGPL-2.1; retain [COPYRIGHT](licenses/LibRaw-COPYRIGHT.txt), LGPL/CDDL texts, and per-file dcraw/DCB/FBDD/X3F/Adobe notices in the full source |
| Little CMS | lcms2.19.1, commit `21c582a594fe5279f90c0b93437c398f93bf62b0` | MIT; upstream LICENSE copied to [Little-CMS.txt](licenses/Little-CMS.txt) |
| JPEG | IJG 9f, extracted by the LibRaw final linker | IJG terms in [upstream README](licenses/JPEG-9f-README.txt), including its legal issues section |
| Unicorn JS / ARM executor | Wrapper `560284c59c11c8d6c94d537f4354339f069ddcdf`; Unicorn `8028ec436f2d9376525352dd38ed9ed6b9f6be10`; distinct `source-build-2026-10-09` runtime | [GPL-2.0](licenses/Unicorn-GPL-2.0.txt); QEMU/GLib and individual utility notices retained in the preferred source |
| Emscripten system runtime | 5.0.7, commit `263db4cffa6f9fc2ec514a70abac81362ea41849` | Source-specific MIT/BSD/CC0 and Apache-2.0 WITH LLVM-exception terms; [Emscripten](licenses/unicorn-runtime/Emscripten.txt), [authors](licenses/unicorn-runtime/Emscripten-AUTHORS.txt), [LLVM runtime](licenses/unicorn-runtime/LLVM-Runtime.txt), [musl](licenses/unicorn-runtime/musl.txt), [additional extracted source notices](licenses/unicorn-runtime/musl-and-dlmalloc-additional.txt) |
| fflate | 0.8.3; https://github.com/101arrowz/fflate | MIT, [notice](licenses/fflate.txt) |
| buffer | 6.0.3; https://github.com/feross/buffer | MIT, [notice](licenses/buffer.txt) |
| @noble/hashes | 2.4.0; https://github.com/paulmillr/noble-hashes | MIT, [notice](licenses/noble-hashes.txt) |
| lit-html | 3.3.3; https://github.com/lit/lit/tree/main/packages/lit-html | BSD-3-Clause, [notice](licenses/lit-html.txt); Firmware UI templates |
| wasm-bindgen and Rust dependencies | wasm-bindgen 0.2.103; exact Cargo.lock files in the project source | Select MIT where MIT/Apache-2.0 alternatives exist; retain additional terms. `unicode-ident` is `(MIT OR Apache-2.0) AND Unicode-3.0`; selecting MIT does not remove Unicode-3.0 |

The active runtime manifests live at `packages/raw-web/runtime/source-build-2026-10-09/SOURCE.json` and `packages/firmware-checks/vendor/source-build-2026-10-09/SOURCE.json` in the source tree. `distribution/native/` records reproduction scripts and source-archive hashes. Component archives are staged privately and must be made accessible with the approved public release. Source availability is not established by this table or an upstream link.

LibRaw's inherited flags request PNG 1.6.55 and zlib 1.3.1. Both are built, but the final linker extracts no archive members from them. The reproduction archives retain their exact source and notices. The source package also preserves full Emscripten system-library licenses, including libc++ and libc++abi. Do not describe the entire SDK as MIT/BSD or plain Apache-2.0. [LLVM's license policy](https://llvm.org/docs/DeveloperPolicy.html#license) explains its GPLv2 exception route.

The two runtimes were built from complete pinned library sources rather than reusing the wrapper's unknown-origin static archives. Repeat builds and production browser parity are recorded separately from the former npm binaries. They do not establish correspondence for those older binaries or resolve firmware-derived asset rights. See [reference attribution](REFERENCE-ATTRIBUTION.md) for color/reference content.
