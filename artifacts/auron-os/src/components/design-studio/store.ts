import { useSyncExternalStore } from "react";
import {
  createHistory,
  projectModelSchema,
  pushHistory,
  redo as historyRedo,
  undo as historyUndo,
  type CustomSpec,
  type History,
  type ObjectType,
  type OpeningKind,
  type ProjectModel,
  type SectionKind,
  type Vec2,
} from "@workspace/design-model";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Editor state for one open project. A tiny external store (no extra
// dependency): components subscribe with a selector and only re-render when
// their slice changes, which keeps dragging on an iPad smooth.
//
// `history.present` is the committed model (what autosave writes and undo
// restores). While a finger or pencil is dragging, edits go to `draft`
// instead, so a drag is one undo step and nothing is saved mid-gesture.
// ---------------------------------------------------------------------------

export type Tool =
  | "select"
  | "pan"
  | "room"
  | "polygon"
  | "wall"
  | "pillar"
  | "opening"
  | "section"
  | "object"
  | "dimension"
  | "label"
  | "measure";

export type Workspace = "2d" | "3d";

/** A custom object chosen in the library, waiting to be placed. */
export type CustomPlacement = {
  spec: CustomSpec;
  name: string;
  color: string;
  accentColor: string;
  elevation: number;
  /** Library entry it came from (kept on the instance for "update from library"). */
  libraryId: number | null;
  libraryRevision: number | null;
};

export type ToolOptions = {
  openingKind: OpeningKind;
  sectionKind: SectionKind;
  objectType: ObjectType;
  /** Set when the object tool places a custom object instead of `objectType`. */
  custom: CustomPlacement | null;
};

export type EditorState = {
  history: History<ProjectModel>;
  draft: ProjectModel | null;
  selection: string[];
  /** Vertex of the selected room/partition that is focused (for numeric edits). */
  focusEdge: { hostId: string; index: number } | null;
  tool: Tool;
  toolOptions: ToolOptions;
  workspace: Workspace;
  /** Set when a pen has been used: then fingers pan and only the pen draws. */
  penMode: boolean;
  /** Points placed so far by the polygon-room or wall tool. */
  chain: Vec2[];
  /** Tape measure (not saved). */
  measure: { a: Vec2; b: Vec2 | null } | null;
};

/** What the canvas exposes to the rest of the editor. */
export type CanvasApi = {
  fit: () => void;
  zoomBy: (factor: number) => void;
  /** Pans so the given entities are visible inside the uncovered part of the canvas. */
  ensureVisible: (ids: string[]) => void;
  /** Plan point at the centre of the visible canvas. */
  centre: () => Vec2;
  /** Current zoom in px per mm. */
  scale: () => number;
};

type Listener = () => void;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();

  constructor(model: ProjectModel) {
    this.state = {
      history: createHistory(model),
      draft: null,
      selection: [],
      focusEdge: null,
      tool: "select",
      toolOptions: { openingKind: "door", sectionKind: "section", objectType: "stage", custom: null },
      workspace: "2d",
      penMode: false,
      chain: [],
      measure: null,
    };
  }

  /** Registered by the 2D canvas while it is mounted. */
  canvas: CanvasApi | null = null;
  /** Screen-space rectangle (px, within the canvas) hidden by panels, for ensureVisible. */
  occluded: { right: number; bottom: number } = { right: 0, bottom: 0 };

  getState = (): EditorState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** The model to render: the live drag preview if any, else the committed one. */
  get model(): ProjectModel {
    return this.state.draft ?? this.state.history.present;
  }

  /**
   * Commits a change as an undo step. `key` merges rapid edits of one field.
   * A change the server would refuse (a size beyond the plan's limits, say)
   * is rejected here with a message, so autosave never gets stuck on it.
   */
  commit(next: ProjectModel, key?: string): boolean {
    const check = projectModelSchema.safeParse(next);
    if (!check.success) {
      this.set({ draft: null });
      toast({ title: "That value can't be used", description: describeIssue(check.error.issues[0]), variant: "destructive" });
      return false;
    }
    this.set({ history: pushHistory(this.state.history, next, { key }), draft: null });
    this.pruneSelection(next);
    return true;
  }

  setDraft(next: ProjectModel | null) {
    this.set({ draft: next });
  }

  /** Ends a drag: commits the preview (if it changed anything) as one step. */
  endDraft() {
    const d = this.state.draft;
    if (!d) return;
    if (d === this.state.history.present) this.set({ draft: null });
    else this.commit(d);
  }

  undo() {
    if (this.state.draft) this.set({ draft: null });
    const history = historyUndo(this.state.history);
    this.set({ history });
    this.pruneSelection(history.present);
  }

  redo() {
    const history = historyRedo(this.state.history);
    this.set({ history });
    this.pruneSelection(history.present);
  }

  /** Replaces the whole model without an undo step (e.g. restoring a draft). */
  replace(model: ProjectModel) {
    this.set({ history: createHistory(model), draft: null, selection: [], focusEdge: null });
  }

  select(ids: string[], focusEdge: EditorState["focusEdge"] = null) {
    this.set({ selection: ids, focusEdge });
  }

  setFocusEdge(focusEdge: EditorState["focusEdge"]) {
    this.set({ focusEdge });
  }

  setTool(tool: Tool, options: Partial<ToolOptions> = {}) {
    this.set({ tool, toolOptions: { ...this.state.toolOptions, ...options }, chain: [], measure: null });
  }

  setChain(chain: Vec2[]) {
    this.set({ chain });
  }

  setMeasure(measure: EditorState["measure"]) {
    this.set({ measure });
  }

  setWorkspace(workspace: Workspace) {
    this.set({ workspace });
  }

  setPenMode(penMode: boolean) {
    if (penMode !== this.state.penMode) this.set({ penMode });
  }

  private pruneSelection(model: ProjectModel) {
    const { selection } = this.state;
    if (selection.length === 0) return;
    const ids = new Set<string>();
    for (const list of [model.rooms, model.partitions, model.openings, model.pillars, model.sections, model.objects, model.dimensions, model.labels]) {
      for (const e of list as Array<{ id: string }>) ids.add(e.id);
    }
    const kept = selection.filter((id) => ids.has(id));
    if (kept.length !== selection.length) this.set({ selection: kept, focusEdge: kept.length ? this.state.focusEdge : null });
  }
}

export function useEditor<T>(store: EditorStore, selector: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

/** The model currently on screen (drag preview or committed). */
export function useModel(store: EditorStore): ProjectModel {
  return useEditor(store, (s) => s.draft ?? s.history.present);
}

const FIELD_NAMES: Record<string, string> = { width: "Width", depth: "Depth", height: "Height", elevation: "Elevation", wallThickness: "Wall thickness", wallHeight: "Wall height", thickness: "Thickness", dimOffset: "Dimension offset", gridSize: "Grid size", sill: "Sill height", offset: "Position", x: "Position", y: "Position", rotation: "Rotation", name: "Name", notes: "Notes", text: "Text" };

function describeIssue(issue: { path: PropertyKey[]; code: string; message: string } | undefined): string {
  if (!issue) return "It is outside what a plan can store.";
  const key = [...issue.path].reverse().find((k): k is string => typeof k === "string") ?? "";
  const field = FIELD_NAMES[key] ?? "This value";
  if (issue.code === "too_big") return `${field} is too large for a floor plan.`;
  if (issue.code === "too_small") return `${field} is too small.`;
  return `${field}: ${issue.message}`;
}
