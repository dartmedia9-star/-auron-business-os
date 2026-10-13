import type { Vec2 } from "./schema";
import { segmentsIntersect } from "./geometry";
import { beam, box, cyl, partsBounds, prism, type Part, type V3 } from "./parts";
import { counterParts } from "./objects/furniture";
import { paramReader } from "./objects/kit";
import {
  CUSTOM_LIMITS,
  customSpecSchema,
  type Construction,
  type CustomPart,
  type CustomSpec,
  type Sketch,
  type SketchPoint,
  type SketchShape,
  type TemplateId,
  type TemplateRef,
} from "./custom-schema";

// ---------------------------------------------------------------------------
// Custom objects: recipe → solid parts, sizing, resizing, and the Custom
// Builder's drawing → recipe step. All deterministic; nothing is inferred
// that the user didn't choose (the construction method, depth, thickness
// and section are always explicit).
// ---------------------------------------------------------------------------

const r1 = (n: number) => Math.round(n * 10) / 10;

type Extent = { minX: number; maxX: number; minY: number; maxY: number };

function extentOf(points: SketchPoint[]): Extent {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

const allPoints = (spec: CustomSpec): SketchPoint[] =>
  "profiles" in spec ? spec.profiles.flat() : spec.method === "frame" ? spec.segments.flatMap((s) => [s.a, s.b]) : [];

/**
 * Maps a drawn coordinate so the drawing's outer edge is the outer face of
 * the members: centrelines move in by half the section. Along an axis with
 * no extent (a single straight beam) everything sits on the centre.
 */
function insetAxis(lo: number, hi: number, s: number): (v: number) => number {
  const span = hi - lo;
  if (span <= s + 1e-6) return () => (lo + hi) / 2;
  return (v) => lo + s / 2 + ((v - lo) * (span - s)) / span;
}

function translatePart(p: Part, dx: number, dy: number, dz: number): Part {
  switch (p.kind) {
    case "box":
    case "cylinder":
      return { ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz };
    case "beam":
      return { ...p, a: [p.a[0] + dx, p.a[1] + dy, p.a[2] + dz] as V3, b: [p.b[0] + dx, p.b[1] + dy, p.b[2] + dz] as V3 };
    case "prism": {
      const d: Record<"front" | "side" | "top", [number, number, number]> = { front: [dx, dy, dz], side: [dz, dy, dx], top: [dx, dz, dy] };
      const [du, dv, ds] = d[p.plane];
      return { ...p, profile: p.profile.map((q) => ({ x: q.x + du, y: q.y + dv })), at: p.at + ds };
    }
    case "grid":
      return { ...p, y: p.y + dy, z: p.z + dz };
  }
}

/** Centres the parts on x / z and stands them on y = 0. */
function normalise(parts: Part[]): Part[] {
  const b = partsBounds(parts);
  if (!b) return parts;
  const dx = -(b.min[0] + b.max[0]) / 2;
  const dy = -b.min[1];
  const dz = -(b.min[2] + b.max[2]) / 2;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9) return parts;
  return parts.map((p) => translatePart(p, dx, dy, dz));
}

function frameParts(spec: Extract<CustomSpec, { method: "frame" }>): Part[] {
  const s = spec.section;
  const e = extentOf(spec.segments.flatMap((q) => [q.a, q.b]));
  const fx = insetAxis(e.minX, e.maxX, s);
  const fy = insetAxis(e.minY, e.maxY, s);
  const tone = "body" as const;
  const round = spec.round;
  const segs = spec.segments.filter((q) => Math.hypot(q.a.x - q.b.x, q.a.y - q.b.y) >= 1);
  const parts: Part[] = [];
  // Extend each member by half a section at both ends so corners close.
  const member = (a: V3, b: V3, role: string) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1e-6) return;
    const k = s / 2 / L;
    const ext = (p: V3, q: V3): V3 => [p[0] + (p[0] - q[0]) * k, p[1] + (p[1] - q[1]) * k, p[2] + (p[2] - q[2]) * k];
    parts.push(beam(ext(a, b), ext(b, a), s, tone, { round, role }));
  };
  const nodes = new Map<string, Vec2>();
  const addNode = (p: Vec2) => nodes.set(`${Math.round(p.x)}:${Math.round(p.y)}`, p);

  if (spec.plane === "front") {
    // Drawn y runs down the screen; height runs up.
    const at = (q: SketchPoint): Vec2 => ({ x: fx(q.x), y: -fy(q.y) });
    const double = spec.depth > s + 1e-6;
    const zs = double ? [-(spec.depth / 2 - s / 2), spec.depth / 2 - s / 2] : [0];
    for (const z of zs) for (const q of segs) {
      const a = at(q.a), b = at(q.b);
      member([a.x, a.y, z], [b.x, b.y, z], "member");
      addNode(a);
      addNode(b);
    }
    if (double) for (const n of nodes.values()) parts.push(beam([n.x, n.y, zs[0] + s / 2], [n.x, n.y, zs[1] - s / 2], s, tone, { round, role: "connector" }));
    if (spec.infill && e.maxX - e.minX > 2 * s && e.maxY - e.minY > 2 * s) {
      const t = Math.min(18, s / 2);
      const w = e.maxX - e.minX - s;
      const h = e.maxY - e.minY - s;
      parts.push(box((fx(e.minX) + fx(e.maxX)) / 2, -fy(e.maxY), zs[0], w, h, t, "accent", { role: "infill" }));
    }
    return parts;
  }

  // Plan view: posts at every node, beams along each line at the bottom and top.
  const H = Math.max(spec.depth, s);
  const at = (q: SketchPoint): Vec2 => ({ x: fx(q.x), y: fy(q.y) });
  for (const q of segs) {
    const a = at(q.a), b = at(q.b);
    addNode(a);
    addNode(b);
    member([a.x, s / 2, a.y], [b.x, s / 2, b.y], "member");
    if (H > 2 * s) member([a.x, H - s / 2, a.y], [b.x, H - s / 2, b.y], "member");
    if (spec.infill && H > 2 * s) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const ry = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      parts.push(box((a.x + b.x) / 2, s, (a.y + b.y) / 2, L, H - 2 * s, Math.min(18, s / 2), "accent", { role: "infill", ry }));
    }
  }
  if (H > 2 * s) for (const n of nodes.values()) parts.push(beam([n.x, s, n.y], [n.x, H - s, n.y], s, tone, { round, role: "post" }));
  return parts;
}

