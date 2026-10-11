/** Style library and four-slot mapping: templates, native drag/drop, keyboard reorder, and the slot chooser. */
import { html, render } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import type { LibraryStyle } from "./project.ts";
import { assignStyle, libraryEntries, moveSlot, unassignSlot } from "./slot-mapping.ts";

export type MappingView = {
  styles: LibraryStyle[]; slots: string[]; selected: string | null; busy: boolean; epoch: number;
  current(): { busy: boolean; epoch: number };
  select(id: string | null): void; commit(slots: string[]): void; rerender(): void; drawIcon(canvas: HTMLCanvasElement, style: LibraryStyle): void;
};
const grip = html`<svg viewBox="0 0 16 24" aria-hidden="true"><circle cx="5" cy="6" r="1.3"/><circle cx="11" cy="6" r="1.3"/><circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/><circle cx="5" cy="18" r="1.3"/><circle cx="11" cy="18" r="1.3"/></svg>`;
const slotName = (index: number) => String(index + 1).padStart(2, "0");
// One native drag gesture. It edits slots only if the configuration epoch is unchanged at drop.
let drag: { origin: "library" | "slot"; id: string; source: number; epoch: number; over: number | "library" | null } | null = null;
const available = (v: MappingView) => v.styles.filter(s => !v.slots.includes(s.id)).map(s => s.id);
/** Only an idle gesture that began in the current configuration epoch may edit slots. */
const live = (v: MappingView, epoch = v.epoch) => { const now = v.current(); return !now.busy && now.epoch === epoch; };
function endDrag(v: MappingView) { drag = null; v.rerender(); }
function hover(v: MappingView, over: number | "library" | null) { if (drag && drag.over !== over) { drag.over = over; v.rerender(); } }
function dropLabel(v: MappingView, target: number) {
  if (!drag || drag.over !== target) return "";
  const filled = v.slots.filter(Boolean).length, destination = Math.min(target, filled - (drag.origin === "slot" ? 1 : 0));
  return drag.origin === "slot" ? `Move to ${slotName(destination)}` : filled === 4 ? `Replace ${slotName(target)}` : `Insert at ${slotName(destination)}`;
}
function dragStart(v: MappingView, event: DragEvent, origin: "library" | "slot", id: string, source: number) {
  if (!live(v) || !event.dataTransfer || (event.target as HTMLElement).closest("[data-remove],[data-unassign]")) { event.preventDefault(); return; }
  drag = { origin, id, source, epoch: v.epoch, over: null };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-gr-style", id);
  event.dataTransfer.setData("text/plain", v.styles.find(s => s.id === id)!.name);
  v.rerender();
}

/** Library cards. `onRemove` receives the index in `styles`. */
export function libraryTemplate(v: MappingView, onRemove: (index: number) => void) {
  const entries = libraryEntries(v.styles, v.slots);
  if (!entries.length) return html`<div class="empty">${v.styles.length ? "All styles are assigned. Drag a camera style back here to make it available." : "Import .grstyle or .cube to begin."}</div>`;
  return entries.map(({ style, index }) => html`<article class="style-card ${v.selected === style.id ? "is-selected" : ""} ${drag?.origin === "library" && drag.id === style.id ? "is-dragging" : ""}" data-style-id=${style.id} draggable=${String(!v.busy)}
      @dragstart=${(e: DragEvent) => dragStart(v, e, "library", style.id, -1)} @dragend=${() => endDrag(v)}>
      <button class="style-pick" data-style-pick=${style.id} aria-label="Select ${style.name}" aria-pressed=${String(v.selected === style.id)} ?disabled=${v.busy}
        @click=${() => { if (live(v)) v.select(v.selected === style.id ? null : style.id); }}>
        <canvas width="32" height="32" data-icon=${index} ${ref(canvas => canvas && v.drawIcon(canvas as HTMLCanvasElement, style))}></canvas><span class="style-meta"><span class="style-name" title=${style.name}>${style.name}</span><span class="small">${style.reference ? "Reference style" : `LUT · ${style.manifest?.look.size}³ · ${style.manifest?.version}`}</span></span>
      </button>
      <button class="subtle remove" aria-label="Delete ${style.name} from library" title="Delete from library" data-remove=${index} ?disabled=${v.busy} @click=${() => onRemove(index)}>×</button></article>`);
}

