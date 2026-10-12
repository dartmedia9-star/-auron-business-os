import {
  add,
  dist,
  dot,
  edgesOf,
  findEntity,
  lerp,
  mid,
  normalize,
  objectFootprint,
  openingGeometry,
  pointInPolygon,
  projectOnSegment,
  rotate,
  scale,
  snapAngle,
  snapTo,
  sub,
  dimLinePoints,
  perp,
  type ProjectModel,
  type Vec2,
} from "@workspace/design-model";

// Hit testing, handles and snapping for the 2D canvas. Tolerances are given
// in screen pixels and converted with the current zoom, so a fingertip has
// the same reach at any zoom level.

export type View = { scale: number; tx: number; ty: number };

export const toWorld = (v: View, sx: number, sy: number): Vec2 => ({ x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale });
export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });

export type Handle =
  | { type: "vertex"; hostId: string; vertexId: string; p: Vec2 }
  | { type: "edgeMid"; hostId: string; edgeIndex: number; p: Vec2 }
  | { type: "resize"; id: string; corner: number; p: Vec2 }
  | { type: "rotate"; id: string; p: Vec2; anchor: Vec2 }
  | { type: "dimEnd"; id: string; which: "a" | "b"; p: Vec2 }
  | { type: "dimOffset"; id: string; p: Vec2 }
  /** Grip beside a room/section/object name: dragging it sets labelOffset. `delta` is label position − grip. */
  | { type: "label"; id: string; p: Vec2; base: Vec2; delta: Vec2 };

/** Where the selected entity's name label is drawn (from the laid-out plan). */
export type LabelGrip = { p: Vec2; base: Vec2; delta: Vec2 };

export type Hit =
  | { type: "handle"; handle: Handle }
  | { type: "entity"; id: string; kind: string; edgeIndex?: number };

const ROTATE_HANDLE_PX = 34;

/** Handles for a single selected entity. */
export function handlesFor(model: ProjectModel, id: string, viewScale: number, label?: LabelGrip | null): Handle[] {
  const ref = findEntity(model, id);
  if (!ref) return [];
  const e = ref.entity as { locked?: boolean };
  if (e.locked) return [];
  const out = shapeHandles(ref, id, viewScale);
  if (label && (ref.kind === "room" || ref.kind === "section" || ref.kind === "object")) out.push({ type: "label", id, ...label });
  return out;
}

function shapeHandles(ref: NonNullable<ReturnType<typeof findEntity>>, id: string, viewScale: number): Handle[] {
  switch (ref.kind) {
    case "room":
    case "partition": {
      const pts = ref.entity.points;
      const out: Handle[] = pts.map((p) => ({ type: "vertex", hostId: id, vertexId: p.id, p }));
      for (const edge of edgesOf(pts, ref.kind === "room")) {
        if (edge.length * viewScale > 70) out.push({ type: "edgeMid", hostId: id, edgeIndex: edge.index, p: mid(edge.a, edge.b) });
      }
      return out;
    }
    case "section":
    case "pillar":
    case "object": {
      const ent = ref.entity;
      const pts = objectFootprint(ent);
      const out: Handle[] = pts.map((p, corner) => ({ type: "resize", id, corner, p }));
      if (!(ref.kind === "pillar" && ref.entity.shape === "round")) {
        const topMid = mid(pts[0], pts[1]);
        const up = normalize(sub(pts[0], pts[3]));
        out.push({ type: "rotate", id, p: add(topMid, scale(up, ROTATE_HANDLE_PX / viewScale)), anchor: topMid });
      }
      return out;
    }
    case "dimension": {
      const d = ref.entity;
      const n = perp(normalize(sub(d.b, d.a)));
      const { p1, p2 } = dimLinePoints({ key: "", entityId: id, kind: "user", a: d.a, b: d.b, normal: n, offset: d.offset, value: 0 });
      return [
        { type: "dimEnd", id, which: "a", p: d.a },
        { type: "dimEnd", id, which: "b", p: d.b },
        { type: "dimOffset", id, p: mid(p1, p2) },
      ];
    }
    default:
      return [];
  }
}

