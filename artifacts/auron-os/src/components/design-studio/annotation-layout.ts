import { add, convexOverlap, pointInPolygon, rotate, scale, type Vec2 } from "@workspace/design-model";

// ---------------------------------------------------------------------------
// Annotation placement for the floor plan (screen, PNG and PDF alike).
//
// Every text label is placed in a fixed priority order, and each one tries a
// fixed list of candidate positions, taking the first that doesn't cover a
// label already placed or something it must keep clear of (a stage, say).
// The same plan therefore always lays out the same way, on screen and on
// paper. Nothing is ever dropped: when no candidate fits, the first one is
// used and the label is reported as crowded so the UI can say so.
//
// Only label *positions* move. Measured values and the dimension lines
// themselves are never changed here.
// ---------------------------------------------------------------------------

/** The parts of a text primitive the layout needs (plan-primitives' text prim satisfies it). */
export type TextPrim = {
  k: "text";
  p: Vec2;
  text: string;
  size: number;
  angle: number;
  anchor: "start" | "middle" | "end";
  baseline: "middle" | "bottom" | "top";
  weight?: "normal" | "bold";
  style: { role: string };
  halo?: boolean;
  entityId?: string;
  /** Set on movable name labels: who owns it and where its automatic origin is. */
  owner?: { id: string; base: Vec2 };
};

export type LinePrim = { k: "poly"; pts: Vec2[]; closed: false; style: { role: "muted"; width?: number }; entityId?: string };

export type Candidate = {
  /** Shift applied to every prim of the label (plan mm). */
  shift: Vec2;
  /** Replaces the angle of every prim (deg). */
  angle?: number;
  /** Multiplies text size. */
  sizeScale?: number;
  /** Thin line drawn from this point to the nearest point of the placed label. */
  leaderFrom?: Vec2;
  /** Exempt from the item's `within` rule (a position deliberately outside it). */
  free?: boolean;
};

export type LabelItem<T extends TextPrim = TextPrim> = {
  key: string;
  prims: T[];
  candidates: Candidate[];
  /** Placed exactly as given (user labels, manually moved labels). */
  fixed?: boolean;
  /** Must stay inside this polygon (unless the candidate has a leader). */
  within?: Vec2[];
  /** Must not cover these polygons. */
  avoid?: Vec2[][];
};

export type Crowded = { key: string; text: string; entityId?: string };

export type LayoutResult<T extends TextPrim = TextPrim> = { prims: Array<T | LinePrim>; crowded: Crowded[] };

/** Approximate rendered width of a label (Inter/Helvetica). */
export const textWidthPx = (text: string, size: number, bold = false): number => text.length * size * (bold ? 0.6 : 0.56);

/** Oriented box (4 corners, plan mm) covered by a text prim, with padding. */
export function textBox(t: TextPrim, pxPerMm: number, padPx = 2): Vec2[] {
  const w = (textWidthPx(t.text, t.size, t.weight === "bold") + padPx * 2) / pxPerMm;
  const h = (t.size * 1.15 + padPx * 2) / pxPerMm;
  const dir = rotate({ x: 1, y: 0 }, t.angle);
  const up = rotate({ x: 0, y: -1 }, t.angle);
  let c = t.p;
  if (t.anchor === "start") c = add(c, scale(dir, w / 2 - padPx / pxPerMm));
  if (t.anchor === "end") c = add(c, scale(dir, -w / 2 + padPx / pxPerMm));
  if (t.baseline === "bottom") c = add(c, scale(up, h / 2 - padPx / pxPerMm));
  if (t.baseline === "top") c = add(c, scale(up, -h / 2 + padPx / pxPerMm));
  const dx = scale(dir, w / 2);
  const dy = scale(up, h / 2);
  return [add(add(c, scale(dx, -1)), dy), add(add(c, dx), dy), add(add(c, dx), scale(dy, -1)), add(add(c, scale(dx, -1)), scale(dy, -1))];
}

type Box = { pts: Vec2[]; minX: number; minY: number; maxX: number; maxY: number };

function toBox(pts: Vec2[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { pts, minX, minY, maxX, maxY };
}

const boxesOverlap = (a: Box, b: Box) => a.maxX > b.minX && b.maxX > a.minX && a.maxY > b.minY && b.maxY > a.minY && convexOverlap(a.pts, b.pts, 0.01);

function apply<T extends TextPrim>(prims: T[], c: Candidate): T[] {
  return prims.map((t) => ({
    ...t,
    p: add(t.p, c.shift),
    angle: c.angle ?? t.angle,
    size: c.sizeScale ? t.size * c.sizeScale : t.size,
  }));
}

/** Nearest point of a convex polygon's outline to `p`. */
function nearestOnOutline(poly: Vec2[], p: Vec2): Vec2 {
  let best = poly[0];
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / Math.max(1e-9, abx * abx + aby * aby)));
    const q = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

export function layoutLabels<T extends TextPrim>(items: LabelItem<T>[], pxPerMm: number, obstacles: Vec2[][] = []): LayoutResult<T> {
  const placed: Box[] = obstacles.map(toBox);
  const out: Array<T | LinePrim> = [];
  const crowded: Crowded[] = [];

  for (const item of items) {
    if (!item.prims.length) continue;
    const avoid = (item.avoid ?? []).map(toBox);
    let chosen: { prims: T[]; boxes: Box[]; cand: Candidate } | null = null;
    const cands = item.fixed ? item.candidates.slice(0, 1) : item.candidates;
    for (const cand of cands) {
      const prims = apply(item.prims, cand);
      const boxes = prims.map((t) => toBox(textBox(t, pxPerMm)));
      if (item.fixed) {
        chosen = { prims, boxes, cand };
        break;
      }
      if (item.within && !cand.leaderFrom && !cand.free && !boxes.every((b) => b.pts.every((q) => pointInPolygon(q, item.within!, 0.5)))) continue;
      if (boxes.some((b) => placed.some((o) => boxesOverlap(b, o)) || avoid.some((o) => boxesOverlap(b, o)))) continue;
      chosen = { prims, boxes, cand };
      break;
    }
    if (!chosen) {
      // Deterministic fallback: the first candidate, flagged as crowded.
      const cand = item.candidates[0] ?? { shift: { x: 0, y: 0 } };
      const prims = apply(item.prims, cand);
      chosen = { prims, boxes: prims.map((t) => toBox(textBox(t, pxPerMm))), cand };
      crowded.push({ key: item.key, text: item.prims.map((t) => t.text).join(" "), entityId: item.prims[0].entityId });
    }
    placed.push(...chosen.boxes);
    if (chosen.cand.leaderFrom) {
      const to = nearestOnOutline(chosen.boxes[0].pts, chosen.cand.leaderFrom);
      out.push({ k: "poly", pts: [chosen.cand.leaderFrom, to], closed: false, style: { role: "muted", width: 0.8 }, entityId: item.prims[0].entityId });
    }
    out.push(...chosen.prims);
  }
  return { prims: out, crowded };
}
