import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from "react";
import { arcThrough, formatLength, referenceBounds, sketchSnapPoints, type CustomPart, type DisplayUnit, type ReferenceImage, type Sketch, type SketchPoint, type SketchShape } from "@workspace/design-model";
import { dragHandle, eraseHits, hitSketch, moveShape, newSketchId, polyLength, removeHits, shapeHandles, shapePoints, sketchBounds, snapSketch, type Bounds, type SketchHit } from "./builder-sketch";

// The Custom Builder's drawing surface (SVG). One finger, the Pencil or the
// mouse draws with the current tool; two fingers always pan and zoom and
// cancel whatever was being drawn, so a pinch never leaves stray geometry.
// After the Pencil is used, fingers only pan ("Pencil mode").

export type BuilderTool = "select" | "pan" | "rect" | "line" | "polyline" | "polygon" | "circle" | "arc" | "freehand" | "eraser" | "dimension" | "text";

type View = { scale: number; tx: number; ty: number };
type Pointer = { x: number; y: number; type: string };

type Draft =
  | { kind: "two"; tool: "rect" | "line" | "circle" | "dimension"; a: SketchPoint; b: SketchPoint; dragging: boolean }
  | { kind: "chain"; tool: "polyline" | "polygon"; points: SketchPoint[]; cursor: SketchPoint | null }
  | { kind: "arc"; points: SketchPoint[]; cursor: SketchPoint | null }
  | { kind: "stroke"; points: SketchPoint[] }
  | null;

type Gesture =
  | { kind: "none" }
  | { kind: "pinch"; startDist: number; startMid: { x: number; y: number }; startView: View }
  | { kind: "pan"; id: number; last: { x: number; y: number } }
  | { kind: "pending"; id: number; start: { x: number; y: number }; world: SketchPoint; hit: SketchHit | null; handle: string | null }
  | { kind: "move"; id: number; start: SketchPoint; base: SketchShape }
  | { kind: "handle"; id: number; key: string; base: SketchShape }
  | { kind: "draw"; id: number }
  | { kind: "erase"; id: number; last: SketchPoint }
  | { kind: "refmove"; id: number; start: SketchPoint; base: ReferenceImage }
  | { kind: "caltap"; id: number; start: { x: number; y: number }; world: SketchPoint };

const TAP_PX = { touch: 10, pen: 6, mouse: 4 } as const;
const MIN_SCALE = 0.004;
const MAX_SCALE = 4;
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
const HANDLE_PX = 9;

export type BuilderCanvasHandle = { fit: () => void; zoom: (f: number) => void; finish: () => void; cancel: () => void; undoPoint: () => void };

export type BuilderCanvasProps = {
  sketch: Sketch;
  /** Commit a change (one undo step). */
  onChange: (next: Sketch) => void;
  tool: BuilderTool;
  selected: SketchHit | null;
  onSelect: (hit: SketchHit | null) => void;
  grid: number | null;
  snapPoints: boolean;
  penMode: boolean;
  onPenDetected: () => void;
  unit: DisplayUnit;
  onRequestText: (p: SketchPoint) => void;
  /** Lets the parent show Finish / Undo point for multi-tap tools. */
  onDraftState: (state: { active: boolean; points: number; tool: BuilderTool | null }) => void;
  /** Assembly parts, drawn read-only as a front elevation (floor at y = 0) so the drawing matches the 3D. */
  parts?: CustomPart[];
  /** Reference picture behind the drawing, with the image's pixel size. */
  reference?: { ref: ReferenceImage; href: string; width: number; height: number } | null;
  /** move: one finger / Pencil drags the picture; calibrate: taps pick the two calibration points. */
  refMode?: "move" | "calibrate" | null;
  onReferenceChange?: (r: ReferenceImage) => void;
  calibrationPoints?: SketchPoint[];
  onCalibrationTap?: (p: SketchPoint) => void;
};

type RefShown = NonNullable<BuilderCanvasProps["reference"]>;

function withReference(b: Bounds | null, r: RefShown | null | undefined): Bounds | null {
  if (!r || r.ref.hidden) return b;
  const e = referenceBounds(r.ref, r.width, r.height);
  if (!b) return e;
  return { minX: Math.min(b.minX, e.minX), minY: Math.min(b.minY, e.minY), maxX: Math.max(b.maxX, e.maxX), maxY: Math.max(b.maxY, e.maxY) };
}

