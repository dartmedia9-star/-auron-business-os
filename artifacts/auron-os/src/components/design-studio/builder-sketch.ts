import { circlePoints, sketchSnapPoints, type Sketch, type SketchPoint, type SketchShape } from "@workspace/design-model";

// Pure helpers for the Custom Builder's drawing: hit testing, moving and
// reshaping shapes, erasing and snapping. Coordinates are millimetres as
// drawn (x right, y down). Kept free of React so they can be tested.

const r1 = (n: number) => Math.round(n * 10) / 10;

export function distToSegment(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function insidePoly(p: SketchPoint, pts: SketchPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function shapePoints(s: SketchShape): { pts: SketchPoint[]; closed: boolean } {
  if (s.kind === "rect") return { pts: [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }], closed: true };
  if (s.kind === "circle") return { pts: circlePoints(s.cx, s.cy, s.r, 48), closed: true };
  return { pts: s.points, closed: s.closed };
}

/** Distance from a point to a shape's outline (0 inside a closed shape when `fill`). */
export function distToShape(s: SketchShape, p: SketchPoint, fill = false): number {
  if (s.kind === "circle") {
    const d = Math.hypot(p.x - s.cx, p.y - s.cy);
    return fill && d <= s.r ? 0 : Math.abs(d - s.r);
  }
  const { pts, closed } = shapePoints(s);
  if (fill && closed && insidePoly(p, pts)) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) best = Math.min(best, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

export type SketchHit = { kind: "shape" | "dim" | "label"; id: string };

/** Topmost thing under the point: outlines first (so a shape inside another can be picked), then fills. */
export function hitSketch(sketch: Sketch, p: SketchPoint, tol: number): SketchHit | null {
  for (let i = sketch.labels.length - 1; i >= 0; i--) {
    const l = sketch.labels[i];
    if (Math.abs(p.x - l.x) < tol * 3 && Math.abs(p.y - l.y) < tol * 1.5) return { kind: "label", id: l.id };
  }
  for (let i = sketch.dims.length - 1; i >= 0; i--) {
    const d = sketch.dims[i];
    if (distToSegment(p, d.a, d.b) <= tol) return { kind: "dim", id: d.id };
  }
  for (let i = sketch.shapes.length - 1; i >= 0; i--) if (distToShape(sketch.shapes[i], p) <= tol) return { kind: "shape", id: sketch.shapes[i].id };
  for (let i = sketch.shapes.length - 1; i >= 0; i--) if (distToShape(sketch.shapes[i], p, true) === 0) return { kind: "shape", id: sketch.shapes[i].id };
  return null;
}

export function moveShape(s: SketchShape, dx: number, dy: number): SketchShape {
  if (s.kind === "rect") return { ...s, x: r1(s.x + dx), y: r1(s.y + dy) };
  if (s.kind === "circle") return { ...s, cx: r1(s.cx + dx), cy: r1(s.cy + dy) };
  return { ...s, points: s.points.map((q) => ({ x: r1(q.x + dx), y: r1(q.y + dy) })) };
}

export type Handle = { key: string; p: SketchPoint };

/** Grips for reshaping: rectangle corners, circle radius, polyline vertices (up to 60). */
export function shapeHandles(s: SketchShape): Handle[] {
  if (s.kind === "rect") return shapePoints(s).pts.map((p, i) => ({ key: `c${i}`, p }));
  if (s.kind === "circle") return [{ key: "r", p: { x: s.cx + s.r, y: s.cy } }];
  if (s.points.length > 60) return [];
  return s.points.map((p, i) => ({ key: `v${i}`, p }));
}

export function dragHandle(s: SketchShape, key: string, p: SketchPoint): SketchShape {
  if (s.kind === "rect") {
    const i = Number(key.slice(1));
    const corners = shapePoints(s).pts;
    const opp = corners[(i + 2) % 4];
    const w = Math.abs(p.x - opp.x), h = Math.abs(p.y - opp.y);
    if (w < 1 || h < 1) return s;
    return { ...s, x: r1(Math.min(p.x, opp.x)), y: r1(Math.min(p.y, opp.y)), w: r1(w), h: r1(h) };
  }
  if (s.kind === "circle") {
    const r = Math.hypot(p.x - s.cx, p.y - s.cy);
    return r < 1 ? s : { ...s, r: r1(r) };
  }
  const i = Number(key.slice(1));
  return { ...s, points: s.points.map((q, k) => (k === i ? { x: r1(p.x), y: r1(p.y) } : q)) };
}

/** Everything the eraser touches along a stroke from a to b. */
export function eraseHits(sketch: Sketch, a: SketchPoint, b: SketchPoint, tol: number): SketchHit[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(tol / 2, 1e-6)));
  const out = new Map<string, SketchHit>();
  for (let i = 0; i <= Math.min(steps, 200); i++) {
    const t = i / Math.min(steps, 200);
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (const s of sketch.shapes) if (distToShape(s, p) <= tol) out.set(s.id, { kind: "shape", id: s.id });
    for (const d of sketch.dims) if (distToSegment(p, d.a, d.b) <= tol) out.set(d.id, { kind: "dim", id: d.id });
    for (const l of sketch.labels) if (Math.abs(p.x - l.x) < tol * 3 && Math.abs(p.y - l.y) < tol * 1.5) out.set(l.id, { kind: "label", id: l.id });
  }
  return [...out.values()];
}

