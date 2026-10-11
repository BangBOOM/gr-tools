# Threaded LibRaw reproduction

The active browser runtime uses the fixed source build in `packages/raw-web/runtime/source-build-2026-10-09/`. Its `SOURCE.json` owns source revisions, archive hashes, output hashes, and toolchain identities. It does not attest correspondence for the former npm WASM. Select the LGPL-2.1 option for LibRaw; retain its embedded source-specific notices.

Use a clean macOS arm64 build directory. Place the 14 files in `SOURCE-ARCHIVES.sha256` in its `artifacts/` directory. Verify that list before extraction. The archives are staged privately outside Git; they are not yet available through a public source download.

Activate the pinned Emscripten 5.0.7 SDK. Set `GR_EMSDK` to the SDK directory and `GR_BUILD_ROOT` to the absolute clean build directory. Use Node 24, uv-managed Python, and the build-tool versions encoded in the archive names. Copy the checked-in scripts into the build directory.

1. Create `sources/`, `logs/`, `tools/`, and `downloads/` under `GR_BUILD_ROOT`.
2. Copy the five autotools/pkgconf `.tar.xz` archives from `artifacts/` into `downloads/`.
3. Run `prepare-sources.sh`, then `build-tools.sh`.
4. Run `npm ci` in `sources/wrapper/`.
5. Run `build-native.sh` with the SDK activated.
6. Compare all eight files in `artifacts/libraw-threaded/` with `RUNTIME.sha256` after extraction into the same relative directory layout.

The build compiles LibRaw and Little CMS from source. It does not reuse the wrapper's committed `.a` files. The path map keeps embind assertion source paths stable. It does not remove assertions. Two independent complete native builds on the same host/toolchain produce identical runtime files; this is not a cross-host claim. The research archive records the rebuild comparison and the separate production Studio comparison.

The original executable recipe archive retains logs, the native link trace, toolchain comparison, and helper scripts. LibRaw, Little CMS, JPEG 9f, and Emscripten system libraries contribute to the runtime. PNG and zlib are requested and built by the inherited flags, but the final linker extracts no members from their archives. Retain their source in the reproduction materials.

Compiler/build tools are development dependencies. They do not enter the user runtime. The source materials include Emscripten's compiler/build scripts and system-library source. They fix LLVM/Binaryen identities but do not include their full compiler source or rebuild the compiler. Do not claim that a compiler source link establishes runtime source correspondence or public release clearance.
