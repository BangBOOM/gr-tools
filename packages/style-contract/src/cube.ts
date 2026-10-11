export const MAX_BYTES = 32 * 1024 * 1024;
export type CubeMetadata = { size: number; row_count: number; domain_min: number[]; domain_max: number[]; ordering: "red-fastest"; interpolation: "trilinear" };
export const decodeUTF8 = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

// Match the reference subset's shell-like quoted TITLE and # comments.
function tokens(line: string): string[] {
  const out: string[] = []; let token = "", started = false, quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) { quote = ""; continue; }
      if (c === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) { token += line[++i]; continue; }
      token += c; continue;
    }
    if (c === "#") break;
    if (/\s/.test(c)) { if (started) { out.push(token); token = ""; started = false; } continue; }
    started = true;
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "\\") { if (++i >= line.length) throw new Error("Malformed cube escape"); token += line[i]; continue; }
    token += c;
  }
  if (quote) throw new Error("Unterminated cube quote");
  if (started) out.push(token);
  return out;
}
function numbers(parts: string[]): number[] {
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (parts.length !== 3 || parts.some(p => !numeric.test(p))) throw new Error("Expected three numeric cube values");
  const values = parts.map(Number); if (values.some(v => !Number.isFinite(v))) throw new Error("Nonfinite cube value");
  return values;
}
export function validateCube(cube: Uint8Array): CubeMetadata {
  if (!(cube instanceof Uint8Array) || cube.byteLength === 0 || cube.byteLength > MAX_BYTES) throw new Error("Cube must be 1..32MiB");
  let size = 0, rows = 0; const seen = new Set<string>();
  for (const line of decodeUTF8(cube).split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)) {
    const parts = tokens(line); if (!parts.length) continue;
    const [key, ...rest] = parts;
    if (["TITLE", "LUT_3D_SIZE", "DOMAIN_MIN", "DOMAIN_MAX"].includes(key)) {
      if (rows || seen.has(key)) throw new Error("Duplicate or misplaced cube header"); seen.add(key);
      if (key === "TITLE") {
        if (rest.length !== 1 || !rest[0].trim() || [...rest[0]].length > 1024 || /[\x00-\x1f\x7f]/.test(rest[0])) throw new Error("Invalid cube title");
      } else if (key === "LUT_3D_SIZE") {
        if (rest.length !== 1 || !["17", "33", "65"].includes(rest[0])) throw new Error("Supported cube sizes: 17, 33, 65"); size = Number(rest[0]);
      } else if (numbers(rest).some(v => v !== (key === "DOMAIN_MIN" ? 0 : 1))) throw new Error("Only unit cube input domain supported");
      continue;
    }
    if (!size) throw new Error("Missing LUT_3D_SIZE or unknown header");
    if (numbers(parts).some(v => v < 0 || v > 1)) throw new Error("Cube output outside [0,1]");
    if (++rows > size ** 3) throw new Error("Trailing cube rows");
  }
  if (!size || rows !== size ** 3) throw new Error("Cube row count mismatch");
  return { size, row_count: rows, domain_min: [0, 0, 0], domain_max: [1, 1, 1], ordering: "red-fastest", interpolation: "trilinear" };
}
