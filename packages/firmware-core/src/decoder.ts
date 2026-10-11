/** Independent TypeScript container decoder: deliberately no Rust/WASM calls. */
export const PAYLOAD_BYTES = 59_718_388;
export const MAX_CONTAINER_BYTES = 32 * 1024 * 1024;
const SYNC = [76, 2, 76, 2, 165, 90, 90, 165];
export type Frame = { rawStart: number; rawEnd: number; outStart: number; outEnd: number; stored: boolean };
export function additiveSum(bytes: Uint8Array): number {
  if (bytes.length % 4) throw new Error('unaligned checksum');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  for (let p = 0; p < bytes.length; p += 4) total = (total + view.getUint32(p, true)) >>> 0;
  return total;
}
export function decodeIndependent(raw: Uint8Array): { payload: Uint8Array; frames: Frame[]; zero: number } {
  if (raw.length < 0x80 || raw.length > MAX_CONTAINER_BYTES) throw new Error('container size bound');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Uint8Array(PAYLOAD_BYTES);
  const frames: Frame[] = [];
  let cursor = 128, produced = 0, zero = -1;
  function take(end: number): number { if (cursor >= end) throw new Error('truncated token'); return raw[cursor++]; }
  while (cursor + 2 <= raw.length) {
    const rawStart = cursor, outStart = produced;
    const prefix = view.getUint16(cursor, false); cursor += 2;
    if (!prefix) { zero = rawStart; break; }
    if (frames.length >= 4096) throw new Error('frame count bound');
    const end = cursor + (prefix & 32767), stored = !!(prefix & 32768);
    if (end > raw.length) throw new Error('frame exceeds input');
    if (stored) {
      if (produced + end - cursor > out.length) throw new Error('decoded size bound');
      out.set(raw.subarray(cursor, end), produced); produced += end - cursor; cursor = end;
    } else {
      let terminated = false;
      while (cursor < end && !terminated) {
        const flags = take(end) * 256 + take(end);
        for (let mask = 32768; mask; mask >>>= 1) {
          if (cursor >= end) break;
          if (!(flags & mask)) {
            if (produced >= out.length) throw new Error('decoded size bound');
            out[produced++] = take(end);
          } else {
            const first = take(end), second = take(end);
            const distance = (first >> 3) * 256 + second;
            let length = first & 7;
            if (length === 7) { let extra: number; do { extra = take(end); length += extra; } while (extra === 255); }
            if (!distance) { terminated = true; if (cursor !== end) throw new Error('trailing compressed data'); break; }
            length += 3;
            if (distance > produced || distance > 8191 || produced + length > out.length) throw new Error('invalid reference or decoded bound');
            for (let i = 0; i < length; i++) { out[produced] = out[produced - distance]; produced++; }
          }
        }
      }
      if (!terminated) throw new Error('missing compressed terminator');
    }
    frames.push({ rawStart, rawEnd: end, outStart, outEnd: produced, stored });
  }
  if (zero < 0) throw new Error('missing stream terminator');
  const aligned = (zero + 5) & ~3;
  const eq = (p: number, a: number[]) => a.every((v, i) => raw[p + i] === v);
  if (produced !== PAYLOAD_BYTES || raw.length !== aligned + 24 || !eq(aligned, SYNC)) throw new Error('footer layout mismatch');
  if (!eq(0, [82,73,67,79,72,0,0,0]) || !eq(8,[71,82,32,73,73,73,0,0]) || !eq(56,[2,10]) || !eq(120,SYNC)) throw new Error('unsupported header');
  for (let p = zero + 2; p < aligned; p++) if (raw[p]) throw new Error('nonzero alignment padding');
  if (view.getUint32(aligned + 8, true) !== 2 || view.getUint32(aligned + 12, true) !== zero + 2 - 128 || view.getUint32(aligned + 16, true) !== produced) throw new Error('footer fields mismatch');
  if (additiveSum(raw) || additiveSum(out)) throw new Error('additive checksum mismatch');
  return { payload: out, frames, zero };
}
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
