export type TaskOperation = "inspect" | "plan" | "fit" | "build";
export type TaskProgressEvent = { phase: string; probe?: string; status?: string; completed?: number; total?: number };
export type BuildStep = { id: string; label: string; status: "pending" | "running" | "complete" | "stopped"; detail: string };
const buildSteps = [
  ["plan", "Check installation plan"],
  ["source", "Verify base firmware"],
  ["container", "Build firmware file"],
  ["camera", "Check camera behavior"],
  ["curves", "Check style data"],
  ["artifact", "Verify download"],
] as const;

// Relative suite costs from full production runs. These weight completed work,
// not a timer animation. A slower machine scales the remaining-time estimate.
const probes = [
  ["four49_curve65_arm", 1.8, "Curve interpolation"],
  ["V9_menu_arm", .8, "Menu names & routing"],
  ["V9_text_guest", .8, "Style names"],
  ["V9_icon_arm", 1.1, "Icon resources"],
  ["V9_storage_guest", 1.5, "Settings storage"],
  ["V9_backend_arm", 2.3, "Color & controls"],
  ["V9_raw_arm", 8.4, "RAW development pages"],
  ["V9_ui_detail_arm", 1.5, "Parameter pages"],
  ["V9_1_capacity_arm", 14.2, "Camera style lists"],
  ["V9_1_memory_arm", 2.4, "Memory boundaries"],
  ["V9_1_shared_pages_arm", 2.2, "Shared camera pages"],
  ["persistence_apdata13_probe", 1.5, "Saved settings"],
  ["persistence_refresh_property_gate", .8, "Style switching"],
] as const;
const phases: Record<string, string> = {
  initializing: "Loading local processing tools", ready: "Checking installation plan",
  "check-plan": "Checking installation plan", "plan-checked": "Installation plan checked",
  "prepare-style": "Preparing styles for the camera",
  "decode-rust": "Decoding official firmware", "decode-independent": "Cross-checking the source firmware",
  "repack-rust": "Packing candidate firmware", "verify-container": "Checking the final container",
  "verify-report": "Verifying build results", "verify-result": "Checking the download artifact",
  "fit-cube": "Fitting camera recipes",
};
export function duration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}
export class TaskProgress {
  percent = 0;
  label = "Starting task";
  status: "running" | "complete" | "stopped" = "running";
  private readonly done = new Set<string>();
  private readonly completedSteps = new Set<string>();
  private activeStep = "plan";
  private stoppedAt?: number;
  private armStartedAt?: number;
  private estimatedFinishAt?: number;
  readonly operation: TaskOperation;
  readonly custom: boolean;
  readonly startedAt: number;
  readonly previousSeconds?: number;
  constructor(operation: TaskOperation, custom: boolean, startedAt: number, previousSeconds?: number) {
    this.operation = operation; this.custom = custom; this.startedAt = startedAt; this.previousSeconds = previousSeconds;
  }
  update(event: TaskProgressEvent, now = performance.now()) {
    if (this.status !== "running") return;
    this.label = phases[event.phase] ?? event.phase;
    if (event.phase === "ready" && this.operation === "inspect") this.label = "Hashing and identifying firmware";
    let next = 0;
    if (this.operation === "build") {
      if (event.phase === "plan-checked") { this.completedSteps.add("plan"); this.activeStep = "source"; }
      if (event.phase === "repack-rust") { this.completedSteps.add("source"); this.activeStep = "container"; }
      if (event.phase === "verify-report" || event.phase === "verify-result") this.activeStep = "artifact";
      next = ({initializing: 0, ready: 2, "check-plan": 3, "plan-checked": 4, "decode-rust": 5, "decode-independent": 8, "repack-rust": 14, "verify-container": 20, "verify-report": 98, "verify-result": 99} as Record<string, number>)[event.phase] ?? 0;
      if (event.phase === "native-arm") {
        this.completedSteps.add("container");
        this.activeStep = event.probe === "candidate-native-curves" ? "curves" : "camera";
        this.armStartedAt ??= now;
        const probe = probes.find(p => p[0] === event.probe);
        this.label = probe?.[2] ?? (event.probe === "candidate-native-curves" ? "Checking all style curve values" : "Checking camera behavior");
        const newlyCompleted = event.status === "PASS" && probe && !this.done.has(probe[0]);
        if (newlyCompleted) this.done.add(probe[0]);
        if (this.done.size === probes.length) this.completedSteps.add("camera");
        if (event.probe === "candidate-native-curves" && event.status === "PASS") this.completedSteps.add("curves");
        const weight = probes.reduce((sum, p) => sum + p[1], 0);
        const complete = probes.reduce((sum, p) => sum + (this.done.has(p[0]) ? p[1] : 0), 0);
        if (newlyCompleted && complete > 0) {
          const speed = (now - this.armStartedAt) / complete;
          this.estimatedFinishAt = now + speed * (weight - complete + (this.custom ? 5 : 1));
        }
        next = 22 + (this.custom ? 70 : 75) * complete / weight;
        if (event.probe === "candidate-native-curves") next = event.status === "PASS" ? 97 : 92;
      }
    } else {
      next = event.phase === "initializing" ? 0 : event.phase === "ready" ? 15 : 30;
      if (event.phase === "fit-cube" && event.total) {
        next = 5 + 90 * (event.completed ?? 0) / event.total;
        this.label = `Fitting style ${Math.min((event.completed ?? 0) + (event.status === "PASS" ? 0 : 1), event.total)} of ${event.total}`;
      }
    }
    this.percent = Math.min(99, Math.max(this.percent, next));
  }
  finish(success: boolean, now: number) {
    if (this.status !== "running") return;
    this.stoppedAt = now; this.status = success ? "complete" : "stopped";
    if (success) this.percent = 100;
    if (success && this.operation === "build") { this.completedSteps.add("artifact"); this.label = "All checks passed · Ready to download"; }
  }
  steps(): BuildStep[] {
    if (this.operation !== "build") return [];
    return buildSteps.filter(([id]) => this.custom || id !== "curves").map(([id, label]) => {
      const status = this.completedSteps.has(id) ? "complete" : id === this.activeStep ? this.status === "stopped" ? "stopped" : "running" : "pending";
      const detail = id === "camera" && status !== "pending" ? `${this.done.size}/${probes.length} suites` : status === "complete" ? "Done" : status === "running" ? "In progress" : status === "stopped" ? "Stopped" : this.status === "stopped" ? "Not run" : "Waiting";
      return { id, label, status, detail };
    });
  }
  view(now: number) {
    const elapsed = Math.max(0, ((this.stoppedAt ?? now) - this.startedAt) / 1000);
    let timing = `${duration(elapsed)} elapsed`;
    if (this.status === "running" && this.operation === "build") {
      // First build learns the machine's speed after an actual ARM suite ends.
      const remaining = this.estimatedFinishAt === undefined ? this.previousSeconds === undefined ? undefined : this.previousSeconds - elapsed : (this.estimatedFinishAt - now) / 1000;
      timing += this.percent >= 97 ? " · Finishing checks…" : remaining === undefined ? " · Estimating remaining time…" : remaining > 0 ? ` · About ${duration(Math.ceil(remaining / 5) * 5)} left` : " · Taking longer than estimated; checks are still running";
    }
    const checks = this.operation === "build" && this.done.size ? `${this.done.size}/${probes.length} checks complete` : "";
    return { percent: Math.floor(this.percent), timing, label: this.label, checks };
  }
}