export function hitTest(model: ProjectModel, p: Vec2, viewScale: number, selection: string[], touch: boolean, label?: LabelGrip | null): Hit | null {
  const tol = (touch ? 22 : 10) / viewScale;
  // 1. Handles of the selection.
  if (selection.length === 1) {
    let best: { h: Handle; d: number } | null = null;
    for (const h of handlesFor(model, selection[0], viewScale, label)) {
      const d = dist(h.p, p);
      const reach = h.type === "edgeMid" || h.type === "label" ? tol * 0.8 : tol;
      if (d <= reach && (!best || d < best.d)) best = { h, d };
    }
    if (best) return { type: "handle", handle: best.h };
  }

  const s = model.settings;
  // 2. Labels and user dimensions (small, on top).
  if (s.showLabels) {
    for (const l of [...model.labels].reverse()) {
      if (!l.hidden && dist({ x: l.x, y: l.y }, p) <= tol * 1.4) return { type: "entity", id: l.id, kind: "label" };
    }
  }
  for (const d of [...model.dimensions].reverse()) {
    if (d.hidden) continue;
    const n = perp(normalize(sub(d.b, d.a)));
    const { p1, p2 } = dimLinePoints({ key: "", entityId: d.id, kind: "user", a: d.a, b: d.b, normal: n, offset: d.offset, value: 0 });
    if (projectOnSegment(p, p1, p2).distance <= tol) return { type: "entity", id: d.id, kind: "dimension" };
  }
  // 3. Openings (on their wall).
  for (const o of [...model.openings].reverse()) {
    if (o.hidden) continue;
    const g = openingGeometry(model, o);
    if (!g) continue;
    const c = add(lerp(g.a, g.b, 0.5), scale(g.normal, g.hostKind === "room" ? g.thickness / 2 : 0));
    const along = Math.abs(dot(sub(p, c), g.dir));
    const across = Math.abs(dot(sub(p, c), g.normal));
    if (along <= o.width / 2 + tol * 0.3 && across <= Math.max(g.thickness / 2, tol)) return { type: "entity", id: o.id, kind: "opening" };
  }
  // 4. Objects (top-most last drawn), then pillars.
  if (s.showObjects) {
    for (const o of [...model.objects].reverse()) {
      if (o.hidden) continue;
      if (o.type === "round_table" ? dist({ x: o.x, y: o.y }, p) <= o.width / 2 + tol * 0.3 : pointInPolygon(p, objectFootprint(o), tol * 0.3)) return { type: "entity", id: o.id, kind: "object" };
    }
  }
  for (const pl of [...model.pillars].reverse()) {
    if (pl.hidden) continue;
    const inside = pl.shape === "round" ? dist({ x: pl.x, y: pl.y }, p) <= pl.width / 2 + tol * 0.5 : pointInPolygon(p, objectFootprint(pl), tol * 0.5);
    if (inside) return { type: "entity", id: pl.id, kind: "pillar" };
  }
  // 5. Walls: partitions, then room walls (with the wall index).
  for (const w of [...model.partitions].reverse()) {
    if (w.hidden) continue;
    for (const e of edgesOf(w.points, false)) {
      if (projectOnSegment(p, e.a, e.b).distance <= Math.max(w.thickness / 2, tol)) return { type: "entity", id: w.id, kind: "partition", edgeIndex: e.index };
    }
  }
  // Inside a section, a wall only wins very close to its face, so narrow
  // strips along a wall stay tappable on a phone.
  const inSection = model.sections.some((sec) => !sec.hidden && pointInPolygon(p, objectFootprint(sec), 0));
  for (const r of [...model.rooms].reverse()) {
    if (r.hidden) continue;
    const inside = pointInPolygon(p, r.points, 0);
    const faceReach = inside && inSection ? tol * 0.4 : tol;
    for (const e of edgesOf(r.points)) {
      const pr = projectOnSegment(p, e.a, e.b);
      // Near the internal face, or anywhere on the wall band outside it.
      if (pr.distance <= faceReach || (pr.distance <= r.wallThickness + tol * 0.3 && !inside)) {
        return { type: "entity", id: r.id, kind: "room", edgeIndex: e.index };
      }
    }
  }
  // 6. Sections (inside), then room interiors.
  for (const sec of [...model.sections].reverse()) {
    if (!sec.hidden && pointInPolygon(p, objectFootprint(sec), 0)) return { type: "entity", id: sec.id, kind: "section" };
  }
  for (const r of [...model.rooms].reverse()) {
    if (!r.hidden && pointInPolygon(p, r.points, 0)) return { type: "entity", id: r.id, kind: "room" };
  }
  return null;
}

