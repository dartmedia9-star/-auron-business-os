import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Eye, EyeOff, FlipHorizontal2, Lock, LockOpen, RotateCcw, RotateCw, Scissors, SquareSplitHorizontal, Trash2, ArrowDownToLine, Plus } from "lucide-react";
import {
  OBJECT_DEFS,
  OPENING_DEFS,
  OPENING_KINDS,
  SECTION_DEFS,
  SECTION_KINDS,
  asRect,
  boundsOf,
  edgesOf,
  findEntity,
  formatArea,
  formatLength,
  offsetPolygon,
  openingGeometry,
  outwardNormal,
  perimeter,
  polygonArea,
  removeVertex,
  sectionFillingRoom,
  setEdgeLength,
  setRectSize,
  updateEntity,
  dist,
  type DesignObject,
  type Dimension,
  type Label,
  type Opening,
  type Partition,
  type Pillar,
  type ProjectModel,
  type Room,
  type Section,
} from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ColorField, FieldRow, LengthField, NumberField, PanelSection, SelectField, StatusField, TextField, ToggleRow } from "./fields";
import { deleteSelection, duplicateSelection, surfaceBelow, useStore } from "./commands";
import { useEditor } from "./store";
import { SplitSectionDialog } from "./dialogs";
import { ProjectPanel } from "./project-panel";
import { CustomObjectFields } from "./custom-fields";

// Properties for whatever is selected; the project panel when nothing is.
// Every dimension is typed exactly; dragging on the canvas is optional.

