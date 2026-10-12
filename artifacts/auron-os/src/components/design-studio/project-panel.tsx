import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import {
  NOTE_STATUSES,
  formatArea,
  formatLength,
  gridOptions,
  makeNote,
  newId,
  overallExtents,
  polygonArea,
  validateModel,
  type NoteStatus,
  type ProjectModel,
} from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LengthField, PanelSection, SelectField, StatusField, TextField, ToggleRow, UNIT_OPTIONS } from "./fields";
import { useStore } from "./commands";
import { useEditor } from "./store";
import { IssuesList } from "./inspector";

// Shown when nothing is selected: the venue record (name, ceiling, notes and
// the site-visit checklist), drawing details, display settings and warnings.

type Tab = "venue" | "checklist" | "notes" | "drawing" | "view";

const NOTE_LABEL: Record<NoteStatus, string> = { measured: "Measured", assumption: "Assumption", to_confirm: "To confirm" };
const NOTE_TONE: Record<NoteStatus, string> = { measured: "text-success", assumption: "text-warning", to_confirm: "text-destructive" };

export function ProjectPanel({ issuesCount }: { issuesCount: number }) {
  const store = useStore();
  const model = useEditor(store, (s) => s.draft ?? s.history.present);
  const [tab, setTab] = useState<Tab>("venue");
  const set = (patch: Partial<ProjectModel>, key?: string) => store.commit({ ...store.getState().history.present, ...patch }, key);
  const unit = model.settings.displayUnit;
  const ext = overallExtents(model);
  const area = model.rooms.filter((r) => !r.hidden).reduce((a, r) => a + polygonArea(r.points), 0);
  const checklistDone = model.checklist.filter((c) => c.done).length;

  return (
    <div data-testid="project-panel">
      <div className="px-4 pt-4">
        <p className="text-eyebrow font-semibold uppercase text-gold-ink">Venue</p>
        <p className="truncate text-sm font-semibold">{model.venue.name || "Venue not named yet"}</p>
        {ext && (
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatLength(ext.width, unit)} × {formatLength(ext.length, unit)} overall · {formatArea(area, unit)}
          </p>
        )}
      </div>
      <div className="sticky top-0 z-10 mt-3 flex gap-1 overflow-x-auto border-b border-border/70 bg-inherit px-3 pb-2" role="tablist">
        {(
          [
            ["venue", "Venue"],
            ["checklist", `Checklist ${checklistDone}/${model.checklist.length}`],
            ["notes", `Notes${model.notes.length ? ` ${model.notes.length}` : ""}`],
            ["drawing", "Drawing"],
            ["view", `View${issuesCount ? ` · ${issuesCount}⚠` : ""}`],
          ] as Array<[Tab, string]>
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("min-h-10 shrink-0 rounded-lg px-3 text-xs font-medium transition-colors", tab === t ? "bg-[hsl(var(--state-selected))] text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "venue" && (
        <PanelSection title="Venue record">
          <TextField label="Venue name" testId="venue-name" value={model.venue.name} onCommit={(name) => set({ venue: { ...model.venue, name } })} />
          <TextField label="Address / hall" value={model.venue.address} maxLength={400} onCommit={(address) => set({ venue: { ...model.venue, address } })} />
          <div className="grid grid-cols-2 items-start gap-3">
            {model.venue.ceilingHeight == null ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Ceiling height</p>
                <Button variant="outline" className="h-11 w-full" onClick={() => set({ venue: { ...model.venue, ceilingHeight: model.rooms[0]?.wallHeight ?? 4000, ceilingStatus: "to_confirm" } })}>
                  Record it
                </Button>
              </div>
            ) : (
              <LengthField label="Ceiling height" valueMm={model.venue.ceilingHeight} unit={unit} onCommit={(ceilingHeight) => set({ venue: { ...model.venue, ceilingHeight } })} />
            )}
            {model.venue.ceilingHeight != null && (
              <Button variant="ghost" className="mt-5 h-11 text-xs text-muted-foreground" onClick={() => set({ venue: { ...model.venue, ceilingHeight: null } })}>
                Clear (not known)
              </Button>
            )}
          </div>
          {model.venue.ceilingHeight != null && <StatusField value={model.venue.ceilingStatus} onChange={(ceilingStatus) => set({ venue: { ...model.venue, ceilingStatus } })} />}
          <TextField label="Venue notes" multiline maxLength={8000} value={model.venue.notes} placeholder="Power, access, restrictions, timings…" onCommit={(notes) => set({ venue: { ...model.venue, notes } })} />
          <p className="text-[11px] text-muted-foreground">Nothing is filled in for you: unknown values stay blank until measured.</p>
        </PanelSection>
      )}

      {tab === "checklist" && (
        <PanelSection
          title="Site visit checklist"
          action={
            <Button variant="ghost" size="sm" className="h-9" onClick={() => set({ checklist: [...model.checklist, { id: newId("chk"), label: "New item", done: false, value: "" }] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          <ul className="space-y-2" data-testid="checklist">
            {model.checklist.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/70 p-2">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-label={c.done ? `Mark “${c.label}” not done` : `Mark “${c.label}” done`}
                    aria-pressed={c.done}
                    onClick={() => set({ checklist: model.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
                    className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border", c.done ? "border-success bg-success/15 text-success" : "border-input text-transparent")}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      key={`label:${c.label}`}
                      aria-label="Checklist item"
                      className="h-11 w-full rounded-md bg-transparent px-1 text-sm font-medium focus:bg-background/60 focus:outline-none"
                      defaultValue={c.label}
                      onBlur={(e) => e.target.value !== c.label && set({ checklist: model.checklist.map((x) => (x.id === c.id ? { ...x, label: e.target.value.slice(0, 200) } : x)) })}
                    />
                    <input
                      key={`value:${c.value}`}
                      aria-label={`Value for ${c.label}`}
                      className="h-10 w-full rounded-md border border-input bg-background/60 px-2 text-[16px] md:text-sm"
                      placeholder="Value or remark"
                      defaultValue={c.value}
                      onBlur={(e) => e.target.value !== c.value && set({ checklist: model.checklist.map((x) => (x.id === c.id ? { ...x, value: e.target.value.slice(0, 200) } : x)) })}
                    />
                  </div>
                  <button type="button" aria-label={`Remove “${c.label}”`} className="flex h-11 w-9 items-center justify-center text-muted-foreground hover:text-destructive" onClick={() => set({ checklist: model.checklist.filter((x) => x.id !== c.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      {tab === "notes" && <NotesTab model={model} set={set} />}

      {tab === "drawing" && (
        <PanelSection title="Title block (exports)">
          <TextField label="Drawing title" value={model.drawing.title} onCommit={(title) => set({ drawing: { ...model.drawing, title } })} />
          <TextField label="Client" value={model.drawing.client} onCommit={(client) => set({ drawing: { ...model.drawing, client } })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Revision" value={model.drawing.revision} maxLength={40} onCommit={(revision) => set({ drawing: { ...model.drawing, revision } })} />
            <TextField label="Date" value={model.drawing.date} maxLength={40} placeholder="e.g. 12 Oct 2026" onCommit={(date) => set({ drawing: { ...model.drawing, date } })} />
          </div>
          <TextField label="Prepared by" value={model.drawing.preparedBy} maxLength={120} onCommit={(preparedBy) => set({ drawing: { ...model.drawing, preparedBy } })} />
        </PanelSection>
      )}

      {tab === "view" && (
        <>
          {issuesCount > 0 && (
            <PanelSection title={`Check these (${issuesCount})`}>
              <IssuesList issues={validateModel(model)} onPick={(id) => {
                store.select([id]);
                store.canvas?.ensureVisible([id]);
              }} />
            </PanelSection>
          )}
          <PanelSection title="Units and grid">
            <SelectField label="Units" testId="units" value={unit} options={UNIT_OPTIONS} onChange={(displayUnit) => set({ settings: { ...model.settings, displayUnit, gridSize: gridOptions(displayUnit).some((g) => Math.abs(g.mm - model.settings.gridSize) < 0.1) ? model.settings.gridSize : displayUnit === "ft" ? 304.8 : 500 } })} />
            <SelectField
              label="Grid size"
              value={String(model.settings.gridSize)}
              options={gridOptions(unit).map((g) => ({ value: String(g.mm), label: g.label }))}
              onChange={(v) => set({ settings: { ...model.settings, gridSize: Number(v) } })}
            />
            <ToggleRow label="Show grid" checked={model.settings.showGrid} onChange={(showGrid) => set({ settings: { ...model.settings, showGrid } })} />
            <ToggleRow label="Snap to grid" checked={model.settings.snapGrid} onChange={(snapGrid) => set({ settings: { ...model.settings, snapGrid } })} />
            <ToggleRow label="Snap to corners and walls" checked={model.settings.snapGeometry} onChange={(snapGeometry) => set({ settings: { ...model.settings, snapGeometry } })} />
            <ToggleRow label="Straight lines (45° steps)" checked={model.settings.snapAngle} onChange={(snapAngle) => set({ settings: { ...model.settings, snapAngle } })} />
          </PanelSection>
          <PanelSection title="Show on plan">
            <ToggleRow label="Wall lengths" checked={model.settings.showWallDims} onChange={(showWallDims) => set({ settings: { ...model.settings, showWallDims } })} />
            <ToggleRow label="Overall dimensions" checked={model.settings.showOverallDims} onChange={(showOverallDims) => set({ settings: { ...model.settings, showOverallDims } })} />
            <ToggleRow label="External dimensions (incl. walls)" checked={model.settings.showExternalDims} onChange={(showExternalDims) => set({ settings: { ...model.settings, showExternalDims } })} />
            <ToggleRow label="Section dimensions" checked={model.settings.showSectionDims} onChange={(showSectionDims) => set({ settings: { ...model.settings, showSectionDims } })} />
            <ToggleRow label="Object dimensions" checked={model.settings.showObjectDims} onChange={(showObjectDims) => set({ settings: { ...model.settings, showObjectDims } })} />
            <ToggleRow label="Event objects" checked={model.settings.showObjects} onChange={(showObjects) => set({ settings: { ...model.settings, showObjects } })} />
            <ToggleRow label="Names and labels" checked={model.settings.showLabels} onChange={(showLabels) => set({ settings: { ...model.settings, showLabels } })} />
          </PanelSection>
        </>
      )}
    </div>
  );
}

function NotesTab({ model, set }: { model: ProjectModel; set: (p: Partial<ProjectModel>, key?: string) => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<NoteStatus>("to_confirm");
  const add = () => {
    if (!text.trim()) return;
    set({ notes: [...model.notes, makeNote(text.trim(), status)] });
    setText("");
  };
  const targetName = (id: string | null) => {
    if (!id) return null;
    for (const list of [model.rooms, model.partitions, model.openings, model.pillars, model.sections, model.objects] as Array<Array<{ id: string; name: string }>>) {
      const e = list.find((x) => x.id === id);
      if (e) return e.name;
    }
    return null;
  };
  return (
    <PanelSection title="Measurement notes">
      <div className="space-y-2 rounded-lg border border-border/70 p-2">
        <textarea
          aria-label="New note"
          data-testid="note-text"
          className="min-h-[72px] w-full rounded-md border border-input bg-background/60 px-2 py-2 text-[16px] md:text-sm"
          placeholder="e.g. Stage at the far end is 600 high; 3 × 32 A points on the left wall"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Note status">
            {NOTE_STATUSES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cn("min-h-9 rounded-md px-1 text-[11px] font-medium", status === s ? cn("bg-card shadow-xs", NOTE_TONE[s]) : "text-muted-foreground")}>
                {NOTE_LABEL[s]}
              </button>
            ))}
          </div>
          <Button className="h-11" onClick={add} disabled={!text.trim()} data-testid="add-note">
            Add
          </Button>
        </div>
      </div>
      {model.notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No notes yet. Mark each one as measured, an assumption, or still to confirm.</p>
      ) : (
        <ul className="space-y-2">
          {model.notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-border/70 p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 whitespace-pre-wrap text-sm">{n.text}</p>
                <button type="button" aria-label="Delete note" className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive" onClick={() => set({ notes: model.notes.filter((x) => x.id !== n.id) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className={cn("rounded-full bg-muted px-2 py-1 font-semibold", NOTE_TONE[n.status])}
                  onClick={() => {
                    const next = NOTE_STATUSES[(NOTE_STATUSES.indexOf(n.status) + 1) % NOTE_STATUSES.length];
                    set({ notes: model.notes.map((x) => (x.id === n.id ? { ...x, status: next } : x)) });
                  }}
                >
                  {NOTE_LABEL[n.status]}
                </button>
                {targetName(n.targetId) && <span className="text-muted-foreground">on {targetName(n.targetId)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}