function rawParts(spec: CustomSpec): Part[] {
  switch (spec.method) {
    case "extrude":
      return spec.plane === "front"
        ? spec.profiles.map((pr) => prism("front", pr.map((q) => ({ x: q.x, y: -q.y })), -spec.depth / 2, spec.depth, "body", { role: "solid" }))
        : spec.profiles.map((pr) => prism("top", pr.map((q) => ({ x: q.x, y: q.y })), 0, spec.depth, "body", { role: "solid" }));
    case "panel": {
      const t = spec.thickness;
      const parts: Part[] = spec.profiles.map((pr) => prism("front", pr.map((q) => ({ x: q.x, y: -q.y })), -t / 2, t, "body", { role: "panel" }));
      if (spec.feet) {
        const e = extentOf(spec.profiles.flat());
        const W = e.maxX - e.minX;
        const F = Math.max(300, Math.min(600, (e.maxY - e.minY) * 0.25));
        const xs = W < 600 ? [(e.minX + e.maxX) / 2] : [e.minX + W * 0.15, e.maxX - W * 0.15];
        for (const x of xs) parts.push(box(x, -e.maxY, 0, 60, 30, Math.max(F, t), "dark", { role: "foot" }));
      }
      return parts;
    }
    case "flat":
      return spec.profiles.map((pr) => prism("top", pr.map((q) => ({ x: q.x, y: q.y })), 0, spec.thickness, "body", { role: "outline" }));
    case "frame":
      return frameParts(spec);
    case "assembly":
      return spec.parts.map((q) => {
        const meta = { role: q.name || q.shape, ...(q.color ? { color: q.color } : {}) };
        return q.shape === "cylinder" ? cyl(q.x, q.y, q.z, q.w / 2, q.h, q.tone, meta) : box(q.x, q.y, q.z, q.w, q.h, q.d, q.tone, meta);
      });
  }
}

/** Solid parts of a custom recipe in the object frame (centred, standing on y = 0). */
export function customParts(spec: CustomSpec): Part[] {
  return normalise(rawParts(spec));
}

export type Size3 = { width: number; depth: number; height: number };

/** Overall size of a recipe's solid (what the object's width / depth / height must be). */
export function customSize(spec: CustomSpec): Size3 {
  const b = partsBounds(rawParts(spec));
  if (!b) return { width: 1, depth: 1, height: 1 };
  return { width: Math.max(1, r1(b.max[0] - b.min[0])), depth: Math.max(1, r1(b.max[2] - b.min[2])), height: Math.max(1, r1(b.max[1] - b.min[1])) };
}

// ------------------------------------------------------------ resizing ----

const scalePts = (pts: SketchPoint[], e: Extent, sx: number, sy: number) => pts.map((q) => ({ x: r1(e.minX + (q.x - e.minX) * sx), y: r1(e.minY + (q.y - e.minY) * sy) }));
const ratio = (target: number | undefined, current: number) => (target !== undefined && current > 0.5 && target > 0 ? target / current : 1);

