import type { ObjectType } from "../schema";
import { partBounds, partColor, partPlanOutline, type Part, type PlanOutline } from "../parts";
import { customParts } from "../custom";
import { BACKDROP_DEFS } from "./backdrops";
import { EXHIBITION_DEFS } from "./exhibition";
import { FRAME_DEFS } from "./frames";
import { FURNITURE_DEFS } from "./furniture";
import { paramReader, type ObjectDef, type ObjectShape, type PropValue } from "./kit";
import { SCREEN_DEFS } from "./screens";
import { STAGE_DEFS } from "./stage";

// ---------------------------------------------------------------------------
// The object registry. Each built-in object is one definition (label,
// category, defaults, parameters and a geometry builder) in a category file;
// the editor, 3D view, plan, library and tests all read it from here.
//
// Adding an object type = its id in OBJECT_TYPES (schema.ts) and its
// definition in one of the category files. Nothing else in the editor needs
// to change: properties, placement, persistence, history, the 3D mesh, the
// plan symbol and the library card all come from the definition.
// ---------------------------------------------------------------------------

const CUSTOM_DEF: ObjectDef = {
  type: "custom",
  label: "Custom object",
  category: "Generic",
  description: "Made in the Custom Builder.",
  keywords: ["custom"],
  width: 1000,
  depth: 1000,
  height: 1000,
  elevation: 0,
  color: "#d7d2c8",
  accentColor: "#c8a24a",
  params: [],
  // The recipe is the source of truth; an instance always carries one (the
  // schema requires it), so there is no stand-in geometry.
  build: (o) => (o.custom ? customParts(o.custom) : []),
};

export const OBJECT_DEFS: Record<ObjectType, ObjectDef> = {
  ...STAGE_DEFS,
  ...BACKDROP_DEFS,
  ...FRAME_DEFS,
  ...SCREEN_DEFS,
  ...FURNITURE_DEFS,
  ...EXHIBITION_DEFS,
  custom: CUSTOM_DEF,
};

/** Solid parts of any object, in its own frame (see parts.ts). */
export function objectParts(o: ObjectShape): Part[] {
  const def = OBJECT_DEFS[o.type];
  return def.build(o, paramReader(def, o.props));
}

export type PlanShape = { outline: PlanOutline; color: string; glass: boolean; top: number; outside: boolean };

const planCache = new WeakMap<object, PlanShape[]>();

/**
 * The object seen from above, in its own frame (x across, y = its z towards
 * the front): every part's outline, lowest first, so drawing them in order
 * gives the same picture as the 3D top view.
 */
export function objectPlanShapes(o: ObjectShape & { color: string; accentColor: string }): PlanShape[] {
  const hit = planCache.get(o);
  if (hit) return hit;
  const shapes: PlanShape[] = [];
  for (const p of objectParts(o)) {
    if (p.kind === "grid" || p.plan === false) continue;
    const outline = partPlanOutline(p);
    const b = partBounds(p);
    if (!outline || !b) continue;
    shapes.push({ outline, color: partColor(o, p), glass: p.tone === "glass", top: b.max[1], outside: !!p.outside });
  }
  shapes.sort((a, b) => a.top - b.top);
  planCache.set(o, shapes);
  return shapes;
}

export function objectParamDefaults(type: ObjectType): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of OBJECT_DEFS[type].params) out[p.key] = p.default;
  return out;
}

export function paramValue<T extends PropValue>(props: Record<string, PropValue>, type: ObjectType, key: string): T {
  const v = props[key];
  if (v !== undefined) return v as T;
  const def = OBJECT_DEFS[type].params.find((p) => p.key === key);
  return (def?.default ?? 0) as T;
}

export { OBJECT_CATEGORIES, type ObjectCategory, type ObjectDef, type ObjectParam, type ObjectShape, type PropValue } from "./kit";
export { arcPoints, archSection } from "./frames";
export { counterParts } from "./furniture";
