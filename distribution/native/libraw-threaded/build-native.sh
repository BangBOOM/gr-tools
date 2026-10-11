#!/bin/bash
set -euo pipefail
ROOT=${GR_BUILD_ROOT:-/tmp/gr3-native-release-build}
SDK=${GR_EMSDK:-/tmp/gr3-emsdk}
ROOT=$(cd "$ROOT" && pwd -P)
SDK=$(cd "$SDK" && pwd -P)
export PATH="$ROOT/tools/bin:$SDK/upstream/emscripten:$SDK/upstream/bin:$PATH"
export EM_CONFIG="$SDK/.emscripten"
export EMSDK_PYTHON="$ROOT/tools/uv-python"
export EM_CACHE="$ROOT/emscripten-cache"
export EM_PORTS="$ROOT/emscripten-ports"
mkdir -p "$ROOT/build/includes" "$ROOT/build/libs" "$ROOT/artifacts"
emcc --version > "$ROOT/logs/toolchain.log" 2>&1
grep -q "5.0.7 (263db4cffa6f9fc2ec514a70abac81362ea41849)" "$ROOT/logs/toolchain.log"
cd "$ROOT/sources/lcms2"
libtoolize
 autoreconf -fi
emconfigure ./configure --host=wasm32-unknown-emscripten --disable-shared
emmake make -j8
cp -R src/.libs/* "$ROOT/build/libs/"
cp -R include/* "$ROOT/build/includes/"
cd "$ROOT/sources/LibRawSource"
libtoolize
 autoreconf -i
emconfigure ./configure --host=wasm32-unknown-emscripten --enable-openmp --enable-lcms --enable-jpeg --disable-shared --disable-examples \
 CFLAGS="-O3 -flto -ffast-math -msimd128 -DNDEBUG -DUSE_LCMS2 -DUSE_JPEG -DUSE_JPEG8 -sUSE_LIBJPEG=1 -I$ROOT/build/includes" \
 CXXFLAGS="-O3 -flto -ffast-math -msimd128 -DNDEBUG -DUSE_LCMS2 -DUSE_JPEG -DUSE_JPEG8 -sUSE_LIBJPEG=1 -I$ROOT/build/includes" \
 LDFLAGS="-s USE_PTHREADS=1 -sUSE_LIBJPEG=1 -lpthread -L$ROOT/build/libs/ -llcms2"
emmake make -j8
cp -R lib/.libs/* "$ROOT/build/libs/"
cp -R libraw "$ROOT/build/includes/"
cd "$ROOT/sources/wrapper"
emcc --bind -ffile-prefix-map="$ROOT=/gr-libraw-build" -I"$ROOT/build/includes" -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1 -sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sDISABLE_EXCEPTION_CATCHING=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sUSE_PTHREADS=1 -sENVIRONMENT=web,worker -msimd128 -O3 -flto -pthread libraw_wrapper.cpp "$ROOT/build/libs/liblcms2.a" "$ROOT/build/libs/libraw.a" -o libraw.js
node build.js
cp -R dist "$ROOT/artifacts/libraw-threaded"
