import { box, type Part } from "../parts";
import { clamp, type ObjectDef, type ObjectShape, type ParamReader, type SurfaceDef } from "./kit";

// Stage and platform objects. Every part sits inside the footprint except
// front steps, which stand in front of the stage (marked `outside`).

const SK = 20; // skirt panel thickness

/** Deck, understructure and skirting of a rectangular platform. */
function platform(w: number, h: number, d: number, p: ParamReader, opts: { cx?: number; cz?: number; skirtFront: boolean; skirtSides: boolean; skirtBack: boolean; role?: string }): Part[] {
  const cx = opts.cx ?? 0;
  const cz = opts.cz ?? 0;
  const deck = clamp(p.num("deckThickness") || 50, 10, h);
  const under = h - deck;
  const role = opts.role ?? "platform";
  const parts: Part[] = [];
  if (under > 0.5) parts.push(box(cx, 0, cz, w - 2, under, d - 2, "dark", { role: `${role}-frame`, plan: false }));
  parts.push(box(cx, under, cz, w, deck, d, "body", { role: `${role}-deck` }));
  if (under > 0.5) {
    if (opts.skirtFront) parts.push(box(cx, 0, cz + d / 2 - SK / 2, w, under, SK, "accent", { role: "skirt-front", plan: false }));
    if (opts.skirtSides) {
      parts.push(box(cx - w / 2 + SK / 2, 0, cz, SK, under, d, "accent", { role: "skirt-side", plan: false }));
      parts.push(box(cx + w / 2 - SK / 2, 0, cz, SK, under, d, "accent", { role: "skirt-side", plan: false }));
    }
    if (opts.skirtBack) parts.push(box(cx, 0, cz - d / 2 + SK / 2, w, under, SK, "accent", { role: "skirt-back", plan: false }));
  }
  return parts;
}

/**
 * A straight flight from the floor up to `top`, rising towards -z, its
 * lowest step at `zFront`. Each step is a solid riser block with a tread on
 * top, so treads and risers both read in 3D.
 */
export function flight(width: number, top: number, zFront: number, opts: { count?: number; run?: number; cx?: number; outside?: boolean; base?: number } = {}): Part[] {
  const base = opts.base ?? 0;
  const rise = top - base;
  if (!(rise > 20) || !(width > 50)) return [];
  const n = opts.count ?? Math.max(1, Math.ceil(rise / 200) - 1);
  const run = opts.run ?? 300;
  const cx = opts.cx ?? 0;
  const meta = opts.outside ? ({ outside: true } as const) : {};
  const parts: Part[] = [];
  for (let k = 1; k <= n; k++) {
    const stepTop = base + (rise * k) / (n + 1);
    const zc = zFront - (k - 1) * run - run / 2;
    const tread = Math.min(25, (stepTop - base) / 2);
    parts.push(box(cx, base, zc, width, stepTop - base - tread, run, "body", { role: "riser", ...meta }));
    parts.push(box(cx, stepTop - tread, zc, width, tread, run, "top", { role: "tread", ...meta }));
  }
  return parts;
}

/** Artwork surfaces of a platform: the deck edge and the skirt below it, on each side. */
const platformSurfaces = (o: ObjectShape): SurfaceDef[] => {
  const deck = o.type === "riser" ? "riser-deck" : o.type === "modular_stage" ? "deck-module" : "stage-deck";
  return [
    { id: "front", label: "Front fascia", facing: "front", roles: [deck, "skirt-front"] },
    { id: "left", label: "Left skirting", facing: "left", roles: [deck, "skirt-side"] },
    { id: "right", label: "Right skirting", facing: "right", roles: [deck, "skirt-side"] },
    { id: "rear", label: "Rear skirting", facing: "back", roles: [deck, "skirt-back"] },
  ];
};

const deckParam = { key: "deckThickness", label: "Deck thickness", kind: "length", default: 50, min: 10, max: 300 } as const;