/** A part's outline in front view, in drawing coordinates (y down, floor at 0). */
export function partElevation(p: CustomPart): { x: number; y: number; w: number; h: number } {
  return { x: p.x - p.w / 2, y: -(p.y + p.h), w: p.w, h: p.h };
}

function withParts(b: Bounds | null, parts: CustomPart[] | undefined): Bounds | null {
  if (!parts?.length) return b;
  let out = b ? { ...b } : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of parts) {
    const e = partElevation(p);
    out = { minX: Math.min(out.minX, e.x), minY: Math.min(out.minY, e.y), maxX: Math.max(out.maxX, e.x + e.w), maxY: Math.max(out.maxY, e.y + e.h) };
  }
  return out;
}

function fitView(b: Bounds | null, w: number, h: number): View {
  const box = b ?? { minX: 0, minY: 0, maxX: 3000, maxY: 2400 };
  const bw = Math.max(box.maxX - box.minX, 500);
  const bh = Math.max(box.maxY - box.minY, 500);
  const scale = clampScale(Math.min((w - 80) / bw, (h - 80) / bh));
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
}

export const BuilderCanvas = forwardRef<BuilderCanvasHandle, BuilderCanvasProps>(function BuilderCanvas(props, ref) {
  const { sketch, onChange, tool, selected, onSelect, grid, snapPoints, penMode, onPenDetected, unit, onRequestText, onDraftState, parts, reference, refMode, onReferenceChange, calibrationPoints, onCalibrationTap } = props;
  const [refPreview, setRefPreviewState] = useState<ReferenceImage | null>(null);
  // Read on pointer-up, which can come before React re-renders after the last move.
  const refPreviewRef = useRef<ReferenceImage | null>(null);
  const setRefPreview = (r: ReferenceImage | null) => {
    refPreviewRef.current = r;
    setRefPreviewState(r);
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const [draft, setDraftState] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);
  const setDraft = (d: Draft) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const [preview, setPreview] = useState<SketchShape | null>(null);
  const [cursor, setCursor] = useState<{ p: SketchPoint; kind: string } | null>(null);
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const snapCache = useMemo(() => (snapPoints ? sketchSnapPoints(sketch) : []), [sketch, snapPoints]);

  // Size and first fit.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      if (!viewRef.current && r.width > 0) setView(fitView(withReference(withParts(sketchBounds(sketch), parts), reference), r.width, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changing tool abandons a half-drawn shape.
  useEffect(() => {
    setDraft(null);
    setPreview(null);
    gesture.current = { kind: "none" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    const d = draft;
    onDraftState({ active: !!d, points: d?.kind === "chain" || d?.kind === "arc" ? d.points.length : 0, tool: d ? tool : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tool]);

  const toWorld = (v: View, x: number, y: number): SketchPoint => ({ x: (x - v.tx) / v.scale, y: (y - v.ty) / v.scale });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snap = (v: View, p: SketchPoint, touch: boolean, from: SketchPoint | null = null, exclude?: string) =>
    snapSketch(sketch, p, { grid, points: snapPoints, tol: (touch ? 22 : 12) / v.scale, from, exclude }, exclude ? undefined : snapCache);

  const commitShape = (s: SketchShape) => {
    onChange({ ...sketch, shapes: [...sketch.shapes, s] });
    onSelect({ kind: "shape", id: s.id });
  };

  const finishChain = useCallback(
    (close: boolean) => {
      const d = draftRef.current;
      if (d?.kind !== "chain") return;
      const pts = d.points;
      setDraft(null);
      if (close && pts.length >= 3) commitShape({ kind: "poly", id: newSketchId(), points: pts, closed: true });
      else if (pts.length >= 2) commitShape({ kind: "poly", id: newSketchId(), points: pts, closed: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sketch],
  );

  useImperativeHandle(ref, () => ({
    fit: () => setView(fitView(withReference(withParts(sketchBounds(sketch), parts), reference), size.w, size.h)),
    zoom: (f: number) => setView((v) => (v ? zoomAt(v, f, size.w / 2, size.h / 2) : v)),
    finish: () => finishChain(draftRef.current?.kind === "chain" && draftRef.current.tool === "polygon"),
    cancel: () => setDraft(null),
    undoPoint: () => {
      const d = draftRef.current;
      if ((d?.kind === "chain" || d?.kind === "arc") && d.points.length > 0) setDraft(d.points.length === 1 ? null : { ...d, points: d.points.slice(0, -1) });
    },
  }));

  const drawTool = tool !== "select" && tool !== "pan";

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    if (!v) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer may already be gone (fast taps) */
    }
    const lp = local(e);
    pointers.current.set(e.pointerId, { ...lp, type: e.pointerType });
    if (e.pointerType === "pen" && !penMode) onPenDetected();

    if (pointers.current.size === 2) {
      // A second finger: this is a pan/zoom, never drawing. Drop the stroke or drag in progress.
      const d = draftRef.current;
      if (d && (d.kind === "stroke" || (d.kind === "two" && d.dragging))) setDraft(null);
      setPreview(null);
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", startDist: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)), startMid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, startView: v };
      return;
    }
    if (pointers.current.size > 2) return;

    const world = toWorld(v, lp.x, lp.y);
    const touch = e.pointerType !== "mouse";
    const fingerInPenMode = penMode && e.pointerType === "touch";
    if (refMode && reference && e.button !== 1 && !fingerInPenMode) {
      if (refMode === "move" && !reference.ref.locked) gesture.current = { kind: "refmove", id: e.pointerId, start: world, base: reference.ref };
      else if (refMode === "calibrate") gesture.current = { kind: "caltap", id: e.pointerId, start: lp, world };
      else gesture.current = { kind: "pan", id: e.pointerId, last: lp };
      return;
    }
    if (e.button === 1 || tool === "pan" || (fingerInPenMode && drawTool) || (refMode && fingerInPenMode)) {
      gesture.current = { kind: "pan", id: e.pointerId, last: lp };
      return;
    }

    if (tool === "freehand") {
      setDraft({ kind: "stroke", points: [{ x: world.x, y: world.y }] });
      gesture.current = { kind: "draw", id: e.pointerId };
      return;
    }
    if (tool === "eraser") {
      const hits = eraseHits(sketch, world, world, (touch ? 18 : 8) / v.scale);
      if (hits.length) onChange(removeHits(sketch, hits));
      gesture.current = { kind: "erase", id: e.pointerId, last: world };
      return;
    }

    let handle: string | null = null;
    let hit: SketchHit | null = null;
    if (tool === "select") {
      const sel = selected?.kind === "shape" ? sketch.shapes.find((s) => s.id === selected.id) : undefined;
      if (sel && !fingerInPenMode) {
        const tol = (touch ? 22 : HANDLE_PX + 3) / v.scale;
        handle = shapeHandles(sel).find((h) => Math.hypot(h.p.x - world.x, h.p.y - world.y) <= tol)?.key ?? null;
      }
      hit = handle ? selected : hitSketch(sketch, world, (touch ? 16 : 8) / v.scale);
    }
    gesture.current = { kind: "pending", id: e.pointerId, start: lp, world, hit, handle };

    if (tool === "rect" || tool === "line" || tool === "circle" || tool === "dimension") {
      const d = draftRef.current;
      if (d?.kind !== "two") {
        const a = snap(v, world, touch).p;
        setDraft({ kind: "two", tool, a, b: a, dragging: true });
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    if (!v) return;
    const lp = local(e);
    const known = pointers.current.get(e.pointerId);
    if (known) pointers.current.set(e.pointerId, { ...lp, type: e.pointerType });
    const world = toWorld(v, lp.x, lp.y);
    const touch = e.pointerType !== "mouse";
    const d = draftRef.current;

    // Hover (mouse / pen) or rubber band for multi-tap tools.
    if (!known) {
      if (drawTool && tool !== "eraser" && tool !== "freehand") {
        const from = d?.kind === "chain" ? d.points[d.points.length - 1] : d?.kind === "two" ? d.a : null;
        const s = snap(v, world, touch, from);
        setCursor(s);
        if (d?.kind === "chain" || d?.kind === "arc") setDraft({ ...d, cursor: s.p });
        else if (d?.kind === "two" && !d.dragging) setDraft({ ...d, b: s.p });
      } else setCursor(null);
      return;
    }

    let g = gesture.current;
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [p1, p2] = pts;
      const dd = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
      const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const sv = g.startView;
      const scale = clampScale((sv.scale * dd) / g.startDist);
      const wx = (g.startMid.x - sv.tx) / sv.scale;
      const wy = (g.startMid.y - sv.ty) / sv.scale;
      setView({ scale, tx: m.x - wx * scale, ty: m.y - wy * scale });
      return;
    }
    if ("id" in g && g.id !== e.pointerId) return;
    if (g.kind === "pan") {
      setView({ ...v, tx: v.tx + lp.x - g.last.x, ty: v.ty + lp.y - g.last.y });
      gesture.current = { ...g, last: lp };
      return;
    }
    if (g.kind === "refmove") {
      setRefPreview({ ...g.base, x: g.base.x + world.x - g.start.x, y: g.base.y + world.y - g.start.y });
      return;
    }
    if (g.kind === "caltap") {
      // A drag rather than a tap: pan the view instead.
      if (Math.hypot(lp.x - g.start.x, lp.y - g.start.y) >= (TAP_PX[e.pointerType as keyof typeof TAP_PX] ?? 6)) gesture.current = { kind: "pan", id: g.id, last: lp };
      return;
    }
    if (g.kind === "draw" && d?.kind === "stroke") {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(world.x - last.x, world.y - last.y) * v.scale >= 2 && d.points.length < 400) setDraft({ kind: "stroke", points: [...d.points, { x: world.x, y: world.y }] });
      return;
    }
    if (g.kind === "erase") {
      const hits = eraseHits(sketch, g.last, world, (touch ? 18 : 8) / v.scale);
      if (hits.length) onChange(removeHits(sketch, hits));
      gesture.current = { ...g, last: world };
      return;
    }
    if (g.kind === "pending") {
      const moved = Math.hypot(lp.x - g.start.x, lp.y - g.start.y);
      const threshold = TAP_PX[e.pointerType as keyof typeof TAP_PX] ?? 6;
      if (moved < threshold) return;
      // Becomes a drag.
      if (tool === "select") {
        const hit = g.hit;
        const sel = hit?.kind === "shape" ? sketch.shapes.find((s) => s.id === hit.id) : undefined;
        if (sel && g.handle) g = { kind: "handle", id: g.id, key: g.handle, base: sel };
        else if (sel && selected?.id === sel.id && !(penMode && e.pointerType === "touch")) g = { kind: "move", id: g.id, start: g.world, base: sel };
        else g = { kind: "pan", id: g.id, last: lp };
        gesture.current = g;
      } else if (d?.kind === "two" && d.dragging) {
        g = { kind: "draw", id: g.id };
        gesture.current = g;
      } else {
        gesture.current = { kind: "draw", id: g.id };
        g = gesture.current;
      }
    }
    if (g.kind === "move") {
      const dx = world.x - g.start.x;
      const dy = world.y - g.start.y;
      // Snap the shape's first point, so moved shapes land on the grid or on other shapes.
      const anchor = shapePoints(g.base).pts[0] ?? { x: 0, y: 0 };
      const target = snap(v, { x: anchor.x + dx, y: anchor.y + dy }, touch, null, g.base.id).p;
      setPreview(moveShape(g.base, target.x - anchor.x, target.y - anchor.y));
      return;
    }
    if (g.kind === "handle") {
      setPreview(dragHandle(g.base, g.key, snap(v, world, touch, null, g.base.id).p));
      return;
    }
    if (g.kind === "draw" && d?.kind === "two") {
      const s = snap(v, world, touch, d.tool === "line" || d.tool === "dimension" ? d.a : null);
      setCursor(s);
      setDraft({ ...d, b: s.p });
      return;
    }
    if (g.kind === "draw" && (d?.kind === "chain" || d?.kind === "arc")) {
      const s = snap(v, world, touch, d.kind === "chain" ? d.points[d.points.length - 1] : null);
      setCursor(s);
      setDraft({ ...d, cursor: s.p });
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const v = viewRef.current;
    const had = pointers.current.delete(e.pointerId);
    if (!v || !had) return;
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = { kind: "none" };
      return;
    }
    if ("id" in g && g.id !== e.pointerId) return;
    gesture.current = { kind: "none" };
    const lp = local(e);
    const world = toWorld(v, lp.x, lp.y);
    const touch = e.pointerType !== "mouse";
    const d = draftRef.current;

    if (g.kind === "move" || g.kind === "handle") {
      if (preview) onChange({ ...sketch, shapes: sketch.shapes.map((s) => (s.id === preview.id ? preview : s)) });
      setPreview(null);
      return;
    }
    if (g.kind === "pan" || g.kind === "erase") return;
    if (g.kind === "refmove") {
      const moved = refPreviewRef.current;
      if (moved && (moved.x !== g.base.x || moved.y !== g.base.y)) onReferenceChange?.({ ...moved, x: round1(moved.x), y: round1(moved.y) });
      setRefPreview(null);
      return;
    }
    if (g.kind === "caltap") {
      onCalibrationTap?.(world);
      return;
    }

    if (d?.kind === "stroke") {
      setDraft(null);
      const pts = d.points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
      if (pts.length >= 2 && polyLength(pts, false) * v.scale >= 6) commitShape({ kind: "poly", id: newSketchId(), points: pts, closed: false });
      return;
    }

    const isTap = g.kind === "pending";
    if (tool === "select" && isTap) {
      onSelect(g.hit);
      return;
    }

    if (d?.kind === "two") {
      const b = snap(v, world, touch, d.tool === "line" || d.tool === "dimension" ? d.a : null).p;
      const big = Math.hypot(b.x - d.a.x, b.y - d.a.y) * v.scale >= 8;
      if (!big) {
        // A tap: keep the first point and wait for a second tap (works the same with a finger, Pencil or mouse).
        if (d.dragging) setDraft({ ...d, dragging: false });
        return;
      }
      setDraft(null);
      setCursor(null);
      if (d.tool === "rect") {
        const w = Math.abs(b.x - d.a.x), h = Math.abs(b.y - d.a.y);
        if (w >= 1 && h >= 1) commitShape({ kind: "rect", id: newSketchId(), x: Math.min(d.a.x, b.x), y: Math.min(d.a.y, b.y), w: round1(w), h: round1(h) });
      } else if (d.tool === "circle") commitShape({ kind: "circle", id: newSketchId(), cx: d.a.x, cy: d.a.y, r: round1(Math.hypot(b.x - d.a.x, b.y - d.a.y)) });
      else if (d.tool === "line") commitShape({ kind: "poly", id: newSketchId(), points: [d.a, b], closed: false });
      else {
        const dim = { id: newSketchId("d"), a: d.a, b, offset: round1(24 / v.scale) };
        onChange({ ...sketch, dims: [...sketch.dims, dim] });
        onSelect({ kind: "dim", id: dim.id });
      }
      return;
    }

    if (!isTap) return;
    const p = snap(v, world, touch, d?.kind === "chain" ? d.points[d.points.length - 1] : null).p;
    const now = performance.now();
    const dbl = lastTap.current && now - lastTap.current.t < 350 && Math.hypot(lp.x - lastTap.current.x, lp.y - lastTap.current.y) < 20;
    lastTap.current = { t: now, x: lp.x, y: lp.y };

    if (tool === "polyline" || tool === "polygon") {
      if (d?.kind === "chain") {
        const first = d.points[0];
        const closeTol = (touch ? 24 : 12) / v.scale;
        if (d.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= closeTol) return finishChain(true);
        if (dbl) return finishChain(tool === "polygon");
        const last = d.points[d.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return;
        if (d.points.length >= 400) return finishChain(tool === "polygon");
        setDraft({ ...d, points: [...d.points, p], cursor: p });
      } else setDraft({ kind: "chain", tool, points: [p], cursor: p });
      return;
    }
    if (tool === "arc") {
      const pts = d?.kind === "arc" ? [...d.points, p] : [p];
      if (pts.length === 3) {
        setDraft(null);
        const arc = arcThrough(pts[0], pts[2], pts[1], 24);
        if (arc) commitShape({ kind: "poly", id: newSketchId(), points: arc, closed: false });
        return;
      }
      setDraft({ kind: "arc", points: pts, cursor: p });
      return;
    }
    if (tool === "text") onRequestText(p);
  }

  function onPointerCancel(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    setRefPreview(null);
    const d = draftRef.current;
    if (d?.kind === "stroke" || (d?.kind === "two" && d.dragging)) setDraft(null);
    setPreview(null);
    gesture.current = { kind: "none" };
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    const v = viewRef.current;
    if (!v) return;
    const lp = local(e);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) setView(zoomAt(v, Math.exp(-e.deltaY * 0.0015), lp.x, lp.y));
    else setView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
  }

  const v = view;
  const shapes = preview ? sketch.shapes.map((s) => (s.id === preview.id ? preview : s)) : sketch.shapes;
  const bounds = useMemo(() => sketchBounds(sketch), [sketch]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none bg-[hsl(var(--background))]"
      style={{ cursor: refMode === "move" ? "move" : refMode === "calibrate" ? "crosshair" : tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={(e) => e.pointerType === "mouse" && setCursor(null)}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="builder-canvas"
      aria-label="Drawing area"
      role="application"
    >
      {v && (
        <>
          <GridLines view={v} size={size} grid={grid} />
          {reference && !reference.ref.hidden && (() => {
            const r = refPreview ?? reference.ref;
            return (
              <g transform={`translate(${v.tx} ${v.ty}) scale(${v.scale})`} pointerEvents="none">
                <image
                  href={reference.href}
                  width={reference.width}
                  height={reference.height}
                  opacity={r.opacity}
                  preserveAspectRatio="none"
                  transform={`translate(${r.x} ${r.y}) rotate(${r.rotation}) scale(${r.mmPerPx})`}
                  data-testid="builder-reference"
                />
              </g>
            );
          })()}
          {bounds && sketch.plane === "front" && !parts?.length && (
            <g aria-hidden>
              <line x1={0} x2={size.w} y1={bounds.maxY * v.scale + v.ty} y2={bounds.maxY * v.scale + v.ty} stroke="hsl(var(--primary))" strokeDasharray="6 4" strokeWidth={1} opacity={0.6} />
              <text x={8} y={bounds.maxY * v.scale + v.ty + 14} fontSize={11} fill="hsl(var(--muted-foreground))">
                Floor (bottom of the drawing)
              </text>
            </g>
          )}
          {parts && parts.length > 0 && (
            <g aria-hidden data-testid="builder-parts-elevation">
              <line x1={0} x2={size.w} y1={v.ty} y2={v.ty} stroke="hsl(var(--primary))" strokeDasharray="6 4" strokeWidth={1} opacity={0.6} />
              {(() => {
                // Name each part once where it doesn't cover another part's name.
                const placed: Array<{ x: number; y: number; w: number }> = [];
                return [...parts].sort((a, b) => b.z - a.z).map((p) => {
                const e = partElevation(p);
                const x = e.x * v.scale + v.tx, y = e.y * v.scale + v.ty, w = e.w * v.scale, h = e.h * v.scale;
                const ly = y + Math.min(h / 2, 16);
                const lw = p.name.length * 6.5;
                const clear = w > 60 && h > 18 && !placed.some((q) => Math.abs(q.y - ly) < 14 && Math.abs(q.x - (x + w / 2)) < (q.w + lw) / 2);
                if (clear) placed.push({ x: x + w / 2, y: ly, w: lw });
                return (
                  <g key={p.id}>
                    <rect x={x} y={y} width={w} height={h} rx={p.shape === "cylinder" ? Math.min(w, h) * 0.15 : 0} fill="hsl(var(--muted-foreground) / 0.12)" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 3" />
                    {clear && (
                      <text x={x + w / 2} y={y + Math.min(h / 2, 16)} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--muted-foreground))">
                        {p.name}
                      </text>
                    )}
                  </g>
                );
                });
              })()}
            </g>
          )}
          <g transform={`translate(${v.tx} ${v.ty}) scale(${v.scale})`}>
            {shapes.map((s) => (
              <ShapePath key={s.id} s={s} selected={selected?.id === s.id} scale={v.scale} />
            ))}
          </g>
          {sketch.dims.map((d) => (
            <DimLine key={d.id} a={d.a} b={d.b} offset={d.offset} view={v} unit={unit} selected={selected?.id === d.id} />
          ))}
          {sketch.labels.map((l) => (
            <text key={l.id} x={l.x * v.scale + v.tx} y={l.y * v.scale + v.ty} fontSize={13} textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--foreground))" fontWeight={selected?.id === l.id ? 700 : 500} style={{ paintOrder: "stroke" }} stroke="hsl(var(--background))" strokeWidth={3}>
              {l.text}
            </text>
          ))}
          {selected?.kind === "shape" &&
            (() => {
              const s = shapes.find((x) => x.id === selected.id);
              return s ? shapeHandles(s).map((h) => <circle key={h.key} cx={h.p.x * v.scale + v.tx} cy={h.p.y * v.scale + v.ty} r={HANDLE_PX} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={2} />) : null;
            })()}
          <DraftLayer draft={draft} view={v} unit={unit} />
          {refMode === "calibrate" && calibrationPoints && calibrationPoints.length > 0 && (
            <g data-testid="calibration-points" pointerEvents="none">
              {calibrationPoints.length === 2 && (
                <line x1={calibrationPoints[0].x * v.scale + v.tx} y1={calibrationPoints[0].y * v.scale + v.ty} x2={calibrationPoints[1].x * v.scale + v.tx} y2={calibrationPoints[1].y * v.scale + v.ty} stroke="#e11d48" strokeWidth={2} strokeDasharray="6 4" />
              )}
              {calibrationPoints.map((p, i) => (
                <g key={i} transform={`translate(${p.x * v.scale + v.tx} ${p.y * v.scale + v.ty})`}>
                  <circle r={9} fill="none" stroke="#e11d48" strokeWidth={2} />
                  <line x1={-14} x2={14} y1={0} y2={0} stroke="#e11d48" strokeWidth={1.5} />
                  <line x1={0} x2={0} y1={-14} y2={14} stroke="#e11d48" strokeWidth={1.5} />
                  <text x={12} y={-12} fontSize={13} fontWeight={700} fill="#e11d48" style={{ paintOrder: "stroke" }} stroke="hsl(var(--background))" strokeWidth={3}>
                    {i === 0 ? "A" : "B"}
                  </text>
                </g>
              ))}
            </g>
          )}
          {cursor && cursor.kind !== "none" && drawTool && (
            <rect x={cursor.p.x * v.scale + v.tx - 5} y={cursor.p.y * v.scale + v.ty - 5} width={10} height={10} fill="none" stroke={cursor.kind === "point" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth={1.5} />
          )}
        </>
      )}
    </svg>
  );
});

const round1 = (n: number) => Math.round(n * 10) / 10;

function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(v.scale * factor);
  const wx = (sx - v.tx) / v.scale;
  const wy = (sy - v.ty) / v.scale;
  return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
}

function GridLines({ view: v, size, grid }: { view: View; size: { w: number; h: number }; grid: number | null }) {
  // Minor lines at the snap grid when they're at least 8 px apart; otherwise at a coarser step.
  let step = grid ?? 100;
  while (step * v.scale < 8) step *= 10;
  const major = step * 10;
  const x0 = Math.floor(-v.tx / v.scale / step) * step;
  const y0 = Math.floor(-v.ty / v.scale / step) * step;
  const x1 = (size.w - v.tx) / v.scale;
  const y1 = (size.h - v.ty) / v.scale;
  const lines: ReactElement[] = [];
  let n = 0;
  for (let x = x0; x <= x1 && n < 600; x += step, n++) {
    const sx = x * v.scale + v.tx;
    lines.push(<line key={`x${x}`} x1={sx} x2={sx} y1={0} y2={size.h} stroke="hsl(var(--border))" strokeWidth={Math.abs(x % major) < 1e-6 ? 1 : 0.5} opacity={Math.abs(x % major) < 1e-6 ? 0.9 : 0.5} />);
  }
  for (let y = y0; y <= y1 && n < 1200; y += step, n++) {
    const sy = y * v.scale + v.ty;
    lines.push(<line key={`y${y}`} x1={0} x2={size.w} y1={sy} y2={sy} stroke="hsl(var(--border))" strokeWidth={Math.abs(y % major) < 1e-6 ? 1 : 0.5} opacity={Math.abs(y % major) < 1e-6 ? 0.9 : 0.5} />);
  }
  return <g aria-hidden>{lines}</g>;
}

function ShapePath({ s, selected, scale }: { s: SketchShape; selected: boolean; scale: number }) {
  const stroke = selected ? "hsl(var(--primary))" : "hsl(var(--foreground))";
  const sw = (selected ? 2.5 : 1.75) / scale;
  if (s.kind === "circle") return <circle cx={s.cx} cy={s.cy} r={s.r} fill="hsl(var(--primary) / 0.08)" stroke={stroke} strokeWidth={sw} data-shape={s.id} />;
  if (s.kind === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="hsl(var(--primary) / 0.08)" stroke={stroke} strokeWidth={sw} data-shape={s.id} />;
  const d = "M" + s.points.map((p) => `${p.x} ${p.y}`).join("L") + (s.closed ? "Z" : "");
  return <path d={d} fill={s.closed ? "hsl(var(--primary) / 0.08)" : "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" data-shape={s.id} />;
}

function DimLine({ a, b, offset, view: v, unit, selected }: { a: SketchPoint; b: SketchPoint; offset: number; view: View; unit: DisplayUnit; selected?: boolean }) {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return null;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const o = offset * v.scale;
  const A = { x: a.x * v.scale + v.tx + nx * o, y: a.y * v.scale + v.ty + ny * o };
  const B = { x: b.x * v.scale + v.tx + nx * o, y: b.y * v.scale + v.ty + ny * o };
  const col = selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  let ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  return (
    <g>
      <line x1={a.x * v.scale + v.tx} y1={a.y * v.scale + v.ty} x2={A.x} y2={A.y} stroke={col} strokeWidth={0.75} />
      <line x1={b.x * v.scale + v.tx} y1={b.y * v.scale + v.ty} x2={B.x} y2={B.y} stroke={col} strokeWidth={0.75} />
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={col} strokeWidth={1.25} />
      <text x={mx} y={my - 5} fontSize={12} textAnchor="middle" fill={col} transform={`rotate(${ang} ${mx} ${my})`} style={{ paintOrder: "stroke" }} stroke="hsl(var(--background))" strokeWidth={3} fontWeight={600}>
        {formatLength(L, unit)}
      </text>
    </g>
  );
}

function DraftLayer({ draft: d, view: v, unit }: { draft: Draft; view: View; unit: DisplayUnit }) {
  if (!d) return null;
  const P = (p: SketchPoint) => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });
  const col = "hsl(var(--primary))";
  const label = (p: SketchPoint, text: string) => {
    const s = P(p);
    return (
      <text x={s.x + 12} y={s.y - 12} fontSize={12} fill={col} fontWeight={600} style={{ paintOrder: "stroke" }} stroke="hsl(var(--background))" strokeWidth={3} data-testid="draft-readout">
        {text}
      </text>
    );
  };
  if (d.kind === "two") {
    const a = P(d.a), b = P(d.b);
    const dot = <circle cx={a.x} cy={a.y} r={4} fill={col} />;
    if (d.tool === "rect")
      return (
        <g>
          <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="hsl(var(--primary) / 0.1)" stroke={col} strokeDasharray="5 3" />
          {dot}
          {label(d.b, `${formatLength(Math.abs(d.b.x - d.a.x), unit)} × ${formatLength(Math.abs(d.b.y - d.a.y), unit)}`)}
        </g>
      );
    if (d.tool === "circle") {
      const r = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      return (
        <g>
          <circle cx={a.x} cy={a.y} r={r * v.scale} fill="hsl(var(--primary) / 0.1)" stroke={col} strokeDasharray="5 3" />
          {dot}
          {label(d.b, `⌀ ${formatLength(r * 2, unit)}`)}
        </g>
      );
    }
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={2} strokeDasharray={d.tool === "dimension" ? "4 3" : undefined} />
        {dot}
        {label(d.b, formatLength(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), unit))}
      </g>
    );
  }
  if (d.kind === "stroke") return <path d={"M" + d.points.map((p) => `${P(p).x} ${P(p).y}`).join("L")} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
  const pts = d.points.map(P);
  const cur = d.cursor ? P(d.cursor) : null;
  if (d.kind === "arc") {
    let arc: SketchPoint[] | null = null;
    if (d.points.length === 2 && d.cursor) arc = arcThrough(d.points[0], d.cursor, d.points[1], 24);
    return (
      <g>
        {arc ? <path d={"M" + arc.map((p) => `${P(p).x} ${P(p).y}`).join("L")} fill="none" stroke={col} strokeWidth={2} strokeDasharray="5 3" /> : cur && pts[0] && <line x1={pts[0].x} y1={pts[0].y} x2={cur.x} y2={cur.y} stroke={col} strokeDasharray="5 3" />}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={col} />
        ))}
      </g>
    );
  }
  const last = d.points[d.points.length - 1];
  return (
    <g>
      <polyline points={[...pts, ...(cur ? [cur] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={col} strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 && d.points.length >= 3 ? 9 : 4} fill={i === 0 && d.points.length >= 3 ? "hsl(var(--primary) / 0.2)" : col} stroke={col} />
      ))}
      {d.cursor && last && label(d.cursor, formatLength(Math.hypot(d.cursor.x - last.x, d.cursor.y - last.y), unit))}
    </g>
  );
}
