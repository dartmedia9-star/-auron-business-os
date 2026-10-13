import { useMemo } from "react";
import { AlertTriangle, ImagePlus, RotateCw, Trash2, Undo2 } from "lucide-react";
import {
  DEFAULT_FINISH,
  fitPlacement,
  formatLength,
  objectParts,
  objectSurfaces,
  surfaceLayout,
  type DesignObject,
  type DisplayUnit,
  type Finish,
  type FinishFit,
} from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { AssetThumb, useAssetPicker, useAssets } from "./asset-library";
import { FieldRow, PanelSection, SelectField, ToggleRow } from "./fields";

// Artwork for the selected object: one row per named surface, each with its
// own image, fit, turn and position. Every change is one undo step; a slider
// drag merges into a single step.

type Patch = (p: Record<string, unknown>, key?: string) => void;

const FIT_OPTIONS: Array<{ value: FinishFit; label: string }> = [
  { value: "cover", label: "Fill (crop the overflow)" },
  { value: "contain", label: "Fit whole image" },
  { value: "stretch", label: "Stretch to the surface" },
  { value: "custom", label: "Custom size and position" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** What the artwork controls need from an object (a placed object, or the Custom Builder's result). */
export type ArtObject = Pick<DesignObject, "id" | "type" | "width" | "depth" | "height" | "props" | "finishes"> & { custom?: DesignObject["custom"] };

export function ArtworkFields({ o, unit, patch }: { o: ArtObject; unit: DisplayUnit; patch: Patch }) {
  const pick = useAssetPicker();
  const assets = useAssets();
  const byId = useMemo(() => new Map((assets.data ?? []).map((a) => [a.id, a])), [assets.data]);
  const layout = useMemo(() => surfaceLayout(objectParts(o), objectSurfaces(o)), [o]);
  const finishes = o.finishes ?? {};

  if (!layout.surfaces.length) {
    if (o.type === "box_arch")
      return (
        <PanelSection title="Artwork">
          <p className="text-xs text-muted-foreground" data-testid="artwork-none">
            A truss arch has nothing to print on. Turn on "Branding panels on the front", or choose solid beams, to add artwork.
          </p>
        </PanelSection>
      );
    return null;
  }

  const setFinish = (surface: string, f: Finish | null, key?: string) => {
    const next = { ...finishes };
    if (f) next[surface] = f;
    else delete next[surface];
    patch({ finishes: Object.keys(next).length ? next : undefined }, key ?? `${o.id}:finish:${surface}`);
  };

  return (
    <PanelSection title="Artwork">
      {layout.surfaces.map(({ def, rect, faces }) => {
        const f = finishes[def.id];
        const asset = f ? byId.get(f.assetId) : undefined;
        const gone = !!f && assets.isSuccess && !asset;
        const sw = rect.u1 - rect.u0;
        const sh = rect.v1 - rect.v0;
        const choose = () =>
          pick?.({
            title: `Artwork: ${def.label}`,
            description: `Pick the image for the ${def.label.toLowerCase()} (${formatLength(sw, unit)} × ${formatLength(sh, unit)}).`,
            onPick: (a) => setFinish(def.id, { ...DEFAULT_FINISH, ...(f ?? {}), assetId: a.id }),
          });
        const edit = (p: Partial<Finish>, field: string) => f && setFinish(def.id, { ...f, ...p }, `${o.id}:finish:${def.id}:${field}`);
        const pl = f && asset ? fitPlacement(sw, sh, asset.width, asset.height, f) : null;
        // Pixels per inch of the image at its printed size on this surface.
        const ppi = pl && asset ? (f!.rotation === 90 || f!.rotation === 270 ? asset.height : asset.width) / (pl.w / 25.4) : null;
        return (
          <div key={def.id} className="space-y-3 rounded-lg border border-border/70 p-3" data-testid={`surface-${def.id}`} data-has-art={f ? "yes" : "no"}>
            <div className="flex items-center gap-3">
              {f && asset ? <AssetThumb asset={asset} className="h-14 w-20 shrink-0" /> : <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground">{gone ? "Missing" : "No artwork"}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{def.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatLength(sw, unit)} × {formatLength(sh, unit)}
                  {faces === 0 && " (not shown with the current settings)"}
                </p>
                {f && asset && <p className="truncate text-xs text-muted-foreground">{asset.name}</p>}
              </div>
            </div>
            {gone && (
              <p className="flex items-start gap-1.5 text-xs text-destructive" data-testid="artwork-missing">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This image is no longer in the gallery. The surface shows a "Missing image" pattern until you choose another.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={choose} disabled={!pick} data-testid={`surface-${def.id}-choose`}>
                <ImagePlus className="mr-2 h-4 w-4" /> {f ? "Replace image" : "Choose image"}
              </Button>
              {f && (
                <Button variant="outline" className="h-11 w-11 shrink-0 px-0" aria-label={`Remove the artwork from the ${def.label.toLowerCase()}`} onClick={() => setFinish(def.id, null)} data-testid={`surface-${def.id}-remove`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {f && (
              <>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <SelectField label="Fit" value={f.fit} options={FIT_OPTIONS} onChange={(fit) => edit({ fit }, "fit")} testId={`surface-${def.id}-fit`} />
                  </div>
                  <Button variant="outline" className="h-11 shrink-0" onClick={() => edit({ rotation: ((f.rotation + 90) % 360) as Finish["rotation"] }, "rotation")} data-testid={`surface-${def.id}-rotate`}>
                    <RotateCw className="mr-1.5 h-4 w-4" /> {f.rotation}°
                  </Button>
                </div>
                {f.fit === "custom" && (
                  <>
                    <SliderRow label="Width" value={f.scale} min={0.05} max={4} step={0.01} format={pct} onChange={(scale) => edit({ scale }, "scale")} testId={`surface-${def.id}-scale`} />
                    <ToggleRow label="Keep the image's proportions" checked={f.lockAspect} onChange={(lockAspect) => edit({ lockAspect }, "lock")} />
                    {!f.lockAspect && <SliderRow label="Height" value={f.scaleY} min={0.05} max={4} step={0.01} format={pct} onChange={(scaleY) => edit({ scaleY }, "scaleY")} />}
                  </>
                )}
                {f.fit !== "stretch" && (
                  <>
                    <SliderRow label="Move left / right" value={f.offsetX} min={-1} max={1} step={0.005} format={pct} onChange={(offsetX) => edit({ offsetX }, "offsetX")} testId={`surface-${def.id}-offset-x`} />
                    <SliderRow label="Move down / up" value={f.offsetY} min={-1} max={1} step={0.005} format={pct} onChange={(offsetY) => edit({ offsetY }, "offsetY")} />
                  </>
                )}
                {(f.offsetX !== 0 || f.offsetY !== 0 || f.scale !== 1 || f.scaleY !== 1 || f.rotation !== 0 || !f.lockAspect) && (
                  <Button variant="ghost" className="h-10 w-full justify-start" onClick={() => setFinish(def.id, { ...DEFAULT_FINISH, assetId: f.assetId, fit: f.fit })} data-testid={`surface-${def.id}-reset`}>
                    <Undo2 className="mr-2 h-4 w-4" /> Reset size, turn and position
                  </Button>
                )}
                {pl && asset && (
                  <p className="text-[11px] text-muted-foreground" data-testid={`surface-${def.id}-info`}>
                    {asset.width} × {asset.height} px, shown at {formatLength(pl.w, unit)} × {formatLength(pl.h, unit)}
                    {ppi !== null && ` (about ${Math.round(ppi)} px per inch)`}.
                    {f.fit === "cover" && (pl.w > sw + 0.5 || pl.h > sh + 0.5) && " Edges beyond the surface are cropped."}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">Artwork is mapped flat onto each surface as seen from in front of it. It never changes the object's size.</p>
    </PanelSection>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange, testId }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; testId?: string }) {
  return (
    <FieldRow label={`${label}: ${format(value)}`}>
      <Slider className="py-3" value={[Math.max(min, Math.min(max, value))]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} data-testid={testId} aria-label={label} />
    </FieldRow>
  );
}
