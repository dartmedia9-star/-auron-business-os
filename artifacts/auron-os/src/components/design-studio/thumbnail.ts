import { isRendered, partColor, partFaces, type Part, type V3 } from "@workspace/design-model";

// Small isometric pictures of objects for the library, drawn from the same
// parts as the 3D view and the plan (no images are stored). Faces are
// projected, back faces dropped, and the rest painted far to near with a
// fixed light, which is plenty for a 64–120 px card.

export type ThumbPoly = { d: string; fill: string; opacity: number };
export type Thumb = { viewBox: string; polys: ThumbPoly[] };

const YAW = (-32 * Math.PI) / 180; // seen from the front, a little to the right
const PITCH = (24 * Math.PI) / 180; // and from above
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
const LIGHT: V3 = norm([0.45, 1, 0.75]);

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Object frame (x across, y up, z to the front) → screen x, screen y (down), depth (towards the viewer). */
function project([x, y, z]: V3): [number, number, number] {
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  return [x1, -(y * cp - z1 * sp), z1 * cp + y * sp];
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const MAX_FACES = 6000;

export function thumbnail(parts: Part[], colors: { color: string; accentColor: string }): Thumb | null {
  type F = { pts: Array<[number, number]>; depth: number; fill: string; opacity: number };
  const faces: F[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parts) {
    if (!isRendered(p)) continue;
    const base = p.tone === "screen" ? "#0b1220" : partColor(colors, p);
    const glass = p.tone === "glass";
    for (const f of partFaces(p, "thumb")) {
      if (f.length < 3 || faces.length >= MAX_FACES) continue;
      const pr = f.map(project);
      // Signed area on screen (y down): a face seen from outside is clockwise here.
      let area = 0;
      for (let i = 0; i < pr.length; i++) {
        const a = pr[i], b = pr[(i + 1) % pr.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (!glass && area >= 0) continue;
      // World normal from the first three non-collinear points.
      const [a, b, c] = f;
      const n = norm([
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ]);
      const lit = 0.58 + 0.42 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      let depth = 0;
      for (const q of pr) {
        depth += q[2];
        minX = Math.min(minX, q[0]);
        maxX = Math.max(maxX, q[0]);
        minY = Math.min(minY, q[1]);
        maxY = Math.max(maxY, q[1]);
      }
      faces.push({ pts: pr.map((q) => [q[0], q[1]]), depth: depth / pr.length, fill: shade(base, lit), opacity: glass ? 0.35 : 1 });
    }
  }
  if (!faces.length || !Number.isFinite(minX)) return null;
  faces.sort((a, b) => a.depth - b.depth);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.06;
  // Scale to a 100-unit box so path strings stay short.
  const s = 100 / (span + pad * 2);
  const ox = minX - pad - (span - (maxX - minX)) / 2;
  const oy = minY - pad - (span - (maxY - minY)) / 2;
  const polys = faces.map((f) => ({
    d: "M" + f.pts.map(([x, y]) => `${((x - ox) * s).toFixed(1)} ${((y - oy) * s).toFixed(1)}`).join("L") + "Z",
    fill: f.fill,
    opacity: f.opacity,
  }));
  return { viewBox: "0 0 100 100", polys };
}

const cache = new Map<string, Thumb | null>();

/** Cached thumbnail; `key` must change whenever the parts or colours do. */
export function cachedThumbnail(key: string, make: () => { parts: Part[]; color: string; accentColor: string }): Thumb | null {
  if (cache.has(key)) return cache.get(key)!;
  const { parts, ...colors } = make();
  let t: Thumb | null = null;
  try {
    t = thumbnail(parts, colors);
  } catch {
    t = null;
  }
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, t);
  return t;
}
