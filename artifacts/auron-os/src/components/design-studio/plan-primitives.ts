import {
  OBJECT_DEFS,
  SECTION_DEFS,
  add,
  autoDimensions,
  dimLinePoints,
  dist,
  edgesOf,
  formatArea,
  formatLength,
  lerp,
  normalize,
  objectFootprint,
  offsetPolygon,
  openingGeometry,
  paramValue,
  perp,
  polygonArea,
  boundsOf,
  centroid,
  rotate,
  scale,
  sub,
  type DimLine,
  type DisplayUnit,
  type ProjectModel,
  type Vec2,
} from "@workspace/design-model";
import { layoutLabels, textWidthPx, type Candidate, type Crowded, type LabelItem } from "./annotation-layout";

export { textWidthPx };

// ---------------------------------------------------------------------------
// The floor plan as a flat list of drawing primitives in plan millimetres.
// The on-screen SVG canvas, the PNG export and the PDF export all draw this
// same list, so an exported plan always matches what was on screen.
//
// Stroke widths, text sizes and arrowheads are given in "px" at the target
// resolution (`pxPerMm`), so lines stay crisp and labels stay readable at
// any zoom without distorting geometry.
// ---------------------------------------------------------------------------

export type Role =
  | "roomFill"
  | "wall"
  | "wallEdge"
  | "partition"
  | "openingGap"
  | "opening"
  | "swing"
  | "window"
  | "pillar"
  | "section"
  | "object"
  | "objectLine"
  | "dim"
  | "dimText"
  | "label"
  | "roomLabel"
  | "muted";

export type Style = { role: Role; fill?: string; stroke?: string; fillOpacity?: number; width?: number; dash?: number[] };

export type Prim =
  | { k: "poly"; pts: Vec2[]; holes?: Vec2[][]; closed: boolean; style: Style; entityId?: string }
  | { k: "circle"; c: Vec2; r: number; style: Style; entityId?: string }
  | {
      k: "text";
      p: Vec2;
      text: string;
      size: number;
      angle: number;
      anchor: "start" | "middle" | "end";
      baseline: "middle" | "bottom" | "top";
      weight?: "normal" | "bold";
      style: Style;
      halo?: boolean;
      entityId?: string;
      /** On movable name labels: the entity and the automatic anchor its labelOffset is measured from. */
      owner?: { id: string; base: Vec2 };
    }
  | { k: "arrow"; tip: Vec2; dir: Vec2; size: number; style: Style };

export type Palette = Record<Role, { stroke: string; fill: string; width: number; dash?: number[] }>;

export const PRINT_PALETTE: Palette = {
  roomFill: { stroke: "none", fill: "#ffffff", width: 0 },
  wall: { stroke: "#111111", fill: "#3a3a3a", width: 1.6 },
  wallEdge: { stroke: "#111111", fill: "none", width: 1.6 },
  partition: { stroke: "#111111", fill: "#8a8a8a", width: 1.2 },
  openingGap: { stroke: "none", fill: "#ffffff", width: 0 },
  opening: { stroke: "#111111", fill: "none", width: 1.2 },
  swing: { stroke: "#555555", fill: "none", width: 0.8, dash: [4, 3] },
  window: { stroke: "#111111", fill: "#ffffff", width: 1 },
  pillar: { stroke: "#111111", fill: "#bdbdbd", width: 1.2 },
  section: { stroke: "#555555", fill: "#888888", width: 1, dash: [6, 4] },
  object: { stroke: "#1a1a1a", fill: "#dddddd", width: 1.2 },
  objectLine: { stroke: "#333333", fill: "none", width: 0.8 },
  dim: { stroke: "#1f4fbf", fill: "#1f4fbf", width: 0.9 },
  dimText: { stroke: "#ffffff", fill: "#1f4fbf", width: 3 },
  label: { stroke: "#ffffff", fill: "#111111", width: 3 },
  roomLabel: { stroke: "#ffffff", fill: "#333333", width: 3 },
  muted: { stroke: "#9a9a9a", fill: "#9a9a9a", width: 0.8 },
};

export type BuildOptions = {
  pxPerMm: number;
  unit: DisplayUnit;
  selectedId?: string | null;
  /** Layer switches; default to the project's settings. */
  layers?: Partial<Layers>;
};