/**
 * Resizes a recipe to an overall size. Drawn outlines and lines stretch to
 * the new size; panel thickness and beam sections stay exact. An assembly
 * made from a template is rebuilt from it; a hand-built assembly stretches,
 * keeping thin parts (tops, panels) at their thickness against the edge they
 * sit on.
 */
export function resizeCustom(spec: CustomSpec, target: Partial<Size3>): CustomSpec {
  const cur = customSize(spec);
  const fit = (v: number | undefined, d: number) => (v === undefined || !Number.isFinite(v) ? d : Math.max(1, Math.min(CUSTOM_LIMITS.maxSize, v)));
  const want = { width: fit(target.width, cur.width), depth: fit(target.depth, cur.depth), height: fit(target.height, cur.height) };
  if (Math.abs(want.width - cur.width) < 0.05 && Math.abs(want.depth - cur.depth) < 0.05 && Math.abs(want.height - cur.height) < 0.05) return spec;
  switch (spec.method) {
    case "extrude": {
      const e = extentOf(spec.profiles.flat());
      const sx = ratio(want.width, e.maxX - e.minX);
      if (spec.plane === "front") {
        const sy = ratio(want.height, e.maxY - e.minY);
        return { ...spec, profiles: spec.profiles.map((p) => scalePts(p, e, sx, sy)), depth: r1(want.depth) };
      }
      const sz = ratio(want.depth, e.maxY - e.minY);
      return { ...spec, profiles: spec.profiles.map((p) => scalePts(p, e, sx, sz)), depth: r1(want.height) };
    }
    case "panel": {
      const e = extentOf(spec.profiles.flat());
      const out = { ...spec, profiles: spec.profiles.map((p) => scalePts(p, e, ratio(want.width, e.maxX - e.minX), ratio(want.height, e.maxY - e.minY))) };
      if (!spec.feet && Math.abs(want.depth - cur.depth) >= 0.05) out.thickness = r1(Math.min(1000, want.depth));
      return out;
    }
    case "flat": {
      const e = extentOf(spec.profiles.flat());
      return { ...spec, profiles: spec.profiles.map((p) => scalePts(p, e, ratio(want.width, e.maxX - e.minX), ratio(want.depth, e.maxY - e.minY))), thickness: r1(Math.min(500, want.height)) };
    }
    case "frame": {
      const e = extentOf(spec.segments.flatMap((q) => [q.a, q.b]));
      const spanX = e.maxX - e.minX;
      const spanY = e.maxY - e.minY;
      let section = spec.section;
      const second = spec.plane === "front" ? want.height : want.depth;
      // An axis with no drawn extent is just the section; resizing it changes the section.
      if (spanX <= section + 1e-6 && Math.abs(want.width - cur.width) >= 0.05) section = want.width;
      if (spanY <= section + 1e-6 && Math.abs(second - (spec.plane === "front" ? cur.height : cur.depth)) >= 0.05) section = second;
      const sx = spanX > spec.section + 1e-6 ? ratio(want.width, spanX) : 1;
      const sy = spanY > spec.section + 1e-6 ? ratio(second, spanY) : 1;
      const segments = spec.segments.map((q) => {
        const [a, b] = scalePts([q.a, q.b], e, sx, sy);
        return { a, b };
      });
      const third = spec.plane === "front" ? want.depth : want.height;
      let depth = spec.depth;
      if (Math.abs(third - (spec.plane === "front" ? cur.depth : cur.height)) >= 0.05) {
        if (spec.plane === "front" && third <= section) {
          depth = 0;
          section = third;
        } else depth = r1(third);
      }
      return { ...spec, segments, section: r1(Math.min(2000, section)), depth };
    }
    case "assembly": {
      if (spec.template) {
        const params = { ...spec.template.params, width: r1(want.width), depth: r1(want.depth), height: r1(want.height) };
        const made = templateParts(spec.template.id, params);
        if (made) return { ...spec, parts: made, template: { id: spec.template.id, params } };
      }
      return { ...spec, parts: stretchParts(spec.parts, cur, want) };
    }
  }
}

