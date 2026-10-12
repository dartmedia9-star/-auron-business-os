import { useState, type ComponentType } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BrickWall,
  Check,
  CircleDot,
  DoorOpen,
  Hand,
  LibraryBig,
  MousePointer2,
  Pentagon,
  Ruler,
  RulerDimensionLine,
  Square,
  SquareDashedBottom,
  Type,
  Undo2,
  X,
  Keyboard,
} from "lucide-react";
import { OBJECT_DEFS, OBJECT_TYPES, OPENING_DEFS, OPENING_KINDS, SECTION_DEFS, SECTION_KINDS, dist, formatLength, parseLength, type ObjectType } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { chainStep, dropPoint, finishPolygonRoom, finishWall, placeObject, useStore } from "./commands";
import { useEditor, type Tool } from "./store";

// Tool rail (left on iPad/desktop, bottom on phones), the contextual bar for
// the active tool, and the object library.

type ToolDef = { tool: Tool; label: string; icon: ComponentType<{ className?: string }>; key: string; group: number };

export const TOOLS: ToolDef[] = [
  { tool: "select", label: "Select", icon: MousePointer2, key: "V", group: 0 },
  { tool: "pan", label: "Pan", icon: Hand, key: "H", group: 0 },
  { tool: "room", label: "Room", icon: Square, key: "R", group: 1 },
  { tool: "polygon", label: "Outline", icon: Pentagon, key: "P", group: 1 },
  { tool: "wall", label: "Wall", icon: BrickWall, key: "W", group: 1 },
  { tool: "opening", label: "Door", icon: DoorOpen, key: "D", group: 1 },
  { tool: "pillar", label: "Pillar", icon: CircleDot, key: "C", group: 1 },
  { tool: "section", label: "Section", icon: SquareDashedBottom, key: "S", group: 2 },
  { tool: "object", label: "Objects", icon: LibraryBig, key: "O", group: 2 },
  { tool: "dimension", label: "Dimension", icon: RulerDimensionLine, key: "N", group: 3 },
  { tool: "label", label: "Text", icon: Type, key: "T", group: 3 },
  { tool: "measure", label: "Measure", icon: Ruler, key: "M", group: 3 },
];

