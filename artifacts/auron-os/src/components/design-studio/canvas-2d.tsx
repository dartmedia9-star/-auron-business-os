import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  OPENING_DEFS,
  add,
  boundsOf,
  dist,
  dot,
  findEntity,
  formatLength,
  insertVertex,
  modelBounds,
  moveVertex,
  objectFootprint,
  openingGeometry,
  projectOnSegment,
  sub,
  updateEntity,
  edgesOf,
  nearestWall,
  perp,
  normalize,
  scale,
  type Bounds,
  type ProjectModel,
  type Vec2,
} from "@workspace/design-model";
import { buildPlan, dimensionPrims, type PlanBuild, type Prim } from "./plan-primitives";
import { PlanSvg } from "./plan-svg";
import { handlesFor, hitTest, resizeRect, snapPoint, toWorld, type Handle, type Hit, type LabelGrip, type SnapResult, type View } from "./interaction";
import { textBox } from "./annotation-layout";
import { addRect, finishPolygonRoom, finishWall, placeDimension, placeLabel, placeCustomObject, placeObject, placeOpening, placePillar, translateEntity, useStore } from "./commands";
import { useEditor } from "./store";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// The 2D drawing surface. One SVG, pointer events only (touch, Apple Pencil
// and mouse share one code path), with its own pan/zoom.
//
//  - One finger / pen / mouse: the active tool. Two fingers: pinch and pan,
//    which cancels whatever the first finger had started.
//  - A tap selects. Dragging moves only something already selected, so a
//    stray swipe over a room pans the plan instead of moving the room.
//  - After the Apple Pencil is used once, fingers only pan and select; the
//    pencil draws (store.penMode).
//  - touch-action: none on the surface, so Safari's page zoom and scroll
//    never fight the drawing gestures; panels keep normal scrolling.
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };
type Pointer = { x: number; y: number; type: string };

type Gesture =
  | { kind: "none" }
  | { kind: "pending"; id: number; start: Pt; world: Vec2; hit: Hit | null; touchLike: boolean }
  | { kind: "pan"; id: number; last: Pt }
  | { kind: "pinch"; startDist: number; startScale: number; startMid: Pt; startView: View }
  | { kind: "move"; id: number; ids: string[]; startWorld: Vec2; base: ProjectModel; ref: Vec2 }
  | { kind: "handle"; id: number; handle: Handle; base: ProjectModel }
  | { kind: "opening"; id: number; openingId: string; base: ProjectModel }
  | { kind: "rect"; id: number; start: Vec2; current: Vec2 }
  | { kind: "measure"; id: number; start: Vec2 };

const TAP_PX = { touch: 10, pen: 6, mouse: 4 } as const;
const MIN_SCALE = 0.004; // 4 px per metre
const MAX_SCALE = 2; // 2 px per mm

function fitView(b: Bounds | null, w: number, h: number, insets = { right: 0, bottom: 0 }): View {
  const availW = Math.max(100, w - insets.right);
  const availH = Math.max(100, h - insets.bottom);
  if (!b || b.maxX - b.minX < 1 || b.maxY - b.minY < 1) {
    // Empty plan: 20 m across the visible area, origin near the top-left.
    const s = availW / 20000;
    return { scale: s, tx: availW * 0.1, ty: availH * 0.12 };
  }
  const pad = 40;
  const s = Math.min((availW - pad * 2) / (b.maxX - b.minX), (availH - pad * 2) / (b.maxY - b.minY));
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  return { scale, tx: availW / 2 - ((b.minX + b.maxX) / 2) * scale, ty: availH / 2 - ((b.minY + b.maxY) / 2) * scale };
}

function entityBounds(m: ProjectModel, ids: string[]): Bounds | null {
  const pts: Vec2[] = [];
  for (const id of ids) {
    const ref = findEntity(m, id);
    if (!ref) continue;
    switch (ref.kind) {
      case "room":
      case "partition":
        pts.push(...ref.entity.points);
        break;
      case "pillar":
      case "section":
      case "object":
        pts.push(...objectFootprint(ref.entity));
        break;
      case "dimension":
        pts.push(ref.entity.a, ref.entity.b);
        break;
      case "label":
        pts.push({ x: ref.entity.x, y: ref.entity.y });
        break;
      case "opening": {
        const g = openingGeometry(m, ref.entity);
        if (g) pts.push(g.a, g.b);
        break;
      }
    }
  }
  return boundsOf(pts);
}

