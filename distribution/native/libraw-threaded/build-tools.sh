#!/bin/bash
set -euo pipefail
ROOT=${GR_BUILD_ROOT:-/tmp/gr3-native-release-build}
export PATH="$ROOT/tools/bin:$PATH"
for component in m4-1.4.20 autoconf-2.72 automake-1.18.1 libtool-2.5.4 pkgconf-2.5.1; do
 tar -xJf "$ROOT/downloads/$component.tar.xz" -C "$ROOT/sources"
 cd "$ROOT/sources/$component"
 ./configure --prefix="$ROOT/tools" > "$ROOT/logs/$component.log" 2>&1
 make -j8 >> "$ROOT/logs/$component.log" 2>&1
 make install >> "$ROOT/logs/$component.log" 2>&1
 echo "$component built"
done
ln -sf pkgconf "$ROOT/tools/bin/pkg-config"