export function Inspector({ issuesCount }: { issuesCount: number }) {
  const store = useStore();
  const selection = useEditor(store, (s) => s.selection);
  const model = useEditor(store, (s) => s.draft ?? s.history.present);
  if (selection.length === 0) return <ProjectPanel issuesCount={issuesCount} />;
  if (selection.length > 1) {
    return (
      <div className="p-4">
        <p className="text-sm font-medium">{selection.length} items selected</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => duplicateSelection(store)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </Button>
          <Button variant="outline" className="h-11 flex-1 text-destructive" onClick={() => deleteSelection(store)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>
    );
  }
  const ref = findEntity(model, selection[0]);
  if (!ref) return <ProjectPanel issuesCount={issuesCount} />;
  return <EntityInspector key={ref.entity.id} model={model} refEntity={ref} />;
}

type Ref = NonNullable<ReturnType<typeof findEntity>>;

const KIND_LABEL: Record<Ref["kind"], string> = {
  room: "Room",
  partition: "Partition wall",
  opening: "Opening",
  pillar: "Pillar / column",
  section: "Section / zone",
  object: "Object",
  dimension: "Dimension",
  label: "Text label",
};

function EntityInspector({ model, refEntity }: { model: ProjectModel; refEntity: Ref }) {
  const store = useStore();
  const id = refEntity.entity.id;
  const unit = model.settings.displayUnit;
  const patch = (p: Record<string, unknown>, key?: string) => store.commit(updateEntity(store.getState().history.present, id, p), key ?? `${id}:${Object.keys(p).join(",")}`);
  const ent = refEntity.entity as { locked?: boolean; hidden?: boolean; name?: string; notes?: string; status?: Room["status"] };
  const hasMeta = refEntity.kind !== "dimension" && refEntity.kind !== "label";

  return (
    <div data-testid="inspector" data-kind={refEntity.kind}>
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-eyebrow font-semibold uppercase text-gold-ink">{refEntity.kind === "object" ? OBJECT_DEFS[(refEntity.entity as DesignObject).type].label : KIND_LABEL[refEntity.kind]}</p>
          {ent.name !== undefined && <p className="truncate text-sm font-semibold">{ent.name || "Untitled"}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasMeta && (
            <IconBtn label={ent.locked ? "Unlock" : "Lock position"} onClick={() => patch({ locked: !ent.locked })} active={ent.locked}>
              {ent.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </IconBtn>
          )}
          <IconBtn label={ent.hidden ? "Show" : "Hide"} onClick={() => patch({ hidden: !ent.hidden })} active={ent.hidden}>
            {ent.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </IconBtn>
          <IconBtn label="Duplicate" onClick={() => duplicateSelection(store)}>
            <Copy className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Delete" onClick={() => deleteSelection(store)} destructive disabled={ent.locked}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>
      {ent.locked && <p className="border-b border-border/70 bg-muted/50 px-4 py-2 text-xs text-muted-foreground">Locked: it can't be moved or deleted on the canvas. Values can still be typed here.</p>}

      {refEntity.kind === "room" && <RoomFields room={refEntity.entity} model={model} patch={patch} />}
      {refEntity.kind === "partition" && <PartitionFields wall={refEntity.entity} model={model} patch={patch} />}
      {refEntity.kind === "opening" && <OpeningFields o={refEntity.entity} model={model} patch={patch} />}
      {refEntity.kind === "pillar" && <PillarFields p={refEntity.entity} unit={unit} patch={patch} />}
      {refEntity.kind === "section" && <SectionFields s={refEntity.entity} model={model} patch={patch} />}
      {refEntity.kind === "object" && <ObjectFields o={refEntity.entity} model={model} patch={patch} />}
      {refEntity.kind === "dimension" && <DimensionFields d={refEntity.entity} unit={unit} patch={patch} />}
      {refEntity.kind === "label" && <LabelFields l={refEntity.entity} patch={patch} />}
      {(refEntity.kind === "room" || refEntity.kind === "section" || refEntity.kind === "object") && <LabelPositionField offset={(refEntity.entity as { labelOffset?: { x: number; y: number } }).labelOffset} patch={patch} />}

      {hasMeta && (
        <PanelSection title="Site notes">
          <StatusField value={ent.status ?? "measured"} onChange={(status) => patch({ status })} />
          <TextField label="Notes" multiline maxLength={4000} value={ent.notes ?? ""} placeholder="Heights, power, access, anything to confirm…" onCommit={(notes) => patch({ notes })} />
        </PanelSection>
      )}
    </div>
  );
}

/** Name labels place themselves; once dragged on the plan they stay put until reset. */
function LabelPositionField({ offset, patch }: { offset?: { x: number; y: number }; patch: Patch }) {
  const manual = !!offset && (Math.abs(offset.x) >= 0.5 || Math.abs(offset.y) >= 0.5);
  return (
    <div className="border-t border-border/70 px-4 py-3">
      {manual ? (
        <Button variant="outline" className="h-11 w-full justify-start" data-testid="reset-label" onClick={() => patch({ labelOffset: { x: 0, y: 0 } })}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset label position
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">The name label places itself clear of other labels. Drag the dashed grip beside it on the plan to move it.</p>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, active, destructive, disabled }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; destructive?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[hsl(var(--state-hover))] hover:text-foreground disabled:opacity-40",
        active && "bg-[hsl(var(--state-selected))] text-foreground",
        destructive && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

type Patch = (p: Record<string, unknown>, key?: string) => void;

function wallSideName(points: Room["points"], i: number): string {
  const n = outwardNormal(points, i);
  if (n.y < -0.9) return "top";
  if (n.y > 0.9) return "bottom";
  if (n.x < -0.9) return "left";
  if (n.x > 0.9) return "right";
  return "angled";
}

function RoomFields({ room, model, patch }: { room: Room; model: ProjectModel; patch: Patch }) {
  const store = useStore();
  const unit = model.settings.displayUnit;
  const focus = useEditor(store, (s) => s.focusEdge);
  const rect = asRect(room);
  const edges = edgesOf(room.points);
  const ext = boundsOf(offsetPolygon(room.points, room.showWalls ? room.wallThickness : 0));
  const [moved, setMoved] = useState<string | null>(null);

  const editEdge = (i: number, mm: number) => {
    const r = setEdgeLength(room.points, i, mm);
    patch({ points: r.points }, `${room.id}:edge:${i}`);
    setMoved(r.moved.length > 1 ? `Wall ${i + 1} set to ${formatLength(mm, unit)}; the opposite wall stretched to keep the room square.` : `Wall ${i + 1} set to ${formatLength(mm, unit)}; the next wall adjusted to stay connected.`);
  };

  return (
    <>
      <PanelSection title="Room">
        <TextField label="Name" value={room.name} testId="room-name" onCommit={(name) => patch({ name })} />
        {rect && (
          <div className="grid grid-cols-2 gap-3">
            <LengthField label="Width (internal)" testId="room-width" valueMm={rect.width} unit={unit} onCommit={(w) => patch({ points: setRectSize(room, w, rect.length).points })} />
            <LengthField label="Length (internal)" testId="room-length" valueMm={rect.length} unit={unit} onCommit={(l) => patch({ points: setRectSize(room, rect.width, l).points })} />
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <dt className="text-muted-foreground">Floor area</dt>
          <dd className="text-right font-medium tabular-nums">{formatArea(polygonArea(room.points), unit)}</dd>
          <dt className="text-muted-foreground">Perimeter</dt>
          <dd className="text-right font-medium tabular-nums">{formatLength(perimeter(room.points), unit)}</dd>
          {ext && (
            <>
              <dt className="text-muted-foreground">External overall</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatLength(ext.maxX - ext.minX, unit)} × {formatLength(ext.maxY - ext.minY, unit)}
              </dd>
            </>
          )}
        </dl>
      </PanelSection>
      <PanelSection title={`Walls (${edges.length})`}>
        <div className="space-y-2">
          {edges.map((e) => {
            const isFocused = focus?.hostId === room.id && focus.index === e.index;
            return (
              <div
                key={e.startVertexId}
                className={cn("rounded-lg p-2 transition-colors", isFocused ? "bg-[hsl(var(--state-selected))]" : "")}
                onFocusCapture={() => store.setFocusEdge({ hostId: room.id, index: e.index })}
              >
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <LengthField label={`Wall ${e.index + 1} · ${wallSideName(room.points, e.index)}`} testId={`wall-${e.index}`} valueMm={e.length} unit={unit} onCommit={(mm) => editEdge(e.index, mm)} />
                  </div>
                  {room.points.length > 3 && (
                    <IconBtn label={`Remove the corner at the end of wall ${e.index + 1}`} onClick={() => store.commit(removeVertex(store.getState().history.present, room.id, e.b.id))}>
                      <Scissors className="h-4 w-4" />
                    </IconBtn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {moved && <p className="text-[11px] text-muted-foreground">{moved}</p>}
        <p className="text-[11px] text-muted-foreground">Tap a wall on the plan to jump to it. Drag a corner to reshape, or the + on a wall to add a corner.</p>
      </PanelSection>
      <PanelSection title="Construction">
        <div className="grid grid-cols-2 gap-3">
          <LengthField label="Wall thickness" testId="room-wall-thickness" max={5000} valueMm={room.wallThickness} unit={unit} allowZero onCommit={(wallThickness) => patch({ wallThickness })} />
          <LengthField label="Wall height" max={100_000} valueMm={room.wallHeight} unit={unit} onCommit={(wallHeight) => patch({ wallHeight })} />
        </div>
        <ToggleRow label="Draw walls" checked={room.showWalls} onChange={(showWalls) => patch({ showWalls })} hint="Off: outline only (open-air or unmeasured walls)" />
        <LengthField label="Dimension line distance" max={50_000} valueMm={room.dimOffset} unit={unit} allowZero onCommit={(dimOffset) => patch({ dimOffset })} hint="How far wall dimensions sit outside the wall" />
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Floor (3D)" value={room.floorColor} onChange={(floorColor) => patch({ floorColor }, `${room.id}:floorColor`)} />
          <ColorField label="Walls (3D)" value={room.wallColor} onChange={(wallColor) => patch({ wallColor }, `${room.id}:wallColor`)} />
        </div>
      </PanelSection>
      <PanelSection title="Layout">
        {rect ? (
          <Button
            variant="outline"
            className="h-11 w-full justify-start"
            data-testid="divide-room"
            onClick={() => {
              const sec = sectionFillingRoom(room);
              if (!sec) return;
              const m = store.getState().history.present;
              store.commit({ ...m, sections: [...m.sections, sec] });
              store.select([sec.id]);
            }}
          >
            <SquareSplitHorizontal className="mr-2 h-4 w-4" /> Divide into sections
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Use the Section tool to draw zones inside this room.</p>
        )}
        {focus?.hostId === room.id && (
          <Button variant="outline" className="h-11 w-full justify-start" onClick={() => store.setTool("opening")}>
            <Plus className="mr-2 h-4 w-4" /> Add a door or window
          </Button>
        )}
      </PanelSection>
    </>
  );
}

function PartitionFields({ wall, model, patch }: { wall: Partition; model: ProjectModel; patch: Patch }) {
  const store = useStore();
  const unit = model.settings.displayUnit;
  return (
    <>
      <PanelSection title="Partition wall">
        <TextField label="Name" value={wall.name} onCommit={(name) => patch({ name })} />
        {edgesOf(wall.points, false).map((e) => (
          <div key={e.startVertexId} className="flex items-end gap-2" onFocusCapture={() => store.setFocusEdge({ hostId: wall.id, index: e.index })}>
            <div className="min-w-0 flex-1">
              <LengthField label={`Segment ${e.index + 1}`} valueMm={e.length} unit={unit} onCommit={(mm) => patch({ points: setEdgeLength(wall.points, e.index, mm, false).points }, `${wall.id}:edge:${e.index}`)} />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <LengthField label="Thickness" valueMm={wall.thickness} unit={unit} onCommit={(thickness) => patch({ thickness })} />
          <LengthField label="Height" valueMm={wall.height} unit={unit} onCommit={(height) => patch({ height })} />
        </div>
        <ColorField label="Colour (3D)" value={wall.color} onChange={(color) => patch({ color }, `${wall.id}:color`)} />
      </PanelSection>
    </>
  );
}

function OpeningFields({ o, model, patch }: { o: Opening; model: ProjectModel; patch: Patch }) {
  const unit = model.settings.displayUnit;
  const g = openingGeometry(model, o);
  const toEnd = g ? g.edgeLength - o.offset - o.width : 0;
  return (
    <PanelSection title="Opening">
      <SelectField
        label="Type"
        value={o.kind}
        options={OPENING_KINDS.map((k) => ({ value: k, label: OPENING_DEFS[k].label }))}
        onChange={(kind) => patch({ kind, name: o.name === OPENING_DEFS[o.kind].label ? OPENING_DEFS[kind].label : o.name, sill: OPENING_DEFS[kind].sill, swing: kind === "door" || kind === "emergency_exit" ? (o.swing === "none" ? "left" : o.swing) : kind === "double_door" ? "left" : "none" })}
      />
      <TextField label="Name" value={o.name} onCommit={(name) => patch({ name })} />
      <div className="grid grid-cols-2 gap-3">
        <LengthField label="Width" testId="opening-width" valueMm={o.width} unit={unit} onCommit={(width) => patch({ width })} />
        <LengthField label="Height" valueMm={o.height} unit={unit} onCommit={(height) => patch({ height })} />
        <LengthField label="From wall start" valueMm={o.offset} unit={unit} allowZero onCommit={(offset) => patch({ offset })} />
        <LengthField label="To wall end" valueMm={Math.max(0, toEnd)} unit={unit} allowZero disabled={!g} onCommit={(mm) => g && patch({ offset: Math.max(0, g.edgeLength - o.width - mm) })} />
        <LengthField label="Sill height" valueMm={o.sill} unit={unit} allowZero onCommit={(sill) => patch({ sill })} />
      </div>
      {g && <p className="text-[11px] text-muted-foreground">On a {formatLength(g.edgeLength, unit)} wall. Drag it along the wall on the plan, or drop it on another wall.</p>}
      {(o.kind === "door" || o.kind === "emergency_exit" || o.kind === "double_door") && (
        <div className="grid grid-cols-2 gap-3">
          {o.kind !== "double_door" && (
            <SelectField label="Hinge" value={o.swing} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }, { value: "none", label: "No swing shown" }]} onChange={(swing) => patch({ swing })} />
          )}
          <SelectField label="Opens" value={o.swingSide} options={[{ value: "in", label: "Inward" }, { value: "out", label: "Outward" }]} onChange={(swingSide) => patch({ swingSide })} />
        </div>
      )}
      {o.kind === "door" && (
        <Button variant="outline" className="h-11" onClick={() => patch({ swing: o.swing === "left" ? "right" : "left" })}>
          <FlipHorizontal2 className="mr-2 h-4 w-4" /> Flip hinge
        </Button>
      )}
    </PanelSection>
  );
}

function PillarFields({ p, unit, patch }: { p: Pillar; unit: ProjectModel["settings"]["displayUnit"]; patch: Patch }) {
  return (
    <PanelSection title="Pillar / column">
      <TextField label="Name" value={p.name} onCommit={(name) => patch({ name })} />
      <SelectField label="Shape" value={p.shape} options={[{ value: "rect", label: "Rectangular" }, { value: "round", label: "Round" }]} onChange={(shape) => patch(shape === "round" ? { shape, depth: p.width } : { shape })} />
      <div className="grid grid-cols-2 gap-3">
        {p.shape === "round" ? (
          <LengthField label="Diameter" valueMm={p.width} unit={unit} onCommit={(w) => patch({ width: w, depth: w })} />
        ) : (
          <>
            <LengthField label="Width" valueMm={p.width} unit={unit} onCommit={(width) => patch({ width })} />
            <LengthField label="Depth" valueMm={p.depth} unit={unit} onCommit={(depth) => patch({ depth })} />
          </>
        )}
        <LengthField label="Height" valueMm={p.height} unit={unit} allowZero onCommit={(height) => patch({ height })} hint="0 = full room height" />
        <LengthField label="Centre X" valueMm={p.x} unit={unit} allowZero min={-1e6} onCommit={(x) => patch({ x })} />
        <LengthField label="Centre Y" valueMm={p.y} unit={unit} allowZero min={-1e6} onCommit={(y) => patch({ y })} />
        {p.shape === "rect" && <NumberField label="Rotation" suffix="°" value={p.rotation} min={-360} max={360} onCommit={(rotation) => patch({ rotation })} />}
      </div>
    </PanelSection>
  );
}

function SectionFields({ s, model, patch }: { s: Section; model: ProjectModel; patch: Patch }) {
  const unit = model.settings.displayUnit;
  const [split, setSplit] = useState(false);
  const left = s.x - s.width / 2;
  const top = s.y - s.depth / 2;
  return (
    <>
      <PanelSection title="Section / zone">
        <TextField label="Name" testId="section-name" value={s.name} onCommit={(name) => patch({ name })} />
        <SelectField
          label="Use"
          value={s.kind}
          options={SECTION_KINDS.map((k) => ({ value: k, label: SECTION_DEFS[k].label }))}
          onChange={(kind) => patch({ kind, color: s.color === SECTION_DEFS[s.kind].color ? SECTION_DEFS[kind].color : s.color, name: s.name === SECTION_DEFS[s.kind].label ? SECTION_DEFS[kind].label : s.name })}
        />
        <div className="grid grid-cols-2 gap-3">
          <LengthField label="Width" testId="section-width" valueMm={s.width} unit={unit} onCommit={(width) => patch(s.rotation === 0 ? { width, x: left + width / 2 } : { width })} />
          <LengthField label="Depth" testId="section-depth" valueMm={s.depth} unit={unit} onCommit={(depth) => patch(s.rotation === 0 ? { depth, y: top + depth / 2 } : { depth })} />
          {s.rotation === 0 ? (
            <>
              <LengthField label="Left edge (X)" valueMm={left} unit={unit} allowZero min={-1e6} onCommit={(mm) => patch({ x: mm + s.width / 2 })} />
              <LengthField label="Top edge (Y)" valueMm={top} unit={unit} allowZero min={-1e6} onCommit={(mm) => patch({ y: mm + s.depth / 2 })} />
            </>
          ) : (
            <>
              <LengthField label="Centre X" valueMm={s.x} unit={unit} allowZero min={-1e6} onCommit={(x) => patch({ x })} />
              <LengthField label="Centre Y" valueMm={s.y} unit={unit} allowZero min={-1e6} onCommit={(y) => patch({ y })} />
            </>
          )}
          <NumberField label="Rotation" suffix="°" value={s.rotation} min={-360} max={360} onCommit={(rotation) => patch({ rotation })} />
          <ColorField label="Colour" value={s.color} onChange={(color) => patch({ color }, `${s.id}:color`)} />
        </div>
        <p className="text-xs text-muted-foreground">Area {formatArea(s.width * s.depth, unit)}</p>
        <ToggleRow label="Show dimensions" checked={s.showDims} onChange={(showDims) => patch({ showDims })} />
        <Button variant="outline" className="h-11 w-full justify-start" data-testid="split-section" onClick={() => setSplit(true)}>
          <SquareSplitHorizontal className="mr-2 h-4 w-4" /> Split into parts…
        </Button>
      </PanelSection>
      <SplitSectionDialog open={split} onOpenChange={setSplit} section={s} unit={unit} />
    </>
  );
}

function ObjectFields({ o, model, patch }: { o: DesignObject; model: ProjectModel; patch: Patch }) {
  const unit = model.settings.displayUnit;
  const def = OBJECT_DEFS[o.type];
  const below = useMemo(() => surfaceBelow(model, o), [model, o]);
  return (
    <>
      <PanelSection title="Object">
        <TextField label="Name" testId="object-name" value={o.name} onCommit={(name) => patch({ name })} />
        <div className="grid grid-cols-2 gap-3">
          <LengthField label={def.round ? "Diameter" : def.widthLabel ?? "Width"} testId="object-width" valueMm={o.width} unit={unit} onCommit={(width) => patch(def.round ? { width, depth: width } : { width })} />
          {!def.round && <LengthField label="Depth" testId="object-depth" valueMm={o.depth} unit={unit} onCommit={(depth) => patch({ depth })} />}
          <LengthField label="Height" testId="object-height" valueMm={o.height} unit={unit} onCommit={(height) => patch({ height })} />
          <LengthField label="Elevation" testId="object-elevation" valueMm={o.elevation} unit={unit} allowZero onCommit={(elevation) => patch({ elevation })} hint="Base above the floor" />
          <LengthField label="Centre X" valueMm={o.x} unit={unit} allowZero min={-1e6} onCommit={(x) => patch({ x })} />
          <LengthField label="Centre Y" valueMm={o.y} unit={unit} allowZero min={-1e6} onCommit={(y) => patch({ y })} />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <NumberField label="Rotation" testId="object-rotation" suffix="°" value={o.rotation} min={-360} max={360} onCommit={(rotation) => patch({ rotation })} />
          </div>
          <IconBtn label="Rotate 90° left" onClick={() => patch({ rotation: norm(o.rotation - 90) })}>
            <RotateCcw className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Rotate 90° right" onClick={() => patch({ rotation: norm(o.rotation + 90) })}>
            <RotateCw className="h-4 w-4" />
          </IconBtn>
        </div>
        {below !== o.elevation && (
          <Button variant="outline" className="h-11 w-full justify-start" onClick={() => patch({ elevation: below })}>
            <ArrowDownToLine className="mr-2 h-4 w-4" /> {below > 0 ? `Sit on the surface below (${formatLength(below, unit)})` : "Put on the floor"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Top at {formatLength(o.elevation + o.height, unit)} above the floor.</p>
      </PanelSection>
      <PanelSection title="Appearance">
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Main colour" value={o.color} onChange={(color) => patch({ color }, `${o.id}:color`)} />
          <ColorField label="Accent" value={o.accentColor} onChange={(accentColor) => patch({ accentColor }, `${o.id}:accent`)} />
        </div>
        {def.params.map((p) => {
          const v = o.props[p.key] ?? p.default;
          const set = (val: number | boolean | string) => patch({ props: { ...o.props, [p.key]: val } }, `${o.id}:prop:${p.key}`);
          if (p.kind === "boolean") return <ToggleRow key={p.key} label={p.label} checked={Boolean(v)} onChange={set} />;
          if (p.kind === "length") return <LengthField key={p.key} label={p.label} valueMm={Number(v)} unit={unit} min={p.min ?? 0} onCommit={set} />;
          if (p.kind === "count") return <NumberField key={p.key} label={p.label} value={Number(v)} min={p.min} max={p.max} onCommit={set} />;
          if (p.kind === "choice") return <SelectField key={p.key} label={p.label} value={String(v)} options={p.options} onChange={set} />;
          return <ColorField key={p.key} label={p.label} value={String(v)} onChange={set} />;
        })}
      </PanelSection>
      {o.type === "custom" && <CustomObjectFields o={o} model={model} patch={patch} />}
      <p className="px-4 pb-3 text-[11px] text-muted-foreground">Models show size and placement only. They don't confirm that a structure is safe to build.</p>
    </>
  );
}

const norm = (deg: number) => {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

function DimensionFields({ d, unit, patch }: { d: Dimension; unit: ProjectModel["settings"]["displayUnit"]; patch: Patch }) {
  return (
    <PanelSection title="Dimension">
      <FieldRow label="Measured length">
        <p className="text-lg font-semibold tabular-nums" data-testid="dimension-value">
          {formatLength(dist(d.a, d.b), unit)}
        </p>
      </FieldRow>
      <LengthField label="Line offset" valueMm={Math.abs(d.offset)} unit={unit} allowZero onCommit={(mm) => patch({ offset: d.offset < 0 ? -mm : mm })} />
      <Button variant="outline" className="h-11" onClick={() => patch({ offset: -d.offset })}>
        <FlipHorizontal2 className="mr-2 h-4 w-4" /> Flip side
      </Button>
      <TextField label="Text after the value" value={d.suffix} placeholder="e.g. clear, approx." maxLength={60} onCommit={(suffix) => patch({ suffix })} />
      <p className="text-[11px] text-muted-foreground">The value always shows the true distance; drag the ends on the plan to re-measure.</p>
    </PanelSection>
  );
}

function LabelFields({ l, patch }: { l: Label; patch: Patch }) {
  return (
    <PanelSection title="Text label">
      <TextField label="Text" testId="label-text" value={l.text} onCommit={(text) => patch({ text })} />
      <SelectField label="Size" value={l.size} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]} onChange={(size) => patch({ size })} />
    </PanelSection>
  );
}

export function IssuesList({ issues, onPick }: { issues: Array<{ key: string; entityId: string | null; severity: string; message: string }>; onPick: (id: string) => void }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1.5" data-testid="issues">
      {issues.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            disabled={!i.entityId}
            onClick={() => i.entityId && onPick(i.entityId)}
            className={cn("flex min-h-10 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-[hsl(var(--state-hover))]", i.severity === "error" ? "text-destructive" : "text-warning")}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground">{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
