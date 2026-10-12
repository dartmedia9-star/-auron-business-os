import { DEFAULT_CHECKLIST, OBJECT_DEFS, OPENING_DEFS, SECTION_DEFS, objectParamDefaults } from "./catalog";
import {
  EPS,
  add,
  boundsOf,
  dist,
  dot,
  len,
  lerp,
  normalize,
  outwardNormal,
  rectCorners,
  rotate,
  scale,
  sub,
  unionBounds,
  type Bounds,
} from "./geometry";
import {
  SCHEMA_VERSION,
  type DesignObject,
  type Dimension,
  type EntityKind,
  type Label,
  type Note,
  type ObjectType,
  type Opening,
  type OpeningKind,
  type Partition,
  type Pillar,
  type ProjectModel,
  type Room,
  type Section,
  type SectionKind,
  type Vec2,
  type Vertex,
} from "./schema";
import { roundMm, type DisplayUnit } from "./units";

// ---------------------------------------------------------------------------
// Factories and edits. Every function is pure: it returns new objects and
// never mutates its input, so the editor's undo history can keep snapshots.
// ---------------------------------------------------------------------------

export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rand = c?.randomUUID ? c.randomUUID().replace(/-/g, "").slice(0, 14) : Math.random().toString(36).slice(2, 16);
  return `${prefix}_${rand}`;
}

const r = roundMm;
const rv = (p: Vec2): Vec2 => ({ x: r(p.x), y: r(p.y) });

export function createEmptyModel(opts: { venueName?: string; title?: string; client?: string; displayUnit?: DisplayUnit } = {}): ProjectModel {
  const unit = opts.displayUnit ?? "m";
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      displayUnit: unit,
      gridSize: unit === "ft" ? 304.8 : 500,
      showGrid: true,
      snapGrid: true,
      snapGeometry: true,
      snapAngle: true,
      showWallDims: true,
      showOverallDims: true,
      showExternalDims: false,
      showSectionDims: true,
      showObjectDims: false,
      showLabels: true,
      showObjects: true,
    },
    venue: { name: opts.venueName ?? "", address: "", ceilingHeight: null, ceilingStatus: "to_confirm", notes: "" },
    drawing: { title: opts.title ?? "", client: opts.client ?? "", revision: "R0", date: "", preparedBy: "" },
    scene: { floorColor: "#c9c4ba", wallColor: "#ece9e2", wallOpacity: 1, showCeiling: false, lighting: "studio" },
    rooms: [],
    partitions: [],
    openings: [],
    pillars: [],
    sections: [],
    objects: [],
    dimensions: [],
    labels: [],
    notes: [],
    checklist: DEFAULT_CHECKLIST.map((label) => ({ id: newId("chk"), label, done: false, value: "" })),
  };
}

// ---------------------------------------------------------------- rooms ----

const roomDefaults = {
  notes: "",
  status: "measured" as const,
  locked: false,
  hidden: false,
  wallThickness: 230,
  wallHeight: 4000,
  floorColor: "#c9c4ba",
  wallColor: "#ece9e2",
  showWalls: true,
  dimOffset: 600,
  labelOffset: { x: 0, y: 0 },
};

/** A room from internal-face points; points are re-ordered clockwise on screen. */
export function makePolygonRoom(points: Vec2[], opts: Partial<Omit<Room, "points" | "id">> = {}): Room {
  const pts = points.map(rv);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  if (area < 0) pts.reverse();
  return {
    ...roomDefaults,
    name: "Hall",
    ...opts,
    id: newId("room"),
    points: pts.map((p) => ({ id: newId("v"), x: p.x, y: p.y })),
  };
}

/** Axis-aligned rectangular room with its top-left internal corner at (x, y). */
export function makeRectRoom(x: number, y: number, width: number, length: number, opts: Partial<Omit<Room, "points" | "id">> = {}): Room {
  return makePolygonRoom([{ x, y }, { x: x + width, y }, { x: x + width, y: y + length }, { x, y: y + length }], opts);
}