export type SnapResult = { p: Vec2; kind: "vertex" | "edge" | "grid" | "angle" | null; guide?: { from: Vec2; to: Vec2 } };

export type SnapOptions = {
  viewScale: number;
  gridSize: number;
  snapGrid: boolean;
  snapGeometry: boolean;
  snapAngle: boolean;
  /** Previous point when drawing a chain (enables angle snapping). */
  from?: Vec2 | null;
  /** Entity ids whose geometry must not attract (the thing being dragged). */
  exclude?: Set<string>;
  /** Vertex ids that must not attract (the vertex being dragged). */
  excludeVertex?: string | null;
  touch?: boolean;
};

/** Snap candidates: room/partition vertices and section/object corners. */
function snapVertices(model: ProjectModel, exclude: Set<string> | undefined, excludeVertex: string | null | undefined): Vec2[] {
  const out: Vec2[] = [];
  for (const r of model.rooms) if (!r.hidden && !exclude?.has(r.id)) for (const p of r.points) if (p.id !== excludeVertex) out.push(p);
  for (const w of model.partitions) if (!w.hidden && !exclude?.has(w.id)) for (const p of w.points) if (p.id !== excludeVertex) out.push(p);
  for (const s of model.sections) if (!s.hidden && !exclude?.has(s.id)) out.push(...objectFootprint(s));
  return out;
}

export function snapPoint(model: ProjectModel, raw: Vec2, o: SnapOptions): SnapResult {
  const tol = (o.touch ? 18 : 10) / o.viewScale;
  if (o.snapGeometry) {
    let best: { p: Vec2; d: number } | null = null;
    for (const v of snapVertices(model, o.exclude, o.excludeVertex)) {
      const d = dist(v, raw);
      if (d <= tol && (!best || d < best.d)) best = { p: { x: v.x, y: v.y }, d };
    }
    if (best) return { p: best.p, kind: "vertex" };
  }
  let p = raw;
  let kind: SnapResult["kind"] = null;
  let guide: SnapResult["guide"];
  if (o.from && o.snapAngle) {
    const a = snapAngle(o.from, raw, 45);
    if (dist(a, raw) <= Math.max(tol, dist(o.from, raw) * Math.tan((5 * Math.PI) / 180))) {
      // Round the length along the snapped direction to the grid step.
      const dir = normalize(sub(a, o.from));
      const l = o.snapGrid ? snapTo(dist(o.from, a), o.gridSize / 5 >= 50 ? o.gridSize / 5 : 50) : dist(o.from, a);
      p = add(o.from, scale(dir, l));
      kind = "angle";
      guide = { from: o.from, to: p };
      return { p, kind, guide };
    }
  }
  if (o.snapGeometry) {
    // Snap onto the nearest wall face (useful for butting sections to walls).
    let best: { p: Vec2; d: number } | null = null;
    for (const r of model.rooms) {
      if (r.hidden || o.exclude?.has(r.id)) continue;
      for (const e of edgesOf(r.points)) {
        const pr = projectOnSegment(raw, e.a, e.b);
        if (pr.distance <= tol * 0.7 && (!best || pr.distance < best.d)) best = { p: pr.point, d: pr.distance };
      }
    }
    if (best) {
      p = best.p;
      kind = "edge";
      if (o.snapGrid) {
        // Keep the point on the wall but round its position along it.
        const g = { x: snapTo(p.x, o.gridSize), y: snapTo(p.y, o.gridSize) };
        const onWallX = Math.abs(best.p.y - raw.y) < Math.abs(best.p.x - raw.x);
        p = onWallX ? { x: best.p.x, y: g.y } : { x: g.x, y: best.p.y };
      }
      return { p, kind };
    }
  }
  if (o.snapGrid) return { p: { x: snapTo(raw.x, o.gridSize), y: snapTo(raw.y, o.gridSize) }, kind: "grid" };
  return { p, kind };
}

