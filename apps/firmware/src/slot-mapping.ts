/** Four fixed camera positions; changing their contents never changes native IDs. */
function validate(slots: readonly string[], index: number) {
  if (slots.length !== 4 || slots.some(id => typeof id !== "string") || new Set(slots.filter(Boolean)).size !== slots.filter(Boolean).length) throw new Error("Invalid four-slot mapping");
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) throw new Error("Invalid camera slot");
}

/** Insert from the available pool; a full mapping replaces the target instead. */
export function assignStyle(slots: readonly string[], id: string, target: number, available: readonly string[]): string[] {
  validate(slots, target);
  if (!id || !available.includes(id)) throw new Error("Style is not in the library");
  if (slots.includes(id)) throw new Error("Style is already assigned to a camera slot");
  const next = slots.filter(Boolean);
  if (next.length < 4) next.splice(Math.min(target, next.length), 0, id);
  else next[target] = id;
  return padSlots(next);
}

/** A sortable card moves to its final position, shifting intervening positions. */
export function moveSlot(slots: readonly string[], source: number, target: number): string[] {
  validate(slots, source); validate(slots, target);
  if (!slots[source]) throw new Error("Empty slots cannot be dragged");
  const id = slots[source], next = slots.filter(Boolean);
  next.splice(next.indexOf(id), 1);
  next.splice(Math.min(target, next.length), 0, id);
  return padSlots(next);
}

function padSlots(ids: string[]): string[] { return [...ids, ...Array<string>(4 - ids.length).fill("")]; }

/** Removing a mapped style packs the remaining styles toward the first slot. */
export function unassignSlot(slots: readonly string[], source: number): string[] {
  validate(slots, source);
  return padSlots(slots.filter((id, index) => index !== source && !!id));
}

/** Unassigned library styles with their index in `styles`; icon and delete controls address that index. */
export function libraryEntries<T extends { id: string }>(styles: readonly T[], slots: readonly string[]) {
  return styles.flatMap((style, index) => slots.includes(style.id) ? [] : [{ style, index }]);
}
