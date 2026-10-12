import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Download,
  Loader2,
  Maximize,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
  Check,
  Keyboard,
  Pentagon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { validateModel, type ProjectModel } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Canvas2D } from "./canvas-2d";
import { EditorContext, deleteSelection, duplicateSelection, nudgeSelection, useStore } from "./commands";
import { EditorStore, useEditor } from "./store";
import { Inspector } from "./inspector";
import { ContextBar, ObjectLibrary, TOOLS, ToolRail } from "./toolbar";
import { AddRoomDialog } from "./dialogs";
import { ExportDialog } from "./export-dialog";
import { Saver, clearLocalDraft, useAutosave, type SaveStatus } from "./autosave";

const Studio3D = lazy(() => import("./studio-3d"));

// ---------------------------------------------------------------------------
// The full-screen Design Studio editor (iPad first).
//
//  Landscape iPad / desktop (≥ 1024 px): tool rail left, canvas, properties
//  panel right (collapsible).
//  Portrait iPad (768–1023 px): tool rail left, canvas, properties as a
//  bottom sheet over the canvas.
//  Phone (< 768 px): tools along the bottom, properties as a bottom sheet.
//
// The sheet sits above the on-screen keyboard (visualViewport) and the plan
// pans so the selected item stays visible while a value is typed.
// ---------------------------------------------------------------------------

function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setM(mql.matches);
    mql.addEventListener("change", on);
    on();
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return m;
}

/** Height of the on-screen keyboard (0 when closed), from visualViewport. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    on();
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return inset;
}

export type EditorProps = {
  projectId: number;
  name: string;
  initialModel: ProjectModel;
  revision: number;
  onRename: (name: string) => void;
  /** Reloads the server copy (after a save conflict). */
  onReloadServer: () => Promise<{ model: ProjectModel; revision: number } | null>;
  recoveredDraft?: { model: ProjectModel; savedAt: string; newerOnServer?: { by: string | null; at: string } | null } | null;
};

export function DesignEditor(props: EditorProps) {
  const store = useMemo(() => new EditorStore(props.initialModel), []); // eslint-disable-line react-hooks/exhaustive-deps
  const saver = useMemo(() => new Saver(props.projectId, props.revision, props.initialModel), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void saver.close(), [saver]);
  const status = useAutosave(store, saver);
  return (
    <EditorContext.Provider value={store}>
      <EditorLayout {...props} saver={saver} status={status} />
    </EditorContext.Provider>
  );
}

