import { box, type Part } from "../parts";
import { clamp, feet, type ObjectDef, type ParamReader } from "./kit";

// Exhibition and experiential structures: shell-scheme walls built from
// panels between aluminium posts, so stall sizes read correctly in 3D.

const WALL = 40; // shell wall thickness (panel in its aluminium frame)
const POST = 40;

/** Wall of panels with posts at every joint, running along x (axis "x") or z. */
function panelWall(axis: "x" | "z", from: number, to: number, fixed: number, h: number, panel: number, role: string, y0 = 0): Part[] {
  const L = to - from;
  if (!(L > 1)) return [];
  const n = clamp(Math.ceil(L / Math.max(300, panel) - 1e-6), 1, 60);
  const mid = (from + to) / 2;
  const parts: Part[] = [axis === "x" ? box(mid, y0, fixed, L, h - y0, WALL, "body", { role }) : box(fixed, y0, mid, WALL, h - y0, L, "body", { role })];
  for (let i = 0; i <= n; i++) {
    const s = clamp(from + (i * L) / n, from + POST / 2, to - POST / 2);
    parts.push(axis === "x" ? box(s, 0, fixed, POST, h, POST, "metal", { role: "post", plan: false }) : box(fixed, 0, s, POST, h, POST, "metal", { role: "post", plan: false }));
  }
  return parts;
}

function shellExtras(w: number, d: number, h: number, p: ParamReader): Part[] {
  const parts: Part[] = [];
  if (p.bool("carpet")) parts.push(box(0, 0, 0, w, 8, d, "accent", { role: "carpet", plan: false }));
  if (p.bool("fascia")) {
    const fh = Math.min(300, h / 6);
    // The name board is the front 2 mm of the fascia.
    parts.push(box(0, h - fh, d / 2 - WALL / 2 - 1, w, fh, WALL - 2, "body", { role: "fascia" }));
    parts.push(box(0, h - fh * 0.8, d / 2 - 1, Math.min(w * 0.5, 2000), fh * 0.6, 2, "accent", { role: "name-board", plan: false }));
  }
  return parts;
}

const shellParams = [
  { key: "panelWidth", label: "Panel width", kind: "length", default: 1000, min: 300, max: 3000 },
  { key: "fascia", label: "Front fascia board", kind: "boolean", default: true },
  { key: "carpet", label: "Floor carpet", kind: "boolean", default: true },
] as const;

