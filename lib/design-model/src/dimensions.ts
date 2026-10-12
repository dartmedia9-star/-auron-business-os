import { boundsOf, dist, normalize, offsetPolygon, outwardNormal, perp, pointInPolygon, rectCorners, scale, sub, add } from "./geometry";
import { asRect, edgesOf } from "./model";
import type { ProjectModel, Vec2 } from "./schema";

// Automatic dimension annotations, derived from geometry every time it is
// rendered (never stored), so they can't go stale after an edit. Only the
// user's own dimensions and each room's dimension offset are stored.

export type DimKind = "wall" | "overall" | "external" | "partition" | "section" | "object" | "user";

export type DimLine = {
  key: string;
  entityId: string | null;
  kind: DimKind;
  /** Measured points. */
  a: Vec2;
  b: Vec2;
  /** Unit direction in which the dimension line is offset from a→b. */
  normal: Vec2;
  /** Distance of the dimension line from a→b along `normal` (mm). */
  offset: number;
  /** The measured value in mm (always the true distance a→b). */
  value: number;
  suffix?: string;
};

/** Points where the dimension line itself is drawn. */
export function dimLinePoints(d: DimLine): { p1: Vec2; p2: Vec2 } {
  const o = scale(d.normal, d.offset);
  return { p1: add(d.a, o), p2: add(d.b, o) };
}

export type AutoDimOptions = {
  selectedId?: string | null;
  /**
   * Drawing scale (screen or paper px per mm). When given, gaps between
   * stacked dimension lines never shrink below a readable number of pixels,
   * so lines and their text don't pile up when zoomed out or printed small.
   */
  pxPerMm?: number;
};

const MIN_RING_PX = 30;

/**
 * Sections in a rectangular room that are dimensioned by chains: axis-aligned
 * and centred inside the room. Their edges become running ("chain")
 * dimensions outside the top and left walls, the way a drawn plan does it,
 * instead of one dimension inside every section (which crowds narrow strips).
 */
function chainSections(model: ProjectModel, roomPts: Vec2[]) {
  return model.sections.filter((sec) => {
    if (sec.hidden || !sec.showDims) return false;
    const r = ((sec.rotation % 90) + 90) % 90;
    return r < 0.01 && pointInPolygon({ x: sec.x, y: sec.y }, roomPts, 0);
  });
}

function breaks(values: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const v of [lo, hi, ...values].map((x) => Math.min(hi, Math.max(lo, x))).sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > 1) out.push(v);
    else if (Math.abs(v - hi) < 1e-6) out[out.length - 1] = hi;
  }
  return out;
}