export const STAGE_DEFS = {
  stage: {
    type: "stage",
    label: "Stage platform",
    category: "Stage & platforms",
    description: "Raised deck with skirting and optional front steps.",
    keywords: ["platform", "deck", "fascia", "skirting"],
    width: 7320,
    depth: 4880,
    height: 600,
    elevation: 0,
    color: "#2b2f3a",
    accentColor: "#1d1f26",
    surface: true,
    legacyPlan: true,
    params: [
      deckParam,
      { key: "skirting", label: "Front skirting / fascia", kind: "boolean", default: true },
      { key: "skirtSides", label: "Skirt sides and back", kind: "boolean", default: true },
      { key: "frontSteps", label: "Front steps", kind: "boolean", default: false },
      { key: "stepWidth", label: "Step width", kind: "length", default: 1200, min: 300 },
    ],
    surfaces: platformSurfaces,
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const skirt = p.bool("skirting");
      const parts = platform(w, h, d, p, { skirtFront: skirt, skirtSides: skirt && p.bool("skirtSides"), skirtBack: skirt && p.bool("skirtSides"), role: "stage" });
      if (p.bool("frontSteps") && h > 150) {
        const n = Math.max(1, Math.ceil(h / 200) - 1);
        parts.push(...flight(Math.min(w, p.num("stepWidth")), h, d / 2 + n * 300, { outside: true }));
      }
      return parts;
    },
  },
  riser: {
    type: "riser",
    label: "Riser / platform",
    category: "Stage & platforms",
    description: "Rectangular platform at any elevation.",
    keywords: ["drum riser", "podium base", "platform"],
    width: 2440,
    depth: 1220,
    height: 300,
    elevation: 0,
    color: "#3a3f4c",
    accentColor: "#1d1f26",
    surface: true,
    legacyPlan: true,
    params: [deckParam, { key: "skirting", label: "Skirting all round", kind: "boolean", default: false }],
    surfaces: platformSurfaces,
    build: (o, p) => {
      const s = p.bool("skirting");
      return platform(o.width, o.height, o.depth, p, { skirtFront: s, skirtSides: s, skirtBack: s, role: "riser" });
    },
  },
  modular_stage: {
    type: "modular_stage",
    label: "Modular stage",
    category: "Stage & platforms",
    description: "Stage built from standard deck modules with visible joints.",
    keywords: ["deck", "sections", "4x8", "litedeck", "modules"],
    width: 7320,
    depth: 4880,
    height: 600,
    elevation: 0,
    color: "#2b2f3a",
    accentColor: "#1d1f26",
    surface: true,
    params: [
      { key: "moduleWidth", label: "Module width", kind: "length", default: 2440, min: 500, max: 4000 },
      { key: "moduleDepth", label: "Module depth", kind: "length", default: 1220, min: 500, max: 4000 },
      { key: "skirting", label: "Skirting", kind: "boolean", default: true },
      { key: "frontSteps", label: "Front steps", kind: "boolean", default: false },
    ],
    surfaces: platformSurfaces,
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const deck = Math.min(60, h / 3);
      const under = h - deck;
      const mw = clamp(p.num("moduleWidth"), 200, Math.max(200, w));
      const md = clamp(p.num("moduleDepth"), 200, Math.max(200, d));
      const nx = Math.ceil(w / mw - 1e-6);
      const nz = Math.ceil(d / md - 1e-6);
      const parts: Part[] = [box(0, 0, 0, w - 2, under, d - 2, "dark", { role: "stage-frame", plan: false })];
      const gap = 8;
      if (nx * nz <= 400) {
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < nz; j++) {
            const x0 = -w / 2 + i * mw;
            const x1 = Math.min(w / 2, x0 + mw);
            const z0 = -d / 2 + j * md;
            const z1 = Math.min(d / 2, z0 + md);
            const gx0 = i === 0 ? 0 : gap / 2;
            const gx1 = i === nx - 1 ? 0 : gap / 2;
            const gz0 = j === 0 ? 0 : gap / 2;
            const gz1 = j === nz - 1 ? 0 : gap / 2;
            parts.push(box((x0 + gx0 + x1 - gx1) / 2, under, (z0 + gz0 + z1 - gz1) / 2, x1 - x0 - gx0 - gx1, deck, z1 - z0 - gz0 - gz1, "body", { role: "deck-module" }));
          }
        }
      } else parts.push(box(0, under, 0, w, deck, d, "body", { role: "deck-module" }));
      if (p.bool("skirting") && under > 0.5) {
        parts.push(box(0, 0, d / 2 - SK / 2, w, under, SK, "accent", { role: "skirt-front", plan: false }));
        parts.push(box(-w / 2 + SK / 2, 0, 0, SK, under, d, "accent", { role: "skirt-side", plan: false }), box(w / 2 - SK / 2, 0, 0, SK, under, d, "accent", { role: "skirt-side", plan: false }));
      }
      if (p.bool("frontSteps") && h > 150) {
        const n = Math.max(1, Math.ceil(h / 200) - 1);
        parts.push(...flight(Math.min(w, 1200), h, d / 2 + n * 300, { outside: true }));
      }
      return parts;
    },
  },
  multi_level_stage: {
    type: "multi_level_stage",
    label: "Multi-level stage",
    category: "Stage & platforms",
    description: "Lower front tier with a raised rear tier and steps between them.",
    keywords: ["tiered", "two level", "band riser", "upper deck"],
    width: 7320,
    depth: 4880,
    height: 900,
    elevation: 0,
    color: "#2b2f3a",
    accentColor: "#1d1f26",
    surface: true,
    params: [
      deckParam,
      { key: "lowerHeight", label: "Lower tier height", kind: "length", default: 450, min: 100, max: 3000 },
      { key: "upperDepth", label: "Upper tier depth", kind: "length", default: 2440, min: 300, max: 20000 },
      { key: "innerSteps", label: "Steps between tiers", kind: "boolean", default: true },
      { key: "skirting", label: "Skirting", kind: "boolean", default: true },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const lowH = clamp(p.num("lowerHeight"), 50, Math.max(50, h - 50));
      const upD = clamp(p.num("upperDepth"), 200, d - 200);
      const lowD = d - upD;
      const s = p.bool("skirting");
      const parts = platform(w, h, upD, p, { cz: -d / 2 + upD / 2, skirtFront: s, skirtSides: s, skirtBack: s, role: "upper" });
      parts.push(...platform(w, lowH, lowD, p, { cz: d / 2 - lowD / 2, skirtFront: s, skirtSides: s, skirtBack: false, role: "lower" }));
      if (p.bool("innerSteps") && h - lowH > 100) {
        const n = Math.max(1, Math.ceil((h - lowH) / 200) - 1);
        const run = Math.min(300, (lowD - 100) / Math.max(1, n));
        if (run > 150) parts.push(...flight(Math.min(1200, w / 3), h, -d / 2 + upD + n * run, { base: lowH, count: n, run }));
      }
      return parts;
    },
  },
  steps: {
    type: "steps",
    label: "Stage steps",
    category: "Stage & platforms",
    description: "Straight flight with treads and risers; rises towards the back.",
    keywords: ["stairs", "treads", "access"],
    width: 1200,
    depth: 900,
    height: 600,
    elevation: 0,
    color: "#3a3f4c",
    accentColor: "#1d1f26",
    legacyPlan: true,
    params: [
      { key: "count", label: "Number of steps", kind: "count", default: 3, min: 1, max: 30 },
      { key: "handrail", label: "Handrails", kind: "boolean", default: false },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const n = Math.max(1, Math.round(p.num("count")));
      const run = d / n;
      const parts: Part[] = [];
      // Lowest step at the front (+z); the top step reaches the full height.
      for (let i = 0; i < n; i++) {
        const top = (h * (i + 1)) / n;
        const zc = d / 2 - run * i - run / 2;
        const tread = Math.min(25, top / 3);
        parts.push(box(0, 0, zc, w, top - tread, run, "body", { role: "riser" }));
        parts.push(box(0, top - tread, zc, w, tread, run, "top", { role: "tread" }));
      }
      if (p.bool("handrail")) {
        for (const sx of [-1, 1]) {
          const x = sx * (w / 2 - 25);
          parts.push(box(x, 0, d / 2 - 40, 40, h / n + 900, 40, "metal", { role: "handrail-post", plan: false }));
          parts.push(box(x, 0, -d / 2 + 40, 40, h + 900, 40, "metal", { role: "handrail-post", plan: false }));
          parts.push({ kind: "beam", a: [x, h / n + 900, d / 2 - 40], b: [x, h + 900, -d / 2 + 40], size: 40, round: true, tone: "metal", role: "handrail", plan: false });
        }
      }
      return parts;
    },
  },
  skirting: {
    type: "skirting",
    label: "Skirting panel",
    category: "Stage & platforms",
    description: "Free-standing skirt or fascia run, pleated or flat.",
    keywords: ["fascia", "side skirting", "back skirting", "valance"],
    width: 3000,
    depth: 20,
    height: 600,
    elevation: 0,
    color: "#1d1f26",
    accentColor: "#1d1f26",
    thin: true,
    legacyPlan: true,
    params: [{ key: "pleated", label: "Pleated", kind: "boolean", default: true }],
    surfaces: () => [{ id: "front", label: "Front", facing: "front", roles: ["panel", "pleat"] }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = Math.max(d, 5);
      if (!p.bool("pleated")) return [box(0, 0, 0, w, h, t, "body", { role: "panel" })];
      // Pleat ribs stand proud of the back half of the run, inside the footprint.
      const parts: Part[] = [box(0, 0, -t / 4, w, h, t / 2, "body", { role: "panel" })];
      const n = Math.min(200, Math.floor(w / 150));
      for (let i = 0; i < n; i++) parts.push(box(-w / 2 + ((i + 0.5) * w) / n, 0, t / 4, Math.min(60, w / n / 2), h, t / 2, "accent", { role: "pleat", plan: false }));
      return parts;
    },
  },
} satisfies Record<string, ObjectDef>;
