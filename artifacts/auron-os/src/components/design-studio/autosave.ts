import { useEffect, useRef, useState } from "react";
import { updateDesignProject, type DesignProjectUpdate } from "@workspace/api-client-react";
import type { ProjectModel } from "@workspace/design-model";
import type { EditorStore } from "./store";

// ---------------------------------------------------------------------------
// Autosave. One save in flight at a time; edits made while it runs are saved
// next. Every save carries the revision it is based on, and the server
// refuses it (409) if another tab or device saved in between, so newer work
// is never overwritten without the user choosing to.
//
// Network failures retry with backoff (2 s … 30 s) and show "Offline, will
// retry"; validation errors stop and say why. A copy of unsaved work is kept
// in this browser so a crash or a dead battery doesn't lose it.
// ---------------------------------------------------------------------------

export type SaveStatus =
  | { state: "saved"; at: Date }
  | { state: "dirty" }
  | { state: "saving" }
  | { state: "offline"; retryIn: number }
  | { state: "error"; message: string }
  | { state: "conflict"; currentRevision: number; updatedByName: string | null; updatedAt: string };

type Meta = Omit<DesignProjectUpdate, "baseRevision" | "force" | "model">;

const DRAFT_KEY = (id: number) => `auron-design-draft:${id}`;

export type LocalDraft = { baseRevision: number; savedAt: string; model: ProjectModel };

