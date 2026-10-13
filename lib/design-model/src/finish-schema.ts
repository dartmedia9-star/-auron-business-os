import { z } from "zod";

// Artwork placement on object surfaces (see finishes.ts). Kept apart from
// schema.ts so custom object definitions can carry finishes too.

/**
 * How an image fills a surface. contain: whole image visible, letterboxed in
 * the surface colour; cover: fills the surface, cropping the overflow;
 * stretch: exactly the surface (may distort); custom: scale and offset.
 */
export const FINISH_FITS = ["contain", "cover", "stretch", "custom"] as const;
export const FINISH_ROTATIONS = [0, 90, 180, 270] as const;

/**
 * Artwork on one named surface of an object. Only the image's id and how
 * it's placed are stored, never image data. Scale and offset are fractions
 * of the surface size, so resizing the object keeps the placement.
 */
export const finishSchema = z.object({
  assetId: z.number().int().positive().max(2_147_483_647),
  fit: z.enum(FINISH_FITS).default("cover"),
  /** Quarter turns of the image, clockwise as seen. */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  /** custom: image width as a fraction of the surface width. */
  scale: z.number().finite().min(0.01).max(20).default(1),
  /** custom without aspect lock: image height as a fraction of the surface height. */
  scaleY: z.number().finite().min(0.01).max(20).default(1),
  lockAspect: z.boolean().default(true),
  /** Shift of the image centre from the surface centre, as a fraction of the surface width / height (right, up). */
  offsetX: z.number().finite().min(-5).max(5).default(0),
  offsetY: z.number().finite().min(-5).max(5).default(0),
});

export const MAX_FINISHES = 16;
export const finishesSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), finishSchema)
  .refine((f) => Object.keys(f).length <= MAX_FINISHES, { message: `At most ${MAX_FINISHES} surfaces can carry artwork` });

