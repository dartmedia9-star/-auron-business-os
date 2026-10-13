import { beam, box, type Part } from "../parts";
import { clamp, feet, tubeMember, type ObjectDef } from "./kit";

// Backdrops, branding walls and signage. The graphic face is the front (+z).
// A thin panel and a framed structure are different objects: the panel is
// just its face, a framed backdrop has a tube frame and feet behind it,
// inside its depth.

/** Tube frame (perimeter plus verticals) in the plane z = zc. */
function backFrame(w: number, h: number, zc: number, tube: number, spacing: number, y0 = 0): Part[] {
  const parts: Part[] = [];
  const n = clamp(Math.ceil(w / Math.max(300, spacing)), 1, 60);
  for (let i = 0; i <= n; i++) {
    const x = clamp(-w / 2 + (i * w) / n, -w / 2 + tube / 2, w / 2 - tube / 2);
    parts.push(...tubeMember("y", y0, h, [x, zc], tube, i === 0 || i === n ? "frame-upright" : "frame-mullion"));
  }
  parts.push(...tubeMember("x", -w / 2 + tube, w / 2 - tube, [y0 + tube / 2, zc], tube, "frame-rail"));
  parts.push(...tubeMember("x", -w / 2 + tube, w / 2 - tube, [h - tube / 2, zc], tube, "frame-rail"));
  return parts.map((p) => ({ ...p, plan: false as const }));
}

/** Foot bars running front to back at each x, with a brace up the frame. */
function braced(xs: number[], d: number, h: number, zFrame: number): Part[] {
  const parts: Part[] = feet(xs, d, 60, 40);
  for (const x of xs) parts.push(beam([x, 40, -d / 2 + 30], [x, Math.min(h * 0.45, 1200), zFrame], 30, "metal", { role: "brace", plan: false }));
  return parts;
}

