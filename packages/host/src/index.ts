/** Capability boundary: shared product code knows no desktop framework. */
export type HostFile = { id: string; name: string; size: number; type: string };
export type PickOptions = { accept?: string; signal?: AbortSignal };
export interface ProjectStorage {
  load(key: string, signal?: AbortSignal): Promise<string | null>;
  save(key: string, value: string, signal?: AbortSignal): Promise<void>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
  list(signal?: AbortSignal): Promise<string[]>;
}
export interface Host {
  readonly kind: "browser" | "desktop";
  pickFile(options?: PickOptions): Promise<HostFile | null>;
  readRange(file: HostFile, offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;
  releaseFile(file: HostFile): void;
  saveFile(name: string, bytes: Uint8Array, options?: { type?: string; signal?: AbortSignal }): Promise<void>;
  readonly storage: ProjectStorage;
}
export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
}
export function createLocalProjectStorage(storage: Storage, prefix = "gr-studio:projects:v1:"): ProjectStorage {
  const keyOf = (key: string) => {
    if (!key || key.length > 256 || /[\x00-\x1f\x7f]/.test(key)) throw new Error("Invalid project storage key");
    return prefix + key;
  };
  return {
    async load(key, signal) { checkCancelled(signal); return storage.getItem(keyOf(key)); },
    async save(key, value, signal) { checkCancelled(signal); storage.setItem(keyOf(key), value); },
    async remove(key, signal) { checkCancelled(signal); storage.removeItem(keyOf(key)); },
    async list(signal) {
      checkCancelled(signal); const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length)); }
      return keys.sort();
    },
  };
}
/** Files are selected by the user. IDs are opaque capabilities, never paths. */
export function createBrowserHost(options: { document?: Document; storage?: Storage } = {}): Host {
  const doc = options.document ?? globalThis.document;
  const files = new Map<string, File>();
  return {
    kind: "browser",
    storage: createLocalProjectStorage(options.storage ?? globalThis.localStorage),
    async pickFile(options = {}) {
      checkCancelled(options.signal);
      return new Promise((resolve, reject) => {
        const input = doc.createElement("input"); input.type = "file"; input.accept = options.accept ?? "";
        input.hidden = true; doc.body.append(input);
        const cleanup = () => { input.remove(); options.signal?.removeEventListener("abort", abort); };
        const abort = () => { cleanup(); reject(new DOMException("Operation cancelled", "AbortError")); };
        options.signal?.addEventListener("abort", abort, { once: true });
        input.addEventListener("cancel", () => { cleanup(); resolve(null); }, { once: true });
        input.addEventListener("change", () => {
          const file = input.files?.[0]; cleanup();
          if (!file) return resolve(null);
          const id = globalThis.crypto.randomUUID(); files.set(id, file);
          resolve({ id, name: file.name, size: file.size, type: file.type });
        }, { once: true });
        input.click();
      });
    },
    async readRange(file, offset, length, signal) {
      checkCancelled(signal);
      const source = files.get(file.id);
      if (!source) throw new Error("File capability expired");
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > source.size || length > source.size - offset) throw new Error("Invalid file read range");
      const result = new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
      checkCancelled(signal); return result;
    },
    releaseFile(file) { files.delete(file.id); },
    async saveFile(name, bytes, options = {}) {
      checkCancelled(options.signal);
      if (!name || /[\x00-\x1f\x7f/\\]/.test(name)) throw new Error("Invalid download filename");
      const blob = new Blob([bytes.slice().buffer], { type: options.type ?? "application/octet-stream" });
      const url = URL.createObjectURL(blob), anchor = doc.createElement("a");
      anchor.href = url; anchor.download = name; doc.body.append(anchor);
      try { checkCancelled(options.signal); anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      // Browser download initiation cannot attest that the user saved the file.
    },
  };
}
