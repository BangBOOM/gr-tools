#!/bin/bash
set -euo pipefail
ROOT=${GR_BUILD_ROOT:-/tmp/gr3-native-release-build}
mkdir -p "$ROOT/sources" "$ROOT/logs" "$ROOT/tools"
tar -xzf "$ROOT/artifacts/LibRaw-0.22.1-source.tar.gz" -C "$ROOT/sources"
mv "$ROOT/sources/LibRaw-0.22.1" "$ROOT/sources/LibRawSource"
tar -xzf "$ROOT/artifacts/Little-CMS-2.19.1-source.tar.gz" -C "$ROOT/sources"
mv "$ROOT/sources/Little-CMS-2.19.1" "$ROOT/sources/lcms2"
tar -xzf "$ROOT/artifacts/libraw-wasm-1.6.0-source.tar.gz" -C "$ROOT/sources"
mv "$ROOT/sources/libraw-wasm-1.6.0" "$ROOT/sources/wrapper"
cat > "$ROOT/tools/uv-python" <<'SHIM'
#!/bin/sh
exec uv run --no-project --quiet python "$@"
SHIM
chmod +x "$ROOT/tools/uv-python"