/**
 * L-shaped room: overall width × length with a rectangular cut-out of
 * cutWidth × cutLength removed from the bottom-right corner.
 */
export function makeLShapeRoom(x: number, y: number, width: number, length: number, cutWidth: number, cutLength: number, opts: Partial<Omit<Room, "points" | "id">> = {}): Room {
  return makePolygonRoom(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + length - cutLength },
      { x: x + width - cutWidth, y: y + length - cutLength },
      { x: x + width - cutWidth, y: y + length },
      { x, y: y + length },
    ],
    opts,
  );
}

export type Edge = { index: number; a: Vertex; b: Vertex; length: number; startVertexId: string };

/** Walls of a closed room (or an open partition when `closed` is false). */
export function edgesOf(points: Vertex[], closed = true): Edge[] {
  const n = points.length;
  const count = closed ? n : n - 1;
  const out: Edge[] = [];
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    out.push({ index: i, a, b, length: dist(a, b), startVertexId: a.id });
  }
  return out;
}

/** The room as an axis-aligned rectangle, or null if it isn't one. */
export function asRect(room: Room): { x: number; y: number; width: number; length: number } | null {
  if (room.points.length !== 4) return null;
  const xs = new Set(room.points.map((p) => r(p.x)));
  const ys = new Set(room.points.map((p) => r(p.y)));
  if (xs.size !== 2 || ys.size !== 2) return null;
  for (const e of edgesOf(room.points)) {
    if (Math.abs(e.a.x - e.b.x) > 0.05 && Math.abs(e.a.y - e.b.y) > 0.05) return null;
  }
  const b = boundsOf(room.points)!;
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, length: b.maxY - b.minY };
}

export function setRectSize(room: Room, width: number, length: number): Room {
  const rect = asRect(room);
  if (!rect) return room;
  const sx = (x: number) => (Math.abs(x - rect.x) < 0.05 ? rect.x : rect.x + width);
  const sy = (y: number) => (Math.abs(y - rect.y) < 0.05 ? rect.y : rect.y + length);
  return { ...room, points: room.points.map((p) => ({ ...p, x: r(sx(p.x)), y: r(sy(p.y)) })) };
}

/**
 * Sets the length of wall `edgeIndex` (a closed outline) to `length`.
 *
 * The wall's end point moves along the wall's own direction. To keep the room
 * rectilinear, every following vertex up to the next wall running the
 * opposite way moves with it, and that opposite wall stretches by the same
 * amount (so in a rectangle, changing the top wall widens the room). If no
 * opposite wall exists, only the end point moves and the next wall adjusts.
 *
 * Returns the ids of the vertices that moved, for feedback in the UI.
 */
export function setEdgeLength(points: Vertex[], edgeIndex: number, length: number, closed = true): { points: Vertex[]; moved: string[] } {
  const n = points.length;
  if (length <= 0 || edgeIndex < 0 || edgeIndex >= (closed ? n : n - 1)) return { points, moved: [] };
  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % n];
  const dir = normalize(sub(b, a));
  const current = dist(a, b);
  if (current < EPS) return { points, moved: [] };
  const delta = scale(dir, length - current);

  const movedIdx: number[] = [(edgeIndex + 1) % n];
  if (closed) {
    // Walk forward from the end vertex until an edge runs opposite to `dir`.
    for (let k = 1; k < n - 1; k++) {
      const i = (edgeIndex + k) % n;
      const p = points[i];
      const q = points[(i + 1) % n];
      const ed = normalize(sub(q, p));
      if (dot(ed, dir) < -0.999) break; // q stays: this opposite wall stretches
      const next = (i + 1) % n;
      if (next === edgeIndex) {
        // Went all the way round without an opposite wall: move the end point only.
        movedIdx.length = 1;
        break;
      }
      movedIdx.push(next);
    }
    if (movedIdx.length >= n - 1) movedIdx.length = 1;
  } else {
    for (let i = edgeIndex + 2; i < n; i++) movedIdx.push(i);
  }

  const set = new Set(movedIdx);
  const out = points.map((p, i) => (set.has(i) ? { ...p, x: r(p.x + delta.x), y: r(p.y + delta.y) } : p));
  return { points: out, moved: movedIdx.map((i) => points[i].id) };
}

