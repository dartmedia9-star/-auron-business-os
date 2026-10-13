import type { Vec2 } from "./schema";
import { signedArea } from "./geometry";

// ---------------------------------------------------------------------------
// Solid parts: the one geometric description of every event object, built-in
// or custom. Plain numbers only (no three.js), so the same parts feed the 3D
// mesh, the 2D plan symbol, library thumbnails, bounds checks and tests.
//
// Object frame, in millimetres: x across the object (its width), y up from
// its base, z towards its front (plan +y of the object's own axes). The
// footprint is centred on x = 0, z = 0.
// ---------------------------------------------------------------------------

export type Tone = "body" | "accent" | "screen" | "metal" | "glass" | "frame" | "exit" | "dark" | "light" | "top";

export type V3 = [number, number, number];

type PartMeta = {
  tone: Tone;
  /** Explicit colour (custom parts); otherwise the tone decides. */
  color?: string;
  /** What the part is (leg, beam, top, body…), for tests and readers. */
  role?: string;
  /** Leave out of the 2D plan symbol (truss lacing, small hardware). */
  plan?: false;
  /** Allowed to stand outside the footprint (front steps, chairs). */
  outside?: true;
  /** Plan-only outline (e.g. a truss member's square): not drawn in 3D. */
  render?: false;
};

/** Plane a profile is drawn in. front: (x, up); side: (z, up); top: plan (x, z). */
export type ProfilePlane = "front" | "side" | "top";

export type Part =
  /** Box: centre x / z, base y, size w (x) × h (y) × d (z), optional turn about the vertical (degrees, clockwise from above). */
  | ({ kind: "box"; x: number; y: number; z: number; w: number; h: number; d: number; ry?: number } & PartMeta)
  /** Vertical cylinder (or cone when r2 is set): centre x / z, base y. */
  | ({ kind: "cylinder"; x: number; y: number; z: number; r: number; r2?: number; h: number } & PartMeta)
  /** Straight member from a to b with a square (or round) section of `size`. */
  | ({ kind: "beam"; a: V3; b: V3; size: number; round?: boolean } & PartMeta)
  /**
   * Prism: a closed profile extruded at a right angle to its plane, from
   * `at` to `at + depth` along the remaining axis. Profile points are in the
   * plane's own (u, v): front (x, y), side (z, y), top (x, z).
   */
  | ({ kind: "prism"; plane: ProfilePlane; profile: Vec2[]; at: number; depth: number } & PartMeta)
  /** LED module lines on the face at z, from y up by h. */
  | { kind: "grid"; z: number; y: number; w: number; h: number; cell: number; tone?: undefined; role?: string; plan?: false; outside?: undefined; render?: undefined };

export type SolidPart = Exclude<Part, { kind: "grid" }>;

/** Parts that are drawn as 3D solids. */
export const isRendered = (p: Part): p is SolidPart => p.kind !== "grid" && p.render !== false;

export const box = (x: number, y: number, z: number, w: number, h: number, d: number, tone: Tone = "body", meta: Omit<PartMeta, "tone"> & { ry?: number } = {}): Part => ({ kind: "box", x, y, z, w, h, d, tone, ...meta });
export const cyl = (x: number, y: number, z: number, r: number, h: number, tone: Tone = "body", meta: Omit<PartMeta, "tone"> & { r2?: number } = {}): Part => ({ kind: "cylinder", x, y, z, r, h, tone, ...meta });
export const beam = (a: V3, b: V3, size: number, tone: Tone = "metal", meta: Omit<PartMeta, "tone"> & { round?: boolean } = {}): Part => ({ kind: "beam", a, b, size, tone, ...meta });
export const prism = (plane: ProfilePlane, profile: Vec2[], at: number, depth: number, tone: Tone = "body", meta: Omit<PartMeta, "tone"> = {}): Part => ({ kind: "prism", plane, profile, at, depth, tone, ...meta });

/** Default colour of each tone; body / accent / screen follow the object's own colours. */
export const TONE_DEFAULTS: Record<Tone, string> = {
  body: "#9aa0aa",
  accent: "#2b2f3a",
  screen: "#3b82f6",
  metal: "#b9bcc4",
  glass: "#a8d0ef",
  frame: "#d8d4cc",
  exit: "#16a34a",
  dark: "#1d1f26",
  light: "#f4f2ec",
  top: "#2b2f3a",
};

