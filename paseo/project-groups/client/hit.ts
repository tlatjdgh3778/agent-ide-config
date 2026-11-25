import type { DragSubject, DropTarget } from "./model";

/** A row that can receive a drop. Rows register in render order. */
export type Slot =
  | { kind: "group"; groupId: string }
  | { kind: "project"; projectKey: string; groupId: string | null }
  | { kind: "empty"; groupId: string }
  /** `hostId` is set when Ungrouped is split by host. */
  | { kind: "ungrouped"; hostId?: string | null };

/** A slot's vertical extent in window coordinates, measured when the drag starts. */
export interface MeasuredSlot {
  slot: Slot;
  y: number;
  height: number;
}

/** A line between rows, or a box around the row that will receive the item. */
export type Indicator = { kind: "line"; y: number } | { kind: "box"; y: number; height: number };

export interface Hit {
  target: DropTarget;
  indicator: Indicator;
}

function nearest(sorted: readonly MeasuredSlot[], y: number): MeasuredSlot | undefined {
  const inside = sorted.find((item) => y >= item.y && y < item.y + item.height);
  if (inside) return inside;
  let best: MeasuredSlot | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const item of sorted) {
    const gap = y < item.y ? item.y - y : y - (item.y + item.height);
    if (gap < distance) {
      distance = gap;
      best = item;
    }
  }
  return best;
}

function box(item: MeasuredSlot): Indicator {
  return { kind: "box", y: item.y, height: item.height };
}

/** The host id in a project ref key (`["<hostId>","<projectId>"]`). Kept here so hit testing stays pure. */
function hostOfKey(key: string): string | null {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
  } catch {
    return null;
  }
}

/**
 * The Ungrouped header a project lands under. With Ungrouped split by host, that is its own host's
 * header wherever it is dropped, so the box shows where it will really go.
 */
function ungroupedHeaderFor(key: string, sorted: readonly MeasuredSlot[]): MeasuredSlot | undefined {
  const headers = sorted.filter((entry) => entry.slot.kind === "ungrouped");
  const host = hostOfKey(key);
  return headers.find((entry) => entry.slot.kind === "ungrouped" && entry.slot.hostId === host) ?? headers[0];
}

function hitProject(key: string, sorted: readonly MeasuredSlot[], y: number): Hit | null {
  const item = nearest(sorted, y);
  if (!item) return null;
  const slot = item.slot;
  switch (slot.kind) {
    case "group":
    case "empty":
      return { target: { kind: "into-group", groupId: slot.groupId }, indicator: box(item) };
    case "ungrouped":
      return { target: { kind: "ungroup" }, indicator: box(ungroupedHeaderFor(key, sorted) ?? item) };
    case "project": {
      if (slot.projectKey === key) return null;
      if (slot.groupId === null) {
        return { target: { kind: "ungroup" }, indicator: box(ungroupedHeaderFor(key, sorted) ?? item) };
      }
      const before = y < item.y + item.height / 2;
      return before
        ? {
            target: { kind: "project-before", groupId: slot.groupId, projectKey: slot.projectKey },
            indicator: { kind: "line", y: item.y },
          }
        : {
            target: { kind: "project-after", groupId: slot.groupId, projectKey: slot.projectKey },
            indicator: { kind: "line", y: item.y + item.height },
          };
    }
  }
}

function hitGroup(id: string, sorted: readonly MeasuredSlot[], y: number): Hit | null {
  const headers = sorted.filter((item) => item.slot.kind === "group");
  const from = headers.findIndex((item) => item.slot.kind === "group" && item.slot.groupId === id);
  if (from < 0) return null;
  const ungrouped = sorted.find((item) => item.slot.kind === "ungrouped");
  const last = sorted[sorted.length - 1];
  const end = ungrouped ? ungrouped.y : last ? last.y + last.height : 0;
  let index = headers.length;
  for (let position = 0; position < headers.length; position += 1) {
    const start = headers[position]!.y;
    const stop = headers[position + 1]?.y ?? end;
    if (y < (start + stop) / 2) {
      index = position;
      break;
    }
  }
  if (index === from || index === from + 1) return null;
  const lineY = index < headers.length ? headers[index]!.y : end;
  return { target: { kind: "group-at", index }, indicator: { kind: "line", y: lineY } };
}

/** Finds the drop target under window coordinate `y`. Null means "drop does nothing here". */
export function hitTest(subject: DragSubject, slots: readonly MeasuredSlot[], y: number): Hit | null {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => a.y - b.y);
  return subject.kind === "project" ? hitProject(subject.key, sorted, y) : hitGroup(subject.id, sorted, y);
}

export function sameHit(a: Hit | null, b: Hit | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    JSON.stringify(a.target) === JSON.stringify(b.target) &&
    JSON.stringify(a.indicator) === JSON.stringify(b.indicator)
  );
}
