import { z } from "zod";
import { DISPLAY_UNITS } from "./units";

// ---------------------------------------------------------------------------
// The Design Studio project model: one editable document shared by the 2D
// Hall Designer, the 3D Studio and the server.
//
// Coordinates are plan coordinates in millimetres: x to the right, y down the
// page (towards the viewer in 3D). Heights and elevations are millimetres
// above the finished floor. Rotations are degrees, clockwise on the plan.
//
// Rooms are closed outlines whose points are the INTERNAL wall faces (what is
// measured on site); walls are built outward from them by their thickness.
// Partitions are open wall polylines measured on their centreline.
//
// Every entity carries a stable string id. Openings reference their host
// wall by host id + the id of the wall's start vertex, so inserting a vertex
// elsewhere never re-targets a door.
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

/** Upper bound for any length (1 km) to reject corrupt values. */
const MAX_MM = 1_000_000;

const id = z.string().min(1).max(64);
const mm = z.number().finite().min(-MAX_MM).max(MAX_MM);
const positiveMm = z.number().finite().gt(0).max(MAX_MM);
const nonNegMm = z.number().finite().min(0).max(MAX_MM);
const degrees = z.number().finite().min(-3600).max(3600);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().max(max);

export const vec2Schema = z.object({ x: mm, y: mm });
export const vertexSchema = vec2Schema.extend({ id });

/** How sure a value is: measured on site, estimated, or still to confirm. */
export const MEASURE_STATUSES = ["measured", "estimated", "to_confirm"] as const;
export const measureStatusSchema = z.enum(MEASURE_STATUSES);

const entityBase = {
  id,
  name: text(120),
  notes: text(4000).default(""),
  status: measureStatusSchema.default("measured"),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
};

export const roomSchema = z.object({
  ...entityBase,
  points: z.array(vertexSchema).min(3).max(400),
  wallThickness: nonNegMm.max(5000),
  wallHeight: positiveMm.max(100_000),
  floorColor: color,
  wallColor: color,
  showWalls: z.boolean().default(true),
  /** Distance of wall dimension lines outside the wall, in mm. */
  dimOffset: nonNegMm.max(50_000).default(600),
  labelOffset: vec2Schema.default({ x: 0, y: 0 }),
});

export const partitionSchema = z.object({
  ...entityBase,
  points: z.array(vertexSchema).min(2).max(400),
  thickness: positiveMm.max(5000),
  height: positiveMm.max(100_000),
  color,
});

export const OPENING_KINDS = ["door", "double_door", "window", "opening", "entrance", "emergency_exit", "loading"] as const;
export const openingSchema = z.object({
  ...entityBase,
  kind: z.enum(OPENING_KINDS),
  hostId: id,
  /** Id of the host wall's start vertex (the wall runs from it to the next vertex). */
  startVertexId: id,
  /** Distance from the wall's start vertex to the near edge of the opening. */
  offset: nonNegMm,
  width: positiveMm,
  height: positiveMm,
  /** Height of the bottom of the opening above the floor (0 for doors). */
  sill: nonNegMm,
  swing: z.enum(["left", "right", "none"]).default("left"),
  swingSide: z.enum(["in", "out"]).default("in"),
});

export const pillarSchema = z.object({
  ...entityBase,
  x: mm,
  y: mm,
  shape: z.enum(["rect", "round"]),
  width: positiveMm,
  depth: positiveMm,
  /** 0 = full height of the room it stands in. */
  height: nonNegMm,
  rotation: degrees,
  color,
});

export const SECTION_KINDS = [
  "section",
  "stage_area",
  "dance_floor",
  "seating",
  "dining",
  "registration",
  "exhibition",
  "circulation",
  "emergency_exit",
  "generic",
] as const;
export const sectionSchema = z.object({
  ...entityBase,
  kind: z.enum(SECTION_KINDS),
  /** Centre of the section. */
  x: mm,
  y: mm,
  width: positiveMm,
  depth: positiveMm,
  rotation: degrees,
  color,
  showDims: z.boolean().default(true),
  /** Manual shift of the name label from its automatic place (0,0 = automatic). */
  labelOffset: vec2Schema.default({ x: 0, y: 0 }),
});