export function Canvas2D() {
  const store = useStore();
  const model = useEditor(store, (s) => s.draft ?? s.history.present);
  const selection = useEditor(store, (s) => s.selection);
  const tool = useEditor(store, (s) => s.tool);
  const toolOptions = useEditor(store, (s) => s.toolOptions);
  const chain = useEditor(store, (s) => s.chain);
  const measure = useEditor(store, (s) => s.measure);
  const penMode = useEditor(store, (s) => s.penMode);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const [cursor, setCursor] = useState<{ world: Vec2; snap: SnapResult | null } | null>(null);
  const [rectPreview, setRectPreview] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const s = model.settings;
  const unit = s.displayUnit;
  const selectedId = selection.length === 1 ? selection[0] : null;

  // Size tracking (orientation changes, panels opening, the iPad keyboard).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // First fit once the canvas has a size.
  useEffect(() => {
    if (!view && size.w > 0 && size.h > 0) setView(fitView(modelBounds(store.model), size.w, size.h, store.occluded));
  }, [size, view, store]);

  // Block Safari's own pinch-zoom of the page while over the canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const isMouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && !e.ctrlKey);
      if (e.ctrlKey || isMouseWheel) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        setView(zoomAt(v, factor, sx, sy));
      } else {
        setView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  // Expose view controls to the toolbar and panels.
  useEffect(() => {
    store.canvas = {
      fit: () => setView(fitView(modelBounds(store.model), size.w, size.h, store.occluded)),
      zoomBy: (f) => {
        const v = viewRef.current;
        if (v) setView(zoomAt(v, f, (size.w - store.occluded.right) / 2, (size.h - store.occluded.bottom) / 2));
      },
      ensureVisible: (ids) => {
        const v = viewRef.current;
        const b = entityBounds(store.model, ids);
        if (!v || !b) return;
        const visW = size.w - store.occluded.right;
        const visH = size.h - store.occluded.bottom;
        const margin = 48;
        const sx0 = b.minX * v.scale + v.tx;
        const sx1 = b.maxX * v.scale + v.tx;
        const sy0 = b.minY * v.scale + v.ty;
        const sy1 = b.maxY * v.scale + v.ty;
        let dx = 0;
        let dy = 0;
        if (sx1 - sx0 > visW - margin * 2 || sy1 - sy0 > visH - margin * 2) {
          // Too big to fit: centre it instead.
          dx = visW / 2 - (sx0 + sx1) / 2;
          dy = visH / 2 - (sy0 + sy1) / 2;
        } else {
          if (sx0 < margin) dx = margin - sx0;
          else if (sx1 > visW - margin) dx = visW - margin - sx1;
          if (sy0 < margin) dy = margin - sy0;
          else if (sy1 > visH - margin) dy = visH - margin - sy1;
        }
        if (dx || dy) setView({ ...v, tx: v.tx + dx, ty: v.ty + dy });
      },
      centre: () => {
        const v = viewRef.current;
        if (!v) return { x: 0, y: 0 };
        return toWorld(v, (size.w - store.occluded.right) / 2, (size.h - store.occluded.bottom) / 2);
      },
      scale: () => viewRef.current?.scale ?? 0.05,
    };
    return () => {
      store.canvas = null;
    };
  }, [store, size]);

  // Label layout depends on zoom. While pinching a large plan, React may keep
  // the previous layout for a frame rather than stall the gesture.
  const layoutScale = useDeferredValue(view?.scale);
  const plan = useMemo<PlanBuild>(
    () => (layoutScale ? buildPlan(model, { pxPerMm: layoutScale, unit, selectedId }) : { prims: [], crowded: [] }),
    [model, layoutScale, unit, selectedId],
  );
  const prims = plan.prims;

  // Grip beside the selected room/section/object name, for moving the label.
  const labelGrip = useMemo<LabelGrip | null>(() => {
    if (!view || !selectedId) return null;
    const t = prims.find((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && p.owner?.id === selectedId);
    if (!t?.owner) return null;
    const [tl, tr, , bl] = textBox(t, view.scale, 0);
    const dir = normalize(sub(tr, tl));
    const p = sub({ x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 }, scale(dir, 14 / view.scale));
    return { p, base: t.owner.base, delta: sub(t.p, p) };
  }, [prims, selectedId, view?.scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const localPoint = (e: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const snapOpts = useCallback(
    (v: View, extra: Partial<Parameters<typeof snapPoint>[2]> = {}) => ({
      viewScale: v.scale,
      gridSize: s.gridSize,
      snapGrid: s.snapGrid,
      snapGeometry: s.snapGeometry,
      snapAngle: s.snapAngle,
      ...extra,
    }),
    [s.gridSize, s.snapGrid, s.snapGeometry, s.snapAngle],
  );

  const isDrawTool = tool === "room" || tool === "section" || tool === "polygon" || tool === "wall" || tool === "dimension" || tool === "measure" || tool === "pillar" || tool === "opening" || tool === "object" || tool === "label";

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    if (!v) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const lp = localPoint(e);
    pointers.current.set(e.pointerId, { ...lp, type: e.pointerType });
    if (e.pointerType === "pen") store.setPenMode(true);

    if (pointers.current.size === 2) {
      // Second finger: abandon the first finger's action, start pinch.
      if (store.getState().draft) store.setDraft(null);
      setRectPreview(null);
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", startDist: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)), startScale: v.scale, startMid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, startView: v };
      return;
    }
    if (pointers.current.size > 2) return;

    const world = toWorld(v, lp.x, lp.y);
    // Middle mouse, the pan tool, and (in pencil mode) fingers on draw tools: pan.
    const fingerInPenMode = penMode && e.pointerType === "touch";
    if (e.button === 1 || tool === "pan" || (fingerInPenMode && isDrawTool)) {
      gesture.current = { kind: "pan", id: e.pointerId, last: lp };
      return;
    }
    const touchLike = e.pointerType !== "mouse";
    const hit = tool === "select" ? hitTest(model, world, v.scale, selection, touchLike, labelGrip) : null;
    gesture.current = { kind: "pending", id: e.pointerId, start: lp, world, hit, touchLike };
  }

  function beginDrag(g: Extract<Gesture, { kind: "pending" }>, e: ReactPointerEvent<SVGSVGElement>): Gesture {
    const v = viewRef.current!;
    const fingerInPenMode = penMode && e.pointerType === "touch";
    if (tool === "room" || tool === "section") {
      const a = snapPoint(model, g.world, snapOpts(v, { touch: g.touchLike })).p;
      return { kind: "rect", id: g.id, start: a, current: a };
    }
    if (tool === "measure") {
      const a = snapPoint(model, g.world, snapOpts(v, { touch: g.touchLike, snapGrid: false })).p;
      store.setMeasure({ a, b: a });
      return { kind: "measure", id: g.id, start: a };
    }
    if (tool === "select" && g.hit && !fingerInPenMode) {
      if (g.hit.type === "handle") return { kind: "handle", id: g.id, handle: g.hit.handle, base: model };
      const hitId = g.hit.id;
      if (selection.includes(hitId)) {
        const ent = findEntity(model, hitId)?.entity as { locked?: boolean } | undefined;
        if (ent?.locked) return { kind: "pan", id: g.id, last: g.start };
        if (g.hit.kind === "opening") return { kind: "opening", id: g.id, openingId: hitId, base: model };
        return { kind: "move", id: g.id, ids: selection, startWorld: g.world, base: model, ref: refPoint(model, hitId) ?? g.world };
      }
    }
    return { kind: "pan", id: g.id, last: g.start };
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    if (!v) return;
    const lp = localPoint(e);
    const known = pointers.current.get(e.pointerId);
    if (known) pointers.current.set(e.pointerId, { ...lp, type: e.pointerType });
    const world = toWorld(v, lp.x, lp.y);

    // Hover feedback for mouse and pen-hover; live preview for chain tools.
    if (!known) {
      if (e.pointerType === "mouse" || e.pointerType === "pen") {
        if (tool === "select") {
          const h = hitTest(model, world, v.scale, selection, false, labelGrip);
          setHover(h && h.type === "entity" ? h.id : null);
        }
        updateCursor(world, v, e.pointerType !== "mouse");
      }
      return;
    }

    let g = gesture.current;
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [p1, p2] = pts;
      const d = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
      const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const sv = g.startView;
      const scale = clampScale((sv.scale * d) / g.startDist);
      // Keep the plan point under the starting midpoint under the fingers.
      const wx = (g.startMid.x - sv.tx) / sv.scale;
      const wy = (g.startMid.y - sv.ty) / sv.scale;
      setView({ scale, tx: m.x - wx * scale, ty: m.y - wy * scale });
      return;
    }
    if (g.kind === "pending") {
      if (g.id !== e.pointerId) return;
      const moved = Math.hypot(lp.x - g.start.x, lp.y - g.start.y);
      const threshold = TAP_PX[e.pointerType as keyof typeof TAP_PX] ?? 6;
      if (moved < threshold) {
        if (tool === "polygon" || tool === "wall" || tool === "dimension") updateCursor(world, v, g.touchLike);
        return;
      }
      g = beginDrag(g, e);
      gesture.current = g;
    }
    if ("id" in g && g.id !== e.pointerId) return;

    switch (g.kind) {
      case "pan": {
        setView({ ...v, tx: v.tx + lp.x - g.last.x, ty: v.ty + lp.y - g.last.y });
        gesture.current = { ...g, last: lp };
        break;
      }
      case "rect": {
        const b = snapPoint(model, world, snapOpts(v, { touch: e.pointerType !== "mouse" })).p;
        gesture.current = { ...g, current: b };
        setRectPreview({ a: g.start, b });
        break;
      }
      case "measure": {
        const b = snapPoint(model, world, snapOpts(v, { touch: e.pointerType !== "mouse", snapGrid: false })).p;
        store.setMeasure({ a: g.start, b });
        break;
      }
      case "move": {
        const delta = sub(world, g.startWorld);
        const target = add(g.ref, delta);
        const snapped = snapPoint(g.base, target, snapOpts(v, { exclude: new Set(g.ids), touch: e.pointerType !== "mouse", snapAngle: false }));
        const d = sub(snapped.p, g.ref);
        let m = g.base;
        for (const id of g.ids) {
          const ent = findEntity(m, id)?.entity as { locked?: boolean } | undefined;
          if (!ent?.locked) m = translateEntity(m, id, d.x, d.y);
        }
        store.setDraft(m);
        setCursor({ world: snapped.p, snap: snapped });
        break;
      }
      case "opening": {
        const o = g.base.openings.find((x) => x.id === g.openingId);
        if (!o) break;
        const geo = openingGeometry(g.base, o);
        const tol = (e.pointerType === "mouse" ? 30 : 50) / v.scale;
        const near = nearestWall(g.base, world, Math.max(tol, (geo?.thickness ?? 0) * 2));
        if (!near) break;
        const step = s.snapGrid ? 50 : 1;
        const width = Math.min(o.width, near.edgeLength);
        const offset = Math.max(0, Math.min(near.edgeLength - width, Math.round((near.offset - width / 2) / step) * step));
        store.setDraft(updateEntity(g.base, o.id, { hostId: near.hostId, startVertexId: near.startVertexId, offset }));
        break;
      }
      case "handle":
        applyHandle(g, world, v, e.pointerType !== "mouse");
        break;
    }
  }

  function applyHandle(g: Extract<Gesture, { kind: "handle" }>, world: Vec2, v: View, touch: boolean) {
    const h = g.handle;
    const base = g.base;
    if (h.type === "vertex") {
      const ref = findEntity(base, h.hostId);
      if (!ref || (ref.kind !== "room" && ref.kind !== "partition")) return;
      const pts = ref.entity.points;
      const i = pts.findIndex((p) => p.id === h.vertexId);
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const snap = snapPoint(base, world, snapOpts(v, { excludeVertex: h.vertexId, touch, from: i > 0 || ref.kind === "room" ? prev : null }));
      // Also square to the next neighbour when angle snap is on.
      let p = snap.p;
      if (snap.kind !== "vertex" && s.snapAngle) {
        const nextP = pts[(i + 1) % pts.length];
        if (Math.abs(p.x - nextP.x) < 12 / v.scale) p = { ...p, x: nextP.x };
        if (Math.abs(p.y - nextP.y) < 12 / v.scale) p = { ...p, y: nextP.y };
        if (Math.abs(p.x - prev.x) < 12 / v.scale) p = { ...p, x: prev.x };
        if (Math.abs(p.y - prev.y) < 12 / v.scale) p = { ...p, y: prev.y };
      }
      store.setDraft(updateEntity(base, h.hostId, { points: moveVertex(pts, h.vertexId, p) }));
      setCursor({ world: p, snap });
      return;
    }
    if (h.type === "edgeMid") {
      // Dragging the + on a wall inserts a corner there and moves it.
      const ref = findEntity(base, h.hostId);
      if (!ref || (ref.kind !== "room" && ref.kind !== "partition")) return;
      const ins = insertVertex(ref.entity.points, h.edgeIndex, h.p);
      const withVertex = updateEntity(base, h.hostId, { points: ins.points });
      // Openings that were further along the split wall move to the new wall.
      const a = ref.entity.points[h.edgeIndex];
      const splitAt = dist(a, h.p);
      const reHosted = {
        ...withVertex,
        openings: withVertex.openings.map((o) => (o.hostId === h.hostId && o.startVertexId === a.id && o.offset >= splitAt ? { ...o, startVertexId: ins.vertexId, offset: Math.round((o.offset - splitAt) * 10) / 10 } : o)),
      };
      gesture.current = { kind: "handle", id: (gesture.current as { id: number }).id, handle: { type: "vertex", hostId: h.hostId, vertexId: ins.vertexId, p: h.p }, base: reHosted };
      store.setDraft(updateEntity(reHosted, h.hostId, { points: moveVertex(ins.points, ins.vertexId, world) }));
      return;
    }
    if (h.type === "resize") {
      const ent = findEntity(base, h.id)?.entity as { x: number; y: number; width: number; depth: number; rotation: number; shape?: string } | undefined;
      if (!ent) return;
      const snap = snapPoint(base, world, snapOpts(v, { exclude: new Set([h.id]), touch }));
      let next = resizeRect(ent, h.corner, snap.p);
      if (ent.shape === "round") {
        const dmt = Math.max(next.width, next.depth);
        next = { ...next, width: dmt, depth: dmt };
      }
      store.setDraft(updateEntity(base, h.id, next));
      setCursor({ world: snap.p, snap });
      return;
    }
    if (h.type === "rotate") {
      const ent = findEntity(base, h.id)?.entity as { x: number; y: number } | undefined;
      if (!ent) return;
      let deg = (Math.atan2(world.y - ent.y, world.x - ent.x) * 180) / Math.PI + 90;
      deg = s.snapAngle ? Math.round(deg / 15) * 15 : Math.round(deg);
      deg = ((deg % 360) + 360) % 360;
      store.setDraft(updateEntity(base, h.id, { rotation: deg > 180 ? deg - 360 : deg }));
      return;
    }
    if (h.type === "dimEnd") {
      const snap = snapPoint(base, world, snapOpts(v, { touch, snapGrid: false }));
      store.setDraft(updateEntity(base, h.id, { [h.which]: snap.p }));
      setCursor({ world: snap.p, snap });
      return;
    }
    if (h.type === "label") {
      const p = add(world, h.delta);
      const off = { x: Math.round((p.x - h.base.x) / 10) * 10, y: Math.round((p.y - h.base.y) / 10) * 10 };
      // (0, 0) means "automatic", so a label dropped exactly on its anchor stays put by 1 mm.
      store.setDraft(updateEntity(base, h.id, { labelOffset: off.x === 0 && off.y === 0 ? { x: 1, y: 0 } : off }));
      return;
    }
    if (h.type === "dimOffset") {
      const d = base.dimensions.find((x) => x.id === h.id);
      if (!d) return;
      const n = perp(normalize(sub(d.b, d.a)));
      const off = dot(sub(world, d.a), n);
      store.setDraft(updateEntity(base, h.id, { offset: Math.round(off / 10) * 10 }));
    }
  }

  function updateCursor(world: Vec2, v: View, touch: boolean) {
    if (tool === "polygon" || tool === "wall" || tool === "dimension" || tool === "pillar" || tool === "room" || tool === "section") {
      const from = tool === "dimension" ? (store.getState().measure?.a ?? null) : chain.length ? chain[chain.length - 1] : null;
      const snap = snapPoint(model, world, snapOpts(v, { from, touch }));
      setCursor({ world: snap.p, snap });
    } else if (cursor) setCursor(null);
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    const had = pointers.current.delete(e.pointerId);
    if (!had || !v) return;
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) gesture.current = { kind: "none" };
      return;
    }
    if ("id" in g && g.id !== e.pointerId) return;
    gesture.current = { kind: "none" };
    const lp = localPoint(e);
    const world = toWorld(v, lp.x, lp.y);
    const touch = e.pointerType !== "mouse";

    switch (g.kind) {
      case "pending":
        onTap(g, world, v, touch, e.pointerType === "touch" && penMode);
        break;
      case "rect": {
        setRectPreview(null);
        const id = addRect(store, g.start, g.current, tool === "room" ? "room" : "section", toolOptions.sectionKind);
        if (id) store.setTool("select");
        break;
      }
      case "measure":
        break;
      case "move":
      case "handle":
      case "opening":
        store.endDraft();
        setCursor(null);
        break;
      default:
        break;
    }
  }

  function onPointerCancel(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (store.getState().draft) store.setDraft(null);
      setRectPreview(null);
      gesture.current = { kind: "none" };
    }
  }

  function onTap(g: Extract<Gesture, { kind: "pending" }>, world: Vec2, v: View, touch: boolean, fingerInPenMode: boolean) {
    const snapped = () => snapPoint(model, world, snapOpts(v, { touch, from: chain.length ? chain[chain.length - 1] : null })).p;
    if (fingerInPenMode && tool !== "select") {
      // In pencil mode a finger tap selects instead of drawing.
      const h = hitTest(model, world, v.scale, selection, true, labelGrip);
      store.select(h && h.type === "entity" ? [h.id] : []);
      return;
    }
    switch (tool) {
      case "select": {
        const h = g.hit;
        if (!h) {
          store.select([]);
          return;
        }
        if (h.type === "handle") {
          if (h.handle.type === "edgeMid") {
            // Tap on + : insert a corner in the middle of that wall.
            const ref = findEntity(model, h.handle.hostId);
            if (ref && (ref.kind === "room" || ref.kind === "partition")) {
              const ins = insertVertex(ref.entity.points, h.handle.edgeIndex, h.handle.p);
              store.commit(updateEntity(model, h.handle.hostId, { points: ins.points }));
            }
          }
          return;
        }
        store.select([h.id], h.edgeIndex != null && (h.kind === "room" || h.kind === "partition") ? { hostId: h.id, index: h.edgeIndex } : null);
        return;
      }
      case "polygon":
      case "wall": {
        const p = snapped();
        if (tool === "polygon" && chain.length >= 3 && dist(p, chain[0]) <= (touch ? 24 : 12) / v.scale) {
          finishPolygonRoom(store, chain);
          setCursor(null);
          return;
        }
        if (chain.length && dist(p, chain[chain.length - 1]) < 1) {
          // Tapping the last point again finishes.
          if (tool === "wall") finishWall(store, chain);
          else finishPolygonRoom(store, chain);
          setCursor(null);
          return;
        }
        store.setChain([...chain, p]);
        return;
      }
      case "pillar":
        placePillar(store, snapPoint(model, world, snapOpts(v, { touch })).p);
        return;
      case "opening": {
        const id = placeOpening(store, world, toolOptions.openingKind, (touch ? 40 : 20) / v.scale + 300);
        if (!id) toast({ title: `Tap on a wall to place the ${OPENING_DEFS[toolOptions.openingKind].label.toLowerCase()}` });
        return;
      }
      case "object": {
        const at = snapPoint(model, world, snapOpts(v, { touch })).p;
        if (toolOptions.custom) placeCustomObject(store, toolOptions.custom, at);
        else placeObject(store, toolOptions.objectType, at);
        store.setTool("select");
        return;
      }
      case "label":
        placeLabel(store, world);
        store.setTool("select");
        return;
      case "dimension": {
        const p = snapPoint(model, world, snapOpts(v, { touch, snapGrid: false, from: store.getState().measure?.a ?? null })).p;
        const m = store.getState().measure;
        if (!m) store.setMeasure({ a: p, b: null });
        else {
          store.setMeasure(null);
          if (placeDimension(store, m.a, p)) store.setTool("select");
        }
        return;
      }
      case "measure": {
        const p = snapPoint(model, world, snapOpts(v, { touch, snapGrid: false })).p;
        const m = store.getState().measure;
        if (!m || m.b) store.setMeasure({ a: p, b: null });
        else store.setMeasure({ a: m.a, b: p });
        return;
      }
      case "room":
      case "section":
        toast({ title: "Drag to draw the rectangle", description: "Or use “Add room” to type exact sizes." });
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------- render
  if (!view) {
    return <div ref={wrapRef} className="plan-surface relative h-full w-full touch-none" />;
  }

  const px = (n: number) => n / view.scale;
  const transform = `translate(${view.tx} ${view.ty}) scale(${view.scale})`;
  const handles = selectedId && selection.length === 1 ? handlesFor(model, selectedId, view.scale, labelGrip) : [];
  const selectionOutline = selection.map((id) => outlineFor(model, id)).filter(Boolean) as Vec2[][];
  const hoverOutline = hover && !selection.includes(hover) ? outlineFor(model, hover) : null;

  // Grid as a screen-space pattern (cheap at any zoom).
  let gridStep = s.gridSize * view.scale;
  let gridMult = 1;
  while (gridStep * gridMult < 12) gridMult *= 2;
  gridStep *= gridMult;
  const major = gridStep * 5;
  const gx = ((view.tx % major) + major) % major;
  const gy = ((view.ty % major) + major) % major;

  // Live previews.
  const previews: Prim[] = [];
  const previewDims = (a: Vec2, b: Vec2, normal: Vec2) => previews.push(...dimensionPrims({ key: "p", entityId: null, kind: "user", a, b, normal, offset: px(22), value: dist(a, b) }, { pxPerMm: view.scale, unit }));
  let rubber: Vec2[] | null = null;
  if (rectPreview) {
    const { a, b } = rectPreview;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    rubber = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];
    previewDims({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: 0, y: -1 });
    previewDims({ x: x0, y: y1 }, { x: x0, y: y0 }, { x: -1, y: 0 });
  }
  if ((tool === "polygon" || tool === "wall") && chain.length) {
    const pts = cursor ? [...chain, cursor.world] : chain;
    rubber = pts;
    const last = chain[chain.length - 1];
    if (cursor && dist(last, cursor.world) > 1) previewDims(last, cursor.world, perp(normalize(sub(cursor.world, last))));
  }
  const m = measure;
  if (m) {
    const b = m.b ?? (tool === "dimension" || tool === "measure" ? cursor?.world ?? null : null);
    if (b && dist(m.a, b) > 1) {
      previews.push(...dimensionPrims({ key: "m", entityId: null, kind: "user", a: m.a, b, normal: perp(normalize(sub(b, m.a))), offset: tool === "dimension" ? px(30) : 0, value: dist(m.a, b) }, { pxPerMm: view.scale, unit }));
    }
  }

  return (
    <div ref={wrapRef} className="plan-surface relative h-full w-full touch-none select-none overflow-hidden" data-testid="plan-canvas">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block h-full w-full"
        style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? (hover ? "pointer" : "default") : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(e) => {
          if (!pointers.current.has(e.pointerId)) {
            setHover(null);
            if (e.pointerType === "mouse") setCursor(null);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Floor plan drawing canvas"
      >
        {s.showGrid && (
          <>
            <defs>
              <pattern id="plan-grid-minor" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={gx} y={gy}>
                <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" style={{ stroke: "var(--plan-grid)" }} strokeWidth={1} />
              </pattern>
              <pattern id="plan-grid-major" width={major} height={major} patternUnits="userSpaceOnUse" x={gx} y={gy}>
                <rect width={major} height={major} fill="url(#plan-grid-minor)" />
                <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" style={{ stroke: "var(--plan-grid-major)" }} strokeWidth={1} />
              </pattern>
            </defs>
            <rect width={size.w} height={size.h} fill="url(#plan-grid-major)" />
          </>
        )}
        <g transform={transform}>
          <PlanSvg prims={prims} scale={view.scale} />
          {hoverOutline && <path d={pathD(hoverOutline)} style={{ fill: "none", stroke: "var(--plan-select)", strokeWidth: px(1.5), strokeOpacity: 0.5 }} />}
          {selectionOutline.map((pts, i) => (
            <path key={i} d={pathD(pts)} style={{ fill: "var(--plan-select)", fillOpacity: 0.06, stroke: "var(--plan-select)", strokeWidth: px(2) }} />
          ))}
          {selectedId && <FocusEdge model={model} px={px} />}
          {rubber && <path d={rubber.length ? `M${rubber.map((p) => `${p.x},${p.y}`).join("L")}` : ""} style={{ fill: "none", stroke: "var(--plan-select)", strokeWidth: px(2), strokeDasharray: `${px(6)} ${px(4)}` }} />}
          {(tool === "polygon" || tool === "wall") && chain.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={px(i === 0 && tool === "polygon" ? 7 : 4)} style={{ fill: i === 0 && tool === "polygon" ? "var(--plan-floor)" : "var(--plan-select)", stroke: "var(--plan-select)", strokeWidth: px(2) }} />)}
          <PlanSvg prims={previews} scale={view.scale} />
          {m && <circle cx={m.a.x} cy={m.a.y} r={px(4)} style={{ fill: "var(--plan-dim)" }} />}
          {handles.map((h, i) => (
            <HandleMark key={i} h={h} px={px} />
          ))}
          {cursor?.snap?.kind === "vertex" && <rect x={cursor.world.x - px(7)} y={cursor.world.y - px(7)} width={px(14)} height={px(14)} style={{ fill: "none", stroke: "var(--plan-snap)", strokeWidth: px(2) }} />}
          {cursor?.snap?.kind === "edge" && <circle cx={cursor.world.x} cy={cursor.world.y} r={px(6)} style={{ fill: "none", stroke: "var(--plan-snap)", strokeWidth: px(2) }} />}
          {cursor && (tool === "polygon" || tool === "wall" || tool === "pillar" || tool === "dimension") && cursor.snap?.kind !== "vertex" && (
            <g style={{ stroke: "var(--plan-select)", strokeWidth: px(1.2) }}>
              <line x1={cursor.world.x - px(8)} y1={cursor.world.y} x2={cursor.world.x + px(8)} y2={cursor.world.y} />
              <line x1={cursor.world.x} y1={cursor.world.y - px(8)} x2={cursor.world.x} y2={cursor.world.y + px(8)} />
            </g>
          )}
        </g>
      </svg>
      <ScaleBar scale={view.scale} unit={unit} />
      {plan.crowded.length > 0 && (
        <button
          type="button"
          data-testid="crowded-labels"
          className="absolute bottom-3 left-[9.5rem] flex min-h-9 items-center rounded-md border border-amber-500/40 bg-[var(--plan-floor)]/90 px-2.5 text-[11px] font-medium text-amber-700 shadow-sm dark:text-amber-300"
          onClick={() => {
            const id = plan.crowded.find((c) => c.entityId)?.entityId;
            if (id) store.select([id]);
          }}
        >
          {plan.crowded.length === 1 ? "1 label is crowded" : `${plan.crowded.length} labels are crowded`} at this zoom
        </button>
      )}
    </div>
  );
}

function clampScale(s: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(v.scale * factor);
  const wx = (sx - v.tx) / v.scale;
  const wy = (sy - v.ty) / v.scale;
  return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
}

function refPoint(m: ProjectModel, id: string): Vec2 | null {
  const ref = findEntity(m, id);
  if (!ref) return null;
  switch (ref.kind) {
    case "room":
    case "partition":
      return { x: ref.entity.points[0].x, y: ref.entity.points[0].y };
    case "section":
    case "object":
    case "pillar":
      // Rotation 0: the top-left corner snaps (lines up with walls); otherwise the centre.
      return ref.entity.rotation === 0 && ref.kind !== "pillar" ? objectFootprint(ref.entity)[0] : { x: ref.entity.x, y: ref.entity.y };
    case "label":
      return { x: ref.entity.x, y: ref.entity.y };
    case "dimension":
      return ref.entity.a;
    default:
      return null;
  }
}

function outlineFor(m: ProjectModel, id: string): Vec2[] | null {
  const ref = findEntity(m, id);
  if (!ref) return null;
  switch (ref.kind) {
    case "room":
      return [...ref.entity.points, ref.entity.points[0]];
    case "partition":
      return ref.entity.points;
    case "section":
    case "object":
    case "pillar": {
      const pts = objectFootprint(ref.entity);
      return [...pts, pts[0]];
    }
    case "opening": {
      const g = openingGeometry(m, ref.entity);
      if (!g) return null;
      const inner = g.hostKind === "room" ? 0 : -g.thickness / 2;
      const outer = g.hostKind === "room" ? g.thickness : g.thickness / 2;
      const n = g.normal;
      const p = (q: Vec2, d: number) => ({ x: q.x + n.x * d, y: q.y + n.y * d });
      return [p(g.a, inner), p(g.b, inner), p(g.b, outer), p(g.a, outer), p(g.a, inner)];
    }
    case "dimension": {
      const d = ref.entity;
      const n = perp(normalize(sub(d.b, d.a)));
      const q = (p: Vec2) => ({ x: p.x + n.x * d.offset, y: p.y + n.y * d.offset });
      return [d.a, q(d.a), q(d.b), d.b];
    }
    case "label": {
      const s = 300;
      return [{ x: ref.entity.x - s, y: ref.entity.y - s / 2 }, { x: ref.entity.x + s, y: ref.entity.y - s / 2 }, { x: ref.entity.x + s, y: ref.entity.y + s / 2 }, { x: ref.entity.x - s, y: ref.entity.y + s / 2 }, { x: ref.entity.x - s, y: ref.entity.y - s / 2 }];
    }
  }
}

const pathD = (pts: Vec2[]) => `M${pts.map((p) => `${p.x},${p.y}`).join("L")}`;

/** Highlights the wall whose length is being edited in the panel. */
function FocusEdge({ model, px }: { model: ProjectModel; px: (n: number) => number }) {
  const store = useStore();
  const focus = useEditor(store, (s) => s.focusEdge);
  if (!focus) return null;
  const ref = findEntity(model, focus.hostId);
  if (!ref || (ref.kind !== "room" && ref.kind !== "partition")) return null;
  const e = edgesOf(ref.entity.points, ref.kind === "room")[focus.index];
  if (!e) return null;
  return <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} style={{ stroke: "var(--plan-select)", strokeWidth: px(6), strokeOpacity: 0.45, strokeLinecap: "round" }} />;
}