function stretchParts(parts: CustomPart[], cur: Size3, want: Size3): CustomPart[] {
  const raw = rawParts({ method: "assembly", parts, template: null });
  const b = partsBounds(raw);
  if (!b) return parts;
  const axes = [
    { E: cur.width, T: want.width, lo: (q: CustomPart) => q.x - q.w / 2 - b.min[0], size: (q: CustomPart) => q.w },
    { E: cur.height, T: want.height, lo: (q: CustomPart) => q.y - b.min[1], size: (q: CustomPart) => q.h },
    { E: cur.depth, T: want.depth, lo: (q: CustomPart) => q.z - (q.shape === "cylinder" ? q.w : q.d) / 2 - b.min[2], size: (q: CustomPart) => (q.shape === "cylinder" ? q.w : q.d) },
  ];
  const map = (lo: number, size: number, E: number, T: number): [number, number] => {
    if (E < 0.5) return [lo, size];
    const s = T / E;
    const hi = lo + size;
    if (size <= 0.15 * E) {
      if (hi >= E - 0.5) return [T - size, size];
      if (lo <= 0.5) return [0, size];
      const c = ((lo + hi) / 2) * s;
      return [Math.max(0, Math.min(T - size, c - size / 2)), size];
    }
    return [lo * s, size * s];
  };
  return parts.map((q) => {
    const [x0, w] = map(axes[0].lo(q), axes[0].size(q), axes[0].E, axes[0].T);
    const [y0, h] = map(axes[1].lo(q), axes[1].size(q), axes[1].E, axes[1].T);
    const [z0, d] = map(axes[2].lo(q), axes[2].size(q), axes[2].E, axes[2].T);
    const cylinder = q.shape === "cylinder";
    const diameter = cylinder ? Math.min(w, d) : w;
    return {
      ...q,
      x: r1(x0 + w / 2),
      y: r1(y0),
      z: r1(z0 + d / 2),
      w: r1(Math.max(1, diameter)),
      h: r1(Math.max(1, h)),
      d: r1(Math.max(1, cylinder ? diameter : d)),
    };
  });
}

// ----------------------------------------------------------- templates ----

export type TemplateParam = { key: string; label: string; kind: "length" | "count" | "boolean"; default: number | boolean; min?: number; max?: number };

export type TemplateDef = { id: TemplateId; label: string; description: string; params: TemplateParam[] };

/** Exact-construction starting points in the Custom Builder ("type the sizes"). */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "frame",
    label: "Frame",
    description: "Rectangular beam frame with optional cross members.",
    params: [
      { key: "width", label: "Overall width", kind: "length", default: 3000, min: 100 },
      { key: "height", label: "Overall height", kind: "length", default: 2500, min: 100 },
      { key: "depth", label: "Overall depth", kind: "length", default: 0, min: 0 },
      { key: "section", label: "Beam size", kind: "length", default: 50, min: 10, max: 2000 },
      { key: "crossbars", label: "Cross members", kind: "count", default: 0, min: 0, max: 20 },
      { key: "uprights", label: "Middle uprights", kind: "count", default: 0, min: 0, max: 20 },
      { key: "infill", label: "Panel infill", kind: "boolean", default: false },
    ],
  },
  {
    id: "photo_booth",
    label: "Photo booth frame",
    description: "Two uprights and a top beam, front and back, joined; optional backdrop.",
    params: [
      { key: "width", label: "Width", kind: "length", default: 2400, min: 300 },
      { key: "height", label: "Height", kind: "length", default: 2400, min: 300 },
      { key: "depth", label: "Depth", kind: "length", default: 1200, min: 0 },
      { key: "section", label: "Beam size", kind: "length", default: 50, min: 10, max: 2000 },
      { key: "infill", label: "Backdrop panel", kind: "boolean", default: true },
    ],
  },
  {
    id: "panel",
    label: "Panel",
    description: "Flat panel of a given width, height and thickness.",
    params: [
      { key: "width", label: "Width", kind: "length", default: 2400, min: 10 },
      { key: "height", label: "Height", kind: "length", default: 1200, min: 10 },
      { key: "thickness", label: "Thickness", kind: "length", default: 18, min: 1, max: 1000 },
      { key: "feet", label: "Feet", kind: "boolean", default: true },
    ],
  },
  {
    id: "beam",
    label: "Beam",
    description: "Single straight beam of a given length and section.",
    params: [
      { key: "width", label: "Length", kind: "length", default: 3000, min: 10 },
      { key: "section", label: "Section", kind: "length", default: 100, min: 10, max: 2000 },
    ],
  },
  {
    id: "box",
    label: "Solid block",
    description: "Rectangular solid of exact width, height and depth.",
    params: [
      { key: "width", label: "Width", kind: "length", default: 1000, min: 10 },
      { key: "height", label: "Height", kind: "length", default: 1000, min: 10 },
      { key: "depth", label: "Depth", kind: "length", default: 1000, min: 10 },
    ],
  },
  {
    id: "counter",
    label: "Counter",
    description: "Cabinet body, fascia, countertop and overhang as separate parts.",
    params: [
      { key: "width", label: "Width", kind: "length", default: 2000, min: 300 },
      { key: "height", label: "Height", kind: "length", default: 1050, min: 300 },
      { key: "depth", label: "Depth", kind: "length", default: 600, min: 200 },
      { key: "topThickness", label: "Top thickness", kind: "length", default: 40, min: 12, max: 150 },
      { key: "topOverhang", label: "Top overhang", kind: "length", default: 50, min: 0, max: 300 },
      { key: "sidePanels", label: "Side panels", kind: "boolean", default: true },
      { key: "brandPanel", label: "Brand panel", kind: "boolean", default: true },
    ],
  },
];

