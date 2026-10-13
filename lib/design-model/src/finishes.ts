import { OBJECT_DEFS } from "./objects";
import { paramReader, type ObjectShape, type SurfaceDef, type SurfaceFacing } from "./objects/kit";
import { isRendered, partFaces, type Face, type Part, type V3 } from "./parts";
import type { Finish, Finishes } from "./schema";

// ---------------------------------------------------------------------------
// Artwork on object surfaces: which faces make up each named surface, and
// where an image lands on it. Plain numbers only, so the 3D view, exports
// and tests share one implementation.
//
// Every surface is mapped flat, as seen by someone standing in front of
// it: u runs to their right, v up (for the top, front of the object at the
// bottom). An image therefore always reads the right way round on the
// face it's on; it can't come out mirrored or upside down.
// ---------------------------------------------------------------------------

export type { SurfaceDef, SurfaceFacing } from "./objects";

export const FACING_DIR: Record<SurfaceFacing, V3> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
};

/** Surface coordinates (u right, v up, as seen looking at the surface) of an object-frame point. */
export function toSurface(facing: SurfaceFacing, q: V3): [number, number] {
  switch (facing) {
    case "front":
      return [q[0], q[1]];
    case "back":
      return [-q[0], q[1]];
    case "right":
      return [-q[2], q[1]];
    case "left":
      return [q[2], q[1]];
    case "top":
      return [q[0], -q[2]];
  }
}

/** The surfaces that can carry artwork on this object, as it is built now. */
export function objectSurfaces(o: ObjectShape): SurfaceDef[] {
  const def = OBJECT_DEFS[o.type];
  return def.surfaces ? def.surfaces(o, paramReader(def, o.props)) : [];
}

/** Unit normal of a planar face (Newell's method, robust for any polygon). */
export function faceNormal(f: Face): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < f.length; i++) {
    const a = f[i];
    const b = f[(i + 1) % f.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z);
  return l > 0 ? [x / l, y / l, z / l] : [0, 0, 0];
}

/** Faces turned less than 60° from the surface direction count (curved fronts included). */
const FACING_MIN_DOT = 0.5;

export type SurfaceRect = { u0: number; v0: number; u1: number; v1: number };

export type SurfaceLayout = {
  surfaces: Array<{ def: SurfaceDef; rect: SurfaceRect; faces: number }>;
  /** For each part (in order), the surface index of each of its faces, or -1. Null for parts not drawn. */
  faceSurface: Array<Int16Array | null>;
};

/**
 * Assigns faces to surfaces. `detail` must match the detail the geometry is
 * built with, so face indices line up.
 */
export function surfaceLayout(parts: Part[], surfaces: SurfaceDef[], detail: "render" | "thumb" = "render"): SurfaceLayout {
  const ext = surfaces.map(() => ({ u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity, faces: 0 }));
  const faceSurface = parts.map((p) => {
    if (!isRendered(p)) return null;
    const faces = partFaces(p, detail);
    const out = new Int16Array(faces.length).fill(-1);
    const candidates = surfaces.map((s, i) => (p.role && s.roles.includes(p.role) ? i : -1)).filter((i) => i >= 0);
    if (!candidates.length) return out;
    faces.forEach((f, fi) => {
      const n = faceNormal(f);
      for (const si of candidates) {
        const d = FACING_DIR[surfaces[si].facing];
        if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < FACING_MIN_DOT) continue;
        out[fi] = si;
        const e = ext[si];
        e.faces++;
        for (const q of f) {
          const [u, v] = toSurface(surfaces[si].facing, q);
          e.u0 = Math.min(e.u0, u);
          e.v0 = Math.min(e.v0, v);
          e.u1 = Math.max(e.u1, u);
          e.v1 = Math.max(e.v1, v);
        }
        break;
      }
    });
    return out;
  });
  return {
    surfaces: surfaces.map((def, i) => {
      const e = ext[i];
      const rect = def.rect ?? (e.faces ? { u0: e.u0, v0: e.v0, u1: e.u1, v1: e.v1 } : { u0: 0, v0: 0, u1: 0, v1: 0 });
      return { def, rect, faces: e.faces };
    }),
    faceSurface,
  };
}

// ----------------------------------------------------------------- fit ----

/** Where the image sits on a surface: its centre and size in mm from the surface's bottom-left, and its turn. */
export type Placement = { cx: number; cy: number; w: number; h: number; rotation: Finish["rotation"] };

type FitInput = Pick<Finish, "fit" | "rotation" | "scale" | "scaleY" | "lockAspect" | "offsetX" | "offsetY">;

export const DEFAULT_FINISH: Omit<Finish, "assetId"> = { fit: "cover", rotation: 0, scale: 1, scaleY: 1, lockAspect: true, offsetX: 0, offsetY: 0 };

/**
 * Size and position of an image (iw × ih pixels) on a surface sw × sh mm.
 * The surface never changes size: cover crops, contain leaves bands in the
 * surface colour.
 */
export function fitPlacement(sw: number, sh: number, iw: number, ih: number, f: FitInput): Placement {
  const turned = f.rotation === 90 || f.rotation === 270;
  // The image's size as it appears once turned.
  const aw = turned ? ih : iw;
  const ah = turned ? iw : ih;
  let w = sw;
  let h = sh;
  if (aw > 0 && ah > 0 && sw > 0 && sh > 0) {
    if (f.fit === "contain" || f.fit === "cover") {
      const k = f.fit === "contain" ? Math.min(sw / aw, sh / ah) : Math.max(sw / aw, sh / ah);
      w = aw * k;
      h = ah * k;
    } else if (f.fit === "custom") {
      w = sw * f.scale;
      h = f.lockAspect ? (w * ah) / aw : sh * f.scaleY;
    }
  }
  return { cx: sw / 2 + f.offsetX * sw, cy: sh / 2 + f.offsetY * sh, w, h, rotation: f.rotation };
}

/**
 * Image coordinates (s to the right, t down from the top edge, both 0–1
 * inside the image) of a point (x, y) mm from the surface's bottom-left.
 * Values outside 0–1 mean the point shows the surface colour.
 */
export function imageCoords(x: number, y: number, pl: Placement): [number, number] {
  // Position inside the turned image box: a to the right, b down.
  const a = (x - (pl.cx - pl.w / 2)) / pl.w;
  const b = (pl.cy + pl.h / 2 - y) / pl.h;
  switch (pl.rotation) {
    case 0:
      return [a, b];
    case 90:
      return [b, 1 - a];
    case 180:
      return [1 - a, 1 - b];
    case 270:
      return [1 - b, a];
  }
}

/** Image coordinates of an object-frame point on a laid-out surface. */
export function surfacePointToImage(facing: SurfaceFacing, rect: SurfaceRect, pl: Placement, q: V3): [number, number] {
  const [u, v] = toSurface(facing, q);
  return imageCoords(u - rect.u0, v - rect.v0, pl);
}

/** The asset ids an object's finishes use. */
export function finishAssetIds(finishes: Finishes | undefined | null): number[] {
  if (!finishes) return [];
  return [...new Set(Object.values(finishes).map((f) => f.assetId))];
}

/** The asset ids used anywhere in a design (for preloading and checks). */
export function modelAssetIds(objects: Array<{ finishes?: Finishes }>): number[] {
  const ids = new Set<number>();
  for (const o of objects) for (const id of finishAssetIds(o.finishes)) ids.add(id);
  return [...ids];
}
