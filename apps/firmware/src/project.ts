import { defaultIcon, inspectStylePackage, createStylePackage, validateIcon, strictJSON, renderIcon } from "../../../packages/style-contract/src/index.ts";
import type { FilmLabelIcon, StyleIcon, StyleManifest } from "../../../packages/style-contract/src/index.ts";
import { CAMERA_TARGET } from "../../../packages/firmware-fit/src/target.ts";
import { FIT_WASM_SHA256, FIT_EVALUATOR_SOURCE_SHA256 } from "../../../packages/firmware-fit/wasm/pin.ts";
import { verifyFitResult, type FitResult } from "../../../packages/firmware-fit/src/index.ts";
export const PROJECT_PLATFORM = CAMERA_TARGET;
export const PROJECT_FITTER = Object.freeze({ wasm_sha256: FIT_WASM_SHA256, evaluator_sha256: FIT_EVALUATOR_SOURCE_SHA256 });
// The preceding platform differs only in probe adapters/name behavior. Its exact
// projects can be migrated from their original packages; all fits are discarded.
const PREVIOUS_PLATFORM_SHA256 = 'af0801924602658c5117fd5d62e7e3fd3f172ff44937a69b5f238af9d7d872a5';
export type LibraryStyle = { id: string; name: string; icon: StyleIcon; reference?: string; manifest?: StyleManifest; cube?: Uint8Array; packageBytes?: Uint8Array; packageSha256?:string; compiledFit?: StyleFit };
export const REFERENCE_STYLES: LibraryStyle[] = [
  { id: "reference:gold", name: "Gold 200", reference: "gold", icon: { template: "text-border-v1", text: "G200", border_color: "#E5B828" } },
  { id: "reference:tungsten", name: "Tungsten 800", reference: "tungsten", icon: { template: "text-border-v1", text: "T800", border_color: "#38ADB8" } },
  { id: "reference:ektar", name: "Ektar 100", reference: "ektar", icon: { template: "text-border-v1", text: "E100", border_color: "#D96147" } },
  { id: "reference:metropolis", name: "Metropolis", reference: "metropolis", icon: { template: "text-border-v1", text: "MTRO", border_color: "#92A3AA" } },
];
const DEFAULT_ICONS: FilmLabelIcon[] = [
  { template: "film-label-v1", layout: "split", top_text: "GOLD", bottom_text: "200", top_color: "#E8B640", bottom_color: "#422D28" },
  { template: "film-label-v1", layout: "split", top_text: "TUNG", bottom_text: "800", top_color: "#AF3737", bottom_color: "#23292F" },
  { template: "film-label-v1", layout: "split", top_text: "EKTR", bottom_text: "100", top_color: "#BF453C", bottom_color: "#EADCC2" },
  { template: "film-label-v1", layout: "split", top_text: "METR", bottom_text: "400", top_color: "#67725F", bottom_color: "#E3DCC5" },
];
// UI defaults are resource variants. Frozen reference bytes retain their identity.
export const DEFAULT_STYLES: LibraryStyle[] = REFERENCE_STYLES.map((style, i) => ({ ...style, icon: DEFAULT_ICONS[i] }));
export const FACTORY_ORDER = ["Nega", "Posi", "Gold 200", "Tungsten 800", "Ektar 100", "Metropolis", "Standard", "Vivid", "Monotone", "Soft Monotone", "Hard Monotone", "Hi-Contrast B&W", "Bleach Bypass", "Retro", "HDR Tone", "Cross Processing", "Custom 1", "Custom 2"];
export const defaultSlots = () => REFERENCE_STYLES.map(s => s.id);
export function isReferenceRecipeSelection(styles: LibraryStyle[], slots: string[], order: string[]): boolean {
  return slots.length === 4 && slots.every((id, i) => id === REFERENCE_STYLES[i].id && styles.find(s => s.id === id)?.reference === REFERENCE_STYLES[i].reference) && JSON.stringify(order) === JSON.stringify(FACTORY_ORDER);
}
export function isReferenceSelection(styles: LibraryStyle[], slots: string[], order: string[]): boolean {
  return isReferenceRecipeSelection(styles, slots, order) && slots.every((id, i) => JSON.stringify(styles.find(s => s.id === id)?.icon) === JSON.stringify(REFERENCE_STYLES[i].icon));
}
export type StyleFit = { matrix_q13: number[][]; curves_q14: number[][]; report: Record<string, any>; acceptedFitHash?: string; origin?: 'compiled-style' | 'explicit-refit' };
export function reusableCompiledFit(style: LibraryStyle, nodes:65|257): StyleFit | undefined {
  return style.compiledFit?.curves_q14[0].length === nodes ? structuredClone(style.compiledFit) : undefined;
}
async function inspectedLibraryStyle(bytes:Uint8Array):Promise<LibraryStyle> {
  const inspected = await inspectStylePackage(bytes);
  if(inspected.camera){
    const {platform,fit}=inspected.camera;
    if(platform.id!==PROJECT_PLATFORM.id || platform.sha256!==PROJECT_PLATFORM.sha256) throw new Error('Compiled style platform does not match this Firmware version. Export with the matching Studio version.');
    await verifyFitResult(fit as FitResult,inspected.cubeBytes);
  }
  return { id: inspected.manifest.id, name: inspected.manifest.name, icon: inspected.icon, manifest: inspected.manifest, cube: inspected.cubeBytes, packageBytes: bytes, packageSha256:inspected.package_sha256,
    ...(inspected.camera?{compiledFit:{...inspected.camera.fit,origin:'compiled-style' as const}}:{}) };
}
const CANONICAL_ORDER = [FACTORY_ORDER[2], FACTORY_ORDER[3], FACTORY_ORDER[4], FACTORY_ORDER[5], FACTORY_ORDER[0], FACTORY_ORDER[1], ...FACTORY_ORDER.slice(6)];
export function selection(styles: LibraryStyle[], slots: string[], order: string[], fits: Record<string, StyleFit> = {}) {
  if(JSON.stringify(order)!==JSON.stringify(FACTORY_ORDER))throw new Error("V9.2 menu order is preserved in this release");
  if (isReferenceSelection(styles, slots, order)) return { profile: "V9.2-reference" as const };
  return { profile: "V9.2-four-slot" as const, slots: slots.map((id,index) => {
    const style = styles.find(s => s.id === id), fit = fits[id];
    const pixels_hex = style ? Array.from(renderIcon(style.icon), b => b.toString(16).padStart(2, "0")).join("") : undefined;
    const iconVariant = style?.reference && JSON.stringify(style.icon) !== JSON.stringify(REFERENCE_STYLES.find(s => s.reference === style.reference)?.icon);
    return { uuid: style?.manifest?.id ?? id, label: style?.name ?? "Empty", cubeSha256: style?.manifest?.look.sha256, icon: { pixels_hex, ...(iconVariant ? { definition: structuredClone(style!.icon) } : {}) }, cubeBytes: style?.cube?.slice(), packageBytes:style?.packageBytes?.slice(), packageSha256:style?.packageSha256, reference: style?.reference,
      ...(fit ? { recipe: { matrix_q13: fit.matrix_q13, curves_q14: fit.curves_q14 }, fitReport: fit.report, acceptedFitHash: fit.acceptedFitHash, fitOrigin:fit.origin } : {}) };
  }), historicalDngPolicy:"fixed-slot-reinterpretation" as const, persistencePolicy:"reset-on-registry-change" as const, displayOrder: order.map(name => CANONICAL_ORDER.indexOf(name)) };
}
function toBase64(bytes: Uint8Array): string {
  let text = ""; for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return btoa(text);
}
function fromBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > 44 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid project package encoding");
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
export function exportProject(name: string, base: { sha256: string; name: string } | null, styles: LibraryStyle[], slots: string[], order: string[], nodes:65|257=65): Uint8Array {
  const iconVariant = styles.some(style => style.reference && JSON.stringify(style.icon) !== JSON.stringify(REFERENCE_STYLES.find(s => s.reference === style.reference)?.icon));
  const project = { schema: iconVariant ? "gr-firmware-project/v2" : "gr-firmware-project/v1", name, base, platform: PROJECT_PLATFORM, fitter: PROJECT_FITTER, styles: styles.map(style => style.reference ? { reference: style.reference, ...(iconVariant ? { icon: style.icon } : {}) } : { package_base64: toBase64(style.packageBytes!) }), slots, menu_order: order, curve_nodes:nodes };
  const bytes = new TextEncoder().encode(JSON.stringify(project, null, 2) + "\n");
  if(bytes.length > 64*1024*1024) throw new Error("Project exceeds 64 MiB");
  return bytes;
}
export async function importProject(bytes: Uint8Array): Promise<{ name: string; base: { sha256: string; name: string } | null; styles: LibraryStyle[]; slots: string[]; order: string[]; nodes:65|257; migratedPlatformFrom?:string }> {
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Project exceeds 64 MiB");
  const value = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid firmware project");
  const p = value as Record<string, any>;
  if (Object.keys(p).sort().join(",") !== "base,curve_nodes,fitter,menu_order,name,platform,schema,slots,styles" || !["gr-firmware-project/v1", "gr-firmware-project/v2"].includes(p.schema) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 128) throw new Error("Unknown project fields/schema");
  function exactIdentity(actual:unknown, expected:Record<string,string>): boolean {
    return !!actual && typeof actual === "object" && !Array.isArray(actual) && Object.keys(actual).sort().join(",") === Object.keys(expected).sort().join(",") && Object.entries(expected).every(([key,value]) => (actual as Record<string,unknown>)[key] === value);
  }
  const oldPlatformHashes=[PREVIOUS_PLATFORM_SHA256,'d026b65784cf82657293d8b13dc42cf5682bc8a656f2a5dc492b494b1553dad2'];
  const previousPlatform=oldPlatformHashes.some(sha256=>exactIdentity(p.platform,{id:'gr3-hdf-v210-v9.1',sha256}));
  if (!exactIdentity(p.platform, PROJECT_PLATFORM)&&!previousPlatform) throw new Error("Project platform does not match this tool; rebuild with the matching version");
  if (!exactIdentity(p.fitter, PROJECT_FITTER)) throw new Error("Project fitter does not match this tool; keep the old project and migrate explicitly");
  if(![65,257].includes(p.curve_nodes)) throw new Error("Invalid curve nodes");
  if (p.base !== null && (!p.base || Object.keys(p.base).sort().join(",") !== "name,sha256" || typeof p.base.name !== "string" || !/^[a-f0-9]{64}$/.test(p.base.sha256))) throw new Error("Invalid project base identity");
  if (!Array.isArray(p.styles) || p.styles.length > 32) throw new Error("Project style library exceeds 32 entries");
  const styles: LibraryStyle[] = [];
  for (const item of p.styles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid project style");
    if (Object.keys(item).sort().join(",") === (p.schema === "gr-firmware-project/v2" ? "icon,reference" : "reference")) {
      const ref = REFERENCE_STYLES.find(s => s.reference === item.reference); if (!ref) throw new Error("Unknown frozen reference");
      styles.push({ ...structuredClone(ref), ...(p.schema === "gr-firmware-project/v2" ? { icon: validateIcon(item.icon) } : {}) });
    } else if (Object.keys(item).join(",") === "package_base64") {
      styles.push(await inspectedLibraryStyle(fromBase64(item.package_base64)));
    } else throw new Error("Unknown project style fields");
  }
  if (new Set(styles.map(s => s.id)).size !== styles.length) throw new Error("Duplicate project style identities");
  if (!Array.isArray(p.slots) || p.slots.length !== 4 || p.slots.some((id: unknown) => typeof id !== "string" || id !== "" && !styles.some(s => s.id === id)) || new Set(p.slots.filter(Boolean)).size !== p.slots.filter(Boolean).length) throw new Error("Invalid four-slot mapping");
  if (!Array.isArray(p.menu_order) || p.menu_order.length !== FACTORY_ORDER.length || new Set(p.menu_order).size !== FACTORY_ORDER.length || p.menu_order.some((name: unknown) => !FACTORY_ORDER.includes(name as string))) throw new Error("Invalid menu order");
  if(JSON.stringify(p.menu_order)!==JSON.stringify(FACTORY_ORDER))throw new Error("V9.2 menu order is preserved in this release");
  return { name: p.name, base: p.base, styles, slots: p.slots, order: p.menu_order, nodes:p.curve_nodes, ...(previousPlatform?{migratedPlatformFrom:p.platform.sha256}:{}) };
}
export async function importStyle(bytes: Uint8Array, filename: string, metadata?: { name: string; author: string; license: string; icon: StyleIcon }): Promise<LibraryStyle> {
  if (filename.toLowerCase().endsWith(".cube")) {
    if (!metadata) throw new Error("Cube import needs explicit color and author declarations");
    validateIcon(metadata.icon);
    bytes = await createStylePackage({ cube: bytes, name: metadata.name, style_id: crypto.randomUUID(), version: "1.0.0", author: metadata.author, license: metadata.license, icon: metadata.icon });
  }
  return inspectedLibraryStyle(bytes);
}
