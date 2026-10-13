import { z } from "zod";
import { isSelfIntersecting, signedArea } from "./geometry";

// ---------------------------------------------------------------------------
// Custom objects made in the Custom Builder. A custom object is never stored
// as a picture or a mesh: it is a construction recipe (a method plus exact
// millimetre values and the drawn outline or lines) that custom.ts turns
// into the same solid parts every built-in object uses.
//
//  extrude   closed outlines extruded by a depth (front view or plan)
//  panel     closed outlines as a thin panel, optionally on feet
//  frame     lines turned into beams with a square or round section
//  assembly  independently sized boxes and cylinders, one logical object
//  flat      a plan-only outline (a few mm thick in 3D)
//
// Sketch coordinates are as drawn on screen: x to the right, y down. In the
// front view "down" is towards the floor; in the plan view it is towards the
// front of the object.
// ---------------------------------------------------------------------------

export const CUSTOM_LIMITS = {
  profiles: 24,
  pointsPerProfile: 400,
  totalPoints: 2400,
  segments: 240,
  parts: 80,
  shapes: 150,
  /** Largest overall size of a custom object along any axis (100 m). */
  maxSize: 100_000,
  /** Smallest closed outline area (10 mm × 10 mm). */
  minArea: 100,
} as const;

const MAX = 1_000_000;
const mm = z.number().finite().min(-MAX).max(MAX);
const pos = (max: number = CUSTOM_LIMITS.maxSize) => z.number().finite().gt(0).max(max);
const id = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const sketchPointSchema = z.object({ x: mm, y: mm });
export type SketchPoint = z.infer<typeof sketchPointSchema>;

export const PART_TONES = ["body", "accent", "metal", "glass", "screen", "dark", "light", "top"] as const;

export const customPartSchema = z.object({
  id,
  name: z.string().max(80),
  shape: z.enum(["box", "cylinder"]),
  /** Centre across and front-to-back, base height: the object's own frame (mm). */
  x: mm,
  y: z.number().finite().min(0).max(CUSTOM_LIMITS.maxSize),
  z: mm,
  /** Box: width (x), height, depth (z). Cylinder: w is the diameter, d ignored. */
  w: pos(),
  h: pos(),
  d: pos(),
  tone: z.enum(PART_TONES),
  color: color.nullable().default(null),
});
export type CustomPart = z.infer<typeof customPartSchema>;

export const TEMPLATE_IDS = ["counter", "photo_booth", "frame", "panel", "beam", "box"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const templateRefSchema = z.object({
  id: z.enum(TEMPLATE_IDS),
  params: z.record(z.string().max(40), z.union([z.number().finite(), z.boolean()])),
});
export type TemplateRef = z.infer<typeof templateRefSchema>;

const profile = z.array(sketchPointSchema).min(3).max(CUSTOM_LIMITS.pointsPerProfile);
const profiles = z.array(profile).min(1).max(CUSTOM_LIMITS.profiles);
const segment = z.object({ a: sketchPointSchema, b: sketchPointSchema });

export const CONSTRUCTION_METHODS = ["extrude", "panel", "frame", "assembly", "flat"] as const;
export type ConstructionMethod = (typeof CONSTRUCTION_METHODS)[number];

const extrudeSpec = z.object({ method: z.literal("extrude"), plane: z.enum(["front", "top"]), profiles, depth: pos() });
const panelSpec = z.object({ method: z.literal("panel"), profiles, thickness: pos(1000), feet: z.boolean() });
const frameSpec = z.object({
  method: z.literal("frame"),
  plane: z.enum(["front", "top"]),
  segments: z.array(segment).min(1).max(CUSTOM_LIMITS.segments),
  section: pos(2000),
  round: z.boolean(),
  /** Front view: overall depth (two frames joined when larger than the section). Plan view: height of the cage. */
  depth: z.number().finite().min(0).max(CUSTOM_LIMITS.maxSize),
  infill: z.boolean(),
});
const assemblySpec = z.object({ method: z.literal("assembly"), parts: z.array(customPartSchema).min(1).max(CUSTOM_LIMITS.parts), template: templateRefSchema.nullable().default(null) });
const flatSpec = z.object({ method: z.literal("flat"), profiles, thickness: pos(500) });

const specUnion = z.discriminatedUnion("method", [extrudeSpec, panelSpec, frameSpec, assemblySpec, flatSpec]);
export type CustomSpec = z.infer<typeof specUnion>;

/** Problems that make a recipe unbuildable, in plain words; empty when it is fine. */
export function specProblems(spec: CustomSpec): string[] {
  const out: string[] = [];
  if ("profiles" in spec) {
    const total = spec.profiles.reduce((n, p) => n + p.length, 0);
    if (total > CUSTOM_LIMITS.totalPoints) out.push(`The outlines have ${total} points; the limit is ${CUSTOM_LIMITS.totalPoints}.`);
    spec.profiles.forEach((p, i) => {
      const name = spec.profiles.length > 1 ? `Outline ${i + 1}` : "The outline";
      if (isSelfIntersecting(p)) out.push(`${name} crosses itself. Move the points so its edges don't cross.`);
      else if (Math.abs(signedArea(p)) < CUSTOM_LIMITS.minArea) out.push(`${name} has no area. Draw a closed shape at least 10 mm across.`);
    });
  }
  if (spec.method === "frame") {
    if (spec.segments.every((s) => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) < 1)) out.push("The frame has no lines with length.");
  }
  return out;
}