/** The colour a part is drawn in (3D, plan and thumbnails alike). */
export function partColor(o: { color: string; accentColor: string }, p: SolidPart): string {
  if (p.color) return p.color;
  if (p.tone === "body") return o.color;
  if (p.tone === "accent" || p.tone === "screen") return o.accentColor;
  return TONE_DEFAULTS[p.tone];
}

// --------------------------------------------------------------- faces ----

/** A planar polygon, counter-clockwise seen from outside the solid. */
export type Face = V3[];

const CYL_SEGMENTS = { render: 32, thumb: 12 } as const;

function boxFaces(p: Extract<Part, { kind: "box" }>): Face[] {
  const hw = p.w / 2;
  const hd = p.d / 2;
  const y0 = p.y;
  const y1 = p.y + p.h;
  const a = ((p.ry ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Clockwise on the plan (from above, z towards the viewer) = +θ about -y.
  const at = (lx: number, y: number, lz: number): V3 => [p.x + lx * c - lz * s, y, p.z + lx * s + lz * c];
  const b0 = at(-hw, y0, -hd), b1 = at(hw, y0, -hd), b2 = at(hw, y0, hd), b3 = at(-hw, y0, hd);
  const t0 = at(-hw, y1, -hd), t1 = at(hw, y1, -hd), t2 = at(hw, y1, hd), t3 = at(-hw, y1, hd);
  return [
    [t0, t3, t2, t1], // top
    [b0, b1, b2, b3], // bottom
    [b3, b2, t2, t3], // front (+z)
    [b1, b0, t0, t1], // back
    [b2, b1, t1, t2], // right (+x)
    [b0, b3, t3, t0], // left
  ];
}

function cylinderFaces(p: Extract<Part, { kind: "cylinder" }>, n: number): Face[] {
  const r2 = p.r2 ?? p.r;
  const bottom: V3[] = [];
  const top: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    bottom.push([p.x + Math.cos(t) * p.r, p.y, p.z + Math.sin(t) * p.r]);
    top.push([p.x + Math.cos(t) * r2, p.y + p.h, p.z + Math.sin(t) * r2]);
  }
  const faces: Face[] = [[...top].reverse(), bottom];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([bottom[i], top[i], top[j], bottom[j]]);
  }
  return faces;
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => {
  const l = len3(a);
  return l > 0 ? mul3(a, 1 / l) : [0, 0, 0];
};

function beamFaces(p: Extract<Part, { kind: "beam" }>, n: number): Face[] {
  const axis = sub3(p.b, p.a);
  if (len3(axis) < 1e-6) return [];
  const u = norm3(axis);
  // A side vector that is never parallel to the axis.
  const ref: V3 = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const v = norm3(cross3(u, ref));
  const w = cross3(u, v);
  const k = p.round ? Math.max(6, Math.round(n / 2)) : 4;
  const r = p.round ? p.size / 2 : (p.size / 2) * Math.SQRT2;
  const ring = (c: V3): V3[] =>
    Array.from({ length: k }, (_, i) => {
      const t = (i / k) * Math.PI * 2 + (p.round ? 0 : Math.PI / 4);
      return add3(c, add3(mul3(v, Math.cos(t) * r), mul3(w, Math.sin(t) * r)));
    });
  const ra = ring(p.a);
  const rb = ring(p.b);
  // Ring order runs counter-clockwise about u, so the cap at b faces +u.
  const faces: Face[] = [[...ra].reverse(), rb];
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    faces.push([ra[i], ra[j], rb[j], rb[i]]);
  }
  return faces;
}

/** Ear-clipping triangulation of a simple polygon; returns index triples. */
export function triangulate(pts: Vec2[]): Array<[number, number, number]> {
  const n = pts.length;
  if (n < 3) return [];
  const ccw = signedArea(pts) > 0;
  const idx = Array.from({ length: n }, (_, i) => (ccw ? i : n - 1 - i));
  const out: Array<[number, number, number]> = [];
  const area2 = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) => area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (area2(a, b, c) <= 1e-9) continue;
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate input: stop rather than loop
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

