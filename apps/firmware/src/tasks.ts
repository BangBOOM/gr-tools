/** Firmware task state and the inspect/build lifecycle. No DOM: the caller renders on `onChange` and shows `toast` text. */
import { runWorkerTask, WorkerTaskError, type WorkerTask } from "../../../packages/host/src/worker-task.ts";
import { DEFAULT_STYLES, FACTORY_ORDER, defaultSlots, selection, isReferenceRecipeSelection } from "./project.ts";
import { TaskProgress, type TaskProgressEvent } from "./progress.ts";

type Deps = {
  verifyReportIntegrity(report: Record<string, any>, firmware: ArrayBuffer): Promise<boolean>;
  onChange(): void;
  toast(message: string): void;
};
const stopped = { cancelled: ["CANCELLED", "Task cancelled. No firmware is available to download."], timeout: ["TIMEOUT", "Task timed out. No firmware is available to download."] } as const;
function progressKey(custom: boolean) { return `gr-firmware:build-seconds:${custom ? "custom" : "reference"}`; }

export type FirmwareTasks = ReturnType<typeof createFirmwareTasks>;
export function createFirmwareTasks({ verifyReportIntegrity, onChange, toast }: Deps) {
  const state = {
    styles: structuredClone(DEFAULT_STYLES), slots: defaultSlots(), order: [...FACTORY_ORDER],
    base: null as null | { name: string; bytes: Uint8Array; info: Record<string, any> },
    policies: false,
    busy: false, operation: "", phase: "Ready to start", report: null as Record<string, any> | null,
    progress: null as TaskProgress | null,
    firmware: null as ArrayBuffer | null, task: null as Record<string, any> | null,
  };
  let configurationEpoch = 0;
  let activeTask: WorkerTask<any> | null = null, cancelActive: (() => void) | null = null;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  function finishProgress(success: boolean) {
    clearInterval(progressTimer);
    const progress = state.progress;
    if (!progress || progress.status !== "running") return;
    progress.finish(success, performance.now());
    if (success && progress.operation === "build") {
      try { localStorage.setItem(progressKey(progress.custom), String((performance.now() - progress.startedAt) / 1000)); } catch { /* Timing history is optional. */ }
    }
  }
  /** Any configuration change discards the previous result and report. */
  function invalidate() { configurationEpoch++; state.firmware = null; state.report = null; state.task = null; state.phase = "Configuration updated"; state.progress = null; }
  function taskSummary(operation: string) {
    return { operation, submitted_at: new Date().toISOString(), base_sha256: state.base?.info.sha256, base_name: state.base?.name,
      slots: state.slots.map(id => { const s = state.styles.find(v => v.id === id); return { id, name: s?.name, cube_sha256: s?.manifest?.look.sha256, icon: s?.icon, fit_sha256:s?.compiledFit?.report.fit_sha256 }; }), menu_order: [...state.order],
      historical_dng_policy:"fixed-slot-reinterpretation",persistence_policy:"reset-on-registry-change", policy_accepted:state.policies,
      profile: selection(state.styles, state.slots, state.order).profile };
  }
  async function run(operation: "inspect" | "build", base = state.base?.bytes): Promise<any> {
    if (state.busy || !base) throw new Error("Select a base firmware first");
    // Prepare before acquiring the task lock: cloning/copying large inputs may
    // throw, and must not leave a permanent busy state without a Worker.
    const summary=taskSummary(operation),frozenSelection = structuredClone(selection(state.styles, state.slots, state.order)), input = base.slice().buffer, id = crypto.randomUUID();
    state.busy = true; state.operation = operation; state.phase = operation === "inspect" ? "Inspecting base firmware" : "Building and verifying";
    const custom = frozenSelection.profile !== "V9.2-reference";
    let previousSeconds: number | undefined;
    try { const saved = Number(localStorage.getItem(progressKey(custom))); if (Number.isFinite(saved) && saved > 0 && saved < 900) previousSeconds = saved; } catch { /* Continue without timing history. */ }
    state.progress = new TaskProgress(operation, custom, performance.now(), previousSeconds);
    clearInterval(progressTimer); progressTimer = setInterval(onChange, 1000);
    state.firmware = null; state.report = null; state.task = summary;
    let task: WorkerTask<any>;
    try {
      task = runWorkerTask(new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }), { id, operation, base: input, selection: frozenSelection }, {
        name: "Processing worker", timeoutMs: operation === "build" ? 15 * 60 * 1000 : 3 * 60 * 1000, transfer: [input],
        onMessage(message, { done, fail }) {
          if (message.id !== id) return;
          if (message.kind === "progress") { state.progress?.update(message.value as TaskProgressEvent); state.phase = state.progress?.label ?? "Verifying"; onChange(); return; }
          if (message.kind === "error") { state.report = { ...message.report, task: state.task }; fail(new Error(message.message)); }
          else done(message.value);
        },
      });
    } catch (error) { finishProgress(false); state.busy = false; state.operation = ""; onChange(); throw error; }
    activeTask = task; cancelActive = task.cancel; onChange();
    try { return await task.result; }
    catch (error) {
      if (error instanceof WorkerTaskError) {
        const [status, message] = error.outcome === "failed" ? ["FAIL", error.message] : stopped[error.outcome];
        state.report = { status, message, task: state.task }; finishProgress(false); throw new Error(message);
      }
      finishProgress(false); throw error;
    }
    finally { if (activeTask === task) { activeTask = null; cancelActive = null; } if (operation === "inspect") { state.busy = false; state.operation = ""; } }
  }
  async function execute() {
    if(state.busy)return;const epoch=configurationEpoch;
    try {
      if (state.slots.some(id => !id)) throw new Error("Fill all four camera slots before building.");
      if (!isReferenceRecipeSelection(state.styles,state.slots,state.order) && !state.policies) throw new Error("Acknowledge the effect on existing DNGs and saved settings.");
      const result = await run("build");
      if(epoch!==configurationEpoch)throw new Error("Build inputs changed; the previous result was discarded");
      cancelActive=()=>{configurationEpoch++;state.firmware=null;state.report={status:"CANCELLED",message:"Result verification cancelled"};state.phase="Cancelling";onChange();};
      state.report = result.report;
      if (result.report?.status !== "PASS" || !Array.isArray(result.report.gates) || !result.report.gates.length || result.report.gates.some((gate:any)=>gate.status !== "PASS")) throw new Error("Some build checks failed. Firmware download is blocked.");
      if (!(result.firmware instanceof ArrayBuffer) || result.firmware.byteLength < 128) throw new Error("Build returned incomplete firmware. Download is blocked.");
      state.progress?.update({phase:"verify-result"}); state.phase = state.progress!.label; onChange();
      if(!await verifyReportIntegrity(result.report,result.firmware))throw new Error("Required report evidence or firmware hash mismatch. Download is blocked.");
      if(epoch!==configurationEpoch)throw new Error("Result verification cancelled or inputs changed");
      state.firmware = result.firmware; state.phase = "Build verified";
    } catch (error) { state.firmware = null; if(state.report?.status === "PASS") state.report = {...state.report,status:"FAIL",ui_error:(error as Error).message}; state.phase = state.report?.status === "CANCELLED" ? "Cancelled" : state.report?.status === "TIMEOUT" ? "Timed out" : "Configuration failed verification"; toast((error as Error).message); }
    finally { finishProgress(state.report?.status === "PASS" && !!state.firmware); state.busy=false;state.operation="";cancelActive=null;onChange(); }
  }
  return {
    state, invalidate, run, execute, finishProgress,
    get epoch() { return configurationEpoch; },
    /** Cancel the running Worker task, or reject a build result still under verification. */
    cancel() { cancelActive?.(); },
    /** Terminate the Worker without updating state; used on page unload. */
    dispose() { activeTask?.cancel(); },
  };
}
