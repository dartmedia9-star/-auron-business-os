import type { ObjectType, OpeningKind, SectionKind } from "./schema";

// Labels, defaults and parameters for every kind of plan element. Adding a new
// parametric object = one entry in OBJECT_TYPES (schema.ts), one entry here
// and one geometry builder in the 3D studio.

export type ObjectParam =
  | { key: string; label: string; kind: "length"; default: number; min?: number; max?: number }
  | { key: string; label: string; kind: "count"; default: number; min: number; max: number }
  | { key: string; label: string; kind: "boolean"; default: boolean }
  | { key: string; label: string; kind: "color"; default: string };

export type ObjectDef = {
  type: ObjectType;
  label: string;
  group: "Stage" | "Structures" | "Screens" | "Furniture";
  description: string;
  width: number;
  depth: number;
  height: number;
  elevation: number;
  color: string;
  accentColor: string;
  params: ObjectParam[];
};

export const OBJECT_DEFS: Record<ObjectType, ObjectDef> = {
  stage: {
    type: "stage",
    label: "Stage platform",
    group: "Stage",
    description: "Raised deck with optional skirting and front steps.",
    width: 7320,
    depth: 4880,
    height: 600,
    elevation: 0,
    color: "#2b2f3a",
    accentColor: "#1d1f26",
    params: [
      { key: "skirting", label: "Skirting", kind: "boolean", default: true },
      { key: "skirtSides", label: "Skirt sides and back", kind: "boolean", default: true },
      { key: "frontSteps", label: "Front steps", kind: "boolean", default: false },
      { key: "stepWidth", label: "Step width", kind: "length", default: 1200, min: 300 },
    ],
  },
  riser: {
    type: "riser",
    label: "Riser / platform",
    group: "Stage",
    description: "Rectangular platform at any elevation.",
    width: 2440,
    depth: 1220,
    height: 300,
    elevation: 0,
    color: "#3a3f4c",
    accentColor: "#1d1f26",
    params: [{ key: "skirting", label: "Skirting", kind: "boolean", default: false }],
  },
  backdrop: {
    type: "backdrop",
    label: "Backdrop",
    group: "Stage",
    description: "Flat panel backdrop with optional frame.",
    width: 7320,
    depth: 150,
    height: 3660,
    elevation: 0,
    color: "#1f3a5f",
    accentColor: "#c8a24a",
    params: [
      { key: "frame", label: "Frame", kind: "boolean", default: true },
      { key: "frameSize", label: "Frame size", kind: "length", default: 75, min: 10, max: 600 },
    ],
  },
  box_arch: {
    type: "box_arch",
    label: "Box arch",
    group: "Structures",
    description: "Truss goalpost: two box legs and a top beam.",
    width: 8000,
    depth: 400,
    height: 5000,
    elevation: 0,
    color: "#b9bcc4",
    accentColor: "#8a8d96",
    params: [{ key: "trussSize", label: "Truss section", kind: "length", default: 300, min: 100, max: 1000 }],
  },
  skirting: {
    type: "skirting",
    label: "Skirting panel",
    group: "Stage",
    description: "Free-standing skirt or fascia run.",
    width: 3000,
    depth: 20,
    height: 600,
    elevation: 0,
    color: "#1d1f26",
    accentColor: "#1d1f26",
    params: [{ key: "pleated", label: "Pleated", kind: "boolean", default: true }],
  },
  led_screen: {
    type: "led_screen",
    label: "LED screen",
    group: "Screens",
    description: "LED wall or display panel with module grid.",
    width: 6000,
    depth: 100,
    height: 3000,
    elevation: 600,
    color: "#0b0d12",
    accentColor: "#3b82f6",
    params: [
      { key: "moduleSize", label: "Module size", kind: "length", default: 500, min: 100, max: 2000 },
      { key: "showModules", label: "Show module grid", kind: "boolean", default: true },
    ],
  },
  structure: {
    type: "structure",
    label: "Generic structure",
    group: "Structures",
    description: "Any rectangular block: booth, wall, plinth.",
    width: 2000,
    depth: 2000,
    height: 2500,
    elevation: 0,
    color: "#d7d2c8",
    accentColor: "#9a958c",
    params: [],
  },
  steps: {
    type: "steps",
    label: "Steps",
    group: "Stage",
    description: "Straight flight; rises up towards the back.",
    width: 1200,
    depth: 900,
    height: 600,
    elevation: 0,
    color: "#3a3f4c",
    accentColor: "#1d1f26",
    params: [{ key: "count", label: "Number of steps", kind: "count", default: 3, min: 1, max: 30 }],
  },
  counter: {
    type: "counter",
    label: "Registration counter",
    group: "Furniture",
    description: "Counter with a top overhang and front fascia.",
    width: 2400,
    depth: 600,
    height: 1050,
    elevation: 0,
    color: "#f2efe8",
    accentColor: "#c8a24a",
    params: [{ key: "topOverhang", label: "Top overhang", kind: "length", default: 50, min: 0, max: 300 }],
  },
  round_table: {
    type: "round_table",
    label: "Round table",
    group: "Furniture",
    description: "Banquet round; width is the diameter.",
    width: 1800,
    depth: 1800,
    height: 760,
    elevation: 0,
    color: "#f4f1ea",
    accentColor: "#6b7280",
    params: [{ key: "seats", label: "Seats", kind: "count", default: 10, min: 0, max: 16 }],
  },
};

export const SECTION_DEFS: Record<SectionKind, { label: string; color: string }> = {
  section: { label: "Section", color: "#7c8db5" },
  stage_area: { label: "Stage area", color: "#c8a24a" },
  dance_floor: { label: "Dance floor", color: "#8b5cf6" },
  seating: { label: "Seating", color: "#3b82f6" },
  dining: { label: "Dining / banquet", color: "#14b8a6" },
  registration: { label: "Registration", color: "#f59e0b" },
  exhibition: { label: "Exhibition", color: "#ec4899" },
  circulation: { label: "Circulation", color: "#94a3b8" },
  emergency_exit: { label: "Emergency exit zone", color: "#16a34a" },
  generic: { label: "Area", color: "#64748b" },
};

export const OPENING_DEFS: Record<OpeningKind, { label: string; width: number; height: number; sill: number }> = {
  door: { label: "Door", width: 900, height: 2100, sill: 0 },
  double_door: { label: "Double door", width: 1800, height: 2100, sill: 0 },
  window: { label: "Window", width: 1500, height: 1200, sill: 900 },
  opening: { label: "Opening", width: 1500, height: 2400, sill: 0 },
  entrance: { label: "Entrance", width: 2400, height: 2400, sill: 0 },
  emergency_exit: { label: "Emergency exit", width: 1200, height: 2100, sill: 0 },
  loading: { label: "Loading access", width: 3000, height: 3000, sill: 0 },
};

export const DEFAULT_CHECKLIST = [
  "Overall hall length and width",
  "Ceiling height (lowest point)",
  "Pillar positions and sizes",
  "Doors, entrances and emergency exits",
  "Existing stage position and height",
  "Electrical points and power capacity",
  "Loading access and route",
  "Rigging points / ceiling restrictions",
  "Venue restrictions (fire, noise, timings)",
];

export function objectParamDefaults(type: ObjectType): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of OBJECT_DEFS[type].params) out[p.key] = p.default;
  return out;
}

export function paramValue<T extends number | string | boolean>(props: Record<string, number | string | boolean>, type: ObjectType, key: string): T {
  const v = props[key];
  if (v !== undefined) return v as T;
  const def = OBJECT_DEFS[type].params.find((p) => p.key === key);
  return (def?.default ?? 0) as T;
}
