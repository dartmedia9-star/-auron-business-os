import { OBJECT_DEFS, fitPlacement, formatLength, objectParts, objectSurfaces, surfaceLayout, type DisplayUnit, type FinishFit, type ProjectModel } from "@workspace/design-model";

// The artwork schedule printed after the floor plan in the PDF export: one
// row per surface that carries an image, with the surface size, the image's
// pixel size and printed size, and the resulting resolution, so a printer
// can check every graphic against the plan.

export type ArtAssetInfo = { id: number; name: string; width: number; height: number };

export type ArtRow = {
  object: string;
  surface: string;
  /** Surface size in mm. */
  surfaceW: number;
  surfaceH: number;
  assetId: number;
  /** Null when the image is no longer in the gallery. */
  image: ArtAssetInfo | null;
  fit: FinishFit;
  rotation: number;
  /** Printed size of the whole image in mm (it may overflow the surface when cropped). */
  printW: number | null;
  printH: number | null;
  ppi: number | null;
  cropped: boolean;
};

const FIT_WORDS: Record<FinishFit, string> = { cover: "Fill (cropped)", contain: "Fit whole image", stretch: "Stretched", custom: "Custom" };

export function artworkSchedule(model: ProjectModel, assets: ReadonlyMap<number, ArtAssetInfo>): ArtRow[] {
  const rows: ArtRow[] = [];
  for (const o of model.objects) {
    if (!o.finishes || !Object.keys(o.finishes).length) continue;
    const layout = surfaceLayout(objectParts(o), objectSurfaces(o));
    for (const { def, rect } of layout.surfaces) {
      const f = o.finishes[def.id];
      if (!f) continue;
      const sw = rect.u1 - rect.u0;
      const sh = rect.v1 - rect.v0;
      const image = assets.get(f.assetId) ?? null;
      const pl = image ? fitPlacement(sw, sh, image.width, image.height, f) : null;
      const across = image ? (f.rotation === 90 || f.rotation === 270 ? image.height : image.width) : 0;
      rows.push({
        object: o.name || OBJECT_DEFS[o.type].label,
        surface: def.label,
        surfaceW: sw,
        surfaceH: sh,
        assetId: f.assetId,
        image,
        fit: f.fit,
        rotation: f.rotation,
        printW: pl ? pl.w : null,
        printH: pl ? pl.h : null,
        ppi: pl && pl.w > 0 ? across / (pl.w / 25.4) : null,
        cropped: !!pl && (pl.w > sw + 0.5 || pl.h > sh + 0.5),
      });
    }
  }
  return rows;
}

/** The text columns of one schedule row, with lengths in the chosen unit. */
export function artRowText(r: ArtRow, unit: DisplayUnit): { object: string; surface: string; size: string; image: string; fit: string; print: string } {
  return {
    object: r.object,
    surface: r.surface,
    size: `${formatLength(r.surfaceW, unit)} × ${formatLength(r.surfaceH, unit)}`,
    image: r.image ? `${r.image.name} (${r.image.width} × ${r.image.height} px)` : `Missing image #${r.assetId}`,
    fit: `${FIT_WORDS[r.fit]}${r.rotation ? `, turned ${r.rotation}°` : ""}`,
    print:
      r.printW !== null && r.printH !== null
        ? `${formatLength(r.printW, unit)} × ${formatLength(r.printH, unit)}${r.ppi !== null ? `, ${Math.round(r.ppi)} ppi` : ""}${r.cropped ? ", edges cropped" : ""}`
        : "—",
  };
}

/** A small JPEG of each image for the schedule (from the stored thumbnail), or null if it can't be read. */
export async function artThumbData(id: number, url: string): Promise<{ id: number; data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const k = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * k));
    canvas.height = Math.max(1, Math.round(bitmap.height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = { id, data: canvas.toDataURL("image/jpeg", 0.8), w: canvas.width, h: canvas.height };
    canvas.width = canvas.height = 0;
    return out;
  } catch {
    return null;
  }
}
