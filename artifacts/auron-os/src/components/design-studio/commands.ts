import { createContext, useContext } from "react";
import {
  add,
  deleteEntities,
  dist,
  duplicateEntities,
  findEntity,
  makeDimension,
  makeCustomObject,
  makeLabel,
  makeObject,
  makeOpening,
  makePartition,
  makePillar,
  makePolygonRoom,
  makeRectRoom,
  makeSectionTL,
  nearestWall,
  objectFootprint,
  OBJECT_DEFS,
  OPENING_DEFS,
  pointInPolygon,
  roomAt,
  type DesignObject,
  type ObjectType,
  type OpeningKind,
  type ProjectModel,
  type SectionKind,
  type Vec2,
} from "@workspace/design-model";
import type { CustomPlacement, EditorStore } from "./store";

// Editor commands shared by the canvas, toolbars, panels and keyboard
// shortcuts. Each one is a single undo step.

export const EditorContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const s = useContext(EditorContext);
  if (!s) throw new Error("Design Studio editor context missing");
  return s;
}

const next = (store: EditorStore) => store.getState().history.present;

export function addRect(store: EditorStore, a: Vec2, b: Vec2, kind: "room" | "section", sectionKind: SectionKind = "section"): string | null {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (w < 100 || h < 100) return null;
  const m = next(store);
  if (kind === "room") {
    const room = makeRectRoom(x, y, w, h, { name: m.rooms.length ? `Room ${m.rooms.length + 1}` : "Hall" });
    store.commit({ ...m, rooms: [...m.rooms, room] });
    store.select([room.id]);
    return room.id;
  }
  const sec = makeSectionTL(sectionKind, x, y, w, h);
  store.commit({ ...m, sections: [...m.sections, sec] });
  store.select([sec.id]);
  return sec.id;
}

/** Room from the polygon tool's points (needs 3+). */
export function finishPolygonRoom(store: EditorStore, points: Vec2[]): string | null {
  const pts = dedupe(points);
  if (pts.length < 3) return null;
  const m = next(store);
  const room = makePolygonRoom(pts, { name: m.rooms.length ? `Room ${m.rooms.length + 1}` : "Hall" });
  store.commit({ ...m, rooms: [...m.rooms, room] });
  store.setChain([]);
  store.setTool("select");
  store.select([room.id]);
  return room.id;
}

/** Partition wall from the wall tool's points (needs 2+). */
export function finishWall(store: EditorStore, points: Vec2[]): string | null {
  const pts = dedupe(points);
  if (pts.length < 2) return null;
  const m = next(store);
  const wall = makePartition(pts, { name: `Partition ${m.partitions.length + 1}` });
  store.commit({ ...m, partitions: [...m.partitions, wall] });
  store.setChain([]);
  store.select([wall.id]);
  return wall.id;
}

function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) > 1) out.push(p);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= 1) out.pop();
  return out;
}

/** Adds the next chain point `length` mm from the last one in a direction. */
export function chainStep(store: EditorStore, dir: Vec2, length: number) {
  const chain = store.getState().chain;
  if (chain.length === 0 || !(length > 0)) return;
  const last = chain[chain.length - 1];
  store.setChain([...chain, add(last, { x: dir.x * length, y: dir.y * length })]);
}

export function placePillar(store: EditorStore, p: Vec2): string {
  const m = next(store);
  const pil = makePillar(p.x, p.y, { name: `Pillar ${m.pillars.length + 1}` });
  store.commit({ ...m, pillars: [...m.pillars, pil] });
  store.select([pil.id]);
  return pil.id;
}

export function placeOpening(store: EditorStore, p: Vec2, kind: OpeningKind, tolerance: number): string | null {
  const m = next(store);
  const hit = nearestWall(m, p, tolerance);
  if (!hit) return null;
  const width = Math.min(OPENING_DEFS[kind].width, hit.edgeLength);
  const offset = Math.max(0, Math.min(hit.edgeLength - width, hit.offset - width / 2));
  const o = makeOpening(kind, hit.hostId, hit.startVertexId, Math.round(offset / 10) * 10, { width });
  store.commit({ ...m, openings: [...m.openings, o] });
  store.select([o.id]);
  return o.id;
}

export function placeObject(store: EditorStore, type: ObjectType, p: Vec2): string {
  const m = next(store);
  const count = m.objects.filter((o) => o.type === type).length;
  const obj = makeObject(type, p.x, p.y);
  if (count > 0) obj.name = `${obj.name} ${count + 1}`;
  obj.elevation = surfaceBelow(m, obj);
  store.commit({ ...m, objects: [...m.objects, obj] });
  store.select([obj.id]);
  return obj.id;
}