function HandleMark({ h, px }: { h: Handle; px: (n: number) => number }) {
  if (h.type === "edgeMid") {
    return (
      <g>
        <circle cx={h.p.x} cy={h.p.y} r={px(8)} style={{ fill: "var(--plan-floor)", stroke: "var(--plan-select)", strokeWidth: px(1.5), strokeOpacity: 0.8 }} />
        <path d={`M${h.p.x - px(4)},${h.p.y}H${h.p.x + px(4)}M${h.p.x},${h.p.y - px(4)}V${h.p.y + px(4)}`} style={{ stroke: "var(--plan-select)", strokeWidth: px(1.5) }} />
      </g>
    );
  }
  if (h.type === "rotate") {
    return (
      <g>
        <line x1={h.anchor.x} y1={h.anchor.y} x2={h.p.x} y2={h.p.y} style={{ stroke: "var(--plan-select)", strokeWidth: px(1.2) }} />
        <circle cx={h.p.x} cy={h.p.y} r={px(10)} style={{ fill: "var(--plan-select)", stroke: "var(--plan-floor)", strokeWidth: px(2) }} />
        <path d={`M${h.p.x - px(4)},${h.p.y + px(1)}A${px(4)},${px(4)} 0 1 1 ${h.p.x + px(1)},${h.p.y + px(4)}`} style={{ fill: "none", stroke: "var(--plan-floor)", strokeWidth: px(1.6) }} />
      </g>
    );
  }
  if (h.type === "label") {
    // A small four-way "move" grip.
    const a = px(4.5);
    const { x, y } = h.p;
    return (
      <g data-testid="label-grip">
        <circle cx={x} cy={y} r={px(9)} style={{ fill: "var(--plan-floor)", stroke: "var(--plan-select)", strokeWidth: px(1.5), strokeDasharray: `${px(2.5)} ${px(2)}` }} />
        <path d={`M${x - a},${y}H${x + a}M${x},${y - a}V${y + a}`} style={{ stroke: "var(--plan-select)", strokeWidth: px(1.5), strokeLinecap: "round" }} />
      </g>
    );
  }
  const r = h.type === "dimOffset" ? 7 : 9;
  return <circle cx={h.p.x} cy={h.p.y} r={px(r)} style={{ fill: "var(--plan-floor)", stroke: "var(--plan-select)", strokeWidth: px(2.5) }} />;
}

/** A scale bar with a round length, bottom-left. */
function ScaleBar({ scale, unit }: { scale: number; unit: ProjectModel["settings"]["displayUnit"] }) {
  const targetPx = 110;
  const steps = unit === "ft" ? [304.8, 609.6, 1524, 3048, 6096, 15240, 30480, 60960, 152400] : [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const mm = steps.find((s) => s * scale >= targetPx * 0.6) ?? steps[steps.length - 1];
  const w = mm * scale;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-[var(--plan-floor)]/80 px-2 py-1 text-[11px] font-medium tabular-nums text-[var(--plan-text)] shadow-sm" aria-hidden>
      <div className="mb-0.5">{formatLength(mm, unit)}</div>
      <div className="h-1.5 border-x-2 border-b-2 border-[var(--plan-text)]" style={{ width: w }} />
    </div>
  );
}

