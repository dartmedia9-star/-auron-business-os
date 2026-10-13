import { box, type Part } from "../parts";
import { clamp, trussMember, tubeMember, type ObjectDef } from "./kit";

// Screens and production infrastructure. Screens face the front (+z).

export const SCREEN_DEFS = {
  led_screen: {
    type: "led_screen",
    label: "LED wall",
    category: "Screens & truss",
    description: "LED wall with cabinet, bezel and module grid.",
    keywords: ["led screen", "video wall", "display panel", "modules"],
    width: 6000,
    depth: 100,
    height: 3000,
    elevation: 600,
    color: "#0b0d12",
    accentColor: "#3b82f6",
    thin: true,
    legacyPlan: true,
    params: [
      { key: "moduleSize", label: "Module size", kind: "length", default: 500, min: 100, max: 2000 },
      { key: "showModules", label: "Show module grid", kind: "boolean", default: true },
    ],
    surfaces: () => [{ id: "screen", label: "Screen", facing: "front", roles: ["screen"], glow: true }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      // Cabinet behind, the LED face as the front 2 mm, module lines on that face.
      const face = Math.min(2, d / 4);
      const parts: Part[] = [box(0, 0, -face / 2, w, h, d - face, "body", { role: "cabinet" }), box(0, 0, d / 2 - face / 2, w, h, face, "screen", { role: "screen", plan: false })];
      const cell = p.num("moduleSize");
      if (p.bool("showModules") && cell > 0 && w / cell <= 200 && h / cell <= 200) parts.push({ kind: "grid", z: d / 2 + 0.5, y: 0, w, h, cell, role: "modules" });
      return parts;
    },
  },
  display_screen: {
    type: "display_screen",
    label: "Display screen on stand",
    category: "Screens & truss",
    description: "Freestanding flat screen on a floor stand.",
    keywords: ["tv", "monitor", "kiosk screen", "freestanding display"],
    width: 1450,
    depth: 600,
    height: 1900,
    elevation: 0,
    color: "#111318",
    accentColor: "#3b82f6",
    params: [{ key: "screenHeight", label: "Screen height", kind: "length", default: 830, min: 200, max: 5000 }],
    surfaces: () => [{ id: "screen", label: "Screen", facing: "front", roles: ["screen"], glow: true }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const sh = clamp(p.num("screenHeight"), 100, h - 200);
      const sd = Math.min(70, d / 4);
      return [
        box(0, 0, 0, Math.min(w * 0.55, 800), 25, d, "dark", { role: "base" }),
        box(0, 25, -sd, 80, h - sh * 0.5 - 25, 50, "metal", { role: "pole", plan: false }),
        box(0, h - sh, 0, w, sh, sd, "body", { role: "screen-body" }),
        box(0, h - sh + 20, sd / 2 + 1, w - 40, sh - 40, 2, "screen", { role: "screen", plan: false }),
      ];
    },
  },
  projection_screen: {
    type: "projection_screen",
    label: "Projection screen",
    category: "Screens & truss",
    description: "Fast-fold screen: bordered surface on legs and feet.",
    keywords: ["fastfold", "projector", "screen", "front projection"],
    width: 3000,
    depth: 800,
    height: 2700,
    elevation: 0,
    color: "#f4f4f2",
    accentColor: "#111318",
    params: [
      { key: "screenHeight", label: "Screen height (incl. border)", kind: "length", default: 1800, min: 300, max: 10000 },
      { key: "border", label: "Border", kind: "length", default: 80, min: 0, max: 500 },
    ],
    surfaces: () => [{ id: "screen", label: "Projected image", facing: "front", roles: ["surface"], glow: true }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const sh = clamp(p.num("screenHeight"), 200, h - 200);
      const b = clamp(p.num("border"), 0, Math.min(w, sh) / 4);
      const leg = 35;
      const parts: Part[] = [];
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 - leg / 2);
        parts.push(box(sx * (w / 2 - (leg * 1.5) / 2), 0, 0, leg * 1.5, 30, d, "dark", { role: "foot" }));
        parts.push(...tubeMember("y", 30, h, [x, 0], leg, "leg", "metal"));
      }
      parts.push(box(0, h - sh, 0, w - 2 * leg, sh, 20, "accent", { role: "border" }));
      parts.push(box(0, h - sh + b, 11, w - 2 * leg - 2 * b, sh - 2 * b, 2, "body", { role: "surface", plan: false }));
      return parts;
    },
  },
  truss_tower: {
    type: "truss_tower",
    label: "Truss tower",
    category: "Screens & truss",
    description: "Vertical square truss on a base plate, with a top plate.",
    keywords: ["truss", "tower", "column", "lighting stand", "upright"],
    width: 600,
    depth: 600,
    height: 4000,
    elevation: 0,
    color: "#b9bcc4",
    accentColor: "#1d1f26",
    params: [{ key: "trussSize", label: "Truss section", kind: "length", default: 300, min: 100, max: 1000 }],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = clamp(p.num("trussSize"), 50, Math.min(w, d));
      return [box(0, 0, 0, w, 15, d, "accent", { role: "base" }), ...trussMember("y", 15, h - 10, [0, 0], t, "tower"), box(0, h - 10, 0, t, 10, t, "accent", { role: "top-plate", plan: false })];
    },
  },
  truss_beam: {
    type: "truss_beam",
    label: "Truss crossbar",
    category: "Screens & truss",
    description: "Horizontal truss or square beam span, usually set at height.",
    keywords: ["crossbar", "horizontal beam", "span", "truss", "lighting bar"],
    width: 6000,
    depth: 300,
    height: 300,
    elevation: 4000,
    color: "#b9bcc4",
    accentColor: "#8a8d96",
    widthLabel: "Length",
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
    ],
    build: (o, p) => {
      const { width: w, depth: d, height: h } = o;
      const t = Math.min(d, h);
      if (p.str("style") === "box") return [box(0, 0, 0, w, h, d, "body", { role: "beam" })];
      return [...trussMember("x", -w / 2, w / 2, [h / 2, 0], t, "beam"), box(-w / 2 + 5, h / 2 - t / 2, 0, 10, t, t, "accent", { role: "end-plate", plan: false }), box(w / 2 - 5, h / 2 - t / 2, 0, 10, t, t, "accent", { role: "end-plate", plan: false })];
    },
  },
} satisfies Record<string, ObjectDef>;