export function ToolRail({ orientation, onOpenLibrary }: { orientation: "vertical" | "horizontal"; onOpenLibrary: () => void }) {
  const store = useStore();
  const tool = useEditor(store, (s) => s.tool);
  const vertical = orientation === "vertical";
  return (
    <nav
      aria-label="Drawing tools"
      className={cn("flex shrink-0 gap-1", vertical ? "flex-col overflow-y-auto px-1.5 py-2" : "overflow-x-auto px-2 py-1.5 [scrollbar-width:none]")}
      data-testid="tool-rail"
    >
      {TOOLS.map((t, i) => {
        const active = tool === t.tool;
        const sep = i > 0 && TOOLS[i - 1].group !== t.group;
        return (
          <div key={t.tool} className={cn("flex", vertical ? "flex-col" : "flex-row items-center")}>
            {sep && <span aria-hidden className={cn("bg-border", vertical ? "mx-2 my-1 h-px" : "mx-1 h-8 w-px")} />}
            <button
              type="button"
              aria-pressed={active}
              aria-label={`${t.label} (${t.key})`}
              title={`${t.label} (${t.key})`}
              data-tool={t.tool}
              onClick={() => {
                if (t.tool === "object") onOpenLibrary();
                store.setTool(t.tool);
              }}
              className={cn(
                "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-[background-color,color,transform] active:scale-95",
                vertical ? "h-14 w-14" : "h-14 w-[3.6rem]",
                active ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_hsl(var(--gold)/0.8)]" : "text-muted-foreground hover:bg-[hsl(var(--state-hover))] hover:text-foreground",
              )}
            >
              <t.icon className="h-5 w-5" />
              <span className="leading-none">{t.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

const DIRS = [
  { label: "Up", icon: ArrowUp, v: { x: 0, y: -1 } },
  { label: "Left", icon: ArrowLeft, v: { x: -1, y: 0 } },
  { label: "Right", icon: ArrowRight, v: { x: 1, y: 0 } },
  { label: "Down", icon: ArrowDown, v: { x: 0, y: 1 } },
];

const HINTS: Partial<Record<Tool, string>> = {
  select: "Tap to select · drag a selected item to move it · two fingers to pan and zoom",
  pan: "Drag to pan · pinch to zoom",
  room: "Drag a rectangle, or type exact sizes",
  polygon: "Tap each corner · tap the first corner to close",
  wall: "Tap points along the wall · tap the last point again to finish",
  opening: "Tap on a wall to place it",
  pillar: "Tap to place a pillar",
  section: "Drag a rectangle inside the room",
  object: "Tap the plan to place it",
  dimension: "Tap the start, then the end",
  label: "Tap where the text goes",
  measure: "Tap two points (or drag) to measure; nothing is saved",
};

export function ContextBar({ onTypeRoom, onOpenLibrary }: { onTypeRoom: () => void; onOpenLibrary: () => void }) {
  const store = useStore();
  const tool = useEditor(store, (s) => s.tool);
  const opts = useEditor(store, (s) => s.toolOptions);
  const chain = useEditor(store, (s) => s.chain);
  const measure = useEditor(store, (s) => s.measure);
  const penMode = useEditor(store, (s) => s.penMode);
  const unit = useEditor(store, (s) => (s.draft ?? s.history.present).settings.displayUnit);
  const [lenText, setLenText] = useState("");
  const [lenError, setLenError] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);

  if (tool === "select" && !penMode) return null;

  const step = (v: { x: number; y: number }) => {
    const r = parseLength(lenText, unit);
    if (!r.ok || r.mm <= 0) {
      setLenError(r.ok ? "Enter a length" : r.error);
      return;
    }
    setLenError(null);
    chainStep(store, v, r.mm);
  };

  const chip = (active: boolean) => cn("min-h-10 shrink-0 rounded-lg px-3 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground");

  return (
    <div className="pointer-events-auto max-w-[min(100%,46rem)] rounded-2xl border bg-popover/95 px-3 py-2 shadow-[var(--elev-2)] backdrop-blur" data-testid="context-bar">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {penMode && tool === "select" ? "Pencil mode: fingers pan and select, the Pencil draws." : HINTS[tool]}
          {penMode && tool !== "select" && " Fingers pan."}
        </p>
        {penMode && (
          <button type="button" className="text-[11px] font-medium text-muted-foreground underline" onClick={() => store.setPenMode(false)}>
            Draw with fingers
          </button>
        )}
        {tool !== "select" && (
          <Button variant="ghost" size="sm" className="h-10" onClick={() => store.setTool("select")} aria-label="Done with this tool">
            <X className="mr-1 h-4 w-4" /> Done
          </Button>
        )}
      </div>

      {tool === "room" && (
        <div className="mt-2 flex gap-2">
          <Button className="h-11" onClick={onTypeRoom} data-testid="type-room-sizes">
            <Keyboard className="mr-2 h-4 w-4" /> Type sizes…
          </Button>
        </div>
      )}

      {(tool === "polygon" || tool === "wall") && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tabular-nums">{chain.length} point{chain.length === 1 ? "" : "s"}</span>
            {chain.length > 1 && <span className="text-xs text-muted-foreground tabular-nums">last {formatLength(dist(chain[chain.length - 2], chain[chain.length - 1]), unit)}</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" className="h-10" disabled={!chain.length} onClick={() => store.setChain(chain.slice(0, -1))}>
                <Undo2 className="mr-1 h-4 w-4" /> Point
              </Button>
              <Button
                className="h-10"
                disabled={tool === "polygon" ? chain.length < 3 : chain.length < 2}
                onClick={() => (tool === "polygon" ? finishPolygonRoom(store, chain) : finishWall(store, chain))}
                data-testid="finish-chain"
              >
                <Check className="mr-1 h-4 w-4" /> {tool === "polygon" ? "Close room" : "Finish"}
              </Button>
            </div>
          </div>
          {chain.length > 0 && (
            <>
              <button type="button" className="text-[11px] font-medium text-gold-ink underline" onClick={() => setShowPad((v) => !v)}>
                {showPad ? "Hide exact entry" : "Enter the next wall by length…"}
              </button>
              {showPad && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Next wall length"
                    data-testid="chain-length"
                    className="h-11 w-28 rounded-lg border border-input bg-background/60 px-3 text-[16px] tabular-nums"
                    inputMode={unit === "ft" ? "text" : "decimal"}
                    placeholder={unit === "ft" ? `12' 6"` : "Length"}
                    value={lenText}
                    onChange={(e) => setLenText(e.target.value)}
                  />
                  <div className="flex gap-1">
                    {DIRS.map((d) => (
                      <Button key={d.label} variant="outline" size="icon" className="h-11 w-11" aria-label={`Add wall going ${d.label.toLowerCase()}`} onClick={() => step(d.v)} data-testid={`chain-${d.label.toLowerCase()}`}>
                        <d.icon className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                  {lenError && <span className="text-xs text-destructive">{lenError}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tool === "opening" && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {OPENING_KINDS.map((k) => (
            <button key={k} type="button" className={chip(opts.openingKind === k)} onClick={() => store.setTool("opening", { openingKind: k })}>
              {OPENING_DEFS[k].label}
            </button>
          ))}
        </div>
      )}

      {tool === "section" && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {SECTION_KINDS.map((k) => (
            <button key={k} type="button" className={chip(opts.sectionKind === k)} onClick={() => store.setTool("section", { sectionKind: k })}>
              {SECTION_DEFS[k].label}
            </button>
          ))}
        </div>
      )}

      {tool === "object" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{OBJECT_DEFS[opts.objectType].label}</span>
          <Button variant="outline" className="h-10" onClick={onOpenLibrary}>
            <LibraryBig className="mr-1 h-4 w-4" /> Change
          </Button>
        </div>
      )}

      {(tool === "measure" || tool === "dimension") && measure?.b && (
        <p className="mt-1 text-lg font-semibold tabular-nums" data-testid="measure-result">
          {formatLength(dist(measure.a, measure.b), unit)}
        </p>
      )}
    </div>
  );
}

export function ObjectLibrary({ open, onOpenChange, side }: { open: boolean; onOpenChange: (v: boolean) => void; side: "left" | "bottom" }) {
  const store = useStore();
  const current = useEditor(store, (s) => s.toolOptions.objectType);
  const groups = [...new Set(OBJECT_TYPES.map((t) => OBJECT_DEFS[t].group))];
  const pick = (type: ObjectType, now: boolean) => {
    if (now) {
      placeObject(store, type, dropPoint(store));
      store.setTool("select");
    } else store.setTool("object", { objectType: type });
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn("overflow-y-auto", side === "bottom" ? "max-h-[75dvh] rounded-t-2xl" : "w-[22rem] max-w-[90vw]")} data-testid="object-library">
        <SheetHeader>
          <SheetTitle>Objects</SheetTitle>
          <SheetDescription>Tap an object, then tap the plan to place it. Or add it to the middle of the view.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-eyebrow font-semibold uppercase text-muted-foreground">{g}</h3>
              <ul className="space-y-1.5">
                {OBJECT_TYPES.filter((t) => OBJECT_DEFS[t].group === g).map((t) => {
                  const d = OBJECT_DEFS[t];
                  return (
                    <li key={t} className={cn("flex items-center gap-2 rounded-xl border p-2", current === t && "border-primary/60 bg-primary/5")}>
                      <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={() => pick(t, false)} data-object={t}>
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 shrink-0 rounded border" style={{ background: d.color }} aria-hidden />
                          <span className="text-sm font-medium">{d.label}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{d.description}</span>
                      </button>
                      <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => pick(t, true)} aria-label={`Add ${d.label} to the middle of the view`}>
                        Add
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