const PART_NAMES: Record<string, string> = { plinth: "Plinth", body: "Cabinet body", fascia: "Front fascia", countertop: "Countertop", "side-panel": "Side panel", "brand-panel": "Brand panel" };

/** Assembly parts for templates built from separate parts (only the counter today). */
function templateParts(id: TemplateId, params: Record<string, number | boolean>): CustomPart[] | null {
  if (id !== "counter") return null;
  const num = (k: string, d: number) => (typeof params[k] === "number" ? (params[k] as number) : d);
  const reader = paramReader({ params: [] }, { ...params, topColor: "" });
  const parts = counterParts(Math.max(300, num("width", 2000)), Math.max(200, num("depth", 600)), Math.max(300, num("height", 1050)), reader);
  let i = 0;
  return parts.flatMap((p) =>
    p.kind === "box" ? [{ id: `p${++i}`, name: PART_NAMES[p.role ?? ""] ?? p.role ?? "Part", shape: "box" as const, x: r1(p.x), y: r1(p.y), z: r1(p.z), w: r1(p.w), h: r1(p.h), d: r1(p.d), tone: p.tone === "frame" || p.tone === "exit" ? ("body" as const) : (p.tone as CustomPart["tone"]), color: null }] : [],
  );
}

export type BuilderContent = { sketch: Sketch; construction: Construction; parts: CustomPart[]; template: TemplateRef | null };

let shapeSeq = 0;
const sid = (prefix = "s") => `${prefix}${Date.now().toString(36)}${(shapeSeq++).toString(36)}`;

const rectPoly = (x: number, y: number, w: number, h: number): SketchShape => ({ kind: "rect", id: sid(), x, y, w, h });
const line = (a: SketchPoint, b: SketchPoint): SketchShape => ({ kind: "poly", id: sid(), points: [a, b], closed: false });

export const DEFAULT_CONSTRUCTION: Construction = { method: "extrude", depth: 100, thickness: 18, section: 50, round: false, infill: false, feet: false };

/** Builder content for an exact-size template. Drawing coordinates start at (0, 0), top-left. */
export function applyTemplate(id: TemplateId, values: Record<string, number | boolean>): BuilderContent {
  const def = TEMPLATES.find((t) => t.id === id)!;
  const v = (k: string) => values[k] ?? def.params.find((p) => p.key === k)?.default ?? 0;
  const n = (k: string) => Number(v(k)) || 0;
  const W = Math.max(1, n("width"));
  const H = Math.max(1, n("height"));
  const sketch = (shapes: SketchShape[]): Sketch => ({ plane: "front", shapes, dims: [], labels: [] });
  switch (id) {
    case "frame": {
      const shapes: SketchShape[] = [{ kind: "poly", id: sid(), points: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], closed: true }];
      const cb = Math.max(0, Math.round(n("crossbars")));
      const up = Math.max(0, Math.round(n("uprights")));
      for (let i = 1; i <= cb; i++) shapes.push(line({ x: 0, y: r1((H * i) / (cb + 1)) }, { x: W, y: r1((H * i) / (cb + 1)) }));
      for (let i = 1; i <= up; i++) shapes.push(line({ x: r1((W * i) / (up + 1)), y: 0 }, { x: r1((W * i) / (up + 1)), y: H }));
      return { sketch: sketch(shapes), construction: { ...DEFAULT_CONSTRUCTION, method: "frame", section: n("section") || 50, depth: n("depth"), infill: Boolean(v("infill")) }, parts: [], template: null };
    }
    case "photo_booth": {
      const shapes: SketchShape[] = [{ kind: "poly", id: sid(), points: [{ x: 0, y: H }, { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }], closed: false }];
      return { sketch: sketch(shapes), construction: { ...DEFAULT_CONSTRUCTION, method: "frame", section: n("section") || 50, depth: n("depth"), infill: Boolean(v("infill")) }, parts: [], template: null };
    }
    case "panel":
      return { sketch: sketch([rectPoly(0, 0, W, H)]), construction: { ...DEFAULT_CONSTRUCTION, method: "panel", thickness: n("thickness") || 18, feet: Boolean(v("feet")) }, parts: [], template: null };
    case "beam": {
      const s = n("section") || 100;
      return { sketch: sketch([line({ x: 0, y: 0 }, { x: W, y: 0 })]), construction: { ...DEFAULT_CONSTRUCTION, method: "frame", section: s, depth: 0 }, parts: [], template: null };
    }
    case "box":
      return { sketch: sketch([rectPoly(0, 0, W, H)]), construction: { ...DEFAULT_CONSTRUCTION, method: "extrude", depth: Math.max(1, n("depth")) }, parts: [], template: null };
    case "counter": {
      const params: Record<string, number | boolean> = {};
      for (const p of def.params) params[p.key] = v(p.key) as number | boolean;
      return { sketch: sketch([]), construction: { ...DEFAULT_CONSTRUCTION, method: "assembly" }, parts: templateParts("counter", params) ?? [], template: { id: "counter", params } };
    }
  }
}

