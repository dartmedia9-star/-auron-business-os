import type { ReferenceImage, SketchPoint } from "./custom-schema";

// ---------------------------------------------------------------------------
// Reference pictures in the Custom Builder: where an image pixel lands in
// the drawing, two-point calibration, and the image's extent. A picture is
// only a guide: tracing over it makes ordinary, editable drawing shapes.
//
// Calibration is exact for the two points given. It's only as true as the
// picture: a photo or perspective render isn't to scale across its area,
// so lengths away from the calibrated line can be wrong.
// ---------------------------------------------------------------------------

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Drawing coordinates (mm) of an image pixel. */
export function refToDrawing(r: Pick<ReferenceImage, "x" | "y" | "mmPerPx" | "rotation">, px: SketchPoint): SketchPoint {
  const c = Math.cos(rad(r.rotation));
  const s = Math.sin(rad(r.rotation));
  const u = px.x * r.mmPerPx;
  const v = px.y * r.mmPerPx;
  // Drawing y runs down the screen, so a clockwise turn is +θ in (x, y).
  return { x: r.x + u * c - v * s, y: r.y + u * s + v * c };
}

/** Image pixel under a drawing point (inverse of refToDrawing). */
export function drawingToRef(r: Pick<ReferenceImage, "x" | "y" | "mmPerPx" | "rotation">, p: SketchPoint): SketchPoint {
  const c = Math.cos(rad(r.rotation));
  const s = Math.sin(rad(r.rotation));
  const dx = p.x - r.x;
  const dy = p.y - r.y;
  return { x: (dx * c + dy * s) / r.mmPerPx, y: (-dx * s + dy * c) / r.mmPerPx };
}

export type CalibrationResult = { ok: true; ref: ReferenceImage } | { ok: false; error: string };

/**
 * Rescales the picture so the distance between two drawing points (tapped
 * on the picture) equals `lengthMm`. The first point stays where it is on
 * screen, so tracing already done around it stays aligned.
 */
export function calibrateReference(r: ReferenceImage, a: SketchPoint, b: SketchPoint, lengthMm: number): CalibrationResult {
  if (!(lengthMm > 0) || !Number.isFinite(lengthMm)) return { ok: false, error: "Enter the real distance between the two points." };
  const pa = drawingToRef(r, a);
  const pb = drawingToRef(r, b);
  const px = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  if (!(px >= 2)) return { ok: false, error: "The two points are too close together on the picture. Tap two points far apart, such as the two ends of a known length." };
  const mmPerPx = lengthMm / px;
  if (mmPerPx > 10_000) return { ok: false, error: "That scale is too large. Check the length you typed." };
  // Keep point A fixed: the corner moves so that A lands where it was.
  const scaled = { ...r, mmPerPx };
  const aNow = refToDrawing(scaled, pa);
  const ref: ReferenceImage = { ...scaled, x: r.x + (a.x - aNow.x), y: r.y + (a.y - aNow.y), calibration: { a: pa, b: pb, lengthMm } };
  return { ok: true, ref };
}

/** The four corners of the picture in drawing coordinates. */
export function referenceCorners(r: ReferenceImage, widthPx: number, heightPx: number): SketchPoint[] {
  return [
    { x: 0, y: 0 },
    { x: widthPx, y: 0 },
    { x: widthPx, y: heightPx },
    { x: 0, y: heightPx },
  ].map((p) => refToDrawing(r, p));
}

export function referenceBounds(r: ReferenceImage, widthPx: number, heightPx: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const c = referenceCorners(r, widthPx, heightPx);
  return { minX: Math.min(...c.map((p) => p.x)), minY: Math.min(...c.map((p) => p.y)), maxX: Math.max(...c.map((p) => p.x)), maxY: Math.max(...c.map((p) => p.y)) };
}

/**
 * A new reference picture: as wide as the current drawing (or 3 m when
 * there's nothing drawn yet), its top-left at the drawing's top-left.
 * The scale is a starting guess until it's calibrated.
 */
export function newReference(assetId: number, widthPx: number, bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): ReferenceImage {
  const wide = bounds && bounds.maxX - bounds.minX > 100 ? bounds.maxX - bounds.minX : 3000;
  return {
    assetId,
    x: bounds ? bounds.minX : 0,
    y: bounds ? bounds.minY : 0,
    mmPerPx: wide / Math.max(1, widthPx),
    rotation: 0,
    opacity: 0.5,
    locked: false,
    hidden: false,
    calibration: null,
  };
}

/** Turns the picture to `rotation` degrees about its centre (so it doesn't swing away). */
export function turnReference(r: ReferenceImage, widthPx: number, heightPx: number, rotation: number): ReferenceImage {
  const centre = { x: widthPx / 2, y: heightPx / 2 };
  const before = refToDrawing(r, centre);
  const turned = { ...r, rotation };
  const after = refToDrawing(turned, centre);
  return { ...turned, x: r.x + before.x - after.x, y: r.y + before.y - after.y };
}

/** Rescales the picture to a new mm-per-pixel about its top-left corner, clearing any calibration. */
export function scaleReference(r: ReferenceImage, mmPerPx: number): ReferenceImage {
  return { ...r, mmPerPx, calibration: null };
}
