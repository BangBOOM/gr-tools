import { createFirmwareCore, type Selection } from "../../../packages/firmware-core/src/index.ts";
import { prepareBuildInput } from './build-input.ts';
type Command = { id: string; operation: "inspect" | "build"; base: ArrayBuffer; selection?: Selection };
let core: Awaited<ReturnType<typeof createFirmwareCore>> | undefined;
self.onmessage = async (event: MessageEvent<Command>) => {
  const { id, operation, base, selection } = event.data;
  const progress = (value: unknown) => self.postMessage({ id, kind: "progress", value });
  try {
    progress({phase:"initializing"});
    core ??= await createFirmwareCore();
    progress({ phase: "ready" });
    const value = operation === 'build'
      ? await core.build(base, await prepareBuildInput(selection!, progress), { onProgress: progress })
      : await core.inspect(base);
    if (operation === "build") {
      const { firmware, report } = value as { firmware: ArrayBuffer; report: unknown };
      self.postMessage({ id, kind: "result", value: { firmware, report } }, { transfer: [firmware] });
    } else self.postMessage({ id, kind: "result", value });
  } catch (error) {
    const failure = error as Error & { report?: unknown };
    self.postMessage({ id, kind: "error", message: failure.message ?? String(error), report: failure.report ?? { status: "BLOCKED", operation, error: failure.message ?? String(error) } });
  }
};
