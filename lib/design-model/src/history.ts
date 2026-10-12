// Undo / redo over immutable snapshots. Consecutive changes that share a
// coalesce key within `windowMs` (typing in one field, nudging with arrow
// keys) collapse into one undo step.

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(h: History<T>, next: T, opts: { key?: string; now?: number; windowMs?: number } = {}): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? 1200;
  if (opts.key && opts.key === h.lastKey && now - h.lastAt <= windowMs) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: opts.key ?? null, lastAt: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastAt: 0 };
}

/** Replaces the present without an undo step (e.g. loading a server copy). */
export function resetHistory<T>(present: T): History<T> {
  return createHistory(present);
}
