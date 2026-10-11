import { decodeUTF8, validateCube } from "./cube.ts";
import type { CubeMetadata } from "./cube.ts";
import { defaultIcon, validateIcon } from "./icon.ts";
import type { StyleIcon } from "./icon.ts";
import { strictJSON } from "./strict-json.ts";
import { CAMERA_LIMIT, readZip, writeZip } from "./zip.ts";
export { validateCube, strictJSON, defaultIcon, validateIcon };
export { renderIcon, defaultFilmLabel } from "./icon.ts";
export type { StyleIcon, CubeMetadata };
export type { LegacyStyleIcon, FilmLabelIcon } from "./icon.ts";

export const COMPILED_SCHEMA = "gr-style-package/v3";
export type CameraPlatform = { id: string; sha256: string };
export type CompiledCameraFit = { matrix_q13: number[][]; curves_q14: number[][]; report: Record<string, unknown> };
export type CompiledCamera = { platform: CameraPlatform; fit: CompiledCameraFit };
export const SCHEMA = "gr-style-package/v2";
export const COLOR_CONTRACT = Object.freeze({ id: "display-srgb-unmeasured", input: "display-srgb", output: "display-srgb", domain: [0, 1], calibration: "unmeasured" });
type Look = { path: "look.cube"; sha256: string; size: number; ordering: "red-fastest"; interpolation: "trilinear" };
export type StyleManifest = { schema: "gr-style-package/v1" | "gr-style-package/v2" | "gr-style-package/v3"; id: string; name: string; version: string; author: string; license: string; source: string; color_contract: typeof COLOR_CONTRACT; look: Look; icon?: StyleIcon; camera?: { platform: CameraPlatform; path: "camera.json"; sha256: string } };
export type StylePackageInput = { cube: Uint8Array; name: string; style_id: string; version: string; author: string; license: string; source?: string; icon?: StyleIcon; camera?: CompiledCamera };
const KEYS = ["schema", "id", "name", "version", "author", "license", "source", "color_contract", "look"];
const encode = (source: string) => new TextEncoder().encode(source);
function text(value: unknown, name: string, limit = 1024, empty = false): asserts value is string {
  if (typeof value !== "string" || [...value].length > limit || (!empty && !value.trim()) || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid ${name}`);
}
function identity(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error("Style id must be a canonical lowercase UUID");
}
function sorted(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sorted).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${sorted((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function fields(value: unknown, keys: string[], name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",")) throw new Error(`Invalid ${name} fields`);
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error("Invalid SHA256 identity");
}
function platformCheck(value: unknown): asserts value is CameraPlatform {
  fields(value, ["id", "sha256"], "camera platform"); text(value.id, "camera platform id", 128); digest(value.sha256);
}
function reportCheck(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) reportCheck(item); return; }
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) { for (const item of Object.values(value)) reportCheck(item); return; }
  throw new Error("Camera report must contain JSON values");
}
function fitCheck(value: unknown): asserts value is CompiledCameraFit {
  fields(value, ["matrix_q13", "curves_q14", "report"], "camera fit");
  const matrix = value.matrix_q13, curves = value.curves_q14;
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 3 || row.some(v => !Number.isInteger(v) || v < -32768 || v > 32767))) throw new Error("Invalid camera Q13 matrix");
  if (!Array.isArray(curves) || curves.length !== 3 || curves.some(row => !Array.isArray(row) || ![65, 257].includes(row.length) || row.length !== curves[0].length || row.some(v => !Number.isInteger(v) || v < 0 || v > 16384))) throw new Error("Invalid camera Q14 curves");
  if (!value.report || typeof value.report !== "object" || Array.isArray(value.report)) throw new Error("Invalid camera fit report");
  reportCheck(value.report);
}
function manifestCheck(value: unknown, cube: CubeMetadata, hash: string): StyleManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid style manifest");
  const m = value as Record<string, unknown>, keys = m.schema === COMPILED_SCHEMA ? [...KEYS, "icon", "camera"] : m.schema === SCHEMA ? [...KEYS, "icon"] : KEYS;
  if (Object.keys(m).sort().join(",") !== [...keys].sort().join(",") || ![SCHEMA, COMPILED_SCHEMA, "gr-style-package/v1"].includes(m.schema as string)) throw new Error("Unknown schema or manifest fields");
  identity(m.id); for (const field of ["name", "version", "author", "license"]) text(m[field], field, field === "version" ? 128 : 1024);
  text(m.source, "source", 4096, true);
  if (sorted(m.color_contract) !== sorted(COLOR_CONTRACT)) throw new Error("Unsupported color contract");
  const expected: Look = { path: "look.cube", sha256: hash, size: cube.size, ordering: "red-fastest", interpolation: "trilinear" };
  if (sorted(m.look) !== sorted(expected)) throw new Error("Cube checksum or metadata mismatch");
  if (m.schema !== "gr-style-package/v1") validateIcon(m.icon);
  if (m.schema === COMPILED_SCHEMA) {
    fields(m.camera, ["platform", "path", "sha256"], "camera manifest");
    platformCheck(m.camera.platform); digest(m.camera.sha256);
    if (m.camera.path !== "camera.json") throw new Error("Invalid camera path");
  }
  return m as StyleManifest;
}
/** Portable display-sRGB color target; author declarations do not establish rights. */
export async function createStylePackage(input: StylePackageInput): Promise<Uint8Array> {
  identity(input.style_id); text(input.name, "name");
  const cube = validateCube(input.cube), hash = await sha256(input.cube);
  let cameraBytes: Uint8Array | undefined;
  if (input.camera !== undefined) {
    fields(input.camera, ["platform", "fit"], "compiled camera"); platformCheck(input.camera.platform); fitCheck(input.camera.fit);
    // Fit report identity uses JSON.stringify field order. Preserve that order.
    cameraBytes = encode(JSON.stringify(input.camera.fit) + "\n");
    if (cameraBytes.length > CAMERA_LIMIT) throw new Error("Camera size limit");
    fitCheck(strictJSON(decodeUTF8(cameraBytes)));
  }
  const manifest: StyleManifest = {
    schema: cameraBytes ? COMPILED_SCHEMA : SCHEMA, id: input.style_id, name: input.name, version: input.version, author: input.author,
    license: input.license, source: input.source ?? "", color_contract: COLOR_CONTRACT,
    look: { path: "look.cube", sha256: hash, size: cube.size, ordering: "red-fastest", interpolation: "trilinear" },
    icon: input.icon ?? defaultIcon(input.name, input.style_id),
    ...(cameraBytes ? { camera: { platform: input.camera!.platform, path: "camera.json" as const, sha256: await sha256(cameraBytes) } } : {}),
  };
  manifestCheck(manifest, cube, hash);
  return writeZip(encode(sorted(manifest) + "\n"), input.cube, cameraBytes);
}
/** Reads in memory. Structural validation does not establish calibration or camera installability. */
export async function inspectStylePackage(bytes: Uint8Array): Promise<{ manifest: StyleManifest; cube: CubeMetadata; cubeBytes: Uint8Array; package_sha256: string; icon: StyleIcon; camera?: CompiledCamera }> {
  const files = readZip(bytes), cubeBytes = files["look.cube"], cube = validateCube(cubeBytes);
  const manifest = manifestCheck(strictJSON(decodeUTF8(files["manifest.json"])), cube, await sha256(cubeBytes));
  const cameraBytes = files["camera.json"];
  if ((manifest.schema === COMPILED_SCHEMA) !== (cameraBytes !== undefined) || !files["manifest.json"] || !files["look.cube"]) throw new Error("Schema ZIP members mismatch");
  let camera: CompiledCamera | undefined;
  if (cameraBytes) {
    if (await sha256(cameraBytes) !== manifest.camera!.sha256) throw new Error("Camera checksum mismatch");
    const fit = strictJSON(decodeUTF8(cameraBytes)); fitCheck(fit);
    camera = { platform: manifest.camera!.platform, fit };
  }
  return { manifest, cube, cubeBytes, ...(camera ? { camera } : {}), package_sha256: await sha256(bytes), icon: manifest.icon ?? defaultIcon(manifest.name, manifest.id) };
}