// ------------------------------------------------ drawing → recipe ----

const CIRCLE_SEGMENTS = 48;

export function circlePoints(cx: number, cy: number, r: number, n = CIRCLE_SEGMENTS): SketchPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: r1(cx + Math.cos(t) * r), y: r1(cy + Math.sin(t) * r) };
  });
}

/** Closed outline of a shape, or null for open lines. */
export function shapeOutline(s: SketchShape): SketchPoint[] | null {
  if (s.kind === "rect") return [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }];
  if (s.kind === "circle") return circlePoints(s.cx, s.cy, s.r);
  return s.closed && s.points.length >= 3 ? s.points : null;
}

/** Straight edges of a shape (rectangle sides, polygon edges, line segments). */
export function shapeEdges(s: SketchShape): Array<{ a: SketchPoint; b: SketchPoint }> {
  const pts = s.kind === "poly" ? s.points : shapeOutline(s)!;
  const closed = s.kind !== "poly" || s.closed;
  const out: Array<{ a: SketchPoint; b: SketchPoint }> = [];
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) out.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
  return out;
}

export type SpecResult = { ok: true; spec: CustomSpec } | { ok: false; error: string };

/** Turns the builder's drawing and construction settings into a validated recipe. */
export function buildSpec(content: BuilderContent): SpecResult {
  const { sketch, construction: c, parts, template } = content;
  let spec: CustomSpec;
  switch (c.method) {
    case "extrude":
    case "panel":
    case "flat": {
      const profiles = sketch.shapes.map(shapeOutline).filter((p): p is SketchPoint[] => !!p);
      if (!profiles.length) return { ok: false, error: "This method needs a closed shape. Draw a rectangle, circle or polygon, or close your outline." };
      if (profiles.length > CUSTOM_LIMITS.profiles) return { ok: false, error: `Use at most ${CUSTOM_LIMITS.profiles} closed shapes.` };
      if (c.method === "extrude") {
        if (!(c.depth > 0)) return { ok: false, error: "Enter the extrusion depth." };
        spec = { method: "extrude", plane: sketch.plane, profiles, depth: c.depth };
      } else if (c.method === "panel") spec = { method: "panel", profiles, thickness: c.thickness, feet: c.feet };
      else spec = { method: "flat", profiles, thickness: Math.min(500, c.thickness) };
      break;
    }
    case "frame": {
      const segments = sketch.shapes.flatMap(shapeEdges).filter((s) => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) >= 1);
      if (!segments.length) return { ok: false, error: "A frame needs lines. Draw lines, a polyline or a rectangle for the members." };
      if (segments.length > CUSTOM_LIMITS.segments) return { ok: false, error: `A frame can have at most ${CUSTOM_LIMITS.segments} members; this drawing has ${segments.length}.` };
      if (sketch.plane === "top" && !(c.depth > c.section * 2)) return { ok: false, error: "Enter the frame height (more than twice the beam size) for a frame drawn in plan." };
      spec = { method: "frame", plane: sketch.plane, segments, section: c.section, round: c.round, depth: c.depth, infill: c.infill };
      break;
    }
    case "assembly": {
      if (!parts.length) return { ok: false, error: "Add at least one part, or use rectangles from the drawing as parts." };
      spec = { method: "assembly", parts, template };
      break;
    }
  }
  const parsed = customSpecSchema.safeParse(spec);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "These settings can't be built." };
  const size = customSize(parsed.data);
  if (Math.max(size.width, size.depth, size.height) > CUSTOM_LIMITS.maxSize) return { ok: false, error: "The object is larger than 100 m. Check the units of the values you typed." };
  return { ok: true, spec: parsed.data };
}

