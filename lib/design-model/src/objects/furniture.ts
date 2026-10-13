import { box, cyl, prism, type Part } from "../parts";
import { chair, clamp, type ObjectDef, type ParamReader, type SurfaceDef } from "./kit";

// Counters, tables and furniture. Counters face their guests at the front
// (+z); staff stand at the back.

/**
 * A counter run: recessed plinth, cabinet body, front fascia with an
 * optional brand panel, optional side panels, and a countertop that
 * overhangs the front and both sides. Everything stays inside w × d.
 */
export function counterParts(w: number, d: number, h: number, p: ParamReader, opts: { cx?: number; cz?: number; topTone?: "top" } = {}): Part[] {
  const cx = opts.cx ?? 0;
  const cz = opts.cz ?? 0;
  const tt = clamp(p.num("topThickness") || 40, 12, h / 4);
  const ov = clamp(p.num("topOverhang"), 0, Math.min(w / 4, d / 3));
  const fascia = Math.min(18, (d - ov) / 6);
  const kick = Math.min(100, (h - tt) / 5);
  const bw = w - 2 * ov;
  // Front face of the fascia; the brand panel is the 2 mm in front of it.
  const front = cz + d / 2 - Math.max(ov, 2);
  const bodyD = d - Math.max(ov, 2) - fascia;
  const bodyZ = cz - d / 2 + bodyD / 2;
  const below = h - tt;
  const sides = p.bool("sidePanels");
  const sp = sides ? Math.min(25, bw / 10) : 0;
  const color = p.str("topColor");
  const topMeta = /^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {};
  const parts: Part[] = [
    box(cx, 0, bodyZ - 20, bw - 2 * sp - 40, kick, bodyD - 40, "dark", { role: "plinth", plan: false }),
    box(cx, kick, bodyZ, bw - 2 * sp, below - kick, bodyD, "body", { role: "body" }),
    box(cx, kick, front - fascia / 2, bw - 2 * sp, below - kick, fascia, "body", { role: "fascia" }),
    box(cx, below, cz, w, tt, d, "top", { role: "countertop", ...topMeta }),
  ];
  if (sides) for (const sx of [-1, 1]) parts.push(box(cx + sx * (bw / 2 - sp / 2), 0, cz - ov / 2, sp, below, d - ov, "body", { role: "side-panel" }));
  if (p.bool("brandPanel")) {
    const ph = (below - kick) * 0.6;
    parts.push(box(cx, kick + (below - kick - ph) / 2, front + 1, (bw - 2 * sp) * 0.7, ph, 2, "accent", { role: "brand-panel", plan: false }));
  }
  return parts;
}

/** Artwork surfaces of a counter; the top keeps its own colour. */
const counterSurfaces = (): SurfaceDef[] => [
  { id: "front", label: "Front fascia", facing: "front", roles: ["fascia", "brand-panel"] },
  { id: "left", label: "Left side", facing: "left", roles: ["side-panel", "body", "fascia", "return"] },
  { id: "right", label: "Right side", facing: "right", roles: ["side-panel", "body", "fascia", "return"] },
  { id: "rear", label: "Rear", facing: "back", roles: ["body", "side-panel", "return"] },
];

const counterParams = [
  { key: "topOverhang", label: "Top overhang", kind: "length", default: 50, min: 0, max: 300 },
  { key: "topThickness", label: "Top thickness", kind: "length", default: 40, min: 12, max: 150 },
  { key: "topColor", label: "Top colour", kind: "color", default: "#2b2f3a" },
  { key: "sidePanels", label: "Side panels", kind: "boolean", default: true },
  { key: "brandPanel", label: "Front brand panel", kind: "boolean", default: true },
] as const;