export function readLocalDraft(id: number): LocalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as LocalDraft;
    return d && typeof d.baseRevision === "number" && d.model ? d : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(id: number) {
  try {
    localStorage.removeItem(DRAFT_KEY(id));
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

function writeLocalDraft(id: number, d: LocalDraft) {
  try {
    localStorage.setItem(DRAFT_KEY(id), JSON.stringify(d));
  } catch {
    /* quota or private mode: the server copy is still the source of truth */
  }
}

export class Saver {
  revision: number;
  private savedModel: ProjectModel;
  private pendingModel: ProjectModel | null = null;
  private pendingMeta: Meta = {};
  private inFlight = false;
  private timer: number | null = null;
  private retryTimer: number | null = null;
  private attempt = 0;
  private stopped = false;
  private current: Promise<unknown> | null = null;
  status: SaveStatus;
  private listeners = new Set<() => void>();
  /** Test hook: overrides the network call. */
  send: (id: number, body: DesignProjectUpdate) => Promise<{ revision: number; updatedAt: string | Date }> = (id, body) => updateDesignProject(id, body);

  constructor(
    readonly projectId: number,
    revision: number,
    model: ProjectModel,
    private debounceMs = 1200,
  ) {
    this.revision = revision;
    this.savedModel = model;
    this.status = { state: "saved", at: new Date() };
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private setStatus(s: SaveStatus) {
    this.status = s;
    for (const l of this.listeners) l();
  }

  get dirty() {
    return this.pendingModel !== null || Object.keys(this.pendingMeta).length > 0 || this.inFlight;
  }

  /** Called on every committed model change. */
  modelChanged(model: ProjectModel) {
    if (model === this.savedModel && !this.pendingModel) return;
    this.pendingModel = model === this.savedModel ? null : model;
    if (this.pendingModel) writeLocalDraft(this.projectId, { baseRevision: this.revision, savedAt: new Date().toISOString(), model });
    if (this.status.state === "conflict") return;
    this.setStatus({ state: "dirty" });
    this.schedule();
  }

  /** Name / venue / client changes go through the same queue. */
  metaChanged(meta: Meta) {
    this.pendingMeta = { ...this.pendingMeta, ...meta };
    if (this.status.state === "conflict") return;
    this.setStatus({ state: "dirty" });
    this.schedule(200);
  }

  private schedule(ms = this.debounceMs) {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), ms);
  }

  /** Save now (on blur, before leaving, or from "Save now"). */
  async flush(opts: { force?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) return;
    const model = this.pendingModel;
    const meta = this.pendingMeta;
    if (!model && Object.keys(meta).length === 0) {
      if (this.status.state !== "saved" && this.status.state !== "conflict" && this.status.state !== "error") this.setStatus({ state: "saved", at: new Date() });
      return;
    }
    this.inFlight = true;
    this.pendingModel = null;
    this.pendingMeta = {};
    this.setStatus({ state: "saving" });
    try {
      const req = this.send(this.projectId, { baseRevision: this.revision, ...(opts.force ? { force: true } : {}), ...meta, ...(model ? { model: model as unknown as Record<string, unknown> } : {}) });
      this.current = req.catch(() => undefined);
      const res = await req;
      this.revision = res.revision;
      if (model) this.savedModel = model;
      this.attempt = 0;
      this.inFlight = false;
      if (this.pendingModel === null) clearLocalDraft(this.projectId);
      else writeLocalDraft(this.projectId, { baseRevision: this.revision, savedAt: new Date().toISOString(), model: this.pendingModel });
      if (this.pendingModel || Object.keys(this.pendingMeta).length) {
        this.setStatus({ state: "dirty" });
        this.schedule(300);
      } else this.setStatus({ state: "saved", at: new Date(res.updatedAt) });
    } catch (err) {
      this.inFlight = false;
      // Put the unsaved work back (newer edits made meanwhile win).
      if (model && !this.pendingModel) this.pendingModel = model;
      this.pendingMeta = { ...meta, ...this.pendingMeta };
      const e = err as { status?: number; data?: { error?: string; currentRevision?: number; updatedByName?: string | null; updatedAt?: string } };
      if (e.status === 409 && e.data?.currentRevision) {
        this.setStatus({ state: "conflict", currentRevision: e.data.currentRevision, updatedByName: e.data.updatedByName ?? null, updatedAt: e.data.updatedAt ?? "" });
        return;
      }
      if (e.status === 400 || e.status === 404 || e.status === 413) {
        this.setStatus({ state: "error", message: e.data?.error ?? (e.status === 413 ? "The design is too large to save" : "The server refused this save") });
        return;
      }
      if (e.status === 401) {
        this.setStatus({ state: "error", message: "You've been signed out. Sign in again in another tab, then press Retry." });
        return;
      }
      // Network or server error: retry with backoff.
      const delay = Math.min(30, 2 ** Math.min(this.attempt + 1, 5));
      this.attempt += 1;
      this.setStatus({ state: "offline", retryIn: delay });
      if (this.retryTimer) window.clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => void this.flush(), delay * 1000);
    }
  }

  /** After a conflict: keep my version and overwrite the newer save. */
  async overwrite() {
    this.setStatus({ state: "dirty" });
    await this.flush({ force: true });
  }

  /** Retry after an error. */
  retry() {
    this.attempt = 0;
    this.setStatus({ state: "dirty" });
    void this.flush();
  }

  /** Adopts a freshly loaded server copy (after choosing "Load theirs"). */
  reset(revision: number, model: ProjectModel) {
    this.revision = revision;
    this.savedModel = model;
    this.pendingModel = null;
    this.pendingMeta = {};
    clearLocalDraft(this.projectId);
    this.setStatus({ state: "saved", at: new Date() });
  }

  /** Leaving the editor: save what's pending (best effort), then stop. */
  async close() {
    for (let i = 0; i < 4 && !this.stopped; i++) {
      if (this.inFlight && this.current) await this.current;
      else if (this.dirty && ["dirty", "saved", "saving"].includes(this.status.state)) await this.flush();
      else break;
    }
    this.stop();
  }

  stop() {
    this.stopped = true;
    if (this.timer) window.clearTimeout(this.timer);
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }
}

/** Connects a Saver to the editor store and the page lifecycle. */
export function useAutosave(store: EditorStore | null, saver: Saver | null): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>(saver?.status ?? { state: "saved", at: new Date() });
  const last = useRef<ProjectModel | null>(null);

  useEffect(() => {
    if (!saver) return;
    setStatus(saver.status);
    const unsub = saver.subscribe(() => setStatus(saver.status));
    return () => {
      unsub();
    };
  }, [saver]);

  useEffect(() => {
    if (!store || !saver) return;
    last.current = store.getState().history.present;
    const unsub = store.subscribe(() => {
      const present = store.getState().history.present;
      if (present !== last.current) {
        last.current = present;
        saver.modelChanged(present);
      }
    });
    // Save when the app goes to the background (iPad app switch, tab hide).
    const onHide = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.dirty) {
        void saver.flush();
        e.preventDefault();
      }
    };
    const onOnline = () => {
      if (saver.status.state === "offline") saver.retry();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
    };
  }, [store, saver]);

  return status;
}