function prismFaces(p: Extract<Part, { kind: "prism" }>): Face[] {
  const pts = p.profile;
  if (pts.length < 3 || Math.abs(signedArea(pts)) < 1e-6) return [];
  const ccw = signedArea(pts) > 0 ? pts : [...pts].reverse();
  // Map (u, v, s) → object frame, where s runs along the extrusion axis.
  const map = (u: number, v: number, s: number): V3 => (p.plane === "front" ? [u, v, s] : p.plane === "side" ? [s, v, u] : [u, s, v]);
  const s0 = p.at;
  const s1 = p.at + p.depth;
  // In each plane, (u, v, s) is right-handed for front and left-handed for
  // side/top; flip the winding there so faces still point outwards.
  const flip = p.plane !== "front";
  const faces: Face[] = [];
  const tris = triangulate(ccw);
  for (const [a, b, c] of tris) {
    const A = ccw[a], B = ccw[b], C = ccw[c];
    const near: Face = [map(A.x, A.y, s0), map(C.x, C.y, s0), map(B.x, B.y, s0)];
    const far: Face = [map(A.x, A.y, s1), map(B.x, B.y, s1), map(C.x, C.y, s1)];
    faces.push(flip ? [...near].reverse() : near, flip ? [...far].reverse() : far);
  }
  for (let i = 0; i < ccw.length; i++) {
    const A = ccw[i];
    const B = ccw[(i + 1) % ccw.length];
    const side: Face = [map(A.x, A.y, s0), map(B.x, B.y, s0), map(B.x, B.y, s1), map(A.x, A.y, s1)];
    faces.push(flip ? [...side].reverse() : side);
  }
  return faces;
}

export function partFaces(p: Part, detail: keyof typeof CYL_SEGMENTS = "render"): Face[] {
  switch (p.kind) {
    case "box":
      return boxFaces(p);
    case "cylinder":
      return cylinderFaces(p, CYL_SEGMENTS[detail]);
    case "beam":
      return beamFaces(p, CYL_SEGMENTS[detail]);
    case "prism":
      return prismFaces(p);
    case "grid":
      return [];
  }
}

// -------------------------------------------------------------- bounds ----

export type Box3 = { min: V3; max: V3 };

export function partBounds(p: Part): Box3 | null {
  if (p.kind === "grid") return null; // lines drawn on a face, no volume
  if (p.kind === "cylinder") {
    const r = Math.max(p.r, p.r2 ?? p.r);
    return { min: [p.x - r, p.y, p.z - r], max: [p.x + r, p.y + p.h, p.z + r] };
  }
  if (p.kind === "beam" && p.round) {
    // Exact: a round member reaches r·√(1 − u²) past its axis ends along each axis.
    const ax = sub3(p.b, p.a);
    const L = len3(ax);
    if (L < 1e-6) return null;
    const r = p.size / 2;
    const min: V3 = [0, 0, 0];
    const max: V3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const e = r * Math.sqrt(Math.max(0, 1 - (ax[i] / L) ** 2));
      min[i] = Math.min(p.a[i], p.b[i]) - e;
      max[i] = Math.max(p.a[i], p.b[i]) + e;
    }
    return { min, max };
  }
  const faces = partFaces(p, "thumb");
  if (!faces.length) return null;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const q of f) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], q[i]);
    max[i] = Math.max(max[i], q[i]);
  }
  return { min, max };
}

export function partsBounds(parts: Part[], filter: (p: Part) => boolean = () => true): Box3 | null {
  let out: Box3 | null = null;
  for (const p of parts) {
    if (!filter(p)) continue;
    const b = partBounds(p);
    if (!b) continue;
    if (!out) out = { min: [...b.min] as V3, max: [...b.max] as V3 };
    else for (let i = 0; i < 3; i++) {
      out.min[i] = Math.min(out.min[i], b.min[i]);
      out.max[i] = Math.max(out.max[i], b.max[i]);
    }
  }
  return out;
}

/** True when every coordinate of every face is a finite number. */
export function partsFinite(parts: Part[]): boolean {
  for (const p of parts) for (const f of partFaces(p, "thumb")) for (const q of f) if (!q.every(Number.isFinite)) return false;
  return true;
}

// ---------------------------------------------------------- plan view ----

/** Outline of a part seen from above, in object-frame plan coordinates (x, z). */
export type PlanOutline = { kind: "poly"; pts: Vec2[] } | { kind: "circle"; c: Vec2; r: number };

function hull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const crossO = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossO(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossO(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function partPlanOutline(p: Part): PlanOutline | null {
  if (p.kind === "grid" || p.plan === false) return null;
  if (p.kind === "cylinder") return { kind: "circle", c: { x: p.x, y: p.z }, r: Math.max(p.r, p.r2 ?? p.r) };
  if (p.kind === "prism" && p.plane === "top") return { kind: "poly", pts: p.profile.map((q) => ({ x: q.x, y: q.y })) };
  const pts = partFaces(p, "thumb").flatMap((f) => f.map((q) => ({ x: q[0], y: q[2] })));
  const h = hull(pts);
  return h.length >= 3 ? { kind: "poly", pts: h } : null;
}
