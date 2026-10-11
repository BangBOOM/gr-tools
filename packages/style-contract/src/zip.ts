import { unzipSync, zipSync } from "fflate";
import { decodeUTF8, MAX_BYTES } from "./cube.ts";

export const CAMERA_LIMIT = 256 * 1024;
const MANIFEST_LIMIT = 64 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff; for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
/** Inspect the central directory before decompression; never extract to disk. */
export function readZip(data: Uint8Array): Record<string, Uint8Array> {
  if (!(data instanceof Uint8Array) || data.length < 22 || data.length > MAX_BYTES) throw new Error("Invalid ZIP package size");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true);
  let end = -1;
  for (let at = data.length - 22; at >= Math.max(0, data.length - 65557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === data.length) { end = at; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6) || ![2, 3].includes(u16(end + 8)) || u16(end + 10) !== u16(end + 8)) throw new Error("ZIP must have two or three members on one disk");
  const count = u16(end + 8);
  let at = u32(end + 16); const centralEnd = at + u32(end + 12), seen = new Set<string>();
  if (centralEnd !== end) throw new Error("Unsupported ZIP layout");
  let decodedSize = 0;
  const expected: { name: string; size: number; crc: number }[] = [];
  const intervals: [number, number][] = [];
  for (let index = 0; index < count; index++) {
    if (at + 46 > centralEnd || u32(at) !== 0x02014b50) throw new Error("Invalid ZIP central member");
    const flags = u16(at + 8), method = u16(at + 10), crc = u32(at + 16), compressed = u32(at + 20), size = u32(at + 24);
    const nameLength = u16(at + 28), extra = u16(at + 30), comment = u16(at + 32), local = u32(at + 42);
    const next = at + 46 + nameLength + extra + comment;
    if (next > centralEnd || u16(at + 34) !== 0 || flags & 1 || ![0, 8].includes(method)) throw new Error("Unsupported/encrypted ZIP member");
    const mode = (u32(at + 38) >>> 16) & 0xf000;
    if (mode !== 0 && mode !== 0x8000) throw new Error("Nonregular ZIP member");
    const name = decodeUTF8(data.subarray(at + 46, at + 46 + nameLength));
    if (!["manifest.json", "look.cube", "camera.json"].includes(name) || seen.has(name)) throw new Error("Unknown or duplicate ZIP member");
    seen.add(name); decodedSize += size;
    if (size > (name === "manifest.json" ? MANIFEST_LIMIT : name === "camera.json" ? CAMERA_LIMIT : MAX_BYTES) || decodedSize > MAX_BYTES || compressed > MAX_BYTES) throw new Error("Decoded ZIP size limit");
    if (local + 30 > u32(end + 16) || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) throw new Error("ZIP local header mismatch");
    const localNameLength = u16(local + 26), localExtra = u16(local + 28), payload = local + 30 + localNameLength + localExtra;
    if (payload + compressed > u32(end + 16) || decodeUTF8(data.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error("ZIP local bounds/name mismatch");
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== size)) throw new Error("ZIP member size mismatch");
    intervals.push([local, payload + compressed]); expected.push({ name, size, crc }); at = next;
  }
  if (at !== centralEnd || intervals.some((a, i) => intervals.slice(i + 1).some(b => a[0] < b[1] && b[0] < a[1]))) throw new Error("Overlapping ZIP members");
  const unpacked = unzipSync(data);
  if (Object.keys(unpacked).length !== count) throw new Error("Unexpected decoded ZIP members");
  for (const member of expected) {
    const bytes = unpacked[member.name];
    if (!bytes || bytes.length !== member.size || crc32(bytes) !== member.crc) throw new Error("ZIP CRC/size mismatch");
  }
  return unpacked;
}
export function writeZip(manifest: Uint8Array, cube: Uint8Array, camera?: Uint8Array): Uint8Array {
  if (manifest.length > MANIFEST_LIMIT || (camera?.length ?? 0) > CAMERA_LIMIT || manifest.length + cube.length + (camera?.length ?? 0) > MAX_BYTES) throw new Error("Decoded package size limit");
  const options = { level: 6 as const, mtime: new Date(1980, 0, 1), os: 3, attrs: 0x81a40000 };
  const bytes = zipSync({ "manifest.json": [manifest, options], "look.cube": [cube, options], ...(camera ? { "camera.json": [camera, options] as [Uint8Array, typeof options] } : {}) });
  if (bytes.length > MAX_BYTES) throw new Error("Package size limit");
  return bytes;
}