export type Layers = {
  wallDims: boolean;
  overallDims: boolean;
  externalDims: boolean;
  sectionDims: boolean;
  objectDims: boolean;
  labels: boolean;
  objects: boolean;
  sections: boolean;
  openings: boolean;
  pillars: boolean;
  roomNames: boolean;
};

export function layersFromSettings(model: ProjectModel): Layers {
  const s = model.settings;
  return {
    wallDims: s.showWallDims,
    overallDims: s.showOverallDims,
    externalDims: s.showExternalDims,
    sectionDims: s.showSectionDims,
    objectDims: s.showObjectDims,
    labels: s.showLabels,
    objects: s.showObjects,
    sections: true,
    openings: true,
    pillars: true,
    roomNames: s.showLabels,
  };
}

const FONT_PX = 12;

export type TextPrimitive = Extract<Prim, { k: "text" }>;

function arcPoints(c: Vec2, r: number, from: number, to: number, steps = 18): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

const angleOf = (v: Vec2) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Keeps text upright: angles that would render upside down are flipped. */
function readableAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 90 && a <= 270) a -= 180;
  return a > 180 ? a - 360 : a;
}

/**
 * A dimension's lines and arrows, plus its value text as a label item with
 * fallback positions. The value is always shown: where it doesn't fit
 * between the arrows it goes beyond an end, then further out with a leader.
 */
export function dimensionParts(d: DimLine, opts: { pxPerMm: number; unit: DisplayUnit; style?: Style }): { lines: Prim[]; label: LabelItem<TextPrimitive> | null } {
  const px = (n: number) => n / opts.pxPerMm;
  const lines: Prim[] = [];
  const style = opts.style ?? { role: "dim" as Role };
  const { p1, p2 } = dimLinePoints(d);
  const lenPx = dist(p1, p2) * opts.pxPerMm;
  if (dist(p1, p2) < 0.5) return { lines, label: null };
  // Extension lines: from just off the measured point to just past the dimension line.
  if (Math.abs(d.offset) > 0.5) {
    const gap = px(3);
    const over = px(5);
    const n = d.offset >= 0 ? d.normal : scale(d.normal, -1);
    for (const [m, q] of [[d.a, p1], [d.b, p2]] as const) {
      lines.push({ k: "poly", pts: [add(m, scale(n, gap)), add(q, scale(n, over))], closed: false, style: { ...style, width: 0.6 } });
    }
  }
  lines.push({ k: "poly", pts: [p1, p2], closed: false, style });
  const dir = normalize(sub(p2, p1));
  const arrow = 7;
  const tail = arrow * 1.8;
  const inside = lenPx > arrow * 2.6;
  if (inside) {
    lines.push({ k: "arrow", tip: p1, dir: scale(dir, -1), size: arrow, style });
    lines.push({ k: "arrow", tip: p2, dir, size: arrow, style });
  } else {
    // Short dimension: arrows outside, pointing in.
    lines.push({ k: "arrow", tip: p1, dir, size: arrow, style });
    lines.push({ k: "arrow", tip: p2, dir: scale(dir, -1), size: arrow, style });
    lines.push({ k: "poly", pts: [sub(p1, scale(dir, px(tail))), p1], closed: false, style });
    lines.push({ k: "poly", pts: [p2, add(p2, scale(dir, px(tail)))], closed: false, style });
  }
  const text = `${formatLength(d.value, opts.unit)}${d.suffix ? ` ${d.suffix}` : ""}`;
  const tw = textWidthPx(text, FONT_PX);
  const angle = readableAngle(angleOf(dir));
  // Text sits on the side of the line away from the measured geometry.
  const side = d.offset >= 0 ? d.normal : scale(d.normal, -1);
  const up = rotate({ x: 0, y: -1 }, angle);
  const textDir = rotate({ x: 1, y: 0 }, angle);
  const sign = up.x * side.x + up.y * side.y >= 0 ? 1 : -1;
  const mid = lerp(p1, p2, 0.5);
  const lift = scale(up, sign * px(FONT_PX * 0.75));
  const prim: TextPrimitive = { k: "text", p: add(mid, lift), text, size: FONT_PX, angle, anchor: "middle", baseline: "middle", style: { role: "dimText" }, halo: true, entityId: d.entityId ?? undefined };
  // Beyond either end, clear of the arrow tails, on the line's axis.
  const beyond = px(lenPx / 2 + (inside ? 4 : tail + 4) + tw / 2);
  const along = (k: number) => scale(textDir, k * beyond);
  const fits = lenPx >= tw + 8;
  const cands: Candidate[] = [];
  const mid0: Candidate = { shift: { x: 0, y: 0 } };
  const flipped: Candidate = { shift: scale(lift, -2) };
  const after: Candidate = { shift: add(along(1), scale(lift, -1)) };
  const before: Candidate = { shift: add(along(-1), scale(lift, -1)) };
  if (fits || d.kind === "user") cands.push(mid0, flipped, after, before);
  else cands.push(after, before, mid0, flipped);
  // Last resort: stacked further out, with a leader back to the line.
  for (const k of [2.4, 3.8]) cands.push({ shift: scale(lift, k), leaderFrom: mid });
  return { lines, label: { key: `dim:${d.key}`, prims: [prim], candidates: cands } };
}