export function removeHits(sketch: Sketch, hits: SketchHit[]): Sketch {
  const ids = new Set(hits.map((h) => h.id));
  return { ...sketch, shapes: sketch.shapes.filter((s) => !ids.has(s.id)), dims: sketch.dims.filter((d) => !ids.has(d.id)), labels: sketch.labels.filter((l) => !ids.has(l.id)) };
}

export type SnapOptions = { grid: number | null; points: boolean; tol: number; exclude?: string; from?: SketchPoint | null };
export type SnapResult = { p: SketchPoint; kind: "point" | "grid" | "angle" | "none" };

/**
 * Snap a drawn point: to shape vertices, centres and crossings first (within
 * `tol`), then to the grid. With `from`, lines within 4° of horizontal or
 * vertical are straightened.
 */
export function snapSketch(sketch: Sketch, p: SketchPoint, o: SnapOptions, cache?: SketchPoint[]): SnapResult {
  if (o.points) {
    const cands = cache ?? sketchSnapPoints(sketch, o.exclude);
    let best: SketchPoint | null = null;
    let bd = o.tol;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= bd) {
        bd = d;
        best = c;
      }
    }
    if (best) return { p: { x: r1(best.x), y: r1(best.y) }, kind: "point" };
  }
  let q = p;
  let kind: SnapResult["kind"] = "none";
  if (o.from) {
    const ang = (Math.atan2(p.y - o.from.y, p.x - o.from.x) * 180) / Math.PI;
    const a = ((ang % 180) + 180) % 180;
    if (a < 4 || a > 176) {
      q = { x: p.x, y: o.from.y };
      kind = "angle";
    } else if (Math.abs(a - 90) < 4) {
      q = { x: o.from.x, y: p.y };
      kind = "angle";
    }
  }
  if (o.grid && o.grid > 0) {
    const g = o.grid;
    q = kind === "angle" ? (q.y === o.from!.y ? { x: Math.round(q.x / g) * g, y: q.y } : { x: q.x, y: Math.round(q.y / g) * g }) : { x: Math.round(q.x / g) * g, y: Math.round(q.y / g) * g };
    if (kind === "none") kind = "grid";
  }
  return { p: { x: r1(q.x), y: r1(q.y) }, kind };
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function sketchBounds(sketch: Sketch): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: SketchPoint) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of sketch.shapes) {
    if (s.kind === "circle") {
      add({ x: s.cx - s.r, y: s.cy - s.r });
      add({ x: s.cx + s.r, y: s.cy + s.r });
    } else shapePoints(s).pts.forEach(add);
  }
  sketch.dims.forEach((d) => {
    add(d.a);
    add(d.b);
  });
  sketch.labels.forEach((l) => add(l));
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export function polyLength(pts: SketchPoint[], closed: boolean): number {
  let L = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) L += Math.hypot(pts[(i + 1) % pts.length].x - pts[i].x, pts[(i + 1) % pts.length].y - pts[i].y);
  return L;
}

let seq = 0;
export const newSketchId = (prefix = "s") => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