export const OBJECT_TYPES = [
  "stage",
  "riser",
  "backdrop",
  "box_arch",
  "skirting",
  "led_screen",
  "structure",
  "steps",
  "counter",
  "round_table",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const objectSchema = z.object({
  ...entityBase,
  type: z.enum(OBJECT_TYPES),
  /** Centre of the footprint. */
  x: mm,
  y: mm,
  /** Height of the object's base above the floor. */
  elevation: nonNegMm,
  rotation: degrees,
  /** Footprint along the object's own x axis. */
  width: positiveMm,
  /** Footprint along the object's own y axis (front is +y). */
  depth: positiveMm,
  height: positiveMm,
  color,
  accentColor: color,
  /** Type-specific parameters (see objects.ts); all plain values. */
  props: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(200), z.boolean()])).default({}),
  /** Manual shift of the name label from its automatic place (0,0 = automatic). */
  labelOffset: vec2Schema.default({ x: 0, y: 0 }),
});

export const dimensionSchema = z.object({
  id,
  a: vec2Schema,
  b: vec2Schema,
  /** Perpendicular distance of the dimension line from a→b (positive = left of a→b). */
  offset: mm,
  /** Optional text shown after the measured value, e.g. "clear". Never replaces it. */
  suffix: text(60).default(""),
  hidden: z.boolean().default(false),
});

export const labelSchema = z.object({
  id,
  x: mm,
  y: mm,
  text: text(200),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  hidden: z.boolean().default(false),
});

export const NOTE_STATUSES = ["measured", "assumption", "to_confirm"] as const;
export const noteSchema = z.object({
  id,
  text: text(4000),
  status: z.enum(NOTE_STATUSES),
  /** Entity the note belongs to, or null for a project-level note. */
  targetId: id.nullable().default(null),
  createdAt: z.string().max(40),
});

export const checklistItemSchema = z.object({
  id,
  label: text(200),
  done: z.boolean().default(false),
  value: text(200).default(""),
});

export const settingsSchema = z.object({
  displayUnit: z.enum(DISPLAY_UNITS),
  gridSize: positiveMm.max(10_000),
  showGrid: z.boolean(),
  snapGrid: z.boolean(),
  snapGeometry: z.boolean(),
  snapAngle: z.boolean(),
  showWallDims: z.boolean(),
  showOverallDims: z.boolean(),
  showExternalDims: z.boolean(),
  showSectionDims: z.boolean(),
  showObjectDims: z.boolean(),
  showLabels: z.boolean(),
  showObjects: z.boolean(),
});

export const venueSchema = z.object({
  name: text(200),
  address: text(400),
  /** Ceiling height in mm; null = not recorded. */
  ceilingHeight: positiveMm.nullable(),
  ceilingStatus: measureStatusSchema,
  notes: text(8000),
});

export const drawingSchema = z.object({
  title: text(200),
  client: text(200),
  revision: text(40),
  date: text(40),
  preparedBy: text(120),
});

export const sceneSchema = z.object({
  floorColor: color,
  wallColor: color,
  wallOpacity: z.number().min(0.1).max(1),
  showCeiling: z.boolean(),
  lighting: z.enum(["studio", "event", "daylight"]),
});

export const projectModelSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  settings: settingsSchema,
  venue: venueSchema,
  drawing: drawingSchema,
  scene: sceneSchema,
  rooms: z.array(roomSchema).max(200),
  partitions: z.array(partitionSchema).max(500),
  openings: z.array(openingSchema).max(1000),
  pillars: z.array(pillarSchema).max(1000),
  sections: z.array(sectionSchema).max(1000),
  objects: z.array(objectSchema).max(2000),
  dimensions: z.array(dimensionSchema).max(1000),
  labels: z.array(labelSchema).max(1000),
  notes: z.array(noteSchema).max(1000),
  checklist: z.array(checklistItemSchema).max(200),
});

export type Vec2 = z.infer<typeof vec2Schema>;
export type Vertex = z.infer<typeof vertexSchema>;
export type MeasureStatus = z.infer<typeof measureStatusSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Partition = z.infer<typeof partitionSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type OpeningKind = Opening["kind"];
export type Pillar = z.infer<typeof pillarSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type SectionKind = Section["kind"];
export type DesignObject = z.infer<typeof objectSchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Note = z.infer<typeof noteSchema>;
export type NoteStatus = Note["status"];
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Drawing = z.infer<typeof drawingSchema>;
export type SceneSettings = z.infer<typeof sceneSchema>;
export type ProjectModel = z.infer<typeof projectModelSchema>;

/** Entity collections that hold selectable, id-bearing plan items. */
export type EntityKind = "room" | "partition" | "opening" | "pillar" | "section" | "object" | "dimension" | "label";
