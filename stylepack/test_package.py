"""Run with: uv run --no-project python -m unittest stylepack.test_package."""

import hashlib
import io
import json
import stat
import struct
import unittest
import warnings
import zipfile

from .package import MAX_BYTES, PackageError, create_package, inspect_package
from .icon import FONT, default_icon, render_icon
from pathlib import Path


STYLE_ID = "84556270-dd3c-48bb-8958-7a9395997cfb"


def make_cube(size=17):
    # Distinct channel functions and red-fastest traversal expose accidental
    # transposition; packaging must preserve all original bytes and row order.
    lines = ['TITLE "Asymmetric # target"', f"LUT_3D_SIZE {size}",
             "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"]
    for blue in range(size):
        for green in range(size):
            for red in range(size):
                lines.append(f"{red / (size - 1):.8f} {green / (2 * (size - 1)):.8f} {1 - blue / (size - 1):.8f}")
    return ("\n".join(lines) + "\n").encode()


def package(cube=None, **overrides):
    options = dict(name="Asymmetric", style_id=STYLE_ID, version="1.0.0",
                   author="Test author", license="CC-BY-4.0", source="https://example.invalid/look")
    options.update(overrides)
    return create_package(make_cube() if cube is None else cube, **options)


def members(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def repack(contents, extras=()):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in contents.items():
            archive.writestr(name, payload)
        for name, payload in extras:
            archive.writestr(name, payload)
    return output.getvalue()


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cube = make_cube()
        cls.data = package(cls.cube)

    def test_roundtrip_preserves_asymmetric_cube_and_contract(self):
        result = inspect_package(self.data)
        self.assertEqual(members(self.data)["look.cube"], self.cube)
        self.assertEqual(result["manifest"]["look"]["sha256"], hashlib.sha256(self.cube).hexdigest())
        self.assertEqual(result["cube"]["size"], 17)
        self.assertEqual(result["cube"]["row_count"], 17 ** 3)
        self.assertEqual(result["cube"]["ordering"], "red-fastest")
        self.assertEqual(result["manifest"]["color_contract"]["calibration"], "unmeasured")
        self.assertEqual(set(result), {"manifest", "cube", "package_sha256", "icon"})
        self.assertEqual(result["manifest"]["schema"], "gr-style-package/v2")
        self.assertEqual(package(self.cube), self.data)

    def test_other_supported_sizes(self):
        for size in (33, 65):
            with self.subTest(size=size):
                self.assertEqual(inspect_package(package(make_cube(size)))["cube"]["size"], size)

    def test_uuid_and_required_metadata(self):
        for changes in ({"style_id": "not-a-uuid"}, {"style_id": STYLE_ID.upper()},
                        {"name": " "}, {"license": ""}, {"author": "a\x00b"}):
            with self.subTest(changes=changes), self.assertRaises(PackageError):
                package(self.cube, **changes)

    def test_invalid_cube_contracts(self):
        replacements = (
            (b"LUT_3D_SIZE 17", b"LUT_3D_SIZE 16"),
            (b"LUT_3D_SIZE 17", b"LUT_1D_SIZE 17"),
            (b"LUT_3D_SIZE 17", b"LUT_3D_SIZE 17\nLUT_1D_SIZE 17"),
            (b"DOMAIN_MIN 0 0 0", b"DOMAIN_MIN -1 0 0"),
            (b"DOMAIN_MAX 1 1 1", b"DOMAIN_MAX 2 2 2"),
            (b"DOMAIN_MIN 0 0 0", b"DOMAIN_MIN 0 0 0\nDOMAIN_MIN 0 0 0"),
            (b"DOMAIN_MIN 0 0 0", b"UNKNOWN_HEADER 0 0 0"),
            (b"0.00000000 0.00000000 1.00000000", b"nan 0 1"),
            (b"0.00000000 0.00000000 1.00000000", b"1e999 0 1"),
            (b"0.00000000 0.00000000 1.00000000", b"-0.1 0 1"),
            (b"0.00000000 0.00000000 1.00000000", b"0 0 1.1"),
            (b"0.00000000 0.00000000 1.00000000", b"0 0"),
        )
        for before, after in replacements:
            with self.subTest(after=after), self.assertRaises(PackageError):
                package(self.cube.replace(before, after, 1))
        for invalid in (self.cube + b"0 0 0\n", self.cube.rsplit(b"\n", 2)[0],
                        self.cube + b"TITLE late\n", b"\xff", b""):
            with self.subTest(invalid=invalid[:30]), self.assertRaises(PackageError):
                package(invalid)

    def test_default_unit_domain_and_comments(self):
        cube = self.cube.replace(b"DOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n", b"# unit domain implicit\n")
        self.assertEqual(inspect_package(package(cube))["cube"]["domain_max"], [1, 1, 1])

    def test_checksum_and_manifest_metadata_mismatch(self):
        content = members(self.data)
        manifest = json.loads(content["manifest.json"])
        for field, value in (("sha256", "0" * 64), ("size", 33), ("ordering", "blue-fastest"),
                             ("path", "other.cube")):
            changed = json.loads(json.dumps(manifest))
            changed["look"][field] = value
            candidate = dict(content, **{"manifest.json": json.dumps(changed).encode()})
            with self.subTest(field=field), self.assertRaises(PackageError):
                inspect_package(repack(candidate))
        changed = dict(content)
        changed["look.cube"] += b"# changed bytes\n"
        with self.assertRaises(PackageError):
            inspect_package(repack(changed))

    def test_json_duplicates_nonfinite_and_unknown_fields(self):
        content = members(self.data)
        original = content["manifest.json"].decode()
        candidates = [original.replace('"name":', '"name": "duplicate", "name":', 1),
                      original.replace('"domain": [', '"domain": [NaN,', 1),
                      original.replace('"domain": [', '"domain": [1e999,', 1),
                      original.replace('"schema":', '"unexpected": 1, "schema":', 1),
                      original.replace('"unmeasured"', '"camera-calibrated"'),
                      original.replace('"gr-style-package/v2"', '"draft-grstyle"')]
        for text in candidates:
            with self.subTest(text=text[:60]), self.assertRaises(PackageError):
                inspect_package(repack(dict(content, **{"manifest.json": text.encode()})))

    def test_extra_traversal_and_duplicate_members(self):
        content = members(self.data)
        for name in ("../look.cube", "/tmp/look.cube", "profiles/recipe.json", "look.cube"):
            with self.subTest(name=name), warnings.catch_warnings(), self.assertRaises(PackageError):
                warnings.simplefilter("ignore", UserWarning)
                inspect_package(repack(content, [(name, b"unexpected")]))
        with self.assertRaises(PackageError):
            inspect_package(repack({"manifest.json": content["manifest.json"], "../look.cube": self.cube}))

    def test_symlink_rejected(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("manifest.json", members(self.data)["manifest.json"])
            link = zipfile.ZipInfo("look.cube")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, self.cube)
        with self.assertRaises(PackageError):
            inspect_package(output.getvalue())

    def test_encrypted_member_rejected(self):
        data = bytearray(self.data)
        central = data.index(b"PK\x01\x02")
        flags = struct.unpack_from("<H", data, central + 8)[0]
        struct.pack_into("<H", data, central + 8, flags | 1)
        with self.assertRaises(PackageError):
            inspect_package(bytes(data))

    def test_oversized_archive_and_decoded_members_rejected(self):
        with self.assertRaises(PackageError):
            inspect_package(b"x" * (MAX_BYTES + 1))
        data = bytearray(self.data)
        central = data.index(b"PK\x01\x02")
        struct.pack_into("<I", data, central + 24, MAX_BYTES + 1)
        with self.assertRaises(PackageError):
            inspect_package(bytes(data))
        content = members(self.data)
        content["manifest.json"] = b" " * (64 * 1024 + 1)
        with self.assertRaises(PackageError):
            inspect_package(repack(content))

    def test_bad_zip_and_corrupt_payload_rejected(self):
        for data in (b"not a zip", self.data[:30]):
            with self.assertRaises(PackageError):
                inspect_package(data)
        data = bytearray(self.data)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo("look.cube")
        offset = info.header_offset
        name_length, extra_length = struct.unpack_from("<HH", data, offset + 26)
        payload_offset = offset + 30 + name_length + extra_length
        data[payload_offset + info.compress_size // 2] ^= 0xFF
        with self.assertRaises(PackageError):
            inspect_package(bytes(data))

    def test_v1_is_readable_but_not_relaxed(self):
        content = members(self.data)
        manifest = json.loads(content["manifest.json"])
        manifest["schema"] = "gr-style-package/v1"
        manifest.pop("icon")
        original = repack(dict(content, **{"manifest.json": json.dumps(manifest).encode()}))
        result = inspect_package(original)
        self.assertEqual(result["manifest"], manifest)
        self.assertNotIn("icon", result["manifest"])
        self.assertEqual(result["icon"], default_icon(manifest["name"], STYLE_ID))
        self.assertEqual(result["package_sha256"], hashlib.sha256(original).hexdigest())
        manifest["icon"] = result["icon"]
        with self.assertRaises(PackageError):
            inspect_package(repack(dict(content, **{"manifest.json": json.dumps(manifest).encode()})))

    def test_icon_contract_and_complete_font(self):
        self.assertEqual(set(FONT), set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
        for char in FONT:
            self.assertEqual(len(render_icon({"template": "text-border-v1", "text": char, "border_color": "#E5B828"})), 4096)
        self.assertEqual(default_icon("胶片", STYLE_ID)["text"], "8455")
        self.assertEqual(default_icon("Gold 200", STYLE_ID)["text"], "GOLD")
        for icon in ({"template": "other", "text": "G200", "border_color": "#E5B828"},
                     {"template": "text-border-v1", "text": "ABCDE", "border_color": "#E5B828"},
                     {"template": "text-border-v1", "text": "a", "border_color": "#E5B828"},
                     {"template": "text-border-v1", "text": "A", "border_color": "#e5b828"}):
            with self.subTest(icon=icon), self.assertRaises(PackageError):
                package(self.cube, icon=icon)

    def test_shared_v9_pixel_oracles_and_package_fixtures(self):
        fixtures = Path(__file__).parent / "fixtures"
        for row in json.loads((fixtures / "icons.json").read_text()):
            actual = render_icon(row["icon"])
            self.assertEqual(actual, (fixtures / row["rgba_file"]).read_bytes())
            self.assertEqual(hashlib.sha256(actual).hexdigest(), row["sha256"])
        for name in ("asymmetric-v1.grstyle", "asymmetric-v2.grstyle", "typescript-v2.grstyle"):
            inspected = inspect_package((fixtures / name).read_bytes())
            self.assertEqual(inspected["cube"]["size"], 17)


if __name__ == "__main__":
    unittest.main()
