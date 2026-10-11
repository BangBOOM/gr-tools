/** Firmware entry: user actions, file selection, and rendering. Task state and Worker lifecycle live in tasks.ts. */
import { html, render as renderTemplate } from "lit-html";
import { verifyReportIntegrity } from "../../../packages/firmware-core/src/report.ts";
import { cameraChecklist } from "../../../packages/firmware-core/src/camera-checklist.ts";
import "./style.css";
import { createHost } from "../../../packages/host/src/desktop.ts";
import { renderIcon, defaultIcon } from "../../../packages/style-contract/src/index.ts";
import type { StyleIcon } from "../../../packages/style-contract/src/index.ts";
import { DEFAULT_STYLES, FACTORY_ORDER, defaultSlots, importStyle } from "./project.ts";
import { createFirmwareTasks } from "./tasks.ts";
import type { MappingView } from "./mapping-ui.ts";
import "../../../packages/ui/theme.css";
import "../../../packages/ui/app-header.css";
import { firmwareTemplate, type FirmwareActions } from "./view.ts";

const host = createHost(), root = document.querySelector<HTMLDivElement>("#app")!;
const tasks = createFirmwareTasks({ verifyReportIntegrity, onChange: render, toast }), state = tasks.state;
let selectedStyleId: string | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  document.querySelector("#toast")?.remove(); const node = document.createElement("div"); node.id = "toast"; node.textContent = message; document.body.append(node);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.remove(), 5000);
}
async function identify() {
  const epoch=tasks.epoch;
  const file = await host.pickFile({ accept: ".bin" }); if (!file) return;
  try {
    if (file.size > 32 * 1024 * 1024 || file.size < 128) throw new Error("Select a complete BIN firmware file up to 32 MiB.");
    const bytes = await host.readRange(file, 0, file.size); if(epoch!==tasks.epoch||state.busy)throw new Error("File selection was superseded by another action"); tasks.invalidate();
    state.base = { name: file.name, bytes, info: { supported: false, label: "Inspecting" } }; render();
    const info = await tasks.run("inspect", bytes); state.base.info = info; state.phase = info.supported ? "Base firmware verified" : "Unsupported base firmware";
    state.report = { operation: "inspect", ...info, task: state.task };
    tasks.finishProgress(info.supported);
  } catch (error) { tasks.finishProgress(false); state.phase = "Inspection incomplete"; toast((error as Error).message); } finally { host.releaseFile(file); render(); }
}
async function chooseStyle() {
  const epoch=tasks.epoch;
  const file = await host.pickFile({ accept: ".grstyle,.cube" }); if (!file) return;
  try {
    if (state.styles.length >= 32) throw new Error("The library can hold up to 32 styles.");
    if (file.size > 32 * 1024 * 1024) throw new Error("Style file exceeds 32 MiB.");
    const bytes = await host.readRange(file, 0, file.size);
    let metadata: { name: string; author: string; license: string; icon: StyleIcon } | undefined;
    if (file.name.toLowerCase().endsWith(".cube")) {
      const answer = await cubeDialog(file.name); if (!answer) return; metadata = answer;
    }
    const style = await importStyle(bytes, file.name, metadata), previous = state.styles.find(s => s.id === style.id);
    if(epoch!==tasks.epoch||state.busy)throw new Error("Style import was superseded by another action");
    if (previous) throw new Error("A style with this UUID already exists. Remove it before importing the new version.");
    state.styles.push(style); tasks.invalidate(); toast(`Imported ${style.name}`);
  } catch (error) { toast((error as Error).message); } finally { host.releaseFile(file); render(); }
}
function cubeDialog(filename: string): Promise<{ name: string; author: string; license: string; icon: StyleIcon } | null> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog"), initial = filename.replace(/\.cube$/i, "");
    const close = (result: any) => { dialog.close(); dialog.remove(); resolve(result); };
    const submit = (e: SubmitEvent) => { e.preventDefault(); const data = new FormData(e.target as HTMLFormElement); close({ name: String(data.get("name")), author: String(data.get("author")), license: String(data.get("license")), icon: { template: "text-border-v1", text: String(data.get("label")), border_color: String(data.get("color")).toUpperCase() } }); };
    renderTemplate(html`<h2>Import a color style</h2><p class="small">Interpreted as developed display-sRGB with 0–1 input and output. Camera calibration is pending.</p><form @submit=${submit}><label>Style name<input name="name" value=${initial} required maxlength="128"></label><label>Author<input name="author" value="Local author" required maxlength="128"></label><label>License · author declaration<input name="license" value="NOASSERTION" required maxlength="128"></label><p class="small">NOASSERTION means distribution rights have not been established.</p><label>Icon text · 1–4 characters, A–Z / 0–9<input name="label" value=${defaultIcon(initial, crypto.randomUUID()).text} pattern="[A-Z0-9]{1,4}" required maxlength="4"></label><label>Border color<input name="color" type="color" value="#e5b828"></label><div class="error"></div><div class="actions"><button type="button" data-cancel @click=${() => close(null)}>Cancel</button><button class="primary">Import style</button></div></form>`, dialog);
    dialog.addEventListener("cancel", e => { e.preventDefault(); close(null); });
    document.body.append(dialog); dialog.showModal();
  });
}
function commitSlots(slots: string[]) {
  if (state.busy) return;
  if (slots.every((id, index) => id === state.slots[index])) { selectedStyleId = null; render(); return; }
  state.slots = slots; state.policies = false; selectedStyleId = null;
  tasks.invalidate(); render();
}
/** Ignore actions while a task runs (except Cancel) and report failures as a toast. */
const guarded = (action: () => unknown, allowBusy = false) => async () => { if (state.busy && !allowBusy) return; try { await action(); } catch (error) { toast((error as Error).message); } };
const actions: FirmwareActions = {
  base: guarded(identify),
  importStyle: guarded(chooseStyle),
  reset: guarded(() => { state.styles = structuredClone(DEFAULT_STYLES).concat(state.styles.filter(s => !s.reference)); state.slots = defaultSlots(); state.order = [...FACTORY_ORDER]; state.policies=false; selectedStyleId=null; tasks.invalidate(); render(); }),
  build: guarded(() => { root.querySelector<HTMLElement>('[data-scroll="build"]')!.scrollTop = 0; return tasks.execute(); }),
  cancel: guarded(() => tasks.cancel(), true),
  download: guarded(() => state.firmware && host.saveFile("fwdc239b.bin", new Uint8Array(state.firmware))),
  checklist: guarded(() => state.report && state.firmware && host.saveFile("GR-device-checklist.md",new TextEncoder().encode(cameraChecklist(state.report)),{type:"text/markdown"})),
  report: guarded(() => state.report && host.saveFile("GR-firmware-report.json", new TextEncoder().encode(JSON.stringify(state.report, null, 2) + "\n"), { type: "application/json" })),
  policy(accepted) { state.policies = accepted; tasks.invalidate(); render(); },
  remove(index) { const [removed] = state.styles.splice(index, 1); state.slots = state.slots.map(id => id === removed.id ? "" : id); tasks.invalidate(); render(); },
};
function drawIcon(canvas: HTMLCanvasElement, style: { icon: StyleIcon }) { canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(renderIcon(style.icon)), 32, 32), 0, 0); }
function render() {
  document.body.classList.remove("light");
  if (selectedStyleId && !state.styles.some(style => style.id === selectedStyleId)) selectedStyleId = null;
  const mapping: MappingView = {
    styles: state.styles, slots: state.slots, selected: selectedStyleId, busy: state.busy, epoch: tasks.epoch,
    current: () => ({ busy: state.busy, epoch: tasks.epoch }),
    select: id => { if (state.busy) return; selectedStyleId = id; render(); },
    commit: commitSlots, rerender: render, drawIcon,
  };
  renderTemplate(firmwareTemplate(tasks, mapping, actions), root);
}
window.addEventListener("beforeunload", () => tasks.dispose());
render();