function EditorLayout({ projectId, name, onRename, onReloadServer, recoveredDraft, saver, status }: EditorProps & { saver: Saver; status: SaveStatus }) {
  const store = useStore();
  const model = useEditor(store, (s) => s.history.present);
  const workspace = useEditor(store, (s) => s.workspace);
  const selection = useEditor(store, (s) => s.selection);
  const canUndo = useEditor(store, (s) => s.history.past.length > 0);
  const canRedo = useEditor(store, (s) => s.history.future.length > 0);
  const wide = useMedia("(min-width: 1024px)");
  const phone = useMedia("(max-width: 767px)");
  const kb = useKeyboardInset();
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("peek");
  const [library, setLibrary] = useState(false);
  const [addRoom, setAddRoom] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draftOffer, setDraftOffer] = useState(recoveredDraft ?? null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const issues = useMemo(() => validateModel(model), [model]);
  const useSheet = !wide;

  // Open the sheet a little when something is selected; collapse when cleared.
  useEffect(() => {
    if (!useSheet) return;
    setSheet((s) => (selection.length ? (s === "peek" ? "half" : s) : "peek"));
  }, [selection.length, useSheet]);

  // Tell the canvas which part of it the sheet covers (for ensureVisible / fit).
  useEffect(() => {
    const el = sheetRef.current;
    if (!useSheet || !el) {
      store.occluded = { right: 0, bottom: 0 };
      return;
    }
    const ro = new ResizeObserver(() => {
      store.occluded = { right: 0, bottom: el.getBoundingClientRect().height + kb };
    });
    ro.observe(el);
    store.occluded = { right: 0, bottom: el.getBoundingClientRect().height + kb };
    return () => ro.disconnect();
  }, [useSheet, kb, store, sheet]);

  // Keep the editor in charge of scrolling and zooming while open.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehavior;
    html.style.overscrollBehavior = "none";
    document.body.classList.add("design-studio-open");
    return () => {
      html.style.overscrollBehavior = prev;
      document.body.classList.remove("design-studio-open");
    };
  }, []);

  useKeyboardShortcuts(store, () => setExportOpen(true));

  const empty = model.rooms.length === 0 && model.partitions.length === 0 && model.sections.length === 0 && model.objects.length === 0;

  const conflict = status.state === "conflict" ? status : null;

  const reloadTheirs = useCallback(async () => {
    const fresh = await onReloadServer();
    if (fresh) {
      saver.reset(fresh.revision, fresh.model);
      store.replace(fresh.model);
    }
  }, [onReloadServer, saver, store]);

  const inspector = <Inspector issuesCount={issues.length} />;

  return (
    <div className="design-studio fixed inset-0 z-40 flex flex-col bg-background text-foreground" style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }} data-testid="design-editor">
      <TopBar
        name={name}
        onRename={(n) => {
          onRename(n);
          saver.metaChanged({ name: n });
        }}
        status={status}
        onRetry={() => saver.retry()}
        canUndo={canUndo}
        canRedo={canRedo}
        issues={issues.length}
        onIssues={() => {
          store.select([]);
          if (useSheet) setSheet("half");
          else setPanelOpen(true);
        }}
        onExport={() => setExportOpen(true)}
        compact={phone}
        panelToggle={
          wide ? (
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={panelOpen ? "Hide properties" : "Show properties"} onClick={() => setPanelOpen((v) => !v)}>
              {panelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
            </Button>
          ) : null
        }
      />

      {conflict && (
        <Banner tone="warning" testId="conflict-banner">
          <span className="min-w-0 flex-1">
            This project was saved {conflict.updatedByName ? `by ${conflict.updatedByName} ` : ""}on another device{conflict.updatedAt ? ` ${formatDistanceToNowStrict(new Date(conflict.updatedAt), { addSuffix: true })}` : ""}. Your latest changes are not saved yet.
          </span>
          <Button size="sm" variant="outline" className="h-10" onClick={() => void reloadTheirs()}>
            Load theirs
          </Button>
          <Button size="sm" className="h-10" onClick={() => void saver.overwrite()}>
            Keep mine
          </Button>
        </Banner>
      )}
      {draftOffer && (
        <Banner tone={draftOffer.newerOnServer ? "warning" : "info"} testId="draft-banner">
          <span className="min-w-0 flex-1">
            Unsaved changes from {formatDistanceToNowStrict(new Date(draftOffer.savedAt), { addSuffix: true })} were found on this device.
            {draftOffer.newerOnServer && (
              <>
                {" "}
                The design was saved again {draftOffer.newerOnServer.by ? `by ${draftOffer.newerOnServer.by} ` : ""}
                {formatDistanceToNowStrict(new Date(draftOffer.newerOnServer.at), { addSuffix: true })}, after these changes. Restoring them replaces that newer version.
              </>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            onClick={() => {
              clearLocalDraft(projectId);
              setDraftOffer(null);
            }}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="h-10"
            onClick={() => {
              store.commit(draftOffer.model);
              setDraftOffer(null);
            }}
          >
            {draftOffer.newerOnServer ? "Replace with mine" : "Restore"}
          </Button>
        </Banner>
      )}

      <div className="relative flex min-h-0 flex-1">
        {!phone && (
          <div className="glass-fill flex shrink-0 flex-col border-r border-[hsl(var(--glass-border))]">
            {workspace === "2d" && <ToolRail orientation="vertical" onOpenLibrary={() => setLibrary(true)} />}
          </div>
        )}

        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ background: "var(--plan-paper)" }}>
          {workspace === "2d" ? (
            <>
              <Canvas2D />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 sm:p-3">
                <ContextBar onTypeRoom={() => setAddRoom(true)} onOpenLibrary={() => setLibrary(true)} />
              </div>
              <ZoomControls bottomInset={useSheet ? (sheet === "peek" ? 76 : 0) : 0} hidden={useSheet && sheet !== "peek"} />
              {empty && <EmptyCanvas onAddRoom={() => setAddRoom(true)} onDraw={() => store.setTool("polygon")} />}
            </>
          ) : (
            <Suspense fallback={<CenteredSpinner label="Loading 3D studio…" />}>
              <Studio3D onOpenLibrary={() => setLibrary(true)} />
            </Suspense>
          )}

          {useSheet && (
            <div
              ref={sheetRef}
              className="absolute inset-x-0 z-20 flex flex-col rounded-t-2xl border-t bg-popover/97 shadow-[var(--elev-3)] backdrop-blur"
              style={{
                bottom: kb,
                maxHeight: sheet === "full" ? "calc(100% - 12px)" : sheet === "half" ? "min(48%, 26rem)" : 64,
                transition: "max-height 220ms var(--ease-out-quint)",
              }}
              data-testid="properties-sheet"
              data-state={sheet}
            >
              <button
                type="button"
                className="flex h-12 shrink-0 items-center justify-between gap-2 px-4"
                aria-label={sheet === "peek" ? "Show properties" : "Hide properties"}
                aria-expanded={sheet !== "peek"}
                onClick={() => setSheet((s) => (s === "peek" ? "half" : "peek"))}
              >
                <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
                <span className="truncate text-sm font-semibold">{selection.length ? "Properties" : "Venue, notes and settings"}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {issues.length > 0 && <AlertTriangle className="h-4 w-4 text-warning" />}
                  {sheet === "peek" ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </span>
              </button>
              {sheet !== "peek" && (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{inspector}</div>
                  <button type="button" className="h-8 shrink-0 border-t text-[11px] font-medium text-muted-foreground" onClick={() => setSheet((s) => (s === "full" ? "half" : "full"))}>
                    {sheet === "full" ? "Smaller" : "Expand"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {wide && panelOpen && (
          <aside className="flex w-[22rem] shrink-0 flex-col border-l border-[hsl(var(--glass-border))] bg-card" aria-label="Properties" data-testid="properties-panel">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{inspector}</div>
          </aside>
        )}
      </div>

      {phone && workspace === "2d" && (
        <div className="glass-fill shrink-0 border-t border-[hsl(var(--glass-border))]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <ToolRail orientation="horizontal" onOpenLibrary={() => setLibrary(true)} />
        </div>
      )}

      <ObjectLibrary open={library} onOpenChange={setLibrary} side={phone ? "bottom" : "left"} />
      <AddRoomDialog open={addRoom} onOpenChange={setAddRoom} unit={model.settings.displayUnit} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} model={model} projectName={name} />
    </div>
  );
}

function Banner({ tone, children, testId }: { tone: "warning" | "info"; children: ReactNode; testId?: string }) {
  return (
    <div role="status" data-testid={testId} className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm", tone === "warning" ? "bg-warning/12 text-foreground" : "bg-info/10 text-foreground")}>
      {children}
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  let icon: ReactNode;
  let text: string;
  let tone = "text-muted-foreground";
  switch (status.state) {
    case "saved":
      icon = <Check className="h-3.5 w-3.5" />;
      text = "Saved";
      tone = "text-success";
      break;
    case "dirty":
      icon = <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />;
      text = "Unsaved";
      break;
    case "saving":
      icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      text = "Saving…";
      break;
    case "offline":
      icon = <CloudOff className="h-3.5 w-3.5" />;
      text = "Offline, retrying";
      tone = "text-warning";
      break;
    case "error":
      icon = <AlertTriangle className="h-3.5 w-3.5" />;
      text = "Not saved";
      tone = "text-destructive";
      break;
    case "conflict":
      icon = <AlertTriangle className="h-3.5 w-3.5" />;
      text = "Changed elsewhere";
      tone = "text-warning";
      break;
  }
  const title = status.state === "error" ? status.message : status.state === "saved" ? `Saved ${formatDistanceToNowStrict(status.at, { addSuffix: true })}` : text;
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 text-xs font-medium", tone)} role="status" aria-live="polite" title={title} data-testid="save-status" data-state={status.state}>
      {icon}
      <span className="truncate">{text}</span>
      {status.state === "error" && (
        <button type="button" className="ml-1 rounded-md px-1.5 py-1 underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function TopBar({
  name,
  onRename,
  status,
  onRetry,
  canUndo,
  canRedo,
  issues,
  onIssues,
  onExport,
  compact,
  panelToggle,
}: {
  name: string;
  onRename: (n: string) => void;
  status: SaveStatus;
  onRetry: () => void;
  canUndo: boolean;
  canRedo: boolean;
  issues: number;
  onIssues: () => void;
  onExport: () => void;
  compact: boolean;
  panelToggle: ReactNode;
}) {
  const store = useStore();
  const workspace = useEditor(store, (s) => s.workspace);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commitName = () => {
    setEditing(false);
    const n = draft.trim();
    if (n && n !== name) onRename(n.slice(0, 200));
    else setDraft(name);
  };
  return (
    <header className="glass-fill flex h-14 shrink-0 items-center gap-1 border-b border-[hsl(var(--glass-border))] px-1.5 sm:gap-2 sm:px-3" data-testid="editor-topbar">
      <Link href="/design-studio" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-[hsl(var(--state-hover))] hover:text-foreground" aria-label="Back to projects">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            aria-label="Project name"
            className="h-10 w-full max-w-sm rounded-lg border border-input bg-background/60 px-2 text-[16px] font-semibold"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className="block max-w-full truncate rounded-md px-1 text-left text-sm font-semibold hover:bg-[hsl(var(--state-hover))]" onClick={() => setEditing(true)} title="Rename" data-testid="project-name">
            {name}
          </button>
        )}
        <div className="px-1">
          <SaveIndicator status={status} onRetry={onRetry} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={!canUndo} onClick={() => store.undo()} aria-label="Undo" title="Undo (⌘Z)" data-testid="undo">
          <Undo2 className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={!canRedo} onClick={() => store.redo()} aria-label="Redo" title="Redo (⇧⌘Z)" data-testid="redo">
          <Redo2 className="h-5 w-5" />
        </Button>
        {issues > 0 && !compact && (
          <Button variant="ghost" className="h-11 px-2 text-warning" onClick={onIssues} aria-label={`${issues} things to check`} title="Things to check">
            <AlertTriangle className="h-4 w-4" />
            <span className="ml-1 text-xs tabular-nums">{issues}</span>
          </Button>
        )}
        <div className="mx-0.5 flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="Workspace">
          {(["2d", "3d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={workspace === w}
              data-testid={`workspace-${w}`}
              onClick={() => {
                store.setTool("select");
                store.setWorkspace(w);
              }}
              className={cn("flex h-9 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors", workspace === w ? "bg-card text-foreground shadow-xs" : "text-muted-foreground")}
            >
              {w === "2d" ? <Square className="h-3.5 w-3.5" /> : <Box className="h-3.5 w-3.5" />}
              {w.toUpperCase()}
            </button>
          ))}
        </div>
        <Button variant={compact ? "ghost" : "outline"} size={compact ? "icon" : "default"} className={cn("h-11", compact ? "w-11" : "px-3")} onClick={onExport} aria-label="Export" data-testid="export-open">
          <Download className="h-4 w-4" />
          {!compact && <span className="ml-1.5">Export</span>}
        </Button>
        {panelToggle}
      </div>
    </header>
  );
}

function ZoomControls({ bottomInset, hidden }: { bottomInset: number; hidden: boolean }) {
  const store = useStore();
  if (hidden) return null;
  return (
    <div className="absolute right-3 flex flex-col overflow-hidden rounded-xl border bg-popover/95 shadow-[var(--elev-2)]" style={{ bottom: 12 + bottomInset }}>
      <button type="button" className="flex h-11 w-11 items-center justify-center hover:bg-[hsl(var(--state-hover))]" aria-label="Zoom in" onClick={() => store.canvas?.zoomBy(1.4)}>
        <ZoomIn className="h-5 w-5" />
      </button>
      <button type="button" className="flex h-11 w-11 items-center justify-center border-y hover:bg-[hsl(var(--state-hover))]" aria-label="Zoom out" onClick={() => store.canvas?.zoomBy(1 / 1.4)}>
        <ZoomOut className="h-5 w-5" />
      </button>
      <button type="button" className="flex h-11 w-11 items-center justify-center hover:bg-[hsl(var(--state-hover))]" aria-label="Fit plan to screen" onClick={() => store.canvas?.fit()} data-testid="fit">
        <Maximize className="h-5 w-5" />
      </button>
    </div>
  );
}

function EmptyCanvas({ onAddRoom, onDraw }: { onAddRoom: () => void; onDraw: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-2xl border bg-popover/95 p-5 text-center shadow-[var(--elev-2)]" data-testid="empty-canvas">
        <p className="text-base font-semibold">Start with the hall</p>
        <p className="mt-1 text-sm text-muted-foreground">Type the measured sizes, or tap out the outline corner by corner.</p>
        <div className="mt-4 grid gap-2">
          <Button className="h-12" onClick={onAddRoom} data-testid="empty-add-room">
            <Keyboard className="mr-2 h-4 w-4" /> Add a room by size
          </Button>
          <Button variant="outline" className="h-12" onClick={onDraw}>
            <Pentagon className="mr-2 h-4 w-4" /> Draw the outline
          </Button>
        </div>
      </div>
    </div>
  );
}

function useKeyboardShortcuts(store: EditorStore, openExport: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        duplicateSelection(store);
        return;
      }
      if (mod && k === "e") {
        e.preventDefault();
        openExport();
        return;
      }
      if (mod) return;
      if (k === "delete" || k === "backspace") {
        e.preventDefault();
        deleteSelection(store);
        return;
      }
      if (k === "escape") {
        const st = store.getState();
        if (st.chain.length) store.setChain([]);
        else if (st.measure) store.setMeasure(null);
        else if (st.tool !== "select") store.setTool("select");
        else store.select([]);
        return;
      }
      if (k === "f") {
        store.canvas?.fit();
        return;
      }
      if (k.startsWith("arrow")) {
        const step = e.shiftKey ? 100 : 10;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
        if (d && store.getState().selection.length) {
          e.preventDefault();
          nudgeSelection(store, d[0], d[1]);
        }
        return;
      }
      if (store.getState().workspace !== "2d") return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (tool) store.setTool(tool.tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, openExport]);
}
