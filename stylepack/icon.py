"""Deterministic V9-compatible 32×32 RGBA labels; no platform fonts."""
import json
from pathlib import Path
import re

FONT = json.loads((Path(__file__).parent / "fixtures/icon-font.json").read_text())


def validate_icon(icon):
    if isinstance(icon, dict) and icon.get("template") == "film-label-v1":
        if set(icon) != {"template", "layout", "top_text", "bottom_text", "top_color", "bottom_color"}:
            raise ValueError("Unexpected film-label-v1 fields")
        if icon["layout"] not in ("solid", "split", "band"):
            raise ValueError("Invalid film-label-v1 layout")
        for field, pattern in (("top_text", r"[A-Z0-9]{1,4}"), ("bottom_text", r"[A-Z0-9]{0,4}"), ("top_color", r"#[0-9A-F]{6}"), ("bottom_color", r"#[0-9A-F]{6}")):
            if not isinstance(icon[field], str) or re.fullmatch(pattern, icon[field], re.ASCII) is None:
                raise ValueError(f"Invalid film-label-v1 {field}")
        return dict(icon)
    if not isinstance(icon, dict) or set(icon) != {"template", "text", "border_color"}:
        raise ValueError("Unexpected icon fields")
    if icon["template"] != "text-border-v1":
        raise ValueError("Unsupported icon template")
    if not isinstance(icon["text"], str) or re.fullmatch(r"[A-Z0-9]{1,4}", icon["text"], re.ASCII) is None:
        raise ValueError("Icon text must contain 1–4 A-Z or 0-9 characters")
    if not isinstance(icon["border_color"], str) or re.fullmatch(r"#[0-9A-F]{6}", icon["border_color"], re.ASCII) is None:
        raise ValueError("Icon border color must be uppercase #RRGGBB")
    return dict(icon)


def default_icon(name, style_id):
    text = "".join(c for c in name.upper() if c in FONT)[:4]
    return {"template": "text-border-v1", "text": text or style_id[:4].upper(), "border_color": "#E5B828"}


def default_film_label(name, style_id):
    upper = name.upper()
    trailing = re.search(r"([0-9]+)\s*$", upper, re.ASCII)
    top = upper[:trailing.start()] if trailing else upper
    top = re.sub(r"[^A-Z0-9]", "", top)[:4]
    return {"template": "film-label-v1", "layout": "split", "top_text": top or style_id[:4].upper(), "bottom_text": trailing.group(1)[:4] if trailing else "", "top_color": "#E8B640", "bottom_color": "#422D28"}


def _render_film(icon):
    pixels = bytearray(4096)
    top = bytes.fromhex(icon["top_color"][1:]) + b"\xff"
    bottom = bytes.fromhex(icon["bottom_color"][1:]) + b"\xff"
    def background(y):
        return bottom if (icon["layout"] == "split" and y >= 16 or icon["layout"] == "band" and 17 <= y <= 27) else top
    def ink(color):
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in (v / 255 for v in color[:3])]
        return bytes((24, 24, 24, 255)) if sum(a * b for a, b in zip((.2126, .7152, .0722), linear)) > .179 else bytes((248, 244, 235, 255))
    def put(x, y, color):
        pixels[(y * 32 + x) * 4:(y * 32 + x) * 4 + 4] = color
    for y in range(3, 29):
        for x in range(2, 30):
            put(x, y, background(y))
    for text, start_y in ((icon["top_text"], 5), (icon["bottom_text"], 18)):
        start_x = (32 - (3 + (len(text) - 1) * 5)) // 2
        for index, char in enumerate(text):
            for y, row in enumerate(FONT[char]):
                for x, bit in enumerate(row):
                    if bit == "1":
                        for dy in range(2):
                            py = start_y + y * 2 + dy
                            put(start_x + index * 5 + x, py, ink(background(py)))
    return bytes(pixels)


def render_icon(icon):
    icon = validate_icon(icon)
    if icon["template"] == "film-label-v1":
        return _render_film(icon)
    pixels = bytearray(4096)
    color = bytes.fromhex(icon["border_color"][1:]) + b"\xff"
    def put(x, y, rgba):
        start = (y * 32 + x) * 4
        pixels[start:start + 4] = rgba
    for y in range(3, 29):
        for x in range(2, 30):
            if x in (2, 29) or y in (3, 28):
                put(x, y, color)
    for index, char in enumerate(icon["text"]):
        for y, row in enumerate(FONT[char]):
            for x, value in enumerate(row):
                if value == "1":
                    put(4 + index * 6 + x, 12 + y, b"\xf5\xed\xe1\xff")
    return bytes(pixels)