export const customSpecSchema = specUnion.superRefine((spec, ctx) => {
  for (const message of specProblems(spec)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

// ------------------------------------------------- builder documents ----

export const sketchShapeSchema = z.discriminatedUnion("kind", [
  /** Rectangle by its top-left corner (as drawn) and size. */
  z.object({ kind: z.literal("rect"), id, x: mm, y: mm, w: pos(MAX), h: pos(MAX) }),
  z.object({ kind: z.literal("circle"), id, cx: mm, cy: mm, r: pos(MAX) }),
  /** Line (2 points), polyline, arc or freehand stroke (open), or polygon (closed). */
  z.object({ kind: z.literal("poly"), id, points: z.array(sketchPointSchema).min(2).max(CUSTOM_LIMITS.pointsPerProfile), closed: z.boolean() }),
]);
export type SketchShape = z.infer<typeof sketchShapeSchema>;

export const sketchSchema = z.object({
  plane: z.enum(["front", "top"]),
  shapes: z.array(sketchShapeSchema).max(CUSTOM_LIMITS.shapes),
  dims: z.array(z.object({ id, a: sketchPointSchema, b: sketchPointSchema, offset: mm })).max(200),
  labels: z.array(z.object({ id, x: mm, y: mm, text: z.string().max(120) })).max(200),
});
export type Sketch = z.infer<typeof sketchSchema>;

/** The builder's construction settings, kept even while the drawing is unfinished. */
export const constructionSchema = z.object({
  method: z.enum(CONSTRUCTION_METHODS),
  /** Extrusion depth; frame depth (front view) or height (plan view). */
  depth: z.number().finite().min(0).max(CUSTOM_LIMITS.maxSize),
  thickness: pos(1000),
  section: pos(2000),
  round: z.boolean(),
  infill: z.boolean(),
  feet: z.boolean(),
});
export type Construction = z.infer<typeof constructionSchema>;

/** A reusable custom object as stored in the library (and edited in the builder). */
export const customDefinitionSchema = z.object({
  v: z.literal(1),
  sketch: sketchSchema,
  construction: constructionSchema,
  parts: z.array(customPartSchema).max(CUSTOM_LIMITS.parts),
  template: templateRefSchema.nullable().default(null),
  /** The generated recipe placed into projects. */
  spec: customSpecSchema,
  color,
  accentColor: color,
  elevation: z.number().finite().min(0).max(CUSTOM_LIMITS.maxSize).default(0),
});
export type CustomDefinition = z.infer<typeof customDefinitionSchema>;

export const CUSTOM_CATEGORIES = ["Stage & platforms", "Backdrops & branding", "Arches & frames", "Screens & truss", "Counters & furniture", "Exhibition", "Decor", "Other"] as const;

export type ParseDefinitionResult = { ok: true; definition: CustomDefinition } | { ok: false; error: string };

/** Validates a library definition from the client or the database. */
export function parseCustomDefinition(input: unknown): ParseDefinitionResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "The custom object data is not an object" };
  const parsed = customDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.map(String).join(".") ?? "";
    return { ok: false, error: where ? `Invalid custom object at ${where}: ${first.message}` : first?.message ?? "Invalid custom object" };
  }
  return { ok: true, definition: parsed.data };
}
