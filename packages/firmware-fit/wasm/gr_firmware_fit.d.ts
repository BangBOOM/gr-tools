/* tslint:disable */
/* eslint-disable */
export function native_gamma(key: number, contrast: number, highlight: number, shadow: number, flag: number, exposure: number, seeds: Uint32Array, families: Uint16Array, blend: Uint16Array, constant: number): Uint16Array;
/**
 * The 3034 developed-photo training colors: a 9³ lattice, 2048 xorshift32 colors and 257 grays.
 */
export function training_points(): Float64Array;
/**
 * Returns 9 float matrix + 3*nodes float curves + 9 Q13 + 3*nodes Q14, row-major.
 * `latent`: the training colors as Standard matrix outputs mapped by `Bstd⁻¹` (3034×3, the host inverts the developed photo);
 * `target`: the cube's values at the training colors with YCbCrOperation inverted (3034×3); `ma`: the MultiAxial constants (19).
 */
export function fit_cube(latent: Float64Array, target: Float64Array, nodes: number, gamma: Float64Array, ma: Float64Array, seed_matrices: Float64Array): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly fit_cube: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
  readonly native_gamma: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number, number];
  readonly training_points: () => [number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
