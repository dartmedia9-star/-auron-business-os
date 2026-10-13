import type { OpeningKind, SectionKind } from "./schema";

// Labels and defaults for sections and openings. Event objects live in the
// object registry (objects/), one definition per object type.

export { OBJECT_DEFS, OBJECT_CATEGORIES, objectParamDefaults, objectParts, objectPlanShapes, paramValue, type ObjectCategory, type ObjectDef, type ObjectParam, type ObjectShape, type PlanShape, type PropValue } from "./objects";

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