export function moveVertex(points: Vertex[], vertexId: string, to: Vec2): Vertex[] {
  return points.map((p) => (p.id === vertexId ? { ...p, x: r(to.x), y: r(to.y) } : p));
}

export function translatePoints(points: Vertex[], dx: number, dy: number): Vertex[] {
  return points.map((p) => ({ ...p, x: r(p.x + dx), y: r(p.y + dy) }));
}

/** Inserts a vertex on wall `edgeIndex` at `at` (projected onto the wall). Returns the new vertex id. */
export function insertVertex(points: Vertex[], edgeIndex: number, at: Vec2): { points: Vertex[]; vertexId: string } {
  const n = points.length;
  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % n];
  const ab = sub(b, a);
  const t = Math.max(0.01, Math.min(0.99, dot(sub(at, a), ab) / Math.max(EPS, dot(ab, ab))));
  const p = lerp(a, b, t);
  const vertex: Vertex = { id: newId("v"), x: r(p.x), y: r(p.y) };
  const out = [...points];
  out.splice(edgeIndex + 1, 0, vertex);
  return { points: out, vertexId: vertex.id };
}

// ------------------------------------------------------------- entities ----

export function makePartition(points: Vec2[], opts: Partial<Omit<Partition, "points" | "id">> = {}): Partition {
  return {
    name: "Partition",
    notes: "",
    status: "measured",
    locked: false,
    hidden: false,
    thickness: 115,
    height: 3000,
    color: "#d8d4cc",
    ...opts,
    id: newId("wall"),
    points: points.map((p) => ({ id: newId("v"), x: r(p.x), y: r(p.y) })),
  };
}

export function makeOpening(kind: OpeningKind, hostId: string, startVertexId: string, offset: number, opts: Partial<Omit<Opening, "id">> = {}): Opening {
  const d = OPENING_DEFS[kind];
  return {
    name: d.label,
    notes: "",
    status: "measured",
    locked: false,
    hidden: false,
    kind,
    hostId,
    startVertexId,
    offset: r(Math.max(0, offset)),
    width: d.width,
    height: d.height,
    sill: d.sill,
    swing: kind === "door" || kind === "emergency_exit" ? "left" : "none",
    swingSide: kind === "emergency_exit" ? "out" : "in",
    ...opts,
    id: newId("open"),
  };
}

export function makePillar(x: number, y: number, opts: Partial<Omit<Pillar, "id">> = {}): Pillar {
  return {
    name: "Pillar",
    notes: "",
    status: "measured",
    locked: false,
    hidden: false,
    x: r(x),
    y: r(y),
    shape: "rect",
    width: 600,
    depth: 600,
    height: 0,
    rotation: 0,
    color: "#9aa0aa",
    ...opts,
    id: newId("pil"),
  };
}

export function makeSection(kind: SectionKind, x: number, y: number, width: number, depth: number, opts: Partial<Omit<Section, "id">> = {}): Section {
  const d = SECTION_DEFS[kind];
  return {
    name: d.label,
    notes: "",
    status: "measured",
    locked: false,
    hidden: false,
    kind,
    x: r(x),
    y: r(y),
    width: r(width),
    depth: r(depth),
    rotation: 0,
    color: d.color,
    showDims: true,
    labelOffset: { x: 0, y: 0 },
    ...opts,
    id: newId("sec"),
  };
}

/** Section from its top-left corner (unrotated), convenient for layouts. */
export function makeSectionTL(kind: SectionKind, left: number, top: number, width: number, depth: number, opts: Partial<Omit<Section, "id">> = {}): Section {
  return makeSection(kind, left + width / 2, top + depth / 2, width, depth, opts);
}

