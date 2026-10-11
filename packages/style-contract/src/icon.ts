import font from "../../../stylepack/fixtures/icon-font.json" with { type: "json" };

export type LegacyStyleIcon = { template: "text-border-v1"; text: string; border_color: string };
export type FilmLabelIcon = { template: "film-label-v1"; layout: "solid" | "split" | "band"; top_text: string; bottom_text: string; top_color: string; bottom_color: string };
export type StyleIcon = LegacyStyleIcon | FilmLabelIcon;
export function validateIcon(value: unknown): StyleIcon {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid icon");
  const icon = value as Record<string, unknown>;
  if (icon.template === "film-label-v1") {
    if (Object.keys(icon).sort().join(",") !== "bottom_color,bottom_text,layout,template,top_color,top_text" ||
        !["solid", "split", "band"].includes(icon.layout as string) ||
        typeof icon.top_text !== "string" || !/^[A-Z0-9]{1,4}$/.test(icon.top_text) ||
        typeof icon.bottom_text !== "string" || !/^[A-Z0-9]{0,4}$/.test(icon.bottom_text) ||
        typeof icon.top_color !== "string" || !/^#[0-9A-F]{6}$/.test(icon.top_color) ||
        typeof icon.bottom_color !== "string" || !/^#[0-9A-F]{6}$/.test(icon.bottom_color)) throw new Error("Invalid film-label-v1 icon");
    return { template: "film-label-v1", layout: icon.layout as FilmLabelIcon["layout"], top_text: icon.top_text, bottom_text: icon.bottom_text, top_color: icon.top_color, bottom_color: icon.bottom_color };
  }
  if (Object.keys(icon).sort().join(",") !== "border_color,template,text" || icon.template !== "text-border-v1" ||
      typeof icon.text !== "string" || !/^[A-Z0-9]{1,4}$/.test(icon.text) ||
      typeof icon.border_color !== "string" || !/^#[0-9A-F]{6}$/.test(icon.border_color)) throw new Error("Invalid text-border-v1 icon");
  return { template: "text-border-v1", text: icon.text, border_color: icon.border_color };
}
export function defaultIcon(name: string, styleId: string): LegacyStyleIcon {
  const text = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || styleId.slice(0, 4).toUpperCase();
  return { template: "text-border-v1", text, border_color: "#E5B828" };
}
export function defaultFilmLabel(name: string, styleId: string): FilmLabelIcon {
  const upper = name.toUpperCase(), trailing = upper.match(/([0-9]+)\s*$/);
  const top = (trailing ? upper.slice(0, trailing.index) : upper).replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return { template: "film-label-v1", layout: "split", top_text: top || styleId.slice(0, 4).toUpperCase(), bottom_text: trailing?.[1].slice(0, 4) ?? "", top_color: "#E8B640", bottom_color: "#422D28" };
}
function filmPixels(icon: FilmLabelIcon): Uint8Array {
  const pixels = new Uint8Array(4096);
  const rgba = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).concat(255);
  const top = rgba(icon.top_color), bottom = rgba(icon.bottom_color);
  const background = (y: number) => icon.layout === "split" && y >= 16 || icon.layout === "band" && y >= 17 && y <= 27 ? bottom : top;
  const ink = (color: number[]) => {
    const linear = color.slice(0, 3).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2] > .179 ? [24, 24, 24, 255] : [248, 244, 235, 255];
  };
  for (let y = 3; y <= 28; y++) for (let x = 2; x <= 29; x++) pixels.set(background(y), (y * 32 + x) * 4);
  for (const [text, startY] of [[icon.top_text, 5], [icon.bottom_text, 18]] as const) {
    const startX = Math.floor((32 - (3 + (text.length - 1) * 5)) / 2);
    [...text].forEach((char, index) => (font as Record<string, string[]>)[char].forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === "1") for (let dy = 0; dy < 2; dy++) { const py = startY + y * 2 + dy; pixels.set(ink(background(py)), (py * 32 + startX + index * 5 + x) * 4); }
    })));
  }
  return pixels;
}
/** Exact V9 geometry and glyphs, RGBA bytes including transparent zero background. */
export function renderIcon(value: StyleIcon): Uint8Array {
  const icon = validateIcon(value);
  if (icon.template === "film-label-v1") return filmPixels(icon);
  const pixels = new Uint8Array(32 * 32 * 4);
  const color = [1, 3, 5].map(at => parseInt(icon.border_color.slice(at, at + 2), 16)).concat(255);
  const put = (x: number, y: number, rgba: number[]) => pixels.set(rgba, (y * 32 + x) * 4);
  for (let y = 3; y < 29; y++) for (let x = 2; x < 30; x++) if (x === 2 || x === 29 || y === 3 || y === 28) put(x, y, color);
  [...icon.text].forEach((char, index) => {
    const rows = (font as Record<string, string[]>)[char];
    rows.forEach((row, y) => [...row].forEach((bit, x) => { if (bit === "1") put(4 + index * 6 + x, 12 + y, [245, 237, 225, 255]); }));
  });
  return pixels;
}