export const FURNITURE_DEFS = {
  counter: {
    type: "counter",
    label: "Registration counter",
    category: "Counters & furniture",
    description: "Cabinet with fascia, brand panel and an overhanging top.",
    keywords: ["registration", "check-in", "desk", "counter", "front desk"],
    width: 2400,
    depth: 600,
    height: 1050,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    surface: true,
    legacyPlan: true,
    params: [...counterParams],
    surfaces: counterSurfaces,
    build: (o, p) => counterParts(o.width, o.depth, o.height, p),
  },
  reception_counter: {
    type: "reception_counter",
    label: "Reception counter",
    category: "Counters & furniture",
    description: "L-shaped counter: a front run with a return wing.",
    keywords: ["reception", "l-shaped", "front desk", "hotel desk"],
    width: 3000,
    depth: 1800,
    height: 1050,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    params: [
      { key: "runDepth", label: "Run depth", kind: "length", default: 700, min: 300, max: 2000 },
      { key: "returnSide", label: "Return wing", kind: "choice", default: "left", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
      ...counterParams,
    ],
    surfaces: counterSurfaces,
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const rd = clamp(p.num("runDepth"), 200, Math.min(d - 100, w / 2));
      const side = p.str("returnSide") === "right" ? 1 : -1;
      const parts = counterParts(w, rd, h, p, { cz: d / 2 - rd / 2 });
      // Return wing: a plain cabinet running back from the front run.
      const wd = d - rd;
      const wx = side * (w / 2 - rd / 2);
      const wz = -d / 2 + wd / 2;
      const tt = clamp(p.num("topThickness") || 40, 12, h / 4);
      const color = p.str("topColor");
      parts.push(box(wx, 0, wz, rd - 40, 100, wd, "dark", { role: "plinth", plan: false }));
      parts.push(box(wx, 100, wz, rd - 20, h - tt - 100, wd, "body", { role: "return" }));
      parts.push(box(wx, h - tt, wz, rd, tt, wd, "top", { role: "countertop", ...(/^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}) }));
      return parts;
    },
  },
  exhibition_counter: {
    type: "exhibition_counter",
    label: "Exhibition counter",
    category: "Counters & furniture",
    description: "Counter cabinet with a glass showcase on top.",
    keywords: ["showcase", "display counter", "glass counter", "promo counter"],
    width: 1500,
    depth: 600,
    height: 1150,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    params: [
      { key: "showcaseHeight", label: "Showcase height", kind: "length", default: 300, min: 50, max: 1500 },
      ...counterParams.filter((q) => q.key !== "topOverhang"),
      { key: "topOverhang", label: "Top overhang", kind: "length", default: 20, min: 0, max: 300 },
    ],
    surfaces: counterSurfaces,
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const sh = clamp(p.num("showcaseHeight"), 20, h / 2);
      const base = counterParts(w, d, h - sh, p);
      return [
        ...base,
        box(0, h - sh, 0, w - 40, sh - 15, d - 40, "glass", { role: "showcase" }),
        box(0, h - 15, 0, w - 30, 15, d - 30, "top", { role: "showcase-top", plan: false }),
      ];
    },
  },
  info_desk: {
    type: "info_desk",
    label: "Information desk",
    category: "Counters & furniture",
    description: "Round kiosk desk with a band and an overhanging top.",
    keywords: ["info point", "kiosk", "help desk", "round counter"],
    width: 1200,
    depth: 1200,
    height: 1050,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    round: true,
    params: [{ key: "topColor", label: "Top colour", kind: "color", default: "#2b2f3a" }],
    surfaces: () => [{ id: "front", label: "Front (wraps the front half)", facing: "front", roles: ["body", "band"] }],
    build: (o, p) => {
      const r = o.width / 2;
      const h = o.height;
      const color = p.str("topColor");
      return [
        cyl(0, 0, 0, Math.max(10, r - 60), Math.min(100, h / 6), "dark", { role: "plinth", plan: false }),
        cyl(0, Math.min(100, h / 6), 0, Math.max(10, r - 40), h - 40 - Math.min(100, h / 6), "body", { role: "body" }),
        cyl(0, h * 0.55, 0, Math.max(11, r - 38), h * 0.15, "accent", { role: "band", plan: false }),
        cyl(0, h - 40, 0, r, 40, "top", { role: "countertop", ...(/^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}) }),
      ];
    },
  },
  rect_table: {
    type: "rect_table",
    label: "Rectangular table",
    category: "Counters & furniture",
    description: "Trestle or dining table, optional cloth and chairs.",
    keywords: ["trestle", "banquet", "dining", "conference table"],
    width: 1800,
    depth: 750,
    height: 760,
    elevation: 0,
    color: "#f4f1ea",
    accentColor: "#6b7280",
    params: [
      { key: "cloth", label: "Table cloth to the floor", kind: "boolean", default: false },
      { key: "seats", label: "Chairs", kind: "count", default: 6, min: 0, max: 20 },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const tt = Math.min(30, h / 6);
      const parts: Part[] = [box(0, h - tt, 0, w, tt, d, "body", { role: "top" })];
      if (p.bool("cloth")) parts.push(box(0, 0, 0, w - 4, h - tt, d - 4, "light", { role: "cloth" }));
      else for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) parts.push(box(sx * (w / 2 - 60), 0, sz * (d / 2 - 60), 50, h - tt, 50, "metal", { role: "leg", plan: false }));
      const n = clamp(Math.round(p.num("seats")), 0, 20);
      const front = Math.ceil(n / 2);
      const back = n - front;
      for (const [count, z, facing] of [[front, d / 2 + 280, -Math.PI / 2], [back, -d / 2 - 280, Math.PI / 2]] as const) {
        for (let i = 0; i < count; i++) parts.push(...chair(-w / 2 + (w * (i + 0.5)) / count, z, facing));
      }
      return parts;
    },
  },
  round_table: {
    type: "round_table",
    label: "Round table",
    category: "Counters & furniture",
    description: "Banquet round with chairs; width is the diameter.",
    keywords: ["banquet", "dining", "gala", "wedding table"],
    width: 1800,
    depth: 1800,
    height: 760,
    elevation: 0,
    color: "#f4f1ea",
    accentColor: "#6b7280",
    round: true,
    legacyPlan: true,
    params: [{ key: "seats", label: "Seats", kind: "count", default: 10, min: 0, max: 16 }],
    build: (o, p) => {
      const r = o.width / 2;
      const h = o.height;
      const top = Math.min(30, h / 4);
      const parts: Part[] = [
        cyl(0, h - top, 0, r, top, "body", { role: "top" }),
        cyl(0, 20, 0, Math.min(50, r / 4), h - top - 20, "metal", { role: "pedestal", plan: false }),
        cyl(0, 0, 0, Math.min(300, r * 0.6), 20, "metal", { role: "base", plan: false }),
      ];
      const seats = clamp(Math.round(p.num("seats")), 0, 16);
      const ring = r + 280;
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2;
        parts.push(...chair(Math.cos(a) * ring, Math.sin(a) * ring, a + Math.PI));
      }
      return parts;
    },
  },
  cocktail_table: {
    type: "cocktail_table",
    label: "Cocktail table",
    category: "Counters & furniture",
    description: "Tall poseur table, optional stretch cover.",
    keywords: ["poseur", "high table", "bar table", "standing table"],
    width: 600,
    depth: 600,
    height: 1100,
    elevation: 0,
    color: "#f4f1ea",
    accentColor: "#6b7280",
    round: true,
    params: [{ key: "cover", label: "Stretch cover", kind: "boolean", default: false }],
    build: (o, p) => {
      const r = o.width / 2;
      const h = o.height;
      const parts: Part[] = [cyl(0, h - 25, 0, r, 25, "body", { role: "top" })];
      if (p.bool("cover")) {
        // Stretch cover: narrows from the top to a waist and flares at the floor.
        parts.push(cyl(0, h * 0.45, 0, r * 0.35, h * 0.55 - 25, "light", { role: "cover", r2: r, plan: false }));
        parts.push(cyl(0, 0, 0, r * 0.8, h * 0.45, "light", { role: "cover", r2: r * 0.35, plan: false }));
      } else {
        parts.push(cyl(0, 20, 0, Math.min(35, r / 5), h - 45, "metal", { role: "pedestal", plan: false }));
        parts.push(cyl(0, 0, 0, r * 0.7, 20, "metal", { role: "base", plan: false }));
      }
      return parts;
    },
  },
  lectern: {
    type: "lectern",
    label: "Podium / lectern",
    category: "Counters & furniture",
    description: "Speaker's lectern with a sloping top and logo panel.",
    keywords: ["podium", "lectern", "speaker", "rostrum"],
    width: 600,
    depth: 500,
    height: 1150,
    elevation: 0,
    color: "#2b2f3a",
    accentColor: "#c8a24a",
    params: [{ key: "logo", label: "Front logo panel", kind: "boolean", default: true }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const base = Math.min(60, h / 10);
      const fall = Math.min(150, h / 6);
      const bw = w - 40;
      // Side profile (z, y): taller at the audience side, sloping down to the speaker.
      const profile = [
        { x: -d / 2 + 30, y: base },
        { x: d / 2 - 30, y: base },
        { x: d / 2 - 30, y: h },
        { x: -d / 2 + 30, y: h - fall },
      ];
      const parts: Part[] = [box(0, 0, 0, w, base, d, "dark", { role: "base" }), prism("side", profile, -bw / 2, bw, "body", { role: "body" })];
      if (p.bool("logo")) parts.push(box(0, h * 0.45, d / 2 - 30 + 1, bw * 0.6, h * 0.25, 2, "accent", { role: "logo", plan: false }));
      return parts;
    },
  },
  plinth: {
    type: "plinth",
    label: "Display plinth",
    category: "Counters & furniture",
    description: "Square display plinth with a shadow-gap base and top cap.",
    keywords: ["plinth", "display stand", "cube", "pedestal"],
    width: 500,
    depth: 500,
    height: 1000,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#1d1f26",
    surface: true,
    params: [{ key: "cap", label: "Top cap", kind: "boolean", default: true }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const kick = Math.min(60, h / 8);
      const cap = p.bool("cap") ? Math.min(25, h / 10) : 0;
      const parts: Part[] = [box(0, 0, 0, w - 40, kick, d - 40, "dark", { role: "plinth", plan: false }), box(0, kick, 0, w - 16, h - kick - cap, d - 16, "body", { role: "body" })];
      if (cap) parts.push(box(0, h - cap, 0, w, cap, d, "top", { role: "cap" }));
      return parts;
    },
  },
  pedestal: {
    type: "pedestal",
    label: "Product pedestal",
    category: "Counters & furniture",
    description: "Round pedestal with an optional glass cover.",
    keywords: ["pedestal", "column display", "vitrine", "product stand"],
    width: 450,
    depth: 450,
    height: 1300,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    round: true,
    params: [{ key: "glass", label: "Glass cover height", kind: "length", default: 300, min: 0, max: 1500 }],
    build: (o, p) => {
      const r = o.width / 2;
      const h = o.height;
      const g = clamp(p.num("glass"), 0, h / 2);
      const parts: Part[] = [cyl(0, 0, 0, r, 30, "dark", { role: "base" }), cyl(0, 30, 0, r * 0.85, h - g - 55, "body", { role: "body" }), cyl(0, h - g - 25, 0, r, 25, "top", { role: "top" })];
      if (g > 0) parts.push(cyl(0, h - g, 0, r * 0.8, g, "glass", { role: "glass", plan: false }));
      return parts;
    },
  },
  chair: {
    type: "chair",
    label: "Chair",
    category: "Counters & furniture",
    description: "Seating placeholder: seat, back and legs.",
    keywords: ["seat", "seating", "banquet chair"],
    width: 450,
    depth: 500,
    height: 850,
    elevation: 0,
    color: "#6b7280",
    accentColor: "#6b7280",
    params: [],
    build: (o) => {
      const { width: w, depth: d, height: h } = o;
      const seatH = Math.min(450, h * 0.55);
      const parts: Part[] = [box(0, seatH - 40, 0, w, 40, d, "body", { role: "seat" }), box(0, seatH, -d / 2 + 20, w, h - seatH, 40, "body", { role: "chair-back" })];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) parts.push(box(sx * (w / 2 - 20), 0, sz * (d / 2 - 20), 30, seatH - 40, 30, "metal", { role: "leg", plan: false }));
      return parts;
    },
  },
  structure: {
    type: "structure",
    label: "Generic block",
    category: "Generic",
    description: "Any rectangular block: a placeholder, wall or plinth.",
    keywords: ["box", "block", "placeholder", "generic structure"],
    width: 2000,
    depth: 2000,
    height: 2500,
    elevation: 0,
    color: "#d7d2c8",
    accentColor: "#9a958c",
    surface: true,
    legacyPlan: true,
    params: [],
    build: (o) => [box(0, 0, 0, o.width, o.height, o.depth, "body", { role: "block" })],
  },
} satisfies Record<string, ObjectDef>;