export function makeObject(type: ObjectType, x: number, y: number, opts: Partial<Omit<DesignObject, "id">> = {}): DesignObject {
  const d = OBJECT_DEFS[type];
  return {
    name: d.label,
    notes: "",
    status: "measured",
    locked: false,
    hidden: false,
    type,
    x: r(x),
    y: r(y),
    elevation: d.elevation,
    rotation: 0,
    width: d.width,
    depth: d.depth,
    height: d.height,
    color: d.color,
    accentColor: d.accentColor,
    props: objectParamDefaults(type),
    labelOffset: { x: 0, y: 0 },
    ...opts,
    id: newId("obj"),
  };
}

export function makeDimension(a: Vec2, b: Vec2, offset = 500): Dimension {
  return { id: newId("dim"), a: rv(a), b: rv(b), offset: r(offset), suffix: "", hidden: false };
}

export function makeLabel(x: number, y: number, text: string): Label {
  return { id: newId("lbl"), x: r(x), y: r(y), text, size: "md", hidden: false };
}

export function makeNote(text: string, status: Note["status"], targetId: string | null = null): Note {
  return { id: newId("note"), text, status, targetId, createdAt: new Date().toISOString() };
}

/**
 * Splits a section into consecutive parts along its own width ("x") or depth
 * ("y"). `sizes` must add up to that dimension (within 1 mm). Rotation is
 * kept; the first part keeps the original id so references survive.
 */
export function splitSection(section: Section, axis: "x" | "y", sizes: number[], names?: string[]): { ok: true; sections: Section[] } | { ok: false; error: string } {
  if (sizes.length < 2) return { ok: false, error: "Enter at least two sizes" };
  if (sizes.some((s) => !(s > 0))) return { ok: false, error: "Every size must be greater than zero" };
  const total = axis === "x" ? section.width : section.depth;
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - total) > 1) return { ok: false, error: `Sizes add up to ${r(sum)} mm but the section is ${r(total)} mm` };
  const out: Section[] = [];
  let cursor = -total / 2;
  sizes.forEach((size, i) => {
    const centreLocal = cursor + size / 2;
    cursor += size;
    const local = axis === "x" ? { x: centreLocal, y: 0 } : { x: 0, y: centreLocal };
    const c = rotate(local, section.rotation);
    out.push({
      ...section,
      id: i === 0 ? section.id : newId("sec"),
      name: names?.[i] ?? (i === 0 ? section.name : `${section.name} ${i + 1}`),
      x: r(section.x + c.x),
      y: r(section.y + c.y),
      width: axis === "x" ? r(size) : section.width,
      depth: axis === "y" ? r(size) : section.depth,
      // Each part gets its own automatic label place.
      labelOffset: { x: 0, y: 0 },
    });
  });
  return { ok: true, sections: out };
}

/** A section covering a rectangular room exactly (start point for splitting). */
export function sectionFillingRoom(room: Room): Section | null {
  const rect = asRect(room);
  if (!rect) return null;
  return makeSectionTL("section", rect.x, rect.y, rect.width, rect.length, { name: "Section" });
}

// --------------------------------------------------------------- lookup ----

export type EntityRef =
  | { kind: "room"; entity: Room }
  | { kind: "partition"; entity: Partition }
  | { kind: "opening"; entity: Opening }
  | { kind: "pillar"; entity: Pillar }
  | { kind: "section"; entity: Section }
  | { kind: "object"; entity: DesignObject }
  | { kind: "dimension"; entity: Dimension }
  | { kind: "label"; entity: Label };

export const COLLECTION: Record<EntityKind, "rooms" | "partitions" | "openings" | "pillars" | "sections" | "objects" | "dimensions" | "labels"> = {
  room: "rooms",
  partition: "partitions",
  opening: "openings",
  pillar: "pillars",
  section: "sections",
  object: "objects",
  dimension: "dimensions",
  label: "labels",
};

export function findEntity(model: ProjectModel, id: string): EntityRef | null {
  for (const kind of Object.keys(COLLECTION) as EntityKind[]) {
    const list = model[COLLECTION[kind]] as Array<{ id: string }>;
    const entity = list.find((e) => e.id === id);
    if (entity) return { kind, entity } as EntityRef;
  }
  return null;
}

