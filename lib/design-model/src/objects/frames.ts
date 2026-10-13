import { beam, box, type Part } from "../parts";
import { clamp, trussMember, tubeMember, type ObjectDef } from "./kit";

// Arches and frames people walk through. Legs stand on base plates inside
// the footprint; members meet at corner blocks so nothing floats.

const PLATE = 12;

export const FRAME_DEFS = {
  box_arch: {
    type: "box_arch",
    label: "Box arch",
    category: "Arches & frames",
    description: "Square truss goalpost: two legs, corner blocks and a top beam.",
    keywords: ["truss", "goalpost", "arch", "entrance", "gantry"],
    width: 8000,
    depth: 400,
    height: 5000,
    elevation: 0,
    color: "#b9bcc4",
    accentColor: "#8a8d96",
    open: true,
    legacyPlan: true,
    params: [
      {
        key: "style",
        label: "Member style",
        kind: "choice",
        default: "truss",
        options: [
          { value: "truss", label: "Truss (chords and lacing)" },
          { value: "box", label: "Solid square beam" },
        ],
      },
      { key: "trussSize", label: "Truss section", kind: "length", default: 300, min: 100, max: 1000 },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = archSection(o, p.num("trussSize"));
      const lx = w / 2 - t / 2;
      const pw = Math.min(t + 120, w / 3);
      const pd = Math.max(t, Math.min(t + 120, d));
      const truss = p.str("style") !== "box";
      // Base plates sit inside the footprint, under the outer edge of each leg.
      const px = w / 2 - pw / 2;
      const parts: Part[] = [box(-px, 0, 0, pw, PLATE, pd, "dark", { role: "base" }), box(px, 0, 0, pw, PLATE, pd, "dark", { role: "base" })];
      for (const [x, side] of [[-lx, "leg-left"], [lx, "leg-right"]] as const) {
        parts.push(...(truss ? trussMember("y", PLATE, h - t, [x, 0], t, side) : tubeMember("y", PLATE, h - t, [x, 0], t, side, "body")));
        parts.push(box(x, h - t, 0, t, t, t, truss ? "accent" : "body", { role: "corner" }));
      }
      parts.push(...(truss ? trussMember("x", -w / 2 + t, w / 2 - t, [h - t / 2, 0], t, "beam") : tubeMember("x", -w / 2 + t, w / 2 - t, [h - t / 2, 0], t, "beam", "body")));
      return parts;
    },
  },
  goalpost: {
    type: "goalpost",
    label: "Goalpost frame",
    category: "Arches & frames",
    description: "Slim square-tube goalpost on base plates.",
    keywords: ["square tube", "frame", "crossbar", "rectangular frame"],
    width: 4000,
    depth: 300,
    height: 3000,
    elevation: 0,
    color: "#1d1f26",
    accentColor: "#8a8d96",
    open: true,
    params: [{ key: "tube", label: "Tube size", kind: "length", default: 100, min: 20, max: 500 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = clamp(p.num("tube"), 10, Math.min(w / 4, h / 3, d));
      const lx = w / 2 - t / 2;
      const pw = Math.min(w / 4, t * 2.5);
      return [
        box(-(w / 2 - pw / 2), 0, 0, pw, PLATE, d, "dark", { role: "base" }),
        box(w / 2 - pw / 2, 0, 0, pw, PLATE, d, "dark", { role: "base" }),
        ...tubeMember("y", PLATE, h - t, [-lx, 0], t, "leg-left", "body"),
        ...tubeMember("y", PLATE, h - t, [lx, 0], t, "leg-right", "body"),
        ...tubeMember("x", -w / 2, w / 2, [h - t / 2, 0], t, "beam", "body"),
      ];
    },
  },
  circular_arch: {
    type: "circular_arch",
    label: "Circular arch",
    category: "Arches & frames",
    description: "Round-top tube arch on two straight legs.",
    keywords: ["round arch", "balloon arch frame", "hoop", "curved"],
    width: 3000,
    depth: 400,
    height: 3000,
    elevation: 0,
    color: "#d8d4cc",
    accentColor: "#1d1f26",
    open: true,
    params: [{ key: "tube", label: "Tube diameter", kind: "length", default: 60, min: 20, max: 300 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = clamp(p.num("tube"), 10, Math.min(w / 6, d));
      const a = w / 2 - t / 2;
      const top = h - t / 2;
      const pts = arcPoints(a, top, PLATE, t);
      const pw = Math.min(w / 4, t * 3);
      const parts: Part[] = [box(-(w / 2 - pw / 2), 0, 0, pw, PLATE, d, "dark", { role: "base" }), box(w / 2 - pw / 2, 0, 0, pw, PLATE, d, "dark", { role: "base" })];
      for (let i = 0; i < pts.length - 1; i++) parts.push(beam([pts[i][0], pts[i][1], 0], [pts[i + 1][0], pts[i + 1][1], 0], t, "body", { round: true, role: i === 0 ? "leg-left" : i === pts.length - 2 ? "leg-right" : "arch" }));
      return parts;
    },
  },
  photo_frame: {
    type: "photo_frame",
    label: "Photo-booth frame",
    category: "Arches & frames",
    description: "Freestanding picture-frame border on feet.",
    keywords: ["photo frame", "selfie frame", "freestanding frame", "rectangular frame"],
    width: 2400,
    depth: 600,
    height: 2400,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    open: true,
    params: [
      { key: "border", label: "Border width", kind: "length", default: 200, min: 30, max: 1000 },
      { key: "thickness", label: "Frame thickness", kind: "length", default: 100, min: 18, max: 600 },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const b = clamp(p.num("border"), 20, Math.min(w, h) / 3);
      const t = clamp(p.num("thickness"), 10, Math.max(10, d - 4));
      return [
        box(0, h - b, 0, w, b, t, "body", { role: "frame-top" }),
        box(0, 0, 0, w, b, t, "body", { role: "frame-bottom" }),
        box(-w / 2 + b / 2, b, 0, b, h - 2 * b, t, "body", { role: "frame-side" }),
        box(w / 2 - b / 2, b, 0, b, h - 2 * b, t, "body", { role: "frame-side" }),
        box(0, h - b + b * 0.2, t / 2 + 1, w - b * 0.4, b * 0.6, 2, "accent", { role: "trim", plan: false }),
        box(-w / 2 + b / 2, 0, 0, Math.min(b, 80), 30, d, "dark", { role: "foot" }),
        box(w / 2 - b / 2, 0, 0, Math.min(b, 80), 30, d, "dark", { role: "foot" }),
      ];
    },
  },
  entrance_gate: {
    type: "entrance_gate",
    label: "Entrance gate",
    category: "Arches & frames",
    description: "Two branded pillars with a header sign across the top.",
    keywords: ["gate", "entry arch", "welcome arch", "portal"],
    width: 4000,
    depth: 600,
    height: 3500,
    elevation: 0,
    color: "#1f3a5f",
    accentColor: "#c8a24a",
    open: true,
    params: [
      { key: "pillarWidth", label: "Pillar width", kind: "length", default: 600, min: 100, max: 3000 },
      { key: "headerHeight", label: "Header height", kind: "length", default: 600, min: 100, max: 3000 },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const pw = clamp(p.num("pillarWidth"), 50, w / 3);
      const hh = clamp(p.num("headerHeight"), 50, h / 2);
      const parts: Part[] = [];
      // The sign face is the front 2 mm of the header.
      for (const [sx, side] of [[-1, "leg-left"], [1, "leg-right"]] as const) parts.push(box(sx * (w / 2 - pw / 2), 0, 0, pw, h - hh, d, "body", { role: side }));
      parts.push(box(0, h - hh, -1, w, hh, d - 2, "body", { role: "beam" }));
      parts.push(box(0, h - hh + hh * 0.15, d / 2 - 1, w * 0.8, hh * 0.7, 2, "accent", { role: "sign", plan: false }));
      return parts;
    },
  },
} satisfies Record<string, ObjectDef>;

/** Truss section that fits the arch's footprint and height. */
export function archSection(o: { width: number; depth: number; height: number }, size: number): number {
  return clamp(size, 50, Math.max(50, Math.min(o.width / 3, o.height / 2, o.depth)));
}

/**
 * Centreline of a round-top arch with half-span `a` whose crown is at
 * `top`: straight legs up to a semicircle when it is tall enough, otherwise
 * a flatter circular segment springing from the base plates.
 */
export function arcPoints(a: number, top: number, base: number, leg = 0, segments = 24): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  if (top - base >= a) {
    const spring = top - a;
    pts.push([-a, base]);
    for (let i = 0; i <= segments; i++) {
      const t = Math.PI - (i / segments) * Math.PI;
      pts.push([Math.cos(t) * a, spring + Math.sin(t) * a]);
    }
    pts.push([a, base]);
    // Drop duplicate points where there are no straight legs.
    return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.5);
  }
  // Short straight feet (one tube size) so the tube ends stand flat on the plates.
  const spring = Math.min(base + leg, top - 1);
  const s = top - spring;
  const R = (a * a + s * s) / (2 * s);
  const cy = top - R;
  const half = Math.asin(clamp(a / R, -1, 1));
  pts.push([-a, base]);
  for (let i = 0; i <= segments; i++) {
    const t = Math.PI / 2 + half - (i / segments) * 2 * half;
    pts.push([Math.cos(t) * R, cy + Math.sin(t) * R]);
  }
  pts.push([a, base]);
  return pts;
}

