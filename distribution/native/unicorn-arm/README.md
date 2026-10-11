# Unicorn ARM corresponding source candidate

This directory supplies separate pristine source archives for Unicorn.JS revision `560284c59c11c8d6c94d537f4354339f069ddcdf` and its Unicorn submodule revision `8028ec436f2d9376525352dd38ed9ed6b9f6be10`.

Extract `unicorn-js-source.tar.gz`. Extract `unicorn-source.tar.gz` inside `unicorn-js/`. Apply `emscripten-5.0.7-build.patch` at the wrapper root with `patch -p1`.

Use Emscripten SDK revision `b44154299bdefe75ba287874bb63fc9806243771`, activated toolchain `5.0.7`, Emscripten revision `263db4cffa6f9fc2ec514a70abac81362ea41849`, CMake `4.4.3`, GNU Make `3.81`, pkgconf `2.5.1`, uv `0.11.16`, and CPython `3.13.13`. The tested host is macOS arm64. Emscripten supplies Node `24.19.0` and LLVM revision `7b58716d96c3ae4c0c4e6f72e29b16137bb6224b`.

Activate emsdk with `source /path/to/emsdk/emsdk_env.sh`. Set `PKG_CONFIG` to the installed pkgconf executable. Run `uv run --python 3.13.13 --no-project python build.py arm` at the wrapper root. The script copies QEMU 5.0.1 TCI sources, applies its three included patches, installs its helper adapter, regenerates constants and helper headers, and builds only ARM.

The build patch defines CONFIG_INT128 and includes sys/mman.h for the newer Emscripten headers. It removes the obsolete RESERVED_FUNCTION_POINTERS option. Preserve this patch with source distributions. No claim of byte identity with the previous npm binary is made.

Apply `adapt-runtime.py` to the built `dist/unicorn_arm.js` to write the distributed `.mjs` to a distinct path. This disables the Node filesystem branch and appends an ESM default export.

GPL-2.0 applies to the wrapper and Unicorn project grant. Individual QEMU, GLib, and utility sources retain their own notices. `license-inventory.json` lists source notices for inspection. Preserve all upstream files and notices. Emscripten system components retain their source-specific notices. The final link includes musl, dlmalloc, and nine compiler-rt objects, with MIT/BSD/CC0 and Apache-2.0 WITH LLVM-exception terms. Do not replace the LLVM exception route with plain Apache-2.0 or legacy NCSA. The complete source archives preserve all notices; the static distribution also carries the exact notice files under `public/licenses/unicorn-runtime/`. The SDK's third_party runtime source is supplied separately.

Build logs record failed attempts and the final successful build. This material does not establish permission to ship Ricoh-derived assets or the project's license combination.

The repeat build fixes parallel jobs to `4`. `emscripten-build-tools.tar.gz` and `emscripten-runtime-source.tar.gz` together contain the installed SDK's Emscripten source, tools, system libraries, and notices; extract both into one Emscripten directory. `emsdk-source.tar.gz` contains the pinned SDK installer source. `gr3-pkgconf-2.5.1.tar.xz` supplies the host configure helper source. Install pkgconf with `./configure --prefix=/path/to/isolated/tools`, `make -j4`, and `make install`. Compiler binary/toolchain downloads are not bundled. The SDK installer records the toolchain release mapping in its own source.

`unicorn-arm-preferred-source.tar.gz` contains the exact patched and generated source tree used by the final build. It includes regenerated helper headers/constants and copied TCI/helper files. It excludes compiler object files, Git history and runtime output. The separate pristine archives and build patch permit regeneration. The adapted runtime carries a dated modification notice.

Two clean ARM builds, with `10` then `4` jobs, produced the same generated JavaScript SHA-256: `258052b423b0e1c539432455b4bdf73509633904edfb0a863f9733aa54a71866`. This checks repeatability on this host and toolchain. It does not establish reproducibility across hosts or equality to the former npm binary.