/** Replaces one entity (matched by id) with `patch` applied. */
export function updateEntity(model: ProjectModel, id: string, patch: Record<string, unknown>): ProjectModel {
  const ref = findEntity(model, id);
  if (!ref) return model;
  const key = COLLECTION[ref.kind];
  const list = model[key] as Array<{ id: string }>;
  return { ...model, [key]: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/**
 * Deletes entities. Openings hosted on a deleted room or partition go with
 * it; notes attached to anything deleted become project-level notes (their
 * text is never discarded).
 */
export function deleteEntities(model: ProjectModel, ids: string[]): ProjectModel {
  const gone = new Set(ids);
  for (const o of model.openings) if (gone.has(o.hostId)) gone.add(o.id);
  return {
    ...model,
    rooms: model.rooms.filter((e) => !gone.has(e.id)),
    partitions: model.partitions.filter((e) => !gone.has(e.id)),
    openings: model.openings.filter((e) => !gone.has(e.id)),
    pillars: model.pillars.filter((e) => !gone.has(e.id)),
    sections: model.sections.filter((e) => !gone.has(e.id)),
    objects: model.objects.filter((e) => !gone.has(e.id)),
    dimensions: model.dimensions.filter((e) => !gone.has(e.id)),
    labels: model.labels.filter((e) => !gone.has(e.id)),
    notes: model.notes.map((n) => (n.targetId && gone.has(n.targetId) ? { ...n, targetId: null } : n)),
  };
}

/**
 * Removes a vertex from a room or partition. Openings on the wall that
 * started at it move to the merged wall with their position preserved.
 */
export function removeVertex(model: ProjectModel, hostId: string, vertexId: string): ProjectModel {
  const ref = findEntity(model, hostId);
  if (!ref || (ref.kind !== "room" && ref.kind !== "partition")) return model;
  const pts = ref.entity.points;
  const min = ref.kind === "room" ? 3 : 2;
  if (pts.length <= min) return model;
  const i = pts.findIndex((p) => p.id === vertexId);
  if (i < 0) return model;
  const closed = ref.kind === "room";
  const prevIndex = i === 0 ? (closed ? pts.length - 1 : -1) : i - 1;
  const prev = prevIndex >= 0 ? pts[prevIndex] : null;
  const prevLen = prev ? dist(prev, pts[i]) : 0;
  const newPts = pts.filter((p) => p.id !== vertexId);
  const openings = model.openings.flatMap((o) => {
    if (o.hostId !== hostId) return [o];
    if (o.startVertexId === vertexId) {
      if (!prev) return [{ ...o, startVertexId: newPts[0].id }];
      return [{ ...o, startVertexId: prev.id, offset: r(o.offset + prevLen) }];
    }
    return [o];
  });
  const updated = updateEntity(model, hostId, { points: newPts });
  return { ...updated, openings };
}

const DUP_OFFSET = 500;

/** Duplicates entities with fresh ids, offset so the copy is visible. Returns the new ids. */
export function duplicateEntities(model: ProjectModel, ids: string[], offset: Vec2 = { x: DUP_OFFSET, y: DUP_OFFSET }): { model: ProjectModel; ids: string[] } {
  let next = model;
  const newIds: string[] = [];
  for (const id of ids) {
    const ref = findEntity(next, id);
    if (!ref) continue;
    switch (ref.kind) {
      case "room": {
        const copy: Room = { ...ref.entity, id: newId("room"), name: `${ref.entity.name} copy`, points: ref.entity.points.map((p) => ({ id: newId("v"), x: r(p.x + offset.x), y: r(p.y + offset.y) })) };
        // Openings follow the copy, re-pointed at the copied vertices by index.
        const vmap = new Map(ref.entity.points.map((p, i) => [p.id, copy.points[i].id]));
        const ops = next.openings.filter((o) => o.hostId === id).map((o) => ({ ...o, id: newId("open"), hostId: copy.id, startVertexId: vmap.get(o.startVertexId) ?? o.startVertexId }));
        next = { ...next, rooms: [...next.rooms, copy], openings: [...next.openings, ...ops] };
        newIds.push(copy.id);
        break;
      }
      case "partition": {
        const copy: Partition = { ...ref.entity, id: newId("wall"), name: `${ref.entity.name} copy`, points: ref.entity.points.map((p) => ({ id: newId("v"), x: r(p.x + offset.x), y: r(p.y + offset.y) })) };
        const vmap = new Map(ref.entity.points.map((p, i) => [p.id, copy.points[i].id]));
        const ops = next.openings.filter((o) => o.hostId === id).map((o) => ({ ...o, id: newId("open"), hostId: copy.id, startVertexId: vmap.get(o.startVertexId) ?? o.startVertexId }));
        next = { ...next, partitions: [...next.partitions, copy], openings: [...next.openings, ...ops] };
        newIds.push(copy.id);
        break;
      }
      case "opening": {
        const geo = openingGeometry(next, ref.entity);
        const shift = geo ? Math.min(ref.entity.width + 200, Math.max(0, geo.edgeLength - ref.entity.offset - 2 * ref.entity.width)) : 0;
        const copy: Opening = { ...ref.entity, id: newId("open"), offset: r(ref.entity.offset + shift) };
        next = { ...next, openings: [...next.openings, copy] };
        newIds.push(copy.id);
        break;
      }
      case "pillar": {
        const copy: Pillar = { ...ref.entity, id: newId("pil"), x: r(ref.entity.x + offset.x), y: r(ref.entity.y + offset.y) };
        next = { ...next, pillars: [...next.pillars, copy] };
        newIds.push(copy.id);
        break;
      }
      case "section": {
        const copy: Section = { ...ref.entity, id: newId("sec"), name: `${ref.entity.name} copy`, x: r(ref.entity.x + offset.x), y: r(ref.entity.y + offset.y) };
        next = { ...next, sections: [...next.sections, copy] };
        newIds.push(copy.id);
        break;
      }
      case "object": {
        const copy: DesignObject = { ...ref.entity, id: newId("obj"), name: `${ref.entity.name} copy`, x: r(ref.entity.x + offset.x), y: r(ref.entity.y + offset.y), props: { ...ref.entity.props } };
        next = { ...next, objects: [...next.objects, copy] };
        newIds.push(copy.id);
        break;
      }
      case "dimension": {
        const copy: Dimension = { ...ref.entity, id: newId("dim"), offset: r(ref.entity.offset + DUP_OFFSET) };
        next = { ...next, dimensions: [...next.dimensions, copy] };
        newIds.push(copy.id);
        break;
      }
      case "label": {
        const copy: Label = { ...ref.entity, id: newId("lbl"), x: r(ref.entity.x + offset.x), y: r(ref.entity.y + offset.y) };
        next = { ...next, labels: [...next.labels, copy] };
        newIds.push(copy.id);
        break;
      }
    }
  }
  return { model: next, ids: newIds };
}

// ------------------------------------------------------------- openings ----

export type OpeningGeometry = {
  host: Room | Partition;
  hostKind: "room" | "partition";
  edgeIndex: number;
  edgeStart: Vec2;
  edgeEnd: Vec2;
  edgeLength: number;
  /** Unit vector along the wall. */
  dir: Vec2;
  /** Unit normal pointing out of the room (or to the partition's left). */
  normal: Vec2;
  /** Opening endpoints on the reference line (room: internal face; partition: centreline). */
  a: Vec2;
  b: Vec2;
  thickness: number;
  wallHeight: number;
  /** True when the opening extends past the end of its wall. */
  overflows: boolean;
};

export function openingGeometry(model: ProjectModel, o: Opening): OpeningGeometry | null {
  const room = model.rooms.find((x) => x.id === o.hostId);
  const part = room ? null : model.partitions.find((x) => x.id === o.hostId);
  const host = room ?? part;
  if (!host) return null;
  const pts = host.points;
  const i = pts.findIndex((p) => p.id === o.startVertexId);
  if (i < 0) return null;
  if (!room && i >= pts.length - 1) return null;
  const s = pts[i];
  const e = pts[(i + 1) % pts.length];
  const edgeLength = dist(s, e);
  if (edgeLength < EPS) return null;
  const dir = normalize(sub(e, s));
  const normal = room ? outwardNormal(pts, i) : { x: dir.y, y: -dir.x };
  const a = add(s, scale(dir, o.offset));
  const b = add(s, scale(dir, o.offset + o.width));
  return {
    host,
    hostKind: room ? "room" : "partition",
    edgeIndex: i,
    edgeStart: s,
    edgeEnd: e,
    edgeLength,
    dir,
    normal,
    a,
    b,
    thickness: room ? room.wallThickness : (part as Partition).thickness,
    wallHeight: room ? room.wallHeight : (part as Partition).height,
    overflows: o.offset + o.width > edgeLength + 0.5,
  };
}

/** Finds the wall nearest to `p` within `tolerance` mm, for placing openings. */
export function nearestWall(model: ProjectModel, p: Vec2, tolerance: number): { hostId: string; startVertexId: string; offset: number; distance: number; edgeLength: number } | null {
  let best: { hostId: string; startVertexId: string; offset: number; distance: number; edgeLength: number } | null = null;
  const consider = (hostId: string, pts: Vertex[], closed: boolean) => {
    for (const e of edgesOf(pts, closed)) {
      const ab = sub(e.b, e.a);
      const t = Math.max(0, Math.min(1, dot(sub(p, e.a), ab) / Math.max(EPS, dot(ab, ab))));
      const q = lerp(e.a, e.b, t);
      const d = dist(p, q);
      if (d <= tolerance && (!best || d < best.distance)) best = { hostId, startVertexId: e.startVertexId, offset: t * e.length, distance: d, edgeLength: e.length };
    }
  };
  for (const room of model.rooms) if (!room.hidden) consider(room.id, room.points, true);
  for (const part of model.partitions) if (!part.hidden) consider(part.id, part.points, false);
  return best;
}

// --------------------------------------------------------------- bounds ----

export function objectFootprint(o: { x: number; y: number; width: number; depth: number; rotation: number }): Vec2[] {
  return rectCorners(o.x, o.y, o.width, o.depth, o.rotation);
}

export function modelBounds(model: ProjectModel): Bounds | null {
  let b: Bounds | null = null;
  for (const room of model.rooms) {
    const pad = room.wallThickness + (room.dimOffset ?? 0) + 400;
    const rb = boundsOf(room.points);
    if (rb) b = unionBounds(b, { minX: rb.minX - pad, minY: rb.minY - pad, maxX: rb.maxX + pad, maxY: rb.maxY + pad });
  }
  for (const p of model.partitions) b = unionBounds(b, boundsOf(p.points));
  for (const p of model.pillars) b = unionBounds(b, boundsOf(objectFootprint(p)));
  for (const s of model.sections) b = unionBounds(b, boundsOf(objectFootprint(s)));
  for (const o of model.objects) b = unionBounds(b, boundsOf(objectFootprint(o)));
  for (const d of model.dimensions) b = unionBounds(b, boundsOf([d.a, d.b]));
  for (const l of model.labels) b = unionBounds(b, boundsOf([{ x: l.x, y: l.y }]));
  return b;
}

/** Room whose internal outline contains `p`, if any (smallest wins). */
export function roomAt(model: ProjectModel, p: Vec2): Room | null {
  let best: Room | null = null;
  let bestArea = Infinity;
  for (const room of model.rooms) {
    const b = boundsOf(room.points)!;
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
    let inside = false;
    const poly = room.points;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const c = poly[j];
      if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
    }
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    if (inside && area < bestArea) {
      best = room;
      bestArea = area;
    }
  }
  return best;
}

export const wallLength = (a: Vec2, b: Vec2): number => len(sub(b, a));