export const BACKDROP_DEFS = {
  backdrop: {
    type: "backdrop",
    label: "Flat backdrop panel",
    category: "Backdrops & branding",
    description: "Single flat graphic panel with an optional edge frame.",
    keywords: ["panel", "flat", "graphic", "wall"],
    width: 7320,
    depth: 150,
    height: 3660,
    elevation: 0,
    color: "#1f3a5f",
    accentColor: "#c8a24a",
    thin: true,
    legacyPlan: true,
    params: [
      { key: "frame", label: "Edge frame", kind: "boolean", default: true },
      { key: "frameSize", label: "Frame size", kind: "length", default: 75, min: 10, max: 600 },
      { key: "supports", label: "Rear braces (behind the footprint)", kind: "boolean", default: false },
    ],
    surfaces: (o, p) => {
      const { width: w, height: h } = o;
      const f = p.bool("frame") ? Math.min(p.num("frameSize"), w / 4, h / 4) : 0;
      // Inside the edge frame: the frame covers the panel's edges.
      return [
        { id: "front", label: "Front", facing: "front", roles: ["panel"], rect: { u0: -w / 2 + f, v0: f, u1: w / 2 - f, v1: h - f } },
        { id: "rear", label: "Rear", facing: "back", roles: ["panel"], rect: { u0: -w / 2 + f, v0: f, u1: w / 2 - f, v1: h - f } },
      ];
    },
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const framed = p.bool("frame");
      // The edge frame stands 10 mm proud of the panel on both faces, inside the depth.
      const parts: Part[] = [box(0, 0, 0, w, h, framed ? Math.max(1, d - 20) : d, "body", { role: "panel" })];
      if (framed) {
        const f = Math.min(p.num("frameSize"), w / 4, h / 4);
        const fd = d;
        parts.push(box(0, h - f, 0, w, f, fd, "accent", { role: "frame", plan: false }), box(0, 0, 0, w, f, fd, "accent", { role: "frame", plan: false }));
        parts.push(box(-w / 2 + f / 2, f, 0, f, h - 2 * f, fd, "accent", { role: "frame", plan: false }), box(w / 2 - f / 2, f, 0, f, h - 2 * f, fd, "accent", { role: "frame", plan: false }));
      }
      if (p.bool("supports")) {
        const reach = clamp(h * 0.35, 300, 2000);
        const n = clamp(Math.ceil(w / 2400), 1, 20);
        for (let i = 0; i <= n; i++) {
          const x = clamp(-w / 2 + (i * w) / n, -w / 2 + 40, w / 2 - 40);
          parts.push(beam([x, h * 0.66, -d / 2 - 20], [x, 30, -d / 2 - reach], 40, "metal", { role: "brace", outside: true }));
          parts.push(box(x, 0, -d / 2 - reach / 2, 60, 30, reach, "dark", { role: "foot", outside: true }));
        }
      }
      return parts;
    },
  },
  framed_backdrop: {
    type: "framed_backdrop",
    label: "Framed backdrop",
    category: "Backdrops & branding",
    description: "Graphic face on a tube frame with braced feet behind it.",
    keywords: ["frame", "stretch fabric", "branded display panel", "seg"],
    width: 4880,
    depth: 600,
    height: 2440,
    elevation: 0,
    color: "#1f3a5f",
    accentColor: "#c8a24a",
    params: [
      { key: "tube", label: "Frame tube", kind: "length", default: 50, min: 20, max: 200 },
      { key: "spacing", label: "Upright spacing", kind: "length", default: 1000, min: 300, max: 5000 },
      { key: "feet", label: "Braced feet", kind: "boolean", default: true },
    ],
    surfaces: () => [{ id: "front", label: "Front", facing: "front", roles: ["panel"] }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const tube = clamp(p.num("tube"), 20, Math.min(200, d / 3));
      const face = Math.min(20, d / 4);
      const zFrame = d / 2 - face - tube / 2;
      // The graphic sits inside a visible metal edge, the way a fabric (SEG) frame reads from the front.
      const e = Math.min(tube, w / 4, h / 4);
      const zFace = d / 2 - face / 2;
      const parts: Part[] = [box(0, e, zFace, w - 2 * e, h - 2 * e, face, "body", { role: "panel" })];
      parts.push(
        box(0, h - e, zFace, w, e, face, "metal", { role: "edge", plan: false }),
        box(0, 0, zFace, w, e, face, "metal", { role: "edge", plan: false }),
        box(-w / 2 + e / 2, e, zFace, e, h - 2 * e, face, "metal", { role: "edge", plan: false }),
        box(w / 2 - e / 2, e, zFace, e, h - 2 * e, face, "metal", { role: "edge", plan: false }),
      );
      parts.push(...backFrame(w, h, zFrame, tube, p.num("spacing")));
      if (p.bool("feet") && d > tube + face + 50) {
        const n = clamp(Math.ceil(w / 2000), 1, 20);
        const xs = Array.from({ length: n + 1 }, (_, i) => clamp(-w / 2 + (i * w) / n, -w / 2 + 30, w / 2 - 30));
        parts.push(...braced(xs, d, h, zFrame - tube / 2));
      }
      return parts;
    },
  },
  modular_backdrop: {
    type: "modular_backdrop",
    label: "Modular backdrop",
    category: "Backdrops & branding",
    description: "Run of equal panels with joints, posts and feet at each joint.",
    keywords: ["panels", "modular", "octanorm", "wall"],
    width: 6000,
    depth: 400,
    height: 2400,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#1d1f26",
    params: [
      { key: "panelWidth", label: "Panel width", kind: "length", default: 1000, min: 300, max: 3000 },
      { key: "feet", label: "Feet at joints", kind: "boolean", default: true },
    ],
    surfaces: () => [
      { id: "front", label: "Front (across all panels)", facing: "front", roles: ["panel"] },
      { id: "rear", label: "Rear", facing: "back", roles: ["panel"] },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const n = clamp(Math.ceil(w / clamp(p.num("panelWidth"), 200, Math.max(200, w)) - 1e-6), 1, 80);
      const pw = w / n;
      const t = Math.min(40, d / 3);
      const gap = 6;
      const zPanel = d / 2 - t / 2;
      const parts: Part[] = [];
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * pw + (i === 0 ? 0 : gap / 2);
        const x1 = -w / 2 + (i + 1) * pw - (i === n - 1 ? 0 : gap / 2);
        parts.push(box((x0 + x1) / 2, 0, zPanel, x1 - x0, h, t, "body", { role: "panel" }));
      }
      const posts = Array.from({ length: n + 1 }, (_, i) => clamp(-w / 2 + i * pw, -w / 2 + 20, w / 2 - 20));
      for (const x of posts) parts.push(box(x, 0, d / 2 - t - 20, 40, h, 40, "accent", { role: "post", plan: false }));
      if (p.bool("feet") && d > t + 80) parts.push(...feet(posts.map((x) => clamp(x, -w / 2 + 30, w / 2 - 30)), d, 60, 30));
      return parts;
    },
  },
  step_repeat: {
    type: "step_repeat",
    label: "Step-and-repeat wall",
    category: "Backdrops & branding",
    description: "Photo / sponsor wall with a repeating logo pattern.",
    keywords: ["sponsor wall", "photo wall", "media backdrop", "press wall", "logo"],
    width: 3000,
    depth: 500,
    height: 2400,
    elevation: 0,
    color: "#f7f5f0",
    accentColor: "#1f3a5f",
    params: [
      { key: "logoSize", label: "Logo size", kind: "length", default: 300, min: 50, max: 2000 },
      { key: "logoSpacing", label: "Logo spacing", kind: "length", default: 600, min: 100, max: 3000 },
    ],
    surfaces: () => [{ id: "front", label: "Front", facing: "front", roles: ["panel", "logo"] }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const face = Math.min(20, d / 4);
      const tube = Math.min(40, d / 4);
      // Logo tiles are the front 2 mm; the face sits just behind them.
      const zFace = d / 2 - 2 - face / 2;
      const parts: Part[] = [box(0, 0, zFace, w, h, face, "body", { role: "panel" })];
      const size = clamp(p.num("logoSize"), 20, Math.min(w, h));
      const step = Math.max(size * 1.2, p.num("logoSpacing"));
      const cols = Math.floor((w - size) / step);
      const rows = Math.floor((h - size - 200) / step);
      // Staggered logo tiles on the face (a few mm proud of it).
      if (cols >= 0 && rows >= 0 && (cols + 1) * (rows + 1) <= 600) {
        for (let r = 0; r <= rows; r++) {
          const shift = r % 2 ? step / 2 : 0;
          for (let c = 0; c <= cols; c++) {
            const x = -((cols * step) / 2) + c * step + shift;
            if (Math.abs(x) + size / 2 > w / 2) continue;
            parts.push(box(x, 200 + r * step, d / 2 - 1, size, size * 0.55, 2, "accent", { role: "logo", plan: false }));
          }
        }
      }
      parts.push(...backFrame(w, h, d / 2 - 2 - face - tube / 2, tube, 1000));
      if (d > face + tube + 50) parts.push(...braced([-w / 2 + 30, w / 2 - 30], d, h, d / 2 - 2 - face - tube));
      return parts;
    },
  },
  welcome_sign: {
    type: "welcome_sign",
    label: "Welcome sign",
    category: "Backdrops & branding",
    description: "Sign panel on two posts with weighted base plates.",
    keywords: ["signage", "welcome board", "directional", "branded display panel"],
    width: 1200,
    depth: 500,
    height: 2000,
    elevation: 0,
    color: "#f7f5f0",
    accentColor: "#c8a24a",
    params: [
      { key: "signHeight", label: "Sign panel height", kind: "length", default: 1200, min: 200, max: 5000 },
      { key: "postSize", label: "Post size", kind: "length", default: 50, min: 20, max: 200 },
    ],
    surfaces: () => [
      { id: "front", label: "Sign front", facing: "front", roles: ["panel", "header"] },
      { id: "rear", label: "Sign rear", facing: "back", roles: ["panel"] },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const post = clamp(p.num("postSize"), 20, Math.min(200, w / 6));
      const sh = clamp(p.num("signHeight"), 100, h - 100);
      const parts: Part[] = [];
      const pw = Math.min(w / 3, 300);
      for (const sx of [-1, 1]) {
        parts.push(box(sx * (w / 2 - pw / 2), 0, 0, pw, 15, d, "dark", { role: "base" }));
        parts.push(box(sx * (w / 2 - post / 2), 15, 0, post, h - 15, post, "metal", { role: "post" }));
      }
      parts.push(box(0, h - sh, 0, w - 2 * post, sh, 30, "body", { role: "panel" }));
      parts.push(box(0, h - Math.min(200, sh / 5), 16, w - 2 * post, Math.min(200, sh / 5), 2, "accent", { role: "header", plan: false }));
      return parts;
    },
  },
  display_wall: {
    type: "display_wall",
    label: "Product display wall",
    category: "Backdrops & branding",
    description: "Launch wall with bays, shelves, a plinth and a branded header.",
    keywords: ["product launch", "shelving", "retail wall", "niches"],
    width: 4000,
    depth: 450,
    height: 2700,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    params: [
      { key: "bays", label: "Bays", kind: "count", default: 3, min: 1, max: 12 },
      { key: "shelves", label: "Shelves per bay", kind: "count", default: 3, min: 0, max: 10 },
      { key: "header", label: "Header height", kind: "length", default: 350, min: 0, max: 1500 },
    ],
    surfaces: () => [
      { id: "header", label: "Header front", facing: "front", roles: ["header"] },
      { id: "back", label: "Back panel (inside the bays)", facing: "front", roles: ["back-panel"] },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const bays = clamp(Math.round(p.num("bays")), 1, 12);
      const shelves = clamp(Math.round(p.num("shelves")), 0, 10);
      const plinth = Math.min(120, h / 8);
      const header = clamp(p.num("header"), 0, h / 3);
      const side = Math.min(60, w / (bays * 4));
      const back = Math.min(25, d / 6);
      const parts: Part[] = [box(0, 0, -d / 2 + back / 2, w, h, back, "body", { role: "back-panel" })];
      parts.push(box(0, 0, 0, w, plinth, d, "dark", { role: "plinth" }));
      if (header > 0) parts.push(box(0, h - header, 0, w, header, d, "accent", { role: "header" }));
      const bw = w / bays;
      for (let i = 0; i <= bays; i++) {
        const x = clamp(-w / 2 + i * bw, -w / 2 + side / 2, w / 2 - side / 2);
        parts.push(box(x, plinth, 0, side, h - plinth - header, d, "body", { role: "divider", plan: false }));
      }
      const clear = h - plinth - header;
      for (let i = 0; i < bays; i++) {
        const cx = -w / 2 + bw * (i + 0.5);
        for (let s = 1; s <= shelves; s++) parts.push(box(cx, plinth + (clear * s) / (shelves + 1), 0, bw - side, 25, d - back, "light", { role: "shelf", plan: false }));
      }
      return parts;
    },
  },
  media_wall: {
    type: "media_wall",
    label: "Media wall",
    category: "Backdrops & branding",
    description: "Branded wall with an inset screen.",
    keywords: ["screen wall", "video wall", "tv wall", "led"],
    width: 6000,
    depth: 400,
    height: 3000,
    elevation: 0,
    color: "#1f3a5f",
    accentColor: "#3b82f6",
    params: [
      { key: "screenWidth", label: "Screen width", kind: "length", default: 3000, min: 300, max: 50000 },
      { key: "screenHeight", label: "Screen height", kind: "length", default: 1690, min: 200, max: 30000 },
      { key: "screenBottom", label: "Screen bottom height", kind: "length", default: 800, min: 0, max: 20000 },
    ],
    surfaces: () => [
      { id: "front", label: "Wall front", facing: "front", roles: ["wall"] },
      { id: "screen", label: "Screen", facing: "front", roles: ["screen"], glow: true },
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const sw = clamp(p.num("screenWidth"), 100, w - 100);
      const sh = clamp(p.num("screenHeight"), 100, h - 100);
      // The bezel stays 30 mm clear of the floor and the top.
      const sb = clamp(p.num("screenBottom"), 30, h - sh - 30);
      const wallFront = d * 0.1;
      const bez = Math.max(5, Math.min(60, d * 0.4 - 4));
      const parts: Part[] = [box(0, 0, -d * 0.2, w, h, d * 0.6, "body", { role: "wall" })];
      parts.push(box(0, sb - 30, wallFront + bez / 2, sw + 60, sh + 60, bez, "dark", { role: "bezel" }));
      parts.push(box(0, sb, wallFront + bez + 1, sw, sh, 2, "screen", { role: "screen", plan: false }));
      parts.push(...feet([-w / 2 + 40, w / 2 - 40], d, 60, 30));
      return parts;
    },
  },
} satisfies Record<string, ObjectDef>;
