import { useEffect, useMemo, useState } from "react";
import {
  formatLength,
  makeLShapeRoom,
  makeRectRoom,
  modelBounds,
  parseLength,
  splitSection,
  toInputValue,
  type DisplayUnit,
  type Section,
  isImperial,
} from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FieldRow, LengthField, SelectField } from "./fields";
import { useStore } from "./commands";

// Dialogs for exact numeric creation: a room from typed sizes, and splitting
// a section into measured parts (how a hall's internal layout is recorded).

export function AddRoomDialog({ open, onOpenChange, unit }: { open: boolean; onOpenChange: (v: boolean) => void; unit: DisplayUnit }) {
  const store = useStore();
  const [shape, setShape] = useState<"rect" | "l">("rect");
  const [w, setW] = useState(20000);
  const [l, setL] = useState(30000);
  const [cw, setCw] = useState(6000);
  const [cl, setCl] = useState(8000);
  const [t, setT] = useState(230);
  const [h, setH] = useState(4000);
  const lInvalid = shape === "l" && (cw >= w || cl >= l);

  const create = () => {
    if (lInvalid) return;
    const m = store.getState().history.present;
    // New rooms go to the right of existing ones so nothing overlaps.
    const b = modelBounds({ ...m, dimensions: [], labels: [] });
    const x = b && m.rooms.length ? Math.round((b.maxX + 2000) / 100) * 100 : 0;
    const opts = { name: m.rooms.length ? `Room ${m.rooms.length + 1}` : "Hall", wallThickness: t, wallHeight: h };
    const room = shape === "rect" ? makeRectRoom(x, 0, w, l, opts) : makeLShapeRoom(x, 0, w, l, cw, cl, opts);
    store.commit({ ...m, rooms: [...m.rooms, room] });
    store.select([room.id]);
    store.setTool("select");
    onOpenChange(false);
    window.setTimeout(() => store.canvas?.fit(), 30);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="add-room-dialog">
        <DialogHeader>
          <DialogTitle>Add a room</DialogTitle>
          <DialogDescription>Enter the internal sizes measured on site. You can adjust every wall afterwards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Room shape">
            {(["rect", "l"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={shape === s} onClick={() => setShape(s)} className={cn("min-h-10 rounded-md text-sm font-medium", shape === s ? "bg-card shadow-xs" : "text-muted-foreground")}>
                {s === "rect" ? "Rectangle" : "L-shape"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LengthField label={shape === "l" ? "Overall width" : "Width"} testId="new-room-width" valueMm={w} unit={unit} onCommit={setW} />
            <LengthField label={shape === "l" ? "Overall length" : "Length"} testId="new-room-length" valueMm={l} unit={unit} onCommit={setL} />
            {shape === "l" && (
              <>
                <LengthField label="Cut-out width" valueMm={cw} unit={unit} onCommit={setCw} hint="Bottom-right corner" />
                <LengthField label="Cut-out length" valueMm={cl} unit={unit} onCommit={setCl} />
              </>
            )}
            <LengthField label="Wall thickness" valueMm={t} unit={unit} allowZero onCommit={setT} />
            <LengthField label="Wall height" valueMm={h} unit={unit} onCommit={setH} />
          </div>
          {lInvalid && <p className="text-xs text-destructive">The cut-out must be smaller than the overall size.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" onClick={create} disabled={lInvalid} data-testid="create-room">
            Add room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "1, 4, 1" in the display unit → mm values, or an error. */
function parseSizes(text: string, unit: DisplayUnit): { ok: true; sizes: number[] } | { ok: false; error: string } {
  const parts = text.split(/[;,\n]+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { ok: false, error: "Enter at least two sizes, separated by commas" };
  const sizes: number[] = [];
  for (const p of parts) {
    const r = parseLength(p, unit);
    if (!r.ok) return { ok: false, error: `“${p}”: ${r.error}` };
    if (r.mm <= 0) return { ok: false, error: "Every size must be greater than zero" };
    sizes.push(r.mm);
  }
  return { ok: true, sizes };
}

export function SplitSectionDialog({ open, onOpenChange, section, unit }: { open: boolean; onOpenChange: (v: boolean) => void; section: Section; unit: DisplayUnit }) {
  const store = useStore();
  const [axis, setAxis] = useState<"x" | "y">("x");
  const [text, setText] = useState("");
  const [names, setNames] = useState("");
  const total = axis === "x" ? section.width : section.depth;

  useEffect(() => {
    if (open) {
      setText(`${toInputValue(total / 2, unit)}, ${toInputValue(total / 2, unit)}`);
      setNames("");
    }
  }, [open, axis]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseSizes(text, unit), [text, unit]);
  const sum = parsed.ok ? parsed.sizes.reduce((a, b) => a + b, 0) : 0;
  const remainder = total - sum;
  const fits = parsed.ok && Math.abs(remainder) <= 1;

  const apply = () => {
    if (!parsed.ok || !fits) return;
    const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
    const res = splitSection(section, axis, parsed.sizes, parsed.sizes.map((_, i) => nameList[i] ?? (i === 0 ? section.name : `${section.name} ${i + 1}`)));
    if (!res.ok) return;
    const m = store.getState().history.present;
    const idx = m.sections.findIndex((s) => s.id === section.id);
    const sections = [...m.sections];
    sections.splice(idx, 1, ...res.sections);
    store.commit({ ...m, sections });
    store.select([res.sections[0].id]);
    onOpenChange(false);
  };

  const fillRemainder = () => {
    if (!parsed.ok || remainder <= 1) return;
    setText(`${text.trim().replace(/,\s*$/, "")}, ${toInputValue(remainder, unit)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="split-dialog">
        <DialogHeader>
          <DialogTitle>Split “{section.name}”</DialogTitle>
          <DialogDescription>
            Divide it into measured parts, in order from {axis === "x" ? "left to right" : "top to bottom"}. The parts must add up to {formatLength(total, unit)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SelectField
            label="Direction"
            value={axis}
            testId="split-axis"
            options={[
              { value: "x", label: `Across the width (${formatLength(section.width, unit)})` },
              { value: "y", label: `Along the depth (${formatLength(section.depth, unit)})` },
            ]}
            onChange={(v) => setAxis(v as "x" | "y")}
          />
          <FieldRow label={`Sizes (${isImperial(unit) ? "feet" : unit}), comma separated`} htmlFor="split-sizes">
            <input id="split-sizes" data-testid="split-sizes" className="h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-[16px] tabular-nums" value={text} onChange={(e) => setText(e.target.value)} inputMode="text" autoComplete="off" />
          </FieldRow>
          <div className={cn("rounded-lg px-3 py-2 text-xs", fits ? "bg-success/10 text-success" : "bg-warning/10 text-warning")} role="status">
            {!parsed.ok
              ? parsed.error
              : fits
                ? `${parsed.sizes.length} parts, ${formatLength(sum, unit)}: fits exactly.`
                : remainder > 0
                  ? `${formatLength(remainder, unit)} left over.`
                  : `${formatLength(-remainder, unit)} too long.`}
            {parsed.ok && remainder > 1 && (
              <button type="button" className="ml-2 font-semibold underline" onClick={fillRemainder}>
                Add it as a part
              </button>
            )}
          </div>
          <FieldRow label="Names (optional, comma separated)" htmlFor="split-names">
            <input id="split-names" data-testid="split-names" className="h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-[16px]" value={names} onChange={(e) => setNames(e.target.value)} placeholder="Left strip, Middle, Right strip" autoComplete="off" />
          </FieldRow>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" onClick={apply} disabled={!fits} data-testid="apply-split">
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