/** Drop handlers and classes for the library panel, which accepts styles returned from a slot. */
export function libraryDrop(v: MappingView) {
  return {
    returning: drag?.over === "library",
    hint: drag?.origin === "slot" ? "Drop here to return this style to the library" : "Drag a style onto a camera slot",
    dragover(event: DragEvent) { if (drag?.origin !== "slot" || !live(v, drag.epoch)) return; event.preventDefault(); event.dataTransfer!.dropEffect = "move"; hover(v, "library"); },
    dragleave(event: DragEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) hover(v, null); },
    drop(event: DragEvent) {
      if (drag?.origin !== "slot" || !live(v, drag.epoch)) { endDrag(v); return; }
      event.preventDefault(); const next = unassignSlot(v.slots, drag.source); endDrag(v); v.commit(next);
    },
  };
}

export function slotsTemplate(v: MappingView) {
  return html`<div class="slot-list" aria-label="Installed camera styles">${v.slots.map((id, index) => {
    const style = v.styles.find(s => s.id === id), number = slotName(index);
    return html`<article class="slot ${style ? "" : "is-empty"} ${drag?.origin === "slot" && drag.source === index ? "is-dragging" : ""} ${drag?.over === index ? "is-drop-target" : ""}" data-slot-index=${index} data-style-id=${id} draggable=${String(!!style && !v.busy)}
      @dragstart=${(e: DragEvent) => id ? dragStart(v, e, "slot", id, index) : e.preventDefault()} @dragend=${() => endDrag(v)}
      @dragover=${(e: DragEvent) => { if (!drag || !live(v, drag.epoch)) return; e.preventDefault(); e.dataTransfer!.dropEffect = "move"; hover(v, index); }}
      @dragleave=${(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && drag?.over === index) hover(v, null); }}
      @drop=${(e: DragEvent) => {
        if (!drag || !live(v, drag.epoch)) { endDrag(v); return; }
        e.preventDefault(); e.stopPropagation();
        const next = drag.origin === "slot" ? moveSlot(v.slots, drag.source, index) : assignStyle(v.slots, drag.id, index, available(v));
        endDrag(v); v.commit(next);
      }}>
      <button class="slot-handle" data-slot-handle=${index} aria-label="Reorder slot ${number}" title="Drag to reorder · Arrow Up / Down" ?disabled=${v.busy || !style} @keydown=${(e: KeyboardEvent) => {
        const target = index + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
        if (!live(v) || target === index || target < 0 || target > 3) return;
        e.preventDefault(); v.commit(moveSlot(v.slots, index, target));
        (e.currentTarget as HTMLElement).closest(".slot-list")!.querySelector<HTMLButtonElement>(`[data-slot-handle="${target}"]`)?.focus();
      }}>${grip}</button>
      <span class="slot-number">${number}</span><button class="slot-pick" data-slot-pick=${index} aria-label="Choose style for slot ${number}" ?disabled=${v.busy}
        @click=${() => { if (!live(v)) return; if (v.selected) v.commit(assignStyle(v.slots, v.selected, index, available(v))); else chooseStyle(v, index); }}>
      ${style ? html`<canvas width="32" height="32" data-slot-icon=${index} ${ref(canvas => canvas && v.drawIcon(canvas as HTMLCanvasElement, style))}></canvas>` : html`<span class="empty-slot-icon" aria-hidden="true">+</span>`}
      <span class="slot-copy"><span class="slot-name" title=${style?.name ?? "Empty slot"}>${style?.name ?? "Empty slot"}</span><span class="slot-subtitle">${v.selected ? "Click to assign selected style" : style ? "Drag to reorder" : "Drop a style here"}</span></span></button>
      <button class="slot-remove" data-unassign=${index} aria-label="Return slot ${number} to library" title="Return to library" ?disabled=${v.busy || !style} @click=${() => { if (live(v)) v.commit(unassignSlot(v.slots, index)); }}>×</button><span class="slot-drop-label" aria-hidden="true">${dropLabel(v, index)}</span></article>`;
  })}</div>`;
}

function chooseStyle(v: MappingView, index: number) {
  const dialog = document.createElement("dialog"); dialog.className = "slot-chooser-dialog";
  const options = v.styles.filter(style => !v.slots.includes(style.id));
  render(html`<h2>Style for slot ${slotName(index)}</h2><p class="small">Choose an available style. A full mapping returns the replaced style to the library.</p><div class="slot-chooser">${options.length ? options.map(style => html`<button data-choose-style=${style.id} @click=${() => {
      if (live(v)) v.commit(assignStyle(v.slots, style.id, index, available(v)));
      dialog.close();
    }}><span>${style.name}</span><span class="small">Available</span></button>`) : html`<p class="small">No available styles. Return a camera style to the library or import a new one.</p>`}</div><div class="actions"><button data-close @click=${() => dialog.close()}>Cancel</button></div>`, dialog);
  dialog.addEventListener("close", () => dialog.remove()); document.body.append(dialog); dialog.showModal();
}