/** Builder content for editing a placed object's recipe again (its original drawing isn't kept on the instance). */
export function specToContent(spec: CustomSpec): BuilderContent {
  const shapesFromProfiles = (profiles: SketchPoint[][]): SketchShape[] => profiles.map((points) => ({ kind: "poly", id: sid(), points, closed: true }));
  switch (spec.method) {
    case "extrude":
      return { sketch: { plane: spec.plane, shapes: shapesFromProfiles(spec.profiles), dims: [], labels: [] }, construction: { ...DEFAULT_CONSTRUCTION, method: "extrude", depth: spec.depth }, parts: [], template: null };
    case "panel":
      return { sketch: { plane: "front", shapes: shapesFromProfiles(spec.profiles), dims: [], labels: [] }, construction: { ...DEFAULT_CONSTRUCTION, method: "panel", thickness: spec.thickness, feet: spec.feet }, parts: [], template: null };
    case "flat":
      return { sketch: { plane: "top", shapes: shapesFromProfiles(spec.profiles), dims: [], labels: [] }, construction: { ...DEFAULT_CONSTRUCTION, method: "flat", thickness: spec.thickness }, parts: [], template: null };
    case "frame":
      return {
        sketch: { plane: spec.plane, shapes: spec.segments.map((s) => line(s.a, s.b)), dims: [], labels: [] },
        construction: { ...DEFAULT_CONSTRUCTION, method: "frame", section: spec.section, round: spec.round, depth: spec.depth, infill: spec.infill },
        parts: [],
        template: null,
      };
    case "assembly":
      return { sketch: { plane: "front", shapes: [], dims: [], labels: [] }, construction: { ...DEFAULT_CONSTRUCTION, method: "assembly" }, parts: spec.parts, template: spec.template };
  }
}

/** Rectangles in a front-view drawing as box parts of the given depth (for a multi-part assembly). */
export function rectsToParts(sketch: Sketch, depth: number, startIndex = 1): CustomPart[] {
  const rects = sketch.shapes.filter((s): s is Extract<SketchShape, { kind: "rect" }> => s.kind === "rect");
  if (!rects.length) return [];
  const floor = Math.max(...rects.map((r) => r.y + r.h));
  return rects.map((r, i) => ({
    id: sid("p"),
    name: `Part ${startIndex + i}`,
    shape: "box" as const,
    x: r1(r.x + r.w / 2),
    y: sketch.plane === "front" ? r1(floor - (r.y + r.h)) : 0,
    z: sketch.plane === "front" ? 0 : r1(r.y + r.h / 2),
    w: r1(r.w),
    h: sketch.plane === "front" ? r1(r.h) : r1(Math.max(1, depth)),
    d: sketch.plane === "front" ? r1(Math.max(1, depth)) : r1(r.h),
    tone: "body" as const,
    color: null,
  }));
}

// ------------------------------------------------- sketch helpers ----

