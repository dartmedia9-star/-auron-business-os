import * as THREE from "three";
import {
  add,
  dist,
  EPS,
  normalize,
  objectFootprint,
  offsetPolygon,
  openingGeometry,
  outwardNormal,
  rectCorners,
  roomAt,
  scale,
  signedArea,
  sub,
  isRendered,
  objectParts,
  partFaces,
  type Part,
  type SolidPart,
  type Tone,
  type Opening,
  type OpeningKind,
  type ProjectModel,
  type Vec2,
} from "@workspace/design-model";

// ---------------------------------------------------------------------------
// Turns the shared plan model into 3D geometry. Pure functions (no React, no
// WebGL) so they are unit-tested in Node.
//
// Axes: plan x → world x, plan y (down the screen) → world z, height → world
// y. Plan millimetres become metres. Seen from above with the camera's "up"
// pointing to -z, the 3D view matches the 2D plan exactly (no mirroring).
// A plan rotation of θ degrees (clockwise on screen) is a world rotation of
// -θ about y.
// ---------------------------------------------------------------------------

export const MM = 0.001;

export const toWorld = (p: Vec2, yMm = 0): THREE.Vector3 => new THREE.Vector3(p.x * MM, yMm * MM, p.y * MM);
export const rotationY = (deg: number): number => (-deg * Math.PI) / 180;