export function autoDimensions(model: ProjectModel, opts: AutoDimOptions = {}): DimLine[] {
  const s = model.settings;
  const out: DimLine[] = [];
  /** A distance in mm that is at least `px` pixels at the drawing scale. */
  const atLeast = (mm: number, px: number) => (opts.pxPerMm && opts.pxPerMm > 0 ? Math.max(mm, px / opts.pxPerMm) : mm);
  const ring = atLeast(500, MIN_RING_PX);
  const chained = new Set<string>();

  for (const room of model.rooms) {
    if (room.hidden) continue;
    const t = room.showWalls ? room.wallThickness : 0;
    const base = t + atLeast(room.dimOffset, 26);
    const rect = asRect(room);
    const b = boundsOf(room.points)!;

    // Chains for the sections in a rectangular room.
    let chainTop = false;
    let chainLeft = false;
    if (s.showSectionDims && rect) {
      const secs = chainSections(model, room.points);
      if (secs.length) {
        const half = (sec: (typeof secs)[number]) => {
          const swap = Math.round(((sec.rotation % 180) + 180) % 180) === 90;
          return { hw: (swap ? sec.depth : sec.width) / 2, hd: (swap ? sec.width : sec.depth) / 2 };
        };
        const xs = breaks(secs.flatMap((sec) => [sec.x - half(sec).hw, sec.x + half(sec).hw]), b.minX, b.maxX);
        const ys = breaks(secs.flatMap((sec) => [sec.y - half(sec).hd, sec.y + half(sec).hd]), b.minY, b.maxY);
        for (const sec of secs) chained.add(sec.id);
        if (xs.length > 2) {
          chainTop = true;
          for (let i = 0; i < xs.length - 1; i++) {
            out.push({ key: `cx:${room.id}:${i}`, entityId: room.id, kind: "section", a: { x: xs[i], y: b.minY }, b: { x: xs[i + 1], y: b.minY }, normal: { x: 0, y: -1 }, offset: base, value: xs[i + 1] - xs[i] });
          }
        }
        if (ys.length > 2) {
          chainLeft = true;
          for (let i = 0; i < ys.length - 1; i++) {
            out.push({ key: `cy:${room.id}:${i}`, entityId: room.id, kind: "section", a: { x: b.minX, y: ys[i + 1] }, b: { x: b.minX, y: ys[i] }, normal: { x: -1, y: 0 }, offset: base, value: ys[i + 1] - ys[i] });
          }
        }
      }
    }

    if (s.showWallDims) {
      for (const e of edgesOf(room.points)) {
        if (e.length < 1) continue;
        const n = outwardNormal(room.points, e.index);
        // Walls that carry a chain get their overall length one ring further out.
        const pushed = (chainTop && n.y < -0.99) || (chainLeft && n.x < -0.99);
        out.push({ key: `w:${room.id}:${e.startVertexId}`, entityId: room.id, kind: "wall", a: e.a, b: e.b, normal: n, offset: base + (pushed ? ring : 0), value: e.length });
      }
    }
    if (s.showOverallDims && (!rect || !s.showWallDims)) {
      const step = s.showWallDims ? atLeast(room.dimOffset, 26) + ring : 0;
      out.push({ key: `ow:${room.id}`, entityId: room.id, kind: "overall", a: { x: b.minX, y: b.minY }, b: { x: b.maxX, y: b.minY }, normal: { x: 0, y: -1 }, offset: base + step, value: b.maxX - b.minX });
      out.push({ key: `ol:${room.id}`, entityId: room.id, kind: "overall", a: { x: b.minX, y: b.maxY }, b: { x: b.minX, y: b.minY }, normal: { x: -1, y: 0 }, offset: base + step, value: b.maxY - b.minY });
    }
    if (s.showExternalDims && t > 0) {
      const ext = boundsOf(offsetPolygon(room.points, t))!;
      const off = atLeast(room.dimOffset, 26);
      const step = off + ring + (s.showOverallDims && !rect ? off + ring : 0);
      // Measured from the external faces, so the offset counts from there.
      out.push({ key: `ew:${room.id}`, entityId: room.id, kind: "external", a: { x: ext.minX, y: b.maxY + t }, b: { x: ext.maxX, y: b.maxY + t }, normal: { x: 0, y: 1 }, offset: s.showWallDims ? step : off, value: ext.maxX - ext.minX, suffix: "ext." });
      out.push({ key: `el:${room.id}`, entityId: room.id, kind: "external", a: { x: b.maxX + t, y: ext.minY }, b: { x: b.maxX + t, y: ext.maxY }, normal: { x: 1, y: 0 }, offset: s.showWallDims ? step : off, value: ext.maxY - ext.minY, suffix: "ext." });
    }
  }

  if (s.showWallDims) {
    for (const p of model.partitions) {
      if (p.hidden) continue;
      for (const e of edgesOf(p.points, false)) {
        if (e.length < 1) continue;
        out.push({ key: `p:${p.id}:${e.startVertexId}`, entityId: p.id, kind: "partition", a: e.a, b: e.b, normal: perp(normalize(sub(e.b, e.a))), offset: p.thickness / 2 + 350, value: e.length });
      }
    }
  }

  if (s.showSectionDims) {
    for (const sec of model.sections) {
      if (sec.hidden || !sec.showDims) continue;
      // Chained sections show their own size only while selected.
      if (chained.has(sec.id) && sec.id !== opts.selectedId) continue;
      const c = rectCorners(sec.x, sec.y, sec.width, sec.depth, sec.rotation);
      // Inside the section, along its top and left edges.
      const inset = Math.min(320, sec.depth * 0.18, sec.width * 0.18);
      const down = normalize(sub(c[3], c[0]));
      const right = normalize(sub(c[1], c[0]));
      out.push({ key: `sw:${sec.id}`, entityId: sec.id, kind: "section", a: c[0], b: c[1], normal: down, offset: inset, value: sec.width });
      out.push({ key: `sd:${sec.id}`, entityId: sec.id, kind: "section", a: c[3], b: c[0], normal: right, offset: inset, value: sec.depth });
    }
  }

  const objs = model.objects.filter((o) => !o.hidden && (s.showObjectDims || o.id === opts.selectedId));
  if (s.showObjects) {
    for (const o of objs) {
      const c = rectCorners(o.x, o.y, o.width, o.depth, o.rotation);
      const up = normalize(sub(c[0], c[3]));
      const left = normalize(sub(c[0], c[1]));
      const off = atLeast(250, 18);
      out.push({ key: `ow:${o.id}`, entityId: o.id, kind: "object", a: c[0], b: c[1], normal: up, offset: off, value: o.width });
      out.push({ key: `od:${o.id}`, entityId: o.id, kind: "object", a: c[3], b: c[0], normal: left, offset: off, value: o.depth });
    }
  }

  for (const d of model.dimensions) {
    if (d.hidden) continue;
    out.push({ key: `u:${d.id}`, entityId: d.id, kind: "user", a: d.a, b: d.b, normal: perp(normalize(sub(d.b, d.a))), offset: d.offset, value: dist(d.a, d.b), suffix: d.suffix || undefined });
  }

  return out;
}