/** New centre/size for a rectangle when corner `corner` is dragged to `to`. */
export function resizeRect(ent: { x: number; y: number; width: number; depth: number; rotation: number }, corner: number, to: Vec2, minSize = 50) {
  const pts = objectFootprint(ent);
  const q = pts[(corner + 2) % 4];
  const ux = rotate({ x: 1, y: 0 }, ent.rotation);
  const uy = rotate({ x: 0, y: 1 }, ent.rotation);
  const d = sub(to, q);
  let dx = dot(d, ux);
  let dy = dot(d, uy);
  // Keep the dragged corner on its own side of the fixed one.
  const sx = corner === 1 || corner === 2 ? 1 : -1;
  const sy = corner === 2 || corner === 3 ? 1 : -1;
  dx = sx * Math.max(minSize, sx * dx);
  dy = sy * Math.max(minSize, sy * dy);
  const c = add(q, add(scale(ux, dx / 2), scale(uy, dy / 2)));
  return { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, width: Math.round(Math.abs(dx) * 10) / 10, depth: Math.round(Math.abs(dy) * 10) / 10 };
}

export type AlignResult = {
  x: number;
  y: number;
  /** What each axis lined up with, for on-screen feedback ("grid" when it only rounded). */
  alignedX: string | null;
  alignedY: string | null;
};

/**
 * Where a dragged section/object/pillar lands when its centre is proposed at
 * (x, y): its left, centre or right edge lines up with an edge or centre of
 * another item or a wall face when within `tolMm`, otherwise the position
 * rounds to `gridStep`. Each axis is aligned independently.
 */
export function alignMove(model: ProjectModel, id: string, x: number, y: number, tolMm: number, gridStep: number): AlignResult {
  const ref = findEntity(model, id);
  const ent = ref?.entity as { x: number; y: number; width: number; depth: number; rotation: number } | undefined;
  if (!ent || !("width" in ent)) return { x, y, alignedX: null, alignedY: null };
  const box = (pts: Vec2[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  };
  const own = box(objectFootprint({ ...ent, x: 0, y: 0 }));
  const xs: Array<{ v: number; what: string }> = [];
  const ys: Array<{ v: number; what: string }> = [];
  const collect = (b: ReturnType<typeof box>, what: string, centre = true) => {
    xs.push({ v: b.minX, what }, { v: b.maxX, what });
    ys.push({ v: b.minY, what }, { v: b.maxY, what });
    if (centre) {
      xs.push({ v: (b.minX + b.maxX) / 2, what: `${what} centre` });
      ys.push({ v: (b.minY + b.maxY) / 2, what: `${what} centre` });
    }
  };
  for (const r of model.rooms) if (!r.hidden) collect(box(r.points), "wall");
  for (const list of [model.sections, model.objects, model.pillars] as const) {
    for (const o of list) {
      if (o.id === id || o.hidden) continue;
      collect(box(objectFootprint(o)), o.name || "item");
    }
  }
  const axis = (c: number, lo: number, hi: number, targets: Array<{ v: number; what: string }>) => {
    let best: { c: number; d: number; what: string } | null = null;
    for (const t of targets) {
      for (const off of [lo, 0, hi]) {
        const d = Math.abs(c + off - t.v);
        if (d <= tolMm && (!best || d < best.d)) best = { c: t.v - off, d, what: t.what };
      }
    }
    if (best) return { c: Math.round(best.c * 10) / 10, what: best.what };
    return { c: gridStep > 0 ? snapTo(c, gridStep) : c, what: null };
  };
  const ax = axis(x, own.minX, own.maxX, xs);
  const ay = axis(y, own.minY, own.maxY, ys);
  return { x: ax.c, y: ay.c, alignedX: ax.what, alignedY: ay.what };
}
