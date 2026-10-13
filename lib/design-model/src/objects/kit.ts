import type { DesignObject, ObjectType } from "../schema";
import type { CustomSpec } from "../custom-schema";
import { beam, box, type Part, type Tone, type V3 } from "../parts";

// Shared pieces for the object definitions: parameter types, the definition
// shape, and small builders (truss members, feet, chairs) reused across
// objects so a fix in one place fixes every object that uses it.

export type ObjectParam =
  | { key: string; label: string; kind: "length"; default: number; min?: number; max?: number; hint?: string }
  | { key: string; label: string; kind: "count"; default: number; min: number; max: number }
  | { key: string; label: string; kind: "boolean"; default: boolean }
  | { key: string; label: string; kind: "color"; default: string }
  | { key: string; label: string; kind: "choice"; default: string; options: Array<{ value: string; label: string }> };

export type PropValue = number | string | boolean;

export const OBJECT_CATEGORIES = ["Stage & platforms", "Backdrops & branding", "Arches & frames", "Screens & truss", "Counters & furniture", "Exhibition", "Generic"] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

/** What a geometry builder needs from an object. */
export type ObjectShape = Pick<DesignObject, "type" | "width" | "depth" | "height" | "props"> & { custom?: CustomSpec | null };

export type ObjectDef = {
  type: ObjectType;
  label: string;
  category: ObjectCategory;
  description: string;
  /** Extra search words. */
  keywords: string[];
  width: number;
  depth: number;
  height: number;
  elevation: number;
  color: string;
  accentColor: string;
  params: ObjectParam[];
  /** Solid parts in the object frame (see parts.ts). */
  build: (o: ObjectShape, p: ParamReader) => Part[];
  /** Width is a diameter and depth follows it. */
  round?: boolean;
  /** A thin face (backdrop, screen): its name goes just behind it on the plan. */
  thin?: boolean;
  /** People walk through it (an arch): not counted as a solid that others intersect. */
  open?: boolean;
  /** Its top is a surface other objects stand on (stage, riser, plinth). */
  surface?: boolean;
  /** The plan draws the hand-made symbol in plan-primitives instead of the part outlines. */
  legacyPlan?: boolean;
  /** Label for the width field (e.g. "Length" for a beam). */
  widthLabel?: string;
};

export type ParamReader = {
  num: (key: string) => number;
  bool: (key: string) => boolean;
  str: (key: string) => string;
};

export function paramReader(def: Pick<ObjectDef, "params">, props: Record<string, PropValue>): ParamReader {
  const get = (key: string): PropValue | undefined => {
    const v = props[key];
    if (v !== undefined) return v;
    return def.params.find((p) => p.key === key)?.default;
  };
  return {
    num: (k) => {
      const v = Number(get(k));
      return Number.isFinite(v) ? v : 0;
    },
    bool: (k) => Boolean(get(k)),
    str: (k) => String(get(k) ?? ""),
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Tube diameter used for truss chords of a given section. */
export const chordSize = (section: number) => clamp(section * 0.16, 25, 60);

/**
 * A square truss member along one axis: four round chords at the corners of
 * a `size` square, zig-zag lacing on each face, and a plan-only outline of
 * the member. `c` gives the centre of the section (the other two axes).
 */
export function trussMember(axis: "x" | "y" | "z", from: number, to: number, c: [number, number], size: number, role: string, tone: Tone = "metal"): Part[] {
  const L = to - from;
  if (!(L > 1) || !(size > 1)) return [];
  const chord = chordSize(size);
  const lace = Math.max(12, chord * 0.5);
  const o = size / 2 - chord / 2;
  const at = (s: number, u: number, v: number): V3 => (axis === "x" ? [s, c[0] + u, c[1] + v] : axis === "y" ? [c[0] + u, s, c[1] + v] : [c[0] + u, c[1] + v, s]);
  const corners: Array<[number, number]> = [[-o, -o], [o, -o], [o, o], [-o, o]];
  const parts: Part[] = corners.map(([u, v]) => beam(at(from, u, v), at(to, u, v), chord, tone, { round: true, role, plan: false }));
  const n = clamp(Math.round(L / Math.max(size, 150)), 1, 40);
  // Lacing ends stop half a tube short of the member ends so nothing pokes out.
  const l0 = from + lace / 2;
  const span = L - lace;
  for (let f = 0; f < 4; f++) {
    const [u0, v0] = corners[f];
    const [u1, v1] = corners[(f + 1) % 4];
    for (let i = 0; i < n; i++) {
      const s0 = l0 + (span * i) / n;
      const s1 = l0 + (span * (i + 1)) / n;
      // Alternate the diagonal direction so the lacing zig-zags.
      const [a, b] = i % 2 === 0 ? [[u0, v0], [u1, v1]] : [[u1, v1], [u0, v0]];
      parts.push(beam(at(s0, a[0], a[1]), at(s1, b[0], b[1]), lace, tone, { round: true, role, plan: false }));
    }
  }
  // What the plan shows: the member's square outline.
  const mid = (from + to) / 2;
  const centre = at(mid, 0, 0);
  const dims: V3 = axis === "x" ? [L, size, size] : axis === "y" ? [size, L, size] : [size, size, L];
  parts.push(box(centre[0], centre[1] - dims[1] / 2, centre[2], dims[0], dims[1], dims[2], tone, { role, render: false }));
  return parts;
}

/** A plain square tube member along one axis (no lacing). */
export function tubeMember(axis: "x" | "y" | "z", from: number, to: number, c: [number, number], size: number, role: string, tone: Tone = "metal"): Part[] {
  const L = to - from;
  if (!(L > 0.5)) return [];
  const mid = (from + to) / 2;
  if (axis === "x") return [box(mid, c[0] - size / 2, c[1], L, size, size, tone, { role })];
  if (axis === "y") return [box(c[0], from, c[1], size, L, size, tone, { role })];
  return [box(c[0], c[1] - size / 2, mid, size, size, L, tone, { role })];
}

/** Flat foot plates/stabiliser bars under a freestanding panel, kept inside the footprint. */
export function feet(xs: number[], depth: number, width = 60, height = 40, tone: Tone = "dark"): Part[] {
  return xs.map((x) => box(x, 0, 0, width, height, depth, tone, { role: "foot" }));
}

/** Simple banquet chair facing the point (cx, cz) from (x, z): seat, back and legs. */
export function chair(x: number, z: number, facing: number, tone: Tone = "accent"): Part[] {
  const seat = 420;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  // Local frame: +u towards what the chair faces; back sits at -u.
  const at = (u: number, v: number): [number, number] => [x + u * c - v * s, z + u * s + v * c];
  const ry = (facing * 180) / Math.PI + 90;
  const [bx, bz] = at(-seat / 2 + 20, 0);
  const parts: Part[] = [box(x, 430, z, seat, 40, seat, tone, { role: "seat", outside: true, ry })];
  parts.push(box(bx, 470, bz, seat, 420, 40, tone, { role: "chair-back", outside: true, ry, plan: false }));
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const [lx, lz] = at((u * seat) / 2 - u * 30, (v * seat) / 2 - v * 30);
    parts.push(box(lx, 0, lz, 30, 430, 30, "metal", { role: "chair-leg", outside: true, plan: false }));
  }
  return parts;
}
