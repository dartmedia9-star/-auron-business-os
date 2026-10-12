import type { Vec2 } from "./schema";

// Plain 2D geometry on plan coordinates (mm, y down). Pure functions only.

export const EPS = 1e-6;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand normal on screen (y down): rotates +x towards -y. */
export const perp = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });

export function rotate(p: Vec2, deg: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/** Shoelace signed area. Positive = clockwise on screen (y down). */
export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (pts: Vec2[]): number => Math.abs(signedArea(pts));

export function perimeter(pts: Vec2[], closed = true): number {
  let p = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) p += dist(pts[i], pts[(i + 1) % pts.length]);
  return p;
}

export function centroid(pts: Vec2[]): Vec2 {
  const a = signedArea(pts);
  if (Math.abs(a) < EPS) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(pts: Vec2[]): Bounds | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

/** Even-odd point in polygon; points on the boundary count as inside. */
export function pointInPolygon(p: Vec2, poly: Vec2[], tol = 0.5): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= tol) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = lerp(a, b, t);
  return { t, point, distance: dist(p, point) };
}

export const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => projectOnSegment(p, a, b).distance;

/** Proper intersection of segments ab and cd (shared endpoints don't count). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** True when any two non-adjacent edges of a closed polygon cross. */
export function isSelfIntersecting(pts: Vec2[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Corners of a rotated rectangle given its centre, size and rotation. */
export function rectCorners(cx: number, cy: number, width: number, depth: number, rotation: number): Vec2[] {
  const hw = width / 2;
  const hd = depth / 2;
  const c = { x: cx, y: cy };
  return [v(cx - hw, cy - hd), v(cx + hw, cy - hd), v(cx + hw, cy + hd), v(cx - hw, cy + hd)].map((p) => (rotation ? rotate(p, rotation, c) : p));
}

/**
 * Offsets a closed polygon outward by `d` using mitred corners (clamped so a
 * very sharp corner can't spike out). Output has the same vertex order.
 */
export function offsetPolygon(pts: Vec2[], d: number): Vec2[] {
  const n = pts.length;
  if (n < 3 || d === 0) return pts.map((p) => ({ ...p }));
  // Outward normal depends on winding: for clockwise-on-screen (positive area)
  // polygons the left normal points out.
  const sign = signedArea(pts) > 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const n1 = scale(perp(normalize(sub(cur, prev))), sign);
    const n2 = scale(perp(normalize(sub(next, cur))), sign);
    const bis = normalize(add(n1, n2));
    const cosHalf = dot(bis, n2);
    if (len(bis) < EPS || Math.abs(cosHalf) < 0.2) {
      // Near-reversal: fall back to the edge normal.
      out.push(add(cur, scale(n2, d)));
    } else {
      out.push(add(cur, scale(bis, d / cosHalf)));
    }
  }
  return out;
}

/** Outward unit normal of edge i of a closed polygon. */
export function outwardNormal(pts: Vec2[], i: number): Vec2 {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const sign = signedArea(pts) > 0 ? 1 : -1;
  return scale(perp(normalize(sub(b, a))), sign);
}

/** Separating-axis overlap test for two convex polygons (touching = no overlap). */
export function convexOverlap(a: Vec2[], b: Vec2[], tol = 0.5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const axis = perp(normalize(sub(poly[(i + 1) % poly.length], poly[i])));
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of a) { const s = dot(p, axis); aMin = Math.min(aMin, s); aMax = Math.max(aMax, s); }
      for (const p of b) { const s = dot(p, axis); bMin = Math.min(bMin, s); bMax = Math.max(bMax, s); }
      if (aMax <= bMin + tol || bMax <= aMin + tol) return false;
    }
  }
  return true;
}

export const snapTo = (value: number, step: number): number => (step > 0 ? Math.round(value / step) * step : value);
export const snapVec = (p: Vec2, step: number): Vec2 => ({ x: snapTo(p.x, step), y: snapTo(p.y, step) });

/** Constrains `p` so that from → p is at a multiple of `stepDeg` degrees. */
export function snapAngle(from: Vec2, p: Vec2, stepDeg = 45): Vec2 {
  const d = sub(p, from);
  const l = len(d);
  if (l < EPS) return p;
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(d.y, d.x) / step) * step;
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l };
}

/** Angle of a→b in degrees, 0 = +x, clockwise on screen. */
export const angleDeg = (a: Vec2, b: Vec2): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