/** Places an independent copy of a custom object; later edits to it never change the library entry. */
export function placeCustomObject(store: EditorStore, c: CustomPlacement, p: Vec2): string {
  const m = next(store);
  const props: Record<string, string | number | boolean> = {};
  if (c.libraryId != null) props.libraryId = c.libraryId;
  if (c.libraryRevision != null) props.libraryRevision = c.libraryRevision;
  const same = m.objects.filter((o) => o.type === "custom" && o.name.replace(/ \d+$/, "") === c.name).length;
  const obj = makeCustomObject(c.spec, p.x, p.y, { name: same > 0 ? `${c.name} ${same + 1}` : c.name, color: c.color, accentColor: c.accentColor, props });
  obj.elevation = Math.max(c.elevation, surfaceBelow(m, obj));
  store.commit({ ...m, objects: [...m.objects, obj] });
  store.select([obj.id]);
  return obj.id;
}

/**
 * Height of the top of the highest object under the centre of `obj`
 * (0 = floor). Used to sit a backdrop or riser on a stage.
 */
export function surfaceBelow(m: ProjectModel, obj: Pick<DesignObject, "id" | "x" | "y" | "type">): number {
  let top = 0;
  for (const o of m.objects) {
    if (o.id === obj.id || o.hidden) continue;
    if (!OBJECT_DEFS[o.type].surface) continue;
    if (pointInPolygon({ x: obj.x, y: obj.y }, objectFootprint(o), 0)) top = Math.max(top, o.elevation + o.height);
  }
  return top;
}

export function placeLabel(store: EditorStore, p: Vec2): string {
  const m = next(store);
  const l = makeLabel(p.x, p.y, "Label");
  store.commit({ ...m, labels: [...m.labels, l] });
  store.select([l.id]);
  return l.id;
}

export function placeDimension(store: EditorStore, a: Vec2, b: Vec2): string | null {
  if (dist(a, b) < 10) return null;
  const m = next(store);
  const d = makeDimension(a, b, 600);
  store.commit({ ...m, dimensions: [...m.dimensions, d] });
  store.select([d.id]);
  return d.id;
}

export function deleteSelection(store: EditorStore) {
  const { selection } = store.getState();
  if (!selection.length) return;
  const m = next(store);
  const deletable = selection.filter((id) => {
    const e = findEntity(m, id)?.entity as { locked?: boolean } | undefined;
    return e && !e.locked;
  });
  if (!deletable.length) return;
  store.commit(deleteEntities(m, deletable));
  store.select([]);
}

export function duplicateSelection(store: EditorStore) {
  const { selection } = store.getState();
  if (!selection.length) return;
  const res = duplicateEntities(next(store), selection);
  store.commit(res.model);
  store.select(res.ids);
}

/** Moves the selection by a plan offset (arrow keys); locked items stay. */
export function nudgeSelection(store: EditorStore, dx: number, dy: number) {
  const { selection } = store.getState();
  if (!selection.length) return;
  let m = next(store);
  for (const id of selection) {
    const ref = findEntity(m, id);
    if (!ref || (ref.entity as { locked?: boolean }).locked) continue;
    m = translateEntity(m, id, dx, dy);
  }
  store.commit(m, `nudge:${selection.join(",")}`);
}

export function translateEntity(m: ProjectModel, id: string, dx: number, dy: number): ProjectModel {
  const ref = findEntity(m, id);
  if (!ref) return m;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  switch (ref.kind) {
    case "room":
      return { ...m, rooms: m.rooms.map((r) => (r.id === id ? { ...r, points: r.points.map((p) => ({ ...p, x: r1(p.x + dx), y: r1(p.y + dy) })) } : r)) };
    case "partition":
      return { ...m, partitions: m.partitions.map((r) => (r.id === id ? { ...r, points: r.points.map((p) => ({ ...p, x: r1(p.x + dx), y: r1(p.y + dy) })) } : r)) };
    case "pillar":
      return { ...m, pillars: m.pillars.map((e) => (e.id === id ? { ...e, x: r1(e.x + dx), y: r1(e.y + dy) } : e)) };
    case "section":
      return { ...m, sections: m.sections.map((e) => (e.id === id ? { ...e, x: r1(e.x + dx), y: r1(e.y + dy) } : e)) };
    case "object":
      return { ...m, objects: m.objects.map((e) => (e.id === id ? { ...e, x: r1(e.x + dx), y: r1(e.y + dy) } : e)) };
    case "label":
      return { ...m, labels: m.labels.map((e) => (e.id === id ? { ...e, x: r1(e.x + dx), y: r1(e.y + dy) } : e)) };
    case "dimension":
      return { ...m, dimensions: m.dimensions.map((e) => (e.id === id ? { ...e, a: { x: r1(e.a.x + dx), y: r1(e.a.y + dy) }, b: { x: r1(e.b.x + dx), y: r1(e.b.y + dy) } } : e)) };
    case "opening":
      return m;
  }
}

/** Where to drop something new: the visible centre, inside a room if possible. */
export function dropPoint(store: EditorStore): Vec2 {
  const c = store.canvas?.centre() ?? { x: 0, y: 0 };
  const m = next(store);
  if (roomAt(m, c) || m.rooms.length === 0) return c;
  const r = m.rooms[0];
  const xs = r.points.map((p) => p.x);
  const ys = r.points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