export const EXHIBITION_DEFS = {
  booth_shell: {
    type: "booth_shell",
    label: "Exhibition stall (shell)",
    category: "Exhibition",
    description: "Shell-scheme stall: back and side walls, fascia, carpet.",
    keywords: ["booth", "stall", "shell scheme", "octanorm", "inline booth"],
    width: 3000,
    depth: 3000,
    height: 2500,
    elevation: 0,
    color: "#f7f5f0",
    accentColor: "#1f3a5f",
    open: true,
    params: [...shellParams],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const pw = p.num("panelWidth");
      return [
        ...panelWall("x", -w / 2, w / 2, -d / 2 + WALL / 2, h, pw, "back-wall"),
        ...panelWall("z", -d / 2 + WALL, d / 2, -w / 2 + WALL / 2, h, pw, "side-wall"),
        ...panelWall("z", -d / 2 + WALL, d / 2, w / 2 - WALL / 2, h, pw, "side-wall"),
        ...shellExtras(w, d, h, p),
      ];
    },
  },
  corner_booth: {
    type: "corner_booth",
    label: "Corner booth",
    category: "Exhibition",
    description: "Stall open on two sides: back wall and one side wall.",
    keywords: ["corner stall", "booth", "two sides open"],
    width: 3000,
    depth: 3000,
    height: 2500,
    elevation: 0,
    color: "#f7f5f0",
    accentColor: "#1f3a5f",
    open: true,
    params: [{ key: "wallSide", label: "Side wall", kind: "choice", default: "left", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] }, ...shellParams],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const sx = p.str("wallSide") === "right" ? 1 : -1;
      const pw = p.num("panelWidth");
      const parts = [...panelWall("x", -w / 2, w / 2, -d / 2 + WALL / 2, h, pw, "back-wall"), ...panelWall("z", -d / 2 + WALL, d / 2, sx * (w / 2 - WALL / 2), h, pw, "side-wall"), ...shellExtras(w, d, h, p)];
      // The fascia's open end rests on a corner post, as on a real shell-scheme corner stand.
      if (p.bool("fascia")) parts.push(box(-sx * (w / 2 - POST / 2), 0, d / 2 - POST / 2, POST, h, POST, "metal", { role: "corner-post", plan: false }));
      return parts;
    },
  },
  partition_panel: {
    type: "partition_panel",
    label: "Modular partition",
    category: "Exhibition",
    description: "Freestanding run of panels with posts and feet.",
    keywords: ["divider", "partition", "screen wall", "booth wall"],
    width: 3000,
    depth: 400,
    height: 2200,
    elevation: 0,
    color: "#f7f5f0",
    accentColor: "#1d1f26",
    params: [{ key: "panelWidth", label: "Panel width", kind: "length", default: 1000, min: 300, max: 3000 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const n = clamp(Math.ceil(w / Math.max(300, p.num("panelWidth")) - 1e-6), 1, 60);
      const parts = panelWall("x", -w / 2, w / 2, 0, h, w / n, "panel");
      const xs = Array.from({ length: n + 1 }, (_, i) => clamp(-w / 2 + (i * w) / n, -w / 2 + 30, w / 2 - 30));
      if (d > WALL + 40) parts.push(...feet(xs, d, 60, 25));
      return parts;
    },
  },
  photo_booth: {
    type: "photo_booth",
    label: "Photo booth enclosure",
    category: "Exhibition",
    description: "Enclosed booth with an entry, roof frame and backdrop inside.",
    keywords: ["photo booth", "selfie booth", "enclosure", "360 booth"],
    width: 2000,
    depth: 2000,
    height: 2400,
    elevation: 0,
    color: "#1d1f26",
    accentColor: "#c8a24a",
    params: [{ key: "entryWidth", label: "Entry width", kind: "length", default: 900, min: 500, max: 5000 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const entry = clamp(p.num("entryWidth"), 300, w - 2 * WALL - 100);
      const head = Math.min(300, h / 6);
      const zf = d / 2 - WALL / 2;
      const side = (w - entry) / 2;
      const parts: Part[] = [
        box(0, 0, -d / 2 + WALL / 2, w, h, WALL, "body", { role: "back-wall" }),
        box(-w / 2 + WALL / 2, 0, 0, WALL, h, d - 2 * WALL, "body", { role: "side-wall" }),
        box(w / 2 - WALL / 2, 0, 0, WALL, h, d - 2 * WALL, "body", { role: "side-wall" }),
        box(-w / 2 + side / 2, 0, zf, side, h, WALL, "body", { role: "front-wall" }),
        box(w / 2 - side / 2, 0, zf, side, h, WALL, "body", { role: "front-wall" }),
        box(0, h - head, zf, entry, head, WALL, "body", { role: "header" }),
        box(0, 200, -d / 2 + WALL + 1, w - 2 * WALL - 200, h - 500, 2, "accent", { role: "backdrop", plan: false }),
      ];
      // Open roof frame.
      for (const z of [-d / 2 + 40, d / 2 - 40]) parts.push(box(0, h - 60, z, w, 60, 60, "metal", { role: "roof-frame", plan: false }));
      for (const x of [-w / 2 + 40, w / 2 - 40]) parts.push(box(x, h - 60, 0, 60, 60, d - 160, "metal", { role: "roof-frame", plan: false }));
      return parts;
    },
  },
  display_case: {
    type: "display_case",
    label: "Product display case",
    category: "Exhibition",
    description: "Glass vitrine on a cabinet base with a lit top cap.",
    keywords: ["vitrine", "showcase", "glass case", "product display enclosure"],
    width: 1000,
    depth: 500,
    height: 1900,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    params: [{ key: "baseHeight", label: "Base height", kind: "length", default: 900, min: 100, max: 3000 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const base = clamp(p.num("baseHeight"), 50, h - 200);
      const cap = Math.min(100, (h - base) / 4);
      return [
        box(0, 0, 0, w - 30, 60, d - 30, "dark", { role: "plinth", plan: false }),
        box(0, 60, 0, w, base - 60, d, "body", { role: "body" }),
        box(0, base, 0, w - 20, h - base - cap, d - 20, "glass", { role: "glass" }),
        box(0, h - cap, 0, w, cap, d, "top", { role: "cap" }),
      ];
    },
  },
} satisfies Record<string, ObjectDef>;
