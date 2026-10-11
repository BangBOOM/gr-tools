"""Strict, data-only gr-style-package/v2 exchange format; v1 remains readable.

Packages contain only manifest.json and look.cube. The supported cube subset is
3D, 17/33/65 samples per axis, red fastest, trilinear interpolation, with input
domain and output values in [0, 1]. Values are interpreted as display sRGB, with
no claim of camera calibration. License and source are author declarations;
inspection does not establish rights or fitness for firmware installation.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import re
import shlex
import stat
import uuid
import zipfile
import zlib

from .icon import default_icon, validate_icon

SCHEMA = "gr-style-package/v2"
LEGACY_SCHEMA = "gr-style-package/v1"
MAX_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024
COLOR_CONTRACT = {
    "id": "display-srgb-unmeasured",
    "input": "display-srgb",
    "output": "display-srgb",
    "domain": [0, 1],
    "calibration": "unmeasured",
}
_MANIFEST_KEYS = {"schema", "id", "name", "version", "author", "license", "source", "color_contract", "look"}


class PackageError(ValueError):
    """The package or its color target violates the exchange contract."""


def _text(value: object, field: str, *, empty: bool = False, limit: int = 1024) -> str:
    if not isinstance(value, str) or len(value) > limit or (not empty and not value.strip()):
        raise PackageError(f"Invalid {field}")
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise PackageError(f"Control characters in {field}")
    return value


def _identity(value: object) -> str:
    _text(value, "style id", limit=36)
    try:
        normalized = str(uuid.UUID(value))
    except (ValueError, AttributeError) as exc:
        raise PackageError("Style id must be a UUID") from exc
    if value != normalized:
        raise PackageError("Style id must be a canonical lowercase UUID")
    return normalized


def _numbers(tokens: list[str], line: int) -> list[float]:
    if len(tokens) != 3:
        raise PackageError(f"Expected three values at cube line {line}")
    # Python float accepts spellings beyond the cube numeric subset, e.g. 1_0.
    pattern = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
    if any(re.fullmatch(pattern, token, flags=re.ASCII) is None for token in tokens):
        raise PackageError(f"Invalid numeric value at cube line {line}")
    values = [float(token) for token in tokens]
    if any(not math.isfinite(v) for v in values):
        raise PackageError(f"Nonfinite cube value at line {line}")
    return values


def _cube_metadata(cube: bytes) -> dict:
    if not isinstance(cube, bytes) or not cube or len(cube) > MAX_BYTES:
        raise PackageError("Cube must be nonempty bytes, at most 32 MiB")
    try:
        source = cube.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PackageError("Cube must be UTF-8 text") from exc
    size = None
    headers = set()
    rows = 0
    for line_no, line in enumerate(source.splitlines(), 1):
        try:
            tokens = shlex.split(line, comments=True, posix=True)
        except ValueError as exc:
            raise PackageError(f"Malformed cube line {line_no}") from exc
        if not tokens:
            continue
        key = tokens[0]
        if key in {"TITLE", "LUT_3D_SIZE", "DOMAIN_MIN", "DOMAIN_MAX"}:
            if rows or key in headers:
                raise PackageError(f"Duplicate or misplaced cube header {key}")
            headers.add(key)
            if key == "TITLE":
                if len(tokens) != 2:
                    raise PackageError("TITLE must have one quoted value")
                _text(tokens[1], "cube title")
            elif key == "LUT_3D_SIZE":
                if len(tokens) != 2 or tokens[1] not in {"17", "33", "65"}:
                    raise PackageError("Supported 3D cube sizes are 17, 33 and 65")
                size = int(tokens[1])
            else:
                values = _numbers(tokens[1:], line_no)
                expected = 0.0 if key == "DOMAIN_MIN" else 1.0
                if values != [expected] * 3:
                    raise PackageError("Only the cube input domain [0, 1] is supported")
            continue
        if size is None:
            raise PackageError(f"Missing LUT_3D_SIZE or unsupported header at cube line {line_no}")
        values = _numbers(tokens, line_no)
        if any(value < 0 or value > 1 for value in values):
            raise PackageError(f"Cube outputs must be in [0, 1], line {line_no}")
        rows += 1
        if rows > size ** 3:
            raise PackageError("Trailing cube data rows")
    if size is None or rows != size ** 3:
        raise PackageError("Cube data row count does not match LUT_3D_SIZE")
    return {
        "size": size,
        "row_count": rows,
        "domain_min": [0, 0, 0],
        "domain_max": [1, 1, 1],
        "ordering": "red-fastest",
        "interpolation": "trilinear",
    }


def _validate_manifest(manifest: object, cube: bytes, metadata: dict) -> dict:
    if not isinstance(manifest, dict):
        raise PackageError("Unexpected manifest fields")
    schema = manifest.get("schema")
    keys = _MANIFEST_KEYS | {"icon"} if schema == SCHEMA else _MANIFEST_KEYS
    if set(manifest) != keys:
        raise PackageError("Unexpected manifest fields")
    if schema not in (SCHEMA, LEGACY_SCHEMA):
        raise PackageError("Unsupported style package schema")
    _identity(manifest["id"])
    for field in ("name", "version", "author", "license"):
        _text(manifest[field], field, limit=128 if field == "version" else 1024)
    _text(manifest["source"], "source", empty=True, limit=4096)
    if schema == SCHEMA:
        try:
            validate_icon(manifest["icon"])
        except ValueError as exc:
            raise PackageError(str(exc)) from exc
    # Require the exact contract, without coercing JSON booleans to numbers.
    if json.dumps(manifest["color_contract"], sort_keys=True) != json.dumps(COLOR_CONTRACT, sort_keys=True):
        raise PackageError("Unsupported color contract")
    expected = {
        "path": "look.cube",
        "sha256": hashlib.sha256(cube).hexdigest(),
        "size": metadata["size"],
        "ordering": "red-fastest",
        "interpolation": "trilinear",
    }
    if not isinstance(manifest["look"], dict) or json.dumps(manifest["look"], sort_keys=True) != json.dumps(expected, sort_keys=True):
        raise PackageError("Cube checksum or look metadata mismatch")
    return manifest


def create_package(cube: bytes, *, name: str, style_id: str, version: str,
                   author: str, license: str, source: str = "", icon: dict | None = None) -> bytes:
    """Create a deterministic portable color target, preserving exact cube bytes.

    ``license`` is a declared SPDX-like identifier or short license statement.
    No executable code, native camera recipe, or editable user project is added.
    """
    metadata = _cube_metadata(cube)
    _identity(style_id)
    _text(name, "name")
    manifest = {
        "schema": SCHEMA,
        "id": style_id,
        "name": name,
        "version": version,
        "author": author,
        "license": license,
        "source": source,
        "icon": default_icon(name, style_id) if icon is None else icon,
        "color_contract": COLOR_CONTRACT,
        "look": {
            "path": "look.cube",
            "sha256": hashlib.sha256(cube).hexdigest(),
            "size": metadata["size"],
            "ordering": "red-fastest",
            "interpolation": "trilinear",
        },
    }
    _validate_manifest(manifest, cube, metadata)
    encoded = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    if len(encoded) > MAX_MANIFEST_BYTES or len(encoded) + len(cube) > MAX_BYTES:
        raise PackageError("Decoded package exceeds size limit")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in (("manifest.json", encoded), ("look.cube", cube)):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, payload)
    result = output.getvalue()
    if len(result) > MAX_BYTES:
        raise PackageError("Compressed package exceeds size limit")
    return result


def _json_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise PackageError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _json_constant(value: str) -> None:
    raise PackageError(f"Nonfinite JSON value: {value}")


def _json_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise PackageError("Nonfinite JSON number")
    return result


def inspect_package(data: bytes) -> dict:
    """Validate an untrusted package in memory and return modest metadata only.

    Nothing is extracted, executed, fetched, calibrated, or installed. Declared
    sources and licenses are not validated for provenance or legal permission.
    """
    if not isinstance(data, bytes) or not data or len(data) > MAX_BYTES:
        raise PackageError("Package must be nonempty bytes, at most 32 MiB")
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            entries = archive.infolist()
            if len(entries) != 2 or {entry.filename for entry in entries} != {"manifest.json", "look.cube"}:
                raise PackageError("Archive must contain exactly manifest.json and look.cube")
            if sum(entry.file_size for entry in entries) > MAX_BYTES:
                raise PackageError("Decoded package exceeds size limit")
            payloads = {}
            for entry in entries:
                kind = stat.S_IFMT(entry.external_attr >> 16)
                if entry.flag_bits & 1 or kind not in {0, stat.S_IFREG}:
                    raise PackageError("Encrypted or nonregular archive member")
                if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                    raise PackageError("Unsupported ZIP compression")
                limit = MAX_MANIFEST_BYTES if entry.filename == "manifest.json" else MAX_BYTES
                if entry.file_size > limit or entry.compress_size > MAX_BYTES:
                    raise PackageError("Archive member exceeds size limit")
                with archive.open(entry) as member:
                    payload = member.read(limit + 1)
                if len(payload) > limit or len(payload) != entry.file_size:
                    raise PackageError("Archive member size mismatch")
                payloads[entry.filename] = payload
        manifest = json.loads(payloads["manifest.json"].decode("utf-8"),
                              object_pairs_hook=_json_object, parse_constant=_json_constant,
                              parse_float=_json_float)
        cube = _cube_metadata(payloads["look.cube"])
        _validate_manifest(manifest, payloads["look.cube"], cube)
    except (zipfile.BadZipFile, zipfile.LargeZipFile, UnicodeDecodeError,
            json.JSONDecodeError, RuntimeError, NotImplementedError, EOFError,
            RecursionError, OSError, zlib.error) as exc:
        raise PackageError(f"Invalid style package: {exc}") from exc
    return {"manifest": manifest, "cube": cube, "package_sha256": hashlib.sha256(data).hexdigest(),
            "icon": manifest.get("icon") or default_icon(manifest["name"], manifest["id"])}