/** Ramer–Douglas–Peucker simplification of an open path. */
export function simplifyPath(points: SketchPoint[], tolerance: number): SketchPoint[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = points[i], b = points[j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    let worst = -1, at = -1;
    for (let k = i + 1; k < j; k++) {
      const p = points[k];
      const d = L < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
      if (d > worst) {
        worst = d;
        at = k;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Explicit clean-up of a freehand stroke: fewer points, optional square
 * angles, and closing the shape when its ends nearly meet. The user asks
 * for this; drawn input is never changed silently.
 */
export function cleanupStroke(points: SketchPoint[], opts: { tolerance: number; squareAngles: boolean; closeGap: number; grid?: number }): { points: SketchPoint[]; closed: boolean } {
  let pts = simplifyPath(points, opts.tolerance);
  let closed = false;
  if (pts.length >= 4 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= opts.closeGap) {
    pts = pts.slice(0, -1);
    closed = true;
  }
  if (opts.squareAngles && pts.length >= 2) {
    // Straighten edges within 10° of horizontal or vertical by aligning their ends.
    const out = pts.map((p) => ({ ...p }));
    const n = out.length;
    const edges = closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = out[i];
      const b = out[(i + 1) % n];
      const ang = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180;
      if (ang < 10 || ang > 170) b.y = a.y;
      else if (Math.abs(ang - 90) < 10) b.x = a.x;
    }
    pts = out;
  }
  if (opts.grid && opts.grid > 0) pts = pts.map((p) => ({ x: Math.round(p.x / opts.grid!) * opts.grid!, y: Math.round(p.y / opts.grid!) * opts.grid! }));
  pts = pts.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
  // Drop repeated points created by snapping.
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5);
  if (closed && pts.length < 3) closed = false;
  return { points: pts, closed };
}

/** Points worth snapping to: vertices, centres and crossings of straight edges. */
export function sketchSnapPoints(sketch: Sketch, exclude?: string): SketchPoint[] {
  const out: SketchPoint[] = [];
  const edges: Array<{ a: SketchPoint; b: SketchPoint }> = [];
  for (const s of sketch.shapes) {
    if (s.id === exclude) continue;
    if (s.kind === "circle") {
      out.push({ x: s.cx, y: s.cy }, { x: s.cx + s.r, y: s.cy }, { x: s.cx - s.r, y: s.cy }, { x: s.cx, y: s.cy + s.r }, { x: s.cx, y: s.cy - s.r });
      continue;
    }
    const pts = s.kind === "poly" ? s.points : shapeOutline(s)!;
    out.push(...pts);
    if (s.kind === "rect") out.push({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    edges.push(...shapeEdges(s));
  }
  if (edges.length <= 400) {
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const { a, b } = edges[i];
        const { a: c, b: d } = edges[j];
        if (!segmentsIntersect(a, b, c, d)) continue;
        const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }
  return out;
}

/** Points along a circular arc through a start, a point on the arc, and an end. */
export function arcThrough(a: SketchPoint, m: SketchPoint, b: SketchPoint, segments = 16): SketchPoint[] | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-6) return null; // collinear: not an arc
  const ux = ((a.x ** 2 + a.y ** 2) * (m.y - b.y) + (m.x ** 2 + m.y ** 2) * (b.y - a.y) + (b.x ** 2 + b.y ** 2) * (a.y - m.y)) / d;
  const uy = ((a.x ** 2 + a.y ** 2) * (b.x - m.x) + (m.x ** 2 + m.y ** 2) * (a.x - b.x) + (b.x ** 2 + b.y ** 2) * (m.x - a.x)) / d;
  const R = Math.hypot(a.x - ux, a.y - uy);
  const ang = (p: SketchPoint) => Math.atan2(p.y - uy, p.x - ux);
  const t0 = ang(a);
  let t1 = ang(b);
  let tm = ang(m);
  // Go the way round that passes through m.
  const norm = (t: number) => ((t - t0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  tm = norm(tm);
  t1 = norm(t1);
  const sweep = tm < t1 ? t1 : t1 - 2 * Math.PI;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = t0 + (sweep * i) / segments;
    return { x: r1(ux + Math.cos(t) * R), y: r1(uy + Math.sin(t) * R) };
  });
}

// ------------------------------------------------------------ examples ----

export type ExampleId = "photo_booth" | "display_counter" | "product_launch" | "star_extrusion";

export type ExampleDef = { id: ExampleId; label: string; description: string; color: string; accentColor: string; content: () => BuilderContent };

const part = (name: string, shape: "box" | "cylinder", x: number, y: number, z: number, w: number, h: number, d: number, tone: CustomPart["tone"]): CustomPart => ({ id: sid("p"), name, shape, x, y, z, w, h, d, tone, color: null });

/** Ready-made starting points that show each construction method; every value stays editable. */
export const EXAMPLES: ExampleDef[] = [
  {
    id: "photo_booth",
    label: "Photo booth",
    description: "2.4 m beam frame, front and back joined, with a backdrop panel.",
    color: "#1d1f26",
    accentColor: "#c8a24a",
    content: () => applyTemplate("photo_booth", { width: 2400, height: 2400, depth: 1200, section: 50, infill: true }),
  },
  {
    id: "display_counter",
    label: "Display counter",
    description: "Cabinet, fascia, dark countertop with overhang, side panels and a brand panel.",
    color: "#f4f2ec",
    accentColor: "#c8a24a",
    content: () => applyTemplate("counter", { width: 1800, height: 1050, depth: 600, topThickness: 40, topOverhang: 50, sidePanels: true, brandPanel: true }),
  },
  {
    id: "product_launch",
    label: "Product launch structure",
    description: "Low podium, two towers, header beam, centre screen and a reveal plinth as separate parts.",
    color: "#e9e6df",
    accentColor: "#2b2f3a",
    content: () => ({
      sketch: { plane: "front", shapes: [], dims: [], labels: [] },
      construction: { ...DEFAULT_CONSTRUCTION, method: "assembly" },
      parts: [
        part("Podium", "box", 0, 0, 0, 4800, 300, 2400, "dark"),
        part("Left tower", "box", -2200, 300, -900, 400, 3200, 400, "body"),
        part("Right tower", "box", 2200, 300, -900, 400, 3200, 400, "body"),
        part("Header", "box", 0, 3500, -900, 4800, 500, 400, "accent"),
        part("Screen", "box", 0, 1100, -1000, 3200, 1800, 120, "screen"),
        part("Reveal plinth", "cylinder", 0, 300, 400, 900, 900, 900, "light"),
      ],
      template: null,
    }),
  },
  {
    id: "star_extrusion",
    label: "Decorative star",
    description: "Eight-point star outline drawn in front view, extruded 100 mm.",
    color: "#c8a24a",
    accentColor: "#2b2f3a",
    content: () => {
      const R = 750, r = 360;
      const points: SketchPoint[] = Array.from({ length: 16 }, (_, i) => {
        const t = -Math.PI / 2 + (i * Math.PI) / 8;
        const rad = i % 2 === 0 ? R : r;
        return { x: r1(R + Math.cos(t) * rad), y: r1(R + Math.sin(t) * rad) };
      });
      return { sketch: { plane: "front", shapes: [{ kind: "poly", id: sid(), points, closed: true }], dims: [], labels: [] }, construction: { ...DEFAULT_CONSTRUCTION, method: "extrude", depth: 100 }, parts: [], template: null };
    },
  },
];