/** Lines, arrows and text of one dimension at its preferred text position (used for live previews). */
export function dimensionPrims(d: DimLine, opts: { pxPerMm: number; unit: DisplayUnit; style?: Style }): Prim[] {
  const { lines, label } = dimensionParts(d, opts);
  if (!label) return lines;
  const c = label.candidates[0];
  return [...lines, ...label.prims.map((t) => ({ ...t, p: add(t.p, c.shift) }))];
}

export type PlanBuild = {
  prims: Prim[];
  /** Labels that found no clear spot and were drawn at their preferred position anyway. */
  crowded: Crowded[];
};

export function buildPlanPrimitives(model: ProjectModel, opts: BuildOptions): Prim[] {
  return buildPlan(model, opts).prims;
}

const ZERO: Vec2 = { x: 0, y: 0 };
const isZero = (v: Vec2 | undefined) => !v || (Math.abs(v.x) < 0.5 && Math.abs(v.y) < 0.5);

/** Offsets as fractions of a box, nearest the centre first (deterministic order). */
function gridFractions(steps: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const u of steps) for (const v of steps) out.push([u, v]);
  return out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || a[1] - b[1] || a[0] - b[0]);
}

export function buildPlan(model: ProjectModel, opts: BuildOptions): PlanBuild {
  const layers: Layers = { ...layersFromSettings(model), ...(opts.layers ?? {}) };
  const px = (n: number) => n / opts.pxPerMm;
  const out: Prim[] = [];
  const unit = opts.unit;
  // Labels are collected by priority and placed together at the end, so
  // that none of them covers another or sits under a stage or backdrop.
  const fixedItems: LabelItem<TextPrimitive>[] = [];
  const dimItems: LabelItem<TextPrimitive>[] = [];
  const openingItems: LabelItem<TextPrimitive>[] = [];
  const objectItems: Array<LabelItem<TextPrimitive> & { area: number }> = [];
  const sectionItems: LabelItem<TextPrimitive>[] = [];
  const roomItems: LabelItem<TextPrimitive>[] = [];
  // Footprints that room and section names keep clear of.
  const blockers: Vec2[][] = [];
  if (layers.objects) for (const o of model.objects) if (!o.hidden) blockers.push(objectFootprint(o));
  if (layers.pillars) for (const p of model.pillars) if (!p.hidden) blockers.push(objectFootprint(p));

  // Room floors.
  for (const room of model.rooms) {
    if (room.hidden) continue;
    out.push({ k: "poly", pts: room.points, closed: true, style: { role: "roomFill" }, entityId: room.id });
  }

  // Sections and zones (under everything placed on them).
  if (layers.sections) {
    for (const s of model.sections) {
      if (s.hidden) continue;
      const pts = objectFootprint(s);
      out.push({ k: "poly", pts, closed: true, style: { role: "section", fill: s.color, stroke: s.color, fillOpacity: 0.12 }, entityId: s.id });
      const c = { x: s.x, y: s.y };
      const name = s.name || SECTION_DEFS[s.kind].label;
      const minSide = Math.min(s.width, s.depth) * opts.pxPerMm;
      const size = Math.min(14, Math.max(10, minSide / 7));
      // Narrow strips are named along their length.
      const tw = textWidthPx(name, size, true);
      const alongLength = s.depth > s.width && tw + 8 > s.width * opts.pxPerMm;
      const angle = readableAngle(s.rotation + (alongLength ? 90 : 0));
      const prim: TextPrimitive = { k: "text", p: c, text: name, size, angle, anchor: "middle", baseline: "middle", weight: "bold", style: { role: "label", fill: s.color }, halo: true, entityId: s.id, owner: { id: s.id, base: c } };
      if (!isZero(s.labelOffset)) {
        fixedItems.push({ key: `section:${s.id}`, prims: [prim], candidates: [{ shift: s.labelOffset }], fixed: true });
      } else {
        const local = (u: number, v: number) => sub(rotate({ x: s.x + u * s.width, y: s.y + v * s.depth }, s.rotation, c), c);
        const spots = gridFractions([0, -0.25, 0.25, -0.38, 0.38]).map(([u, v]) => local(u, v));
        const cands: Candidate[] = [...spots.map((shift) => ({ shift })), ...spots.map((shift) => ({ shift, sizeScale: 0.82 }))];
        // Outside the section, with a leader back to it.
        const lift = px(size * 0.9);
        cands.push({ shift: local(0, -0.5), angle: readableAngle(s.rotation), leaderFrom: c }, { shift: local(0, 0.5), angle: readableAngle(s.rotation), leaderFrom: c });
        cands[cands.length - 2].shift = add(cands[cands.length - 2].shift, scale(rotate({ x: 0, y: -1 }, s.rotation), lift));
        cands[cands.length - 1].shift = add(cands[cands.length - 1].shift, scale(rotate({ x: 0, y: 1 }, s.rotation), lift));
        sectionItems.push({ key: `section:${s.id}`, prims: [prim], candidates: cands, within: pts, avoid: blockers });
      }
    }
  }

  // Walls: a band between the internal face and the offset external face.
  for (const room of model.rooms) {
    if (room.hidden) continue;
    if (room.showWalls && room.wallThickness > 0) {
      const outer = offsetPolygon(room.points, room.wallThickness);
      out.push({ k: "poly", pts: outer, holes: [room.points], closed: true, style: { role: "wall" }, entityId: room.id });
    } else {
      out.push({ k: "poly", pts: room.points, closed: true, style: { role: "wallEdge" }, entityId: room.id });
    }
  }
  for (const p of model.partitions) {
    if (p.hidden) continue;
    for (const e of edgesOf(p.points, false)) {
      if (e.length < 0.5) continue;
      const n = scale(perp(normalize(sub(e.b, e.a))), p.thickness / 2);
      out.push({ k: "poly", pts: [add(e.a, n), add(e.b, n), sub(e.b, n), sub(e.a, n)], closed: true, style: { role: "partition" }, entityId: p.id });
    }
  }

  // Openings cut the wall and get their symbol.
  if (layers.openings) {
    for (const o of model.openings) {
      if (o.hidden) continue;
      const g = openingGeometry(model, o);
      if (!g) continue;
      const t = g.thickness;
      const isRoom = g.hostKind === "room";
      const inner = isRoom ? 0 : -t / 2;
      const outerD = isRoom ? t : t / 2;
      const a0 = add(g.a, scale(g.normal, inner));
      const b0 = add(g.b, scale(g.normal, inner));
      const a1 = add(g.a, scale(g.normal, outerD));
      const b1 = add(g.b, scale(g.normal, outerD));
      out.push({ k: "poly", pts: [a0, b0, b1, a1], closed: true, style: { role: "openingGap" }, entityId: o.id });
      // Jambs.
      out.push({ k: "poly", pts: [a0, a1], closed: false, style: { role: "opening" }, entityId: o.id });
      out.push({ k: "poly", pts: [b0, b1], closed: false, style: { role: "opening" }, entityId: o.id });
      if (o.kind === "window") {
        const mids = [0.25, 0.5, 0.75].map((f) => [add(g.a, scale(g.normal, inner + (outerD - inner) * f)), add(g.b, scale(g.normal, inner + (outerD - inner) * f))]);
        for (const [m1, m2] of mids) out.push({ k: "poly", pts: [m1, m2], closed: false, style: { role: "window" }, entityId: o.id });
      } else if ((o.kind === "door" || o.kind === "emergency_exit" || o.kind === "double_door") && o.swing !== "none") {
        // Leaf + swing arc on the chosen side (in = into the room).
        const side = o.swingSide === "in" ? scale(g.normal, -1) : g.normal;
        const face = o.swingSide === "in" ? a0 : a1;
        const faceB = o.swingSide === "in" ? b0 : b1;
        const leaves = o.kind === "double_door" ? [{ hinge: face, free: faceB, w: o.width / 2 }, { hinge: faceB, free: face, w: o.width / 2 }] : o.swing === "left" ? [{ hinge: face, free: faceB, w: o.width }] : [{ hinge: faceB, free: face, w: o.width }];
        for (const leaf of leaves) {
          const along = normalize(sub(leaf.free, leaf.hinge));
          const tip = add(leaf.hinge, scale(side, leaf.w));
          out.push({ k: "poly", pts: [leaf.hinge, tip], closed: false, style: { role: "opening" }, entityId: o.id });
          const a = angleOf(side);
          const b = angleOf(along);
          let delta = b - a;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          out.push({ k: "poly", pts: arcPoints(leaf.hinge, leaf.w, a, a + delta), closed: false, style: { role: "swing" }, entityId: o.id });
        }
      } else {
        // Plain opening / entrance / loading: dashed line across the gap.
        out.push({ k: "poly", pts: [lerp(a0, a1, 0.5), lerp(b0, b1, 0.5)], closed: false, style: { role: "swing" }, entityId: o.id });
      }
      if (o.kind === "emergency_exit" || o.kind === "entrance" || o.kind === "loading") {
        const label = o.kind === "emergency_exit" ? "EXIT" : o.kind === "entrance" ? "ENTRY" : "LOADING";
        const m = lerp(g.a, g.b, 0.5);
        const prim: TextPrimitive = { k: "text", p: add(m, scale(g.normal, -px(16))), text: label, size: 10, angle: readableAngle(angleOf(g.dir)), anchor: "middle", baseline: "middle", weight: "bold", style: { role: "label", fill: o.kind === "emergency_exit" ? "#15803d" : undefined }, halo: true, entityId: o.id };
        const slide = scale(g.dir, o.width / 2);
        openingItems.push({
          key: `opening:${o.id}`,
          prims: [prim],
          candidates: [
            { shift: ZERO },
            { shift: scale(g.normal, -px(14)) },
            { shift: slide },
            { shift: scale(slide, -1) },
            { shift: scale(g.normal, px(32) + t) },
          ],
        });
      }
    }
  }

  // Pillars.
  if (layers.pillars) {
    for (const p of model.pillars) {
      if (p.hidden) continue;
      if (p.shape === "round") out.push({ k: "circle", c: { x: p.x, y: p.y }, r: p.width / 2, style: { role: "pillar" }, entityId: p.id });
      else {
        const pts = objectFootprint(p);
        out.push({ k: "poly", pts, closed: true, style: { role: "pillar" }, entityId: p.id });
        out.push({ k: "poly", pts: [pts[0], pts[2]], closed: false, style: { role: "objectLine" }, entityId: p.id });
        out.push({ k: "poly", pts: [pts[1], pts[3]], closed: false, style: { role: "objectLine" }, entityId: p.id });
      }
    }
  }

  // Event objects, as footprints with a simple symbol.
  if (layers.objects) {
    for (const o of model.objects) {
      if (o.hidden) continue;
      const pts = objectFootprint(o);
      const c = { x: o.x, y: o.y };
      const loc = (lx: number, ly: number) => rotate({ x: o.x + lx, y: o.y + ly }, o.rotation, c);
      const hw = o.width / 2;
      const hd = o.depth / 2;
      const st: Style = { role: "object", fill: o.color, fillOpacity: o.type === "box_arch" ? 0 : 0.85 };
      if (o.type === "round_table") {
        out.push({ k: "circle", c, r: o.width / 2, style: st, entityId: o.id });
        const seats = Number(paramValue(o.props, o.type, "seats")) || 0;
        for (let i = 0; i < seats; i++) {
          const a = (i / seats) * Math.PI * 2;
          out.push({ k: "circle", c: { x: o.x + Math.cos(a) * (o.width / 2 + 280), y: o.y + Math.sin(a) * (o.width / 2 + 280) }, r: 220, style: { role: "objectLine" }, entityId: o.id });
        }
      } else if (o.type === "box_arch") {
        const s = Number(paramValue(o.props, o.type, "trussSize")) || 300;
        out.push({ k: "poly", pts, closed: true, style: { role: "objectLine", dash: [6, 4] }, entityId: o.id });
        for (const sx of [-1, 1]) {
          const cx = sx * (hw - s / 2);
          out.push({ k: "poly", pts: [loc(cx - s / 2, -hd), loc(cx + s / 2, -hd), loc(cx + s / 2, hd), loc(cx - s / 2, hd)], closed: true, style: { role: "object", fill: o.color, fillOpacity: 0.9 }, entityId: o.id });
        }
      } else {
        out.push({ k: "poly", pts, closed: true, style: st, entityId: o.id });
        if (o.type === "steps") {
          const n = Math.max(1, Number(paramValue(o.props, o.type, "count")) || 3);
          for (let i = 1; i < n; i++) {
            const y = hd - (o.depth * i) / n;
            out.push({ k: "poly", pts: [loc(-hw, y), loc(hw, y)], closed: false, style: { role: "objectLine" }, entityId: o.id });
          }
          // Arrow towards the top of the flight (the back, -y).
          out.push({ k: "poly", pts: [loc(0, hd * 0.8), loc(0, -hd * 0.8)], closed: false, style: { role: "objectLine" }, entityId: o.id });
          out.push({ k: "arrow", tip: loc(0, -hd * 0.8), dir: rotate({ x: 0, y: -1 }, o.rotation), size: 6, style: { role: "objectLine" } });
        } else if (o.type === "stage" || o.type === "riser") {
          out.push({ k: "poly", pts: [pts[0], pts[2]], closed: false, style: { role: "objectLine", dash: [2, 4] }, entityId: o.id });
          out.push({ k: "poly", pts: [pts[1], pts[3]], closed: false, style: { role: "objectLine", dash: [2, 4] }, entityId: o.id });
          if (o.type === "stage" && paramValue<boolean>(o.props, o.type, "frontSteps")) {
            const sw = Number(paramValue(o.props, o.type, "stepWidth")) || 1200;
            const sd = Math.max(300, Math.ceil(o.height / 180) * 300);
            out.push({ k: "poly", pts: [loc(-sw / 2, hd), loc(sw / 2, hd), loc(sw / 2, hd + sd), loc(-sw / 2, hd + sd)], closed: true, style: { role: "object", fill: o.color, fillOpacity: 0.6 }, entityId: o.id });
          }
        } else if (o.type === "led_screen") {
          out.push({ k: "poly", pts: [loc(-hw, hd), loc(hw, hd)], closed: false, style: { role: "objectLine", stroke: o.accentColor, width: 2.4 }, entityId: o.id });
        } else if (o.type === "counter") {
          out.push({ k: "poly", pts: [loc(-hw, hd - 40), loc(hw, hd - 40)], closed: false, style: { role: "objectLine", stroke: o.accentColor, width: 2 }, entityId: o.id });
        }
      }
      const maxSide = Math.max(o.width, o.depth) * opts.pxPerMm;
      if (maxSide > 40) {
        const angle = readableAngle(o.depth > o.width * 1.6 ? o.rotation + 90 : o.rotation);
        const prim: TextPrimitive = { k: "text", p: c, text: o.name || OBJECT_DEFS[o.type].label, size: 11, angle, anchor: "middle", baseline: "middle", weight: "bold", style: { role: "label" }, halo: true, entityId: o.id, owner: { id: o.id, base: c } };
        if (!isZero(o.labelOffset)) {
          fixedItems.push({ key: `object:${o.id}`, prims: [prim], candidates: [{ shift: o.labelOffset }], fixed: true });
        } else {
          // Thin items (backdrops, screens, skirting) are named just behind their face.
          const above = sub(loc(0, -hd - px(9)), c);
          const below = sub(loc(0, hd + px(9)), c);
          const thin = o.type === "led_screen" || o.type === "backdrop" || o.type === "skirting";
          const across = o.depth > o.width * 1.6 ? rotate({ x: 1, y: 0 }, o.rotation) : rotate({ x: 0, y: 1 }, o.rotation);
          const half = (o.depth > o.width * 1.6 ? hw : hd) / 2;
          const cands: Candidate[] = thin
            ? [{ shift: above }, { shift: below }, { shift: ZERO }, { shift: above, sizeScale: 0.85 }, { shift: below, sizeScale: 0.85 }]
            : [{ shift: ZERO }, { shift: scale(across, -half) }, { shift: scale(across, half) }, { shift: ZERO, sizeScale: 0.85 }, { shift: below }, { shift: above }];
          objectItems.push({ key: `object:${o.id}`, prims: [prim], candidates: cands, area: o.width * o.depth });
        }
      }
    }
  }

  // Room names with area.
  if (layers.roomNames) {
    for (const room of model.rooms) {
      if (room.hidden) continue;
      const c = centroid(room.points);
      const area = formatArea(polygonArea(room.points), unit);
      const owner = { id: room.id, base: c };
      const prims: TextPrimitive[] = [
        { k: "text", p: c, text: room.name, size: 15, angle: 0, anchor: "middle", baseline: "bottom", weight: "bold", style: { role: "roomLabel" }, halo: true, entityId: room.id, owner },
        { k: "text", p: add(c, { x: 0, y: px(4) }), text: area, size: 11, angle: 0, anchor: "middle", baseline: "top", style: { role: "roomLabel" }, halo: true, entityId: room.id, owner },
      ];
      if (!isZero(room.labelOffset)) {
        fixedItems.push({ key: `room:${room.id}`, prims, candidates: [{ shift: room.labelOffset }], fixed: true });
      } else {
        const b = boundsOf(room.points)!;
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        const cands: Candidate[] = gridFractions([0, -0.12, 0.12, -0.25, 0.25, -0.36, 0.36]).map(([u, v]) => ({ shift: { x: u * w, y: v * h } }));
        roomItems.push({ key: `room:${room.id}`, prims, candidates: cands, within: room.points, avoid: blockers });
      }
    }
  }

  // Free text labels.
  if (layers.labels) {
    for (const l of model.labels) {
      if (l.hidden || !l.text.trim()) continue;
      const size = l.size === "lg" ? 18 : l.size === "sm" ? 10 : 13;
      fixedItems.push({ key: `label:${l.id}`, prims: [{ k: "text", p: { x: l.x, y: l.y }, text: l.text, size, angle: 0, anchor: "middle", baseline: "middle", style: { role: "label" }, halo: true, entityId: l.id }], candidates: [{ shift: ZERO }], fixed: true });
    }
  }

  // Dimensions last, on top of everything.
  const filtered: ProjectModel = {
    ...model,
    settings: {
      ...model.settings,
      showWallDims: layers.wallDims,
      showOverallDims: layers.overallDims,
      showExternalDims: layers.externalDims,
      showSectionDims: layers.sectionDims && layers.sections,
      showObjectDims: layers.objectDims,
      showObjects: layers.objects,
    },
  };
  for (const d of autoDimensions(filtered, { selectedId: opts.selectedId, pxPerMm: opts.pxPerMm })) {
    const { lines, label } = dimensionParts(d, { pxPerMm: opts.pxPerMm, unit });
    out.push(...lines);
    if (label) dimItems.push(label);
  }

  // Room names that fit nowhere inside go below the drawing, with a leader.
  if (roomItems.length) {
    const ext: Vec2[] = [];
    for (const p of out) if (p.k === "poly") ext.push(...p.pts);
    const bottom = (boundsOf(ext)?.maxY ?? 0) + px(18);
    roomItems.forEach((item, i) => {
      const base = item.prims[0].p;
      item.candidates.push({ shift: { x: 0, y: bottom + px(i * 34) - base.y + px(15) }, leaderFrom: base });
    });
  }

  // Smaller objects choose first: a stage has room to move its name, a backdrop on it doesn't.
  objectItems.sort((a, b) => a.area - b.area);
  const laid = layoutLabels([...fixedItems, ...dimItems, ...openingItems, ...objectItems, ...sectionItems, ...roomItems], opts.pxPerMm);
  out.push(...laid.prims);
  return { prims: out, crowded: laid.crowded };
}