/** Flat polygon at height `yMm`, facing up. */
export function floorGeometry(points: Vec2[], yMm: number): THREE.BufferGeometry {
  const contour = points.map((p) => new THREE.Vector2(p.x, p.y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  for (const t of tris) {
    let [a, b, c] = t.map((i) => points[i]);
    // Up-facing in world space means clockwise in plan (y down).
    if (signedArea([a, b, c]) < 0) [b, c] = [c, b];
    for (const p of [a, c, b]) pos.push(p.x * MM, yMm * MM, p.y * MM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Vertical prism over a plan polygon, from y0 to y1 (mm), with flat normals. */
export function prismGeometry(points: Vec2[], y0: number, y1: number): THREE.BufferGeometry {
  const pts = signedArea(points) < 0 ? [...points].reverse() : points; // clockwise in plan
  const pos: number[] = [];
  const push = (p: Vec2, y: number) => pos.push(p.x * MM, y * MM, p.y * MM);
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map((p) => new THREE.Vector2(p.x, p.y)),
    [],
  );
  for (const t of tris) {
    let [a, b, c] = t.map((i) => pts[i]);
    if (signedArea([a, b, c]) < 0) [b, c] = [c, b];
    // top (faces +y)
    push(a, y1); push(c, y1); push(b, y1);
    // bottom (faces -y)
    push(a, y0); push(b, y0); push(c, y0);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // Clockwise in plan: the outside is to the left of a→b; wind so it faces out.
    push(a, y0); push(b, y1); push(b, y0);
    push(a, y0); push(a, y1); push(b, y1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export const polygonVolume = (points: Vec2[], y0: number, y1: number): number => Math.abs(signedArea(points)) * (y1 - y0);

// ---------------------------------------------------------------- walls ----

export type WallPiece = {
  key: string;
  hostId: string;
  hostKind: "room" | "partition";
  edgeIndex: number;
  /** Plan footprint of the piece (a quad). */
  points: Vec2[];
  y0: number;
  y1: number;
  /** Unit normal pointing out of the room (partitions: to the left of the run). */
  normal: Vec2;
  color: string;
};

type Span = { s0: number; s1: number; sill: number; top: number };

/**
 * Cuts one straight wall into solid pieces around its openings: full-height
 * pieces between openings, plus the wall below each window sill and above
 * each head. `side0(s)` and `side1(s)` give the two faces at distance `s`.
 */
function cutWall(length: number, height: number, openings: Span[], side0: (s: number) => Vec2, side1: (s: number) => Vec2): Array<{ points: Vec2[]; y0: number; y1: number }> {
  const out: Array<{ points: Vec2[]; y0: number; y1: number }> = [];
  const quad = (s0: number, s1: number) => [side0(s0), side0(s1), side1(s1), side1(s0)];
  const spans = openings
    .map((o) => ({ ...o, s0: Math.max(0, o.s0), s1: Math.min(length, o.s1), top: Math.min(height, o.top) }))
    .filter((o) => o.s1 - o.s0 > EPS && o.sill < height)
    .sort((a, b) => a.s0 - b.s0);
  // Full-height pieces: the wall minus the union of the opening spans.
  let cursor = 0;
  for (const o of spans) {
    if (o.s0 > cursor + EPS) out.push({ points: quad(cursor, o.s0), y0: 0, y1: height });
    cursor = Math.max(cursor, o.s1);
  }
  if (length > cursor + EPS) out.push({ points: quad(cursor, length), y0: 0, y1: height });
  for (const o of spans) {
    if (o.sill > EPS) out.push({ points: quad(o.s0, o.s1), y0: 0, y1: o.sill });
    if (o.top < height - EPS) out.push({ points: quad(o.s0, o.s1), y0: o.top, y1: height });
  }
  return out;
}

function spansFor(model: ProjectModel, hostId: string, vertexId: string): Span[] {
  return model.openings
    .filter((o) => !o.hidden && o.hostId === hostId && o.startVertexId === vertexId)
    .map((o) => ({ s0: o.offset, s1: o.offset + o.width, sill: o.sill, top: o.sill + o.height }));
}

export function wallPieces(model: ProjectModel): WallPiece[] {
  const pieces: WallPiece[] = [];
  for (const room of model.rooms) {
    if (room.hidden || !room.showWalls || room.wallThickness <= 0) continue;
    const pts = room.points;
    const outer = offsetPolygon(pts, room.wallThickness);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const length = dist(a, b);
      if (length < EPS) continue;
      const dir = normalize(sub(b, a));
      const normal = outwardNormal(pts, i);
      const inner = (s: number) => add(a, scale(dir, s));
      const outerAt = (s: number) => (s <= EPS ? outer[i] : s >= length - EPS ? outer[(i + 1) % n] : add(inner(s), scale(normal, room.wallThickness)));
      cutWall(length, room.wallHeight, spansFor(model, room.id, a.id), inner, outerAt).forEach((p, k) =>
        pieces.push({ key: `${room.id}:${i}:${k}`, hostId: room.id, hostKind: "room", edgeIndex: i, normal, color: room.wallColor, ...p }),
      );
    }
  }
  for (const part of model.partitions) {
    if (part.hidden) continue;
    const pts = part.points;
    const h = part.thickness / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const length = dist(a, b);
      if (length < EPS) continue;
      const dir = normalize(sub(b, a));
      const normal = { x: dir.y, y: -dir.x };
      // Overlap interior joints by half the thickness so corners close.
      const ext0 = i > 0 ? h : 0;
      const ext1 = i < pts.length - 2 ? h : 0;
      const at = (s: number, side: number) => add(add(a, scale(dir, s < EPS ? -ext0 : s > length - EPS ? length + ext1 : s)), scale(normal, side * h));
      cutWall(length, part.height, spansFor(model, part.id, a.id), (s) => at(s, -1), (s) => at(s, 1)).forEach((p, k) =>
        pieces.push({ key: `${part.id}:${i}:${k}`, hostId: part.id, hostKind: "partition", edgeIndex: i, normal, color: part.color, ...p }),
      );
    }
  }
  return pieces;
}

// ------------------------------------------------------------- generic ----

export type { Tone };

/** A box in plan space: centre (plan mm), bottom height, size along its own axes, plan rotation. */
export type PlanBox = { cx: number; cy: number; y0: number; w: number; d: number; h: number; rot: number; tone: Tone; color?: string };

// ------------------------------------------------------------ openings ----

const FRAME = 50;

/** Frames, glass and exit signs that dress each opening. */
export function openingDressing(model: ProjectModel, o: Opening): PlanBox[] {
  if (o.hidden) return [];
  const g = openingGeometry(model, o);
  if (!g) return [];
  const rot = (Math.atan2(g.dir.y, g.dir.x) * 180) / Math.PI;
  // Centre of the wall's thickness at the opening's mid point.
  const midRef = scale(add(g.a, g.b), 0.5);
  const c = g.hostKind === "room" ? add(midRef, scale(g.normal, g.thickness / 2)) : midRef;
  const top = Math.min(o.sill + o.height, g.wallHeight);
  const out: PlanBox[] = [];
  const kind: OpeningKind = o.kind;
  if (kind === "window") {
    out.push({ cx: c.x, cy: c.y, y0: o.sill, w: o.width, d: 12, h: top - o.sill, rot, tone: "glass" });
  }
  if (kind === "door" || kind === "double_door" || kind === "emergency_exit" || kind === "loading" || kind === "window") {
    const along = (s: number) => add(c, scale(g.dir, s));
    const j1 = along(-o.width / 2 + FRAME / 2);
    const j2 = along(o.width / 2 - FRAME / 2);
    const depth = g.thickness + 10;
    out.push({ cx: j1.x, cy: j1.y, y0: o.sill, w: FRAME, d: depth, h: top - o.sill, rot, tone: "frame" });
    out.push({ cx: j2.x, cy: j2.y, y0: o.sill, w: FRAME, d: depth, h: top - o.sill, rot, tone: "frame" });
    out.push({ cx: c.x, cy: c.y, y0: top - FRAME, w: o.width, d: depth, h: FRAME, rot, tone: "frame" });
    if (kind === "window" && o.sill > 0) out.push({ cx: c.x, cy: c.y, y0: o.sill, w: o.width, d: depth + 40, h: FRAME / 2, rot, tone: "frame" });
  }
  if (kind === "emergency_exit" && top + 260 < g.wallHeight) {
    // Green running-man sign above the exit, on the room side.
    const inside = g.hostKind === "room" ? add(midRef, scale(g.normal, -40)) : add(midRef, scale(g.normal, -(g.thickness / 2 + 40)));
    out.push({ cx: inside.x, cy: inside.y, y0: top + 80, w: Math.min(500, o.width), d: 40, h: 180, rot, tone: "exit" });
  }
  return out;
}

// ------------------------------------------------------------- pillars ----

/** Height of a pillar: its own, or the room it stands in, or 3 m. */
export function pillarHeight(model: ProjectModel, p: { x: number; y: number; height: number }): number {
  if (p.height > 0) return p.height;
  return roomAt(model, p)?.wallHeight ?? model.rooms[0]?.wallHeight ?? 3000;
}

// ------------------------------------------------------------- objects ----

// Object geometry is defined once, as solid parts, in the shared model
// (lib/design-model: objects/ for built-ins, custom.ts for Custom Builder
// recipes). Here the parts become merged three.js geometry: one buffer per
// colour, so a truss arch with hundreds of members is still a few draw calls.

export { objectParts };
export type { Part };

export type MeshGroup = { key: string; tone: Tone; color: string; geometry: THREE.BufferGeometry };

/** Merged, flat-shaded geometry for a set of parts (metres), grouped by colour. */
export function partsGeometry(parts: Part[], colorOf: (p: SolidPart) => string, detail: "render" | "thumb" = "render"): MeshGroup[] {
  const groups = new Map<string, { tone: Tone; color: string; pos: number[] }>();
  for (const p of parts) {
    if (!isRendered(p)) continue;
    const color = colorOf(p);
    const key = `${p.tone}:${color}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { tone: p.tone, color, pos: [] }));
    for (const f of partFaces(p, detail)) {
      // Fan-triangulate each (convex) face.
      for (let i = 1; i < f.length - 1; i++) for (const q of [f[0], f[i], f[i + 1]]) g.pos.push(q[0] * MM, q[1] * MM, q[2] * MM);
    }
  }
  return [...groups.entries()].map(([key, g]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { key, tone: g.tone, color: g.color, geometry };
  });
}

/** The LED module grid parts of an object (drawn as lines, not solids). */
export const gridParts = (parts: Part[]) => parts.filter((p): p is Extract<Part, { kind: "grid" }> => p.kind === "grid");

/** World transform of an object (and pillar/section) centre. */
export function planTransform(e: { x: number; y: number; rotation: number }, elevationMm = 0): { position: [number, number, number]; rotationY: number } {
  return { position: [e.x * MM, elevationMm * MM, e.y * MM], rotationY: rotationY(e.rotation) };
}

/** Floor outline of a section or object footprint. */
export const footprint = (e: { x: number; y: number; width: number; depth: number; rotation: number }): Vec2[] => rectCorners(e.x, e.y, e.width, e.depth, e.rotation);

// ------------------------------------------------------------ framing ----

export type SceneBounds = { center: THREE.Vector3; size: THREE.Vector3; radius: number };

/** Box around everything visible, for preset views and fit. */
export function sceneBounds(model: ProjectModel): SceneBounds {
  const b = new THREE.Box3();
  const addPlan = (p: Vec2, yMm: number) => b.expandByPoint(toWorld(p, yMm));
  for (const r of model.rooms) {
    if (r.hidden) continue;
    const pts = r.showWalls && r.wallThickness > 0 ? offsetPolygon(r.points, r.wallThickness) : r.points;
    for (const p of pts) {
      addPlan(p, 0);
      addPlan(p, r.wallHeight);
    }
  }
  for (const pt of model.partitions) if (!pt.hidden) for (const p of pt.points) { addPlan(p, 0); addPlan(p, pt.height); }
  for (const s of model.sections) if (!s.hidden) for (const p of footprint(s)) addPlan(p, 0);
  for (const o of model.objects) if (!o.hidden) for (const p of objectFootprint(o)) { addPlan(p, o.elevation); addPlan(p, o.elevation + o.height); }
  for (const p of model.pillars) if (!p.hidden) { addPlan({ x: p.x - p.width / 2, y: p.y - p.depth / 2 }, 0); addPlan({ x: p.x + p.width / 2, y: p.y + p.depth / 2 }, pillarHeight(model, p)); }
  if (b.isEmpty()) b.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const center = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3());
  return { center, size, radius: Math.max(1, size.length() / 2) };
}

export type ViewName = "perspective" | "top" | "front" | "back" | "left" | "right";

export const VIEW_DIRS: Record<ViewName, THREE.Vector3> = {
  perspective: new THREE.Vector3(0.75, 0.85, 1.1).normalize(),
  // A hair off vertical so orbit controls keep a stable "up"; screen-up is -z (plan north).
  top: new THREE.Vector3(0, 1, 0.0008).normalize(),
  front: new THREE.Vector3(0, 0.22, 1).normalize(),
  back: new THREE.Vector3(0, 0.22, -1).normalize(),
  left: new THREE.Vector3(-1, 0.22, 0).normalize(),
  right: new THREE.Vector3(1, 0.22, 0).normalize(),
};

/** Camera position that frames the bounds from a direction. */
export function framePosition(bounds: SceneBounds, dir: THREE.Vector3, fovDeg: number, aspect: number): THREE.Vector3 {
  const half = (fovDeg * Math.PI) / 360;
  const fitV = bounds.radius / Math.sin(half);
  const fitH = bounds.radius / Math.sin(Math.atan(Math.tan(half) * Math.max(0.1, aspect)));
  const d = Math.max(fitV, fitH) * 1.02;
  return bounds.center.clone().add(dir.clone().multiplyScalar(d));
}
