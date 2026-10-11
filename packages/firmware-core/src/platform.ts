export type FrozenPatch = { va: number | string; old_hex: string; new_hex: string; component?: string };
export type FrozenPlan = { source_sha256: string; patches: FrozenPatch[]; modules: any[]; protected_ranges?: [string, number][]; [key: string]: any };
export type Platform = { schema: 'gr3-web-platform-v1'; source_payload_sha256: string; plans: Record<string, string>; assets: Record<string, { bytes: number; sha256: string; base64: string }>; probes: string[]; rom_distributed: false };
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 || !/^[\da-f]*$/i.test(hex)) throw new Error('invalid hexadecimal data');
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(hash, x => x.toString(16).padStart(2, '0')).join('');
}
export function assetBytes(platform: Platform, path: string): Uint8Array {
  const a = platform.assets[path];
  if (!a) throw new Error(`missing approved platform asset ${path}`);
  return Uint8Array.from(atob(a.base64), c => c.charCodeAt(0));
}
export function getPlan(platform: Platform, profile: string): FrozenPlan {
  const path = platform.plans[profile];
  if (!path) throw new Error(`unknown frozen profile ${profile}`);
  return JSON.parse(new TextDecoder().decode(assetBytes(platform, path)));
}
export function payloadOffset(va: number | string): number {
  const v = Number(va);
  if (!Number.isSafeInteger(v)) throw new Error('invalid virtual address');
  return v - 0x53000000 + 0x10870;
}
/** Exact old/new checked, nonoverlapping full payload whitelist. */
export function applyFrozenPlan(source: Uint8Array, plan: FrozenPlan): Uint8Array {
  // Uint8Array.from is intentional: Buffer.slice() aliases Node fixture bytes.
  const body = Uint8Array.from(source), ranges: [number, number][] = [];
  for (const patch of plan.patches) {
    const old = fromHex(patch.old_hex), next = fromHex(patch.new_hex), at = payloadOffset(patch.va);
    if (!old.length || old.length !== next.length || at < 0x10870 || at + old.length > source.length - 4) throw new Error('invalid patch span');
    ranges.push([at, at + old.length]);
    for (let i = 0; i < old.length; i++) if (source[at + i] !== old[i]) throw new Error(`patch old bytes mismatch ${patch.va}`);
    body.set(next, at);
  }
  ranges.sort((a,b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i-1][1]) throw new Error('overlapping patch whitelist');
  return body;
}
