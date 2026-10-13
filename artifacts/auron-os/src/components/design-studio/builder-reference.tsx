import { useMemo, useState } from "react";
import { AlertTriangle, Crosshair, Eye, EyeOff, ImagePlus, Lock, LockOpen, Move, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import {
  calibrateReference,
  formatLength,
  newReference,
  parseLength,
  scaleReference,
  turnReference,
  type DisplayUnit,
  type ReferenceImage,
  type Sketch,
  type SketchPoint,
} from "@workspace/design-model";
import type { DesignAsset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { AssetThumb, useAssetPicker, useAssets } from "./asset-library";
import { assetFileUrl } from "./asset-upload";
import { sketchBounds } from "./builder-sketch";
import { FieldRow, LengthField, PanelSection } from "./fields";

// The reference picture behind a Custom Builder drawing: add, move, turn,
// fade, lock, hide, replace, reset, and two-point calibration. Front view
// and plan each keep their own picture. Tracing over it uses the normal
// drawing tools, so the result is ordinary editable geometry.

export type RefMode = "move" | "calibrate" | null;

type Props = {
  sketch: Sketch;
  setSketch: (s: Sketch, key?: string) => void;
  unit: DisplayUnit;
  mode: RefMode;
  setMode: (m: RefMode) => void;
  calPoints: SketchPoint[];
  setCalPoints: (p: SketchPoint[]) => void;
};

/** The current view's reference picture with its image size, ready for the canvas (null while unknown). */
export function useShownReference(sketch: Sketch): { ref: ReferenceImage; href: string; width: number; height: number; asset: DesignAsset } | null {
  const assets = useAssets();
  const ref = sketch.references?.[sketch.plane];
  return useMemo(() => {
    if (!ref) return null;
    const asset = assets.data?.find((a) => a.id === ref.assetId);
    if (!asset) return null;
    return { ref, href: assetFileUrl(asset.id), width: asset.width, height: asset.height, asset };
  }, [ref, assets.data]);
}

export function ReferenceSection({ sketch, setSketch, unit, mode, setMode, calPoints, setCalPoints }: Props) {
  const pick = useAssetPicker();
  const assets = useAssets();
  const shown = useShownReference(sketch);
  const ref = sketch.references?.[sketch.plane];
  const missing = !!ref && assets.isSuccess && !shown;
  const [lengthText, setLengthText] = useState("");
  const [calError, setCalError] = useState<string | null>(null);
  const view = sketch.plane === "front" ? "front view" : "plan";

  const setRef = (r: ReferenceImage | undefined, key?: string) => {
    const refs = { ...(sketch.references ?? {}) };
    if (r) refs[sketch.plane] = r;
    else delete refs[sketch.plane];
    setSketch({ ...sketch, references: Object.keys(refs).length ? refs : undefined }, key);
  };

  const choose = () =>
    pick?.({
      title: ref ? "Replace the reference picture" : "Reference picture",
      description: `Pick a drawing, photo or render to trace over in the ${view}.`,
      onPick: (a) => {
        // Replacing keeps the place and the scale; a first picture starts as wide as the drawing.
        setRef(ref ? { ...ref, assetId: a.id, calibration: null } : newReference(a.id, a.width, sketchBounds(sketch)));
        setMode(null);
      },
    });

  if (!ref)
    return (
      <PanelSection title="Reference picture">
        <p className="text-xs text-muted-foreground">Put a drawing, photo or render behind the {view} and trace it with the drawing tools. Set its scale from one known length.</p>
        <Button variant="outline" className="h-11 w-full justify-start" onClick={choose} disabled={!pick} data-testid="ref-add">
          <ImagePlus className="mr-2 h-4 w-4" /> Add a picture to trace
        </Button>
      </PanelSection>
    );

  const widthMm = shown ? shown.width * ref.mmPerPx : null;
  const heightMm = shown ? shown.height * ref.mmPerPx : null;

  const apply = () => {
    const parsed = parseLength(lengthText, unit);
    if (!parsed.ok) return setCalError(parsed.error);
    if (calPoints.length < 2) return setCalError("Tap two points on the picture first.");
    const r = calibrateReference(ref, calPoints[0], calPoints[1], parsed.mm);
    if (!r.ok) return setCalError(r.error);
    setRef(r.ref);
    setCalError(null);
    setLengthText("");
    setCalPoints([]);
    setMode(null);
  };

  return (
    <PanelSection title="Reference picture">
      <div className="flex items-center gap-3">
        {shown ? <AssetThumb asset={shown.asset} className="h-14 w-20 shrink-0" /> : <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground">{missing ? "Missing" : "Loading"}</span>}
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <p className="truncate text-sm font-medium text-foreground">{shown?.asset.name ?? "Picture"}</p>
          {widthMm !== null && heightMm !== null && (
            <p data-testid="ref-size">
              {formatLength(widthMm, unit)} × {formatLength(heightMm, unit)}
            </p>
          )}
          <p data-testid="ref-scale">{ref.calibration ? `Calibrated: A–B = ${formatLength(ref.calibration.lengthMm, unit)}` : "Not calibrated: the size is a guess"}</p>
        </div>
      </div>
      {missing && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This picture is no longer in the gallery. Replace or remove it.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant={mode === "move" ? "default" : "outline"} className="h-11" onClick={() => setMode(mode === "move" ? null : "move")} disabled={ref.locked || !shown} aria-pressed={mode === "move"} data-testid="ref-move">
          <Move className="mr-1.5 h-4 w-4" /> Move
        </Button>
        <Button
          variant={mode === "calibrate" ? "default" : "outline"}
          className="h-11"
          onClick={() => {
            setCalPoints([]);
            setCalError(null);
            setMode(mode === "calibrate" ? null : "calibrate");
          }}
          disabled={!shown || ref.hidden}
          aria-pressed={mode === "calibrate"}
          data-testid="ref-calibrate"
        >
          <Crosshair className="mr-1.5 h-4 w-4" /> Set scale
        </Button>
      </div>
      {mode === "move" && <p className="text-xs text-muted-foreground">Drag the picture into place. Two fingers still pan and zoom.</p>}
      {mode === "calibrate" && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="ref-cal-panel">
          <p className="text-xs">
            {calPoints.length === 0 && "Tap point A on the picture: one end of a length you know."}
            {calPoints.length === 1 && "Now tap point B, the other end."}
            {calPoints.length >= 2 && "Type the real distance between A and B."}
          </p>
          {calPoints.length >= 2 && (
            <>
              <FieldRow label={`Distance A–B (${unit === "ft" ? "e.g. 12' 6\"" : unit === "ftd" ? "e.g. 12.5 ft" : `in ${unit}, or with a unit`})`}>
                <Input
                  value={lengthText}
                  onChange={(e) => setLengthText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && apply()}
                  inputMode="decimal"
                  className="h-11 text-[16px]"
                  autoFocus
                  data-testid="ref-cal-length"
                />
              </FieldRow>
              {calError && (
                <p className="text-xs text-destructive" role="alert" data-testid="ref-cal-error">
                  {calError}
                </p>
              )}
              <div className="flex gap-2">
                <Button className="h-11 flex-1" onClick={apply} data-testid="ref-cal-apply">
                  Apply scale
                </Button>
                <Button variant="outline" className="h-11" onClick={() => setCalPoints([])}>
                  Tap again
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <FieldRow label={`Opacity: ${Math.round(ref.opacity * 100)}%`}>
        <Slider className="py-3" value={[ref.opacity]} min={0.05} max={1} step={0.05} onValueChange={([opacity]) => setRef({ ...ref, opacity }, "ref:opacity")} aria-label="Opacity" data-testid="ref-opacity" />
      </FieldRow>
      <FieldRow label={`Turn: ${ref.rotation.toFixed(1)}°`}>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Turn the picture 90° left" onClick={() => shown && setRef(turnReference(ref, shown.width, shown.height, wrap(ref.rotation - 90)))} disabled={ref.locked}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Slider className="flex-1 py-3" value={[ref.rotation]} min={-180} max={180} step={0.5} onValueChange={([rotation]) => shown && setRef(turnReference(ref, shown.width, shown.height, rotation), "ref:rotation")} disabled={ref.locked} aria-label="Turn" data-testid="ref-rotation" />
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Turn the picture 90° right" onClick={() => shown && setRef(turnReference(ref, shown.width, shown.height, wrap(ref.rotation + 90)))} disabled={ref.locked}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </FieldRow>
      {shown && widthMm !== null && (
        <LengthField
          label="Picture width"
          valueMm={widthMm}
          unit={unit}
          min={1}
          onCommit={(mm) => setRef(scaleReference(ref, mm / shown.width))}
          hint="Or set the scale from a known length above."
          testId="ref-width"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className={cn("h-11", ref.hidden && "border-primary")} onClick={() => setRef({ ...ref, hidden: !ref.hidden })} aria-pressed={ref.hidden} data-testid="ref-hide">
          {ref.hidden ? <Eye className="mr-1.5 h-4 w-4" /> : <EyeOff className="mr-1.5 h-4 w-4" />} {ref.hidden ? "Show" : "Hide"}
        </Button>
        <Button
          variant="outline"
          className={cn("h-11", ref.locked && "border-primary")}
          onClick={() => {
            if (!ref.locked && mode === "move") setMode(null);
            setRef({ ...ref, locked: !ref.locked });
          }}
          aria-pressed={ref.locked}
          data-testid="ref-lock"
        >
          {ref.locked ? <LockOpen className="mr-1.5 h-4 w-4" /> : <Lock className="mr-1.5 h-4 w-4" />} {ref.locked ? "Unlock" : "Lock"}
        </Button>
        <Button variant="outline" className="h-11" onClick={choose} disabled={!pick} data-testid="ref-replace">
          <ImagePlus className="mr-1.5 h-4 w-4" /> Replace
        </Button>
        <Button variant="outline" className="h-11" onClick={() => shown && setRef(newReference(ref.assetId, shown.width, sketchBounds({ ...sketch, references: undefined })))} disabled={!shown || ref.locked} data-testid="ref-reset">
          <Undo2 className="mr-1.5 h-4 w-4" /> Reset
        </Button>
      </div>
      <Button
        variant="ghost"
        className="h-10 w-full justify-start text-destructive"
        onClick={() => {
          setMode(null);
          setRef(undefined);
        }}
        data-testid="ref-remove"
      >
        <Trash2 className="mr-2 h-4 w-4" /> Remove the picture
      </Button>
      <p className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2 text-[11px] text-muted-foreground" data-testid="ref-limits">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          The scale is exact only along the line you calibrate, and only on a flat, square-on drawing. A photo or perspective render isn't to scale across the picture, so check other lengths. Depth and hidden parts can't be read from a picture: type them in.
        </span>
      </p>
    </PanelSection>
  );
}

const wrap = (deg: number) => {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};
