import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Camera, Eye, Hand, Layers, Maximize, Move, Plus, RotateCcw, Square } from "lucide-react";
import {
  findEntity,
  formatLength,
  modelAssetIds,
  outwardNormal,
  rectCorners,
  snapTo,
  pointInPolygon,
  type DesignObject,
  type ProjectModel,
  type Vec2,
} from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { useReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore, surfaceBelow, translateEntity } from "./commands";
import { alignMove } from "./interaction";
import { useEditor, useModel, type EditorStore } from "./store";
import { SelectField, ToggleRow } from "./fields";
import { downloadBlob, safeFilename } from "./export-plan";
import { ObjectModel, TONE_DEFAULTS } from "./object-mesh";
import { artSettled } from "./art-textures";
import {
  floorGeometry,
  footprint,
  framePosition,
  MM,
  openingDressing,
  pillarHeight,
  planTransform,
  prismGeometry,
  sceneBounds,
  VIEW_DIRS,
  wallPieces,
  type PlanBox,
  type Tone,
  type ViewName,
  type WallPiece,
} from "./scene-builders";

// ---------------------------------------------------------------------------
// 3D Studio. Renders the same project model as the 2D plan; every edit made
// here goes through the shared editor store, so undo, autosave and the plan
// stay in step.
//
// Navigate mode: one finger orbits, two fingers pan and pinch-zoom, a tap
// selects. Move mode: drag a selected object, pillar or section across the
// floor; empty space still orbits. Numeric editing lives in the same
// properties panel as 2D.
//
// Frames are only drawn when something changes (frameloop="demand"), which
// keeps an iPad cool and the battery happy.
// ---------------------------------------------------------------------------

type Mode = "navigate" | "move";

export type Studio3DApi = {
  setView: (v: ViewName) => void;
  fit: () => void;
  zoomBy: (f: number) => void;
  target: () => Vec2;
  snapshot: () => string;
};

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Studio3D({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const store = useStore();
  const supported = useMemo(webglAvailable, []);
  const [lost, setLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!supported) return <Fallback title="3D isn't available in this browser" body="This device or browser has WebGL turned off, so the 3D view can't start. Your plan is safe and the 2D designer works normally." onBack={() => store.setWorkspace("2d")} />;
  if (lost)
    return (
      <Fallback
        title="The 3D view stopped"
        body="The graphics processor reset (this can happen when an iPad is low on memory). Nothing was lost."
        onBack={() => store.setWorkspace("2d")}
        onRetry={() => {
          setLost(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  return (
    <Boundary key={attempt} fallback={<Fallback title="The 3D view couldn't start" body="Something went wrong while drawing the scene. Your plan is safe." onBack={() => store.setWorkspace("2d")} onRetry={() => setAttempt((a) => a + 1)} />}>
      <StudioInner store={store} onOpenLibrary={onOpenLibrary} onLost={() => setLost(true)} />
    </Boundary>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("3D studio failed", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fallback({ title, body, onBack, onRetry }: { title: string; body: string; onBack: () => void; onRetry?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6" data-testid="studio-3d-fallback">
      <div className="glass-strong max-w-md space-y-3 rounded-2xl p-6 text-center">
        <Box className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-center gap-2 pt-1">
          {onRetry && (
            <Button variant="outline" className="h-11" onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" /> Try again
            </Button>
          )}
          <Button className="h-11" onClick={onBack}>
            <Square className="mr-2 h-4 w-4" /> Back to 2D plan
          </Button>
        </div>
      </div>
    </div>
  );
}

function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

type Overlay = { showGrid: boolean; showAxes: boolean; showDims: boolean; cutaway: boolean };

type Anchor = { key: string; pos: THREE.Vector3; text: string; tone: "dim" | "name" | "sel" };

function StudioInner({ store, onOpenLibrary, onLost }: { store: EditorStore; onOpenLibrary: () => void; onLost: () => void }) {
  const model = useModel(store);
  const selection = useEditor(store, (s) => s.selection);
  const dark = useIsDark();
  const reduce = useReduceMotion();
  const [mode, setMode] = useState<Mode>("navigate");
  const [overlay, setOverlay] = useState<Overlay>({ showGrid: true, showAxes: false, showDims: true, cutaway: true });
  // Top view looks straight down like the 2D plan: no shadows to read as extra shapes.
  const [topView, setTopView] = useState(false);
  // Live position / alignment readout while moving something (written directly, no re-render per frame).
  const readoutRef = useRef<HTMLDivElement>(null);
  const api = useRef<Studio3DApi | null>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const anchors = useMemo(() => buildAnchors(model, selection, overlay.showDims), [model, selection, overlay.showDims]);

  // Let shared commands (drop point for new objects, "F" to fit) use this view.
  useEffect(() => {
    const canvasApi = {
      fit: () => api.current?.fit(),
      zoomBy: (f: number) => api.current?.zoomBy(f),
      ensureVisible: () => {},
      centre: () => api.current?.target() ?? { x: 0, y: 0 },
      scale: () => 1,
    };
    store.canvas = canvasApi;
    return () => {
      if (store.canvas === canvasApi) store.canvas = null;
    };
  }, [store]);

  const snapshot = async () => {
    try {
      // Wait for artwork images to finish loading (or fail) and for the scene
      // to pick them up, so the picture shows the artwork, not the base colour.
      await artSettled(modelAssetIds(model.objects));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const url = api.current?.snapshot();
      if (!url) throw new Error("The 3D view isn't ready yet");
      const bin = atob(url.split(",")[1] ?? "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const name = `${safeFilename(model.drawing.title || model.venue.name || "design")}-3d.png`;
      downloadBlob(new Blob([bytes], { type: "image/png" }), name);
      toast({ title: "3D image saved", description: name });
    } catch (err) {
      toast({ title: "Couldn't save the 3D image", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    }
  };

  const setScene = (patch: Partial<ProjectModel["scene"]>, key: string) => {
    const m = store.getState().history.present;
    store.commit({ ...m, scene: { ...m.scene, ...patch } }, `scene:${key}`);
  };

  const empty = model.rooms.length + model.objects.length + model.partitions.length === 0;

  return (
    <div className="relative h-full w-full" data-testid="studio-3d">
      <Canvas
        className="!absolute inset-0 touch-none"
        frameloop="demand"
        dpr={[1, 2]}
        shadows
        camera={{ fov: 45, near: 0.05, far: 5000, position: [12, 10, 14] }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onLost();
          });
        }}
        onPointerMissed={(e) => {
          if (e.type === "click") store.select([]);
        }}
        aria-label="3D view of the hall"
        role="img"
      >
        <color attach="background" args={[dark ? "#0b0f17" : "#e9ecf1"]} />
        <Scene model={model} selection={selection} store={store} mode={mode} overlay={overlay} dark={dark} topView={topView} readout={readoutRef} />
        <Rig apiRef={api} model={model} reduceMotion={reduce} store={store} onTopView={setTopView} />
        <LabelProjector anchors={anchors} container={labelsRef} />
      </Canvas>

      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {anchors.map((a) => (
          <span
            key={a.key}
            className={cn(
              "absolute left-0 top-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm will-change-transform",
              a.tone === "sel" ? "bg-[var(--plan-select)] text-white" : a.tone === "name" ? "bg-card/85 text-foreground" : "bg-card/80 text-[var(--plan-dim)]",
            )}
            style={{ visibility: "hidden" }}
          >
            {a.text}
          </span>
        ))}
      </div>

      <div
        ref={readoutRef}
        data-testid="move-readout"
        className="pointer-events-none absolute bottom-12 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--plan-select)] px-3 py-1.5 text-xs font-semibold tabular-nums text-white shadow-md"
        aria-live="polite"
      />

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 sm:p-3">
        <div className="glass-strong pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1 shadow-[var(--elev-2)]" role="toolbar" aria-label="3D tools">
          <div className="flex rounded-xl bg-muted/60 p-0.5" role="radiogroup" aria-label="Touch mode">
            {(
              [
                ["navigate", Hand, "Navigate"],
                ["move", Move, "Move"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                data-testid={`mode-${m}`}
                onClick={() => setMode(m)}
                className={cn("flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors", mode === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground")}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-1.5 px-3" data-testid="view-menu">
                <Eye className="h-4 w-4" /> <span className="hidden sm:inline">View</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {(
                [
                  ["perspective", "3D overview"],
                  ["top", "Top (matches plan)"],
                  ["front", "Front"],
                  ["back", "Back"],
                  ["left", "Left"],
                  ["right", "Right"],
                ] as const
              ).map(([v, label]) => (
                <DropdownMenuItem key={v} className="min-h-11" data-testid={`view-${v}`} onSelect={() => api.current?.setView(v)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Fit everything in view" title="Fit (F)" onClick={() => api.current?.fit()} data-testid="fit-3d">
            <Maximize className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Display options" data-testid="display-3d">
                <Layers className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-1" align="end">
              <ToggleRow label="See-through near walls" hint="Fades walls between you and the room" checked={overlay.cutaway} onChange={(cutaway) => setOverlay({ ...overlay, cutaway })} />
              <ToggleRow label="Dimensions" checked={overlay.showDims} onChange={(showDims) => setOverlay({ ...overlay, showDims })} testId="toggle-dims-3d" />
              <ToggleRow label="Floor grid" checked={overlay.showGrid} onChange={(showGrid) => setOverlay({ ...overlay, showGrid })} />
              <ToggleRow label="Axes" hint="Red = width (x), blue = length (y)" checked={overlay.showAxes} onChange={(showAxes) => setOverlay({ ...overlay, showAxes })} />
              <ToggleRow label="Ceiling" checked={model.scene.showCeiling} onChange={(showCeiling) => setScene({ showCeiling }, "ceiling")} />
              <div className="space-y-2 py-2">
                <div className="flex justify-between text-sm">
                  <span>Wall opacity</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(model.scene.wallOpacity * 100)}%</span>
                </div>
                <Slider min={10} max={100} step={5} value={[Math.round(model.scene.wallOpacity * 100)]} onValueChange={([v]) => setScene({ wallOpacity: v / 100 }, "opacity")} aria-label="Wall opacity" />
              </div>
              <SelectField
                label="Lighting"
                value={model.scene.lighting}
                options={[
                  { value: "studio", label: "Studio (even)" },
                  { value: "event", label: "Event (warm, dimmed)" },
                  { value: "daylight", label: "Daylight" },
                ]}
                onChange={(lighting) => setScene({ lighting }, "lighting")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" className="h-10 gap-1.5 px-3" onClick={onOpenLibrary} data-testid="add-object-3d">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Object</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Save a 3D image" title="Save 3D image (PNG)" onClick={snapshot} data-testid="snapshot-3d">
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] rounded-lg bg-card/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        {mode === "navigate" ? "Drag to orbit · two fingers to pan and zoom · tap to select" : "Drag a selected item to move it · drag empty space to orbit"}
      </p>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="glass-strong pointer-events-auto max-w-sm space-y-2 rounded-2xl p-5 text-center">
            <p className="text-sm font-semibold">Nothing to show yet</p>
            <p className="text-sm text-muted-foreground">Draw the hall in the 2D plan first; it appears here automatically.</p>
            <Button className="h-11" onClick={() => store.setWorkspace("2d")}>
              <Square className="mr-2 h-4 w-4" /> Go to 2D plan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- camera ----

/** Normal lens, and the long lens the top view uses so walls stand straight like the plan. */
const FOV = 45;
const TOP_FOV = 10;

function Rig({ apiRef, model, reduceMotion, store, onTopView }: { apiRef: React.MutableRefObject<Studio3DApi | null>; model: ProjectModel; reduceMotion: boolean; store: EditorStore; onTopView: (top: boolean) => void }) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const modelRef = useRef(model);
  modelRef.current = model;
  const tween = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; fFrom: number; fTo: number; start: number; ms: number } | null>(null);
  const lastView = useRef<ViewName>("perspective");

  useEffect(() => {
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.5;
    controls.maxDistance = 2000;
    controls.zoomToCursor = true;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.connect(gl.domElement);
    const onChange = () => {
      // Tilting away from the top view swaps back to the normal lens, moving
      // the camera in so the hall stays the same size on screen.
      const persp = camera as THREE.PerspectiveCamera;
      if (!tween.current && persp.fov < FOV - 0.5 && controls.getPolarAngle() > 0.2) {
        const offset = camera.position.clone().sub(controls.target);
        offset.multiplyScalar(Math.tan((persp.fov * Math.PI) / 360) / Math.tan((FOV * Math.PI) / 360));
        persp.fov = FOV;
        persp.updateProjectionMatrix();
        camera.position.copy(controls.target).add(offset);
        lastView.current = "perspective";
        onTopView(false);
      }
      invalidate();
    };
    controls.addEventListener("change", onChange);
    return () => {
      controls.removeEventListener("change", onChange);
      controls.disconnect();
    };
  }, [controls, gl, invalidate, camera, onTopView]);

  // When the properties sheet covers the bottom of the view (portrait iPad,
  // phone), shift the projection so the scene centres in what is visible.
  const occ = useRef(0);
  const visibleAspect = () => size.width / Math.max(1, size.height - occ.current);
  /** Vertical field of view of the uncovered part of the canvas. */
  const visibleFov = (fov: number) => {
    const o = occ.current;
    const k = (size.height - o) / Math.max(1, size.height + o);
    return (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 180) / Math.PI;
  };
  useEffect(() => {
    const apply = () => {
      const persp = camera as THREE.PerspectiveCamera;
      const o = Math.round(Math.min(store.occluded.bottom, size.height * 0.6));
      const aspect = size.width / Math.max(1, size.height + o);
      const viewOk = o === 0 ? !persp.view?.enabled : persp.view?.enabled && persp.view.offsetY === o && persp.view.fullHeight === size.height + o;
      if (o === occ.current && viewOk && Math.abs(persp.aspect - aspect) < 1e-6) return;
      occ.current = o;
      // The frustum is computed for the taller virtual frame; its aspect must match it.
      persp.aspect = aspect;
      if (o > 0) persp.setViewOffset(size.width, size.height + o, 0, o, size.width, size.height);
      else persp.clearViewOffset();
      persp.updateProjectionMatrix();
      invalidate();
    };
    apply();
    const t = window.setInterval(apply, 250);
    return () => window.clearInterval(t);
  }, [store, camera, size.width, size.height, invalidate]);

  // Other components (move mode) disable orbiting while dragging.
  useEffect(() => {
    (gl.domElement as HTMLCanvasElement & { __orbit?: OrbitControls }).__orbit = controls;
  }, [gl, controls]);

  const go = useCallback(
    (view: ViewName) => {
      lastView.current = view;
      const persp = camera as THREE.PerspectiveCamera;
      const b = sceneBounds(modelRef.current);
      const fTo = view === "top" ? TOP_FOV : FOV;
      const to = framePosition(b, VIEW_DIRS[view], visibleFov(fTo), visibleAspect());
      const tTo = b.center.clone();
      onTopView(view === "top");
      if (reduceMotion) {
        persp.fov = fTo;
        persp.updateProjectionMatrix();
        camera.position.copy(to);
        controls.target.copy(tTo);
        controls.update();
        invalidate();
        return;
      }
      tween.current = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo, fFrom: persp.fov, fTo, start: performance.now(), ms: 450 };
      invalidate();
    },
    [camera, controls, invalidate, reduceMotion, size.width, size.height, onTopView],
  );

  useFrame(() => {
    // Near plane follows the viewing distance, so the far-away top-view
    // camera keeps enough depth precision for floor patches (no flicker).
    const persp = camera as THREE.PerspectiveCamera;
    const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.02, 0.05, 5);
    if (Math.abs(near - persp.near) > persp.near * 0.1) {
      persp.near = near;
      persp.updateProjectionMatrix();
    }
    const t = tween.current;
    if (!t) return;
    const k = Math.min(1, (performance.now() - t.start) / t.ms);
    const e = 1 - Math.pow(1 - k, 4);
    camera.position.lerpVectors(t.from, t.to, e);
    controls.target.lerpVectors(t.tFrom, t.tTo, e);
    if (t.fFrom !== t.fTo) {
      // Lens and distance change together, so the view zooms smoothly.
      const tanF = THREE.MathUtils.lerp(Math.tan((t.fFrom * Math.PI) / 360), Math.tan((t.fTo * Math.PI) / 360), e);
      persp.fov = (Math.atan(tanF) * 360) / Math.PI;
      persp.updateProjectionMatrix();
    }
    controls.update();
    if (k < 1) invalidate();
    else tween.current = null;
  });

  // First frame: frame the hall.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || size.width === 0) return;
    framed.current = true;
    const persp = camera as THREE.PerspectiveCamera;
    const b = sceneBounds(modelRef.current);
    camera.position.copy(framePosition(b, VIEW_DIRS.perspective, visibleFov(persp.fov), visibleAspect()));
    controls.target.copy(b.center);
    controls.update();
    invalidate();
  }, [camera, controls, invalidate, size.width, size.height]);

  useEffect(() => {
    apiRef.current = {
      setView: go,
      fit: () => go(lastView.current),
      zoomBy: (f) => {
        const offset = camera.position.clone().sub(controls.target).multiplyScalar(1 / f);
        camera.position.copy(controls.target.clone().add(offset));
        controls.update();
        invalidate();
      },
      target: () => ({ x: controls.target.x / MM, y: controls.target.z / MM }),
      snapshot: () => {
        const hidden: THREE.Object3D[] = [];
        scene.traverse((o) => {
          if (o.userData.noSnapshot && o.visible) {
            o.visible = false;
            hidden.push(o);
          }
        });
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL("image/png");
        for (const o of hidden) o.visible = true;
        invalidate();
        return url;
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, go, camera, controls, gl, scene, invalidate]);

  return null;
}

/** Positions the HTML dimension labels over the 3D view on each drawn frame. */
function LabelProjector({ anchors, container }: { anchors: Anchor[]; container: React.RefObject<HTMLDivElement | null> }) {
  const { camera, size, invalidate } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [anchors, invalidate]);
  useFrame(() => {
    const el = container.current;
    if (!el) return;
    const kids = el.children;
    // useFrame runs before the render updates matrices: refresh the camera's
    // now, or labels lag a camera move (and stay wrong when nothing else redraws).
    camera.updateMatrixWorld();
    for (let i = 0; i < anchors.length && i < kids.length; i++) {
      const span = kids[i] as HTMLElement;
      v.copy(anchors[i].pos).project(camera);
      const visible = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (!visible) {
        span.style.visibility = "hidden";
        continue;
      }
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      span.style.visibility = "visible";
      span.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

function buildAnchors(model: ProjectModel, selection: string[], showDims: boolean): Anchor[] {
  const unit = model.settings.displayUnit;
  const out: Anchor[] = [];
  if (showDims) {
    for (const r of model.rooms) {
      if (r.hidden) continue;
      const n = r.points.length;
      for (let i = 0; i < n; i++) {
        const a = r.points[i];
        const b = r.points[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 300) continue;
        // Just outside the wall, so wall lengths never sit on top of section names.
        const nrm = outwardNormal(r.points, i);
        const off = (r.showWalls ? r.wallThickness : 0) + 350;
        const mx = (a.x + b.x) / 2 + nrm.x * off;
        const my = (a.y + b.y) / 2 + nrm.y * off;
        out.push({ key: `${r.id}:${i}`, pos: new THREE.Vector3(mx * MM, 0.05, my * MM), text: formatLength(len, unit), tone: "dim" });
      }
    }
    if (model.settings.showLabels) {
      for (const s of model.sections) {
        if (s.hidden || !s.name) continue;
        out.push({ key: `name:${s.id}`, pos: new THREE.Vector3(s.x * MM, 0.08, s.y * MM), text: s.name, tone: "name" });
      }
    }
  }
  const sel = selection.length === 1 ? findEntity(model, selection[0]) : null;
  if (sel?.kind === "object") {
    const o = sel.entity as DesignObject;
    const c = rectCorners(o.x, o.y, o.width, o.depth, o.rotation);
    const top = (o.elevation + o.height) * MM + 0.08;
    const at = (p: Vec2, y: number) => new THREE.Vector3(p.x * MM, y, p.y * MM);
    const midp = (p: Vec2, q: Vec2) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    out.push({ key: "sel:w", pos: at(midp(c[2], c[3]), top), text: `W ${formatLength(o.width, unit, { compact: true })}`, tone: "sel" });
    out.push({ key: "sel:d", pos: at(midp(c[1], c[2]), top), text: `D ${formatLength(o.depth, unit, { compact: true })}`, tone: "sel" });
    out.push({ key: "sel:h", pos: at(c[2], (o.elevation + o.height / 2) * MM), text: `H ${formatLength(o.height, unit, { compact: true })}`, tone: "sel" });
    if (o.elevation > 0) out.push({ key: "sel:e", pos: at(c[3], (o.elevation / 2) * MM), text: `+${formatLength(o.elevation, unit, { compact: true })}`, tone: "sel" });
  }
  return out;
}

// --------------------------------------------------------------- scene ----


const LIGHTING = {
  studio: { hemi: 0.9, sun: 1.6, sky: "#ffffff", ground: "#9aa0aa", sunColor: "#ffffff" },
  event: { hemi: 0.45, sun: 0.9, sky: "#ffe2bf", ground: "#3a2f45", sunColor: "#ffd2a0" },
  daylight: { hemi: 1.1, sun: 2.2, sky: "#dcecff", ground: "#b8b2a6", sunColor: "#fff6e5" },
} as const;

type SceneProps = { model: ProjectModel; selection: string[]; store: EditorStore; mode: Mode; overlay: Overlay; dark: boolean; topView: boolean; readout: React.RefObject<HTMLDivElement | null> };

function Scene({ model, selection, store, mode, overlay, dark, topView, readout }: SceneProps) {
  const bounds = useMemo(() => sceneBounds(model), [model]);
  const L = LIGHTING[model.scene.lighting] ?? LIGHTING.studio;
  const sel = useMemo(() => new Set(selection), [selection]);
  const drag = useMoveDrag(store, mode, readout);
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    store.select([id]);
  };
  const down = (id: string, movable: boolean) => (e: ThreeEvent<PointerEvent>) => {
    if (mode !== "move" || !movable) return;
    e.stopPropagation();
    drag.start(id, e);
  };
  const gridSize = Math.max(10, Math.ceil(Math.max(bounds.size.x, bounds.size.z) / 5) * 5 + 10);
  const shadowR = bounds.radius * 1.3;
  // High, ceiling-like key light: short soft shadows under objects, no long
  // wall shadows striping the floor.
  const sun: [number, number, number] = [bounds.center.x + bounds.radius * 0.35, bounds.radius * 2.6 + 6, bounds.center.z + bounds.radius * 0.5];

  return (
    <>
      <hemisphereLight args={[L.sky, L.ground, L.hemi]} />
      <directionalLight
        position={sun}
        intensity={L.sun}
        color={L.sunColor}
        castShadow={!topView}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={0.1}
        shadow-camera-far={bounds.radius * 6 + 20}
        shadow-bias={-0.0005}
      >
        {/* The target is a child of the light, so its position is relative to it. */}
        <object3D attach="target" position={[bounds.center.x - sun[0], -sun[1], bounds.center.z - sun[2]]} />
      </directionalLight>

      {overlay.showGrid && (
        <gridHelper args={[gridSize, gridSize, dark ? "#3a4252" : "#b4bac6", dark ? "#1c2230" : "#d3d8e0"]} position={[bounds.center.x, -0.002, bounds.center.z]} userData={{ noSnapshot: true }} />
      )}
      {overlay.showAxes && <axesHelper args={[2]} position={[0, 0.01, 0]} userData={{ noSnapshot: true }} />}

      {model.rooms.map((r) =>
        r.hidden ? null : (
          <group key={r.id} onClick={pick(r.id)}>
            <Floor points={r.points} color={r.floorColor || model.scene.floorColor} selected={sel.has(r.id)} />
            {model.scene.showCeiling && <Ceiling points={r.points} height={r.wallHeight} />}
          </group>
        ),
      )}

      <Walls model={model} selection={sel} cutaway={overlay.cutaway} opacity={model.scene.wallOpacity} onPick={pick} />

      {model.openings.map((o) => (
        <group key={o.id} onClick={pick(o.id)}>
          {openingDressing(model, o).map((b, i) => (
            <PlanBoxMesh key={i} box={b} highlight={sel.has(o.id)} />
          ))}
        </group>
      ))}

      {model.sections.map((s, i) =>
        s.hidden ? null : (
          <group key={s.id} onClick={pick(s.id)} onPointerDown={down(s.id, !s.locked)}>
            <SectionPatch points={footprint(s)} color={s.color} order={i} selected={sel.has(s.id)} />
          </group>
        ),
      )}

      {model.pillars.map((p) => {
        if (p.hidden) return null;
        const h = pillarHeight(model, p);
        const t = planTransform(p);
        return (
          <group key={p.id} position={t.position} rotation-y={t.rotationY} onClick={pick(p.id)} onPointerDown={down(p.id, !p.locked)}>
            <mesh position={[0, (h * MM) / 2, 0]} castShadow receiveShadow scale={p.shape === "round" ? [p.width * MM, h * MM, p.depth * MM] : undefined}>
              {p.shape === "round" ? <cylinderGeometry args={[0.5, 0.5, 1, 32]} /> : <boxGeometry args={[p.width * MM, h * MM, p.depth * MM]} />}
              <meshStandardMaterial color={p.color} roughness={0.8} />
            </mesh>
            {sel.has(p.id) && <SelectionBox w={p.width} d={p.depth} h={h} />}
          </group>
        );
      })}

      {model.objects.map((o) =>
        o.hidden ? null : <ObjectMesh key={o.id} object={o} selected={sel.has(o.id)} onClick={pick(o.id)} onPointerDown={down(o.id, !o.locked)} />,
      )}
    </>
  );
}

function Floor({ points, color, selected }: { points: Vec2[]; color: string; selected: boolean }) {
  const geo = useMemo(() => floorGeometry(points, 0), [points]);
  useEffect(() => () => geo.dispose(), [geo]);
  const outline = useMemo(() => loopGeometry(points, 0.004), [points]);
  useEffect(() => () => outline.dispose(), [outline]);
  return (
    <>
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <lineLoop geometry={outline} userData={{ noSnapshot: true }}>
          <lineBasicMaterial color={selectColor()} />
        </lineLoop>
      )}
    </>
  );
}

function Ceiling({ points, height }: { points: Vec2[]; height: number }) {
  const geo = useMemo(() => floorGeometry(points, height), [points, height]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#f4f3f0" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function SectionPatch({ points, color, order, selected }: { points: Vec2[]; color: string; order: number; selected: boolean }) {
  const geo = useMemo(() => floorGeometry(points, 0), [points]);
  const outline = useMemo(() => loopGeometry(points, 0.006), [points]);
  useEffect(() => () => (geo.dispose(), outline.dispose()), [geo, outline]);
  return (
    <>
      <mesh geometry={geo} position-y={0.003 + order * 0.00002} receiveShadow renderOrder={1}>
        <meshStandardMaterial color={color} transparent opacity={selected ? 0.55 : 0.38} roughness={1} depthWrite={false} polygonOffset polygonOffsetFactor={-1 - order} />
      </mesh>
      <lineLoop geometry={outline}>
        <lineBasicMaterial color={selected ? selectColor() : color} />
      </lineLoop>
    </>
  );
}

function loopGeometry(points: Vec2[], y: number): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x * MM, y, p.y * MM)));
}

const selectColor = () => (document.documentElement.classList.contains("dark") ? "#60a5fa" : "#2563eb");

/** All wall pieces. Room walls facing the camera fade so the inside stays visible. */
const Walls = memo(function Walls({ model, selection, cutaway, opacity, onPick }: { model: ProjectModel; selection: Set<string>; cutaway: boolean; opacity: number; onPick: (id: string) => (e: ThreeEvent<MouseEvent>) => void }) {
  const pieces = useMemo(() => wallPieces(model), [model]);
  const items = useMemo(
    () =>
      pieces.map((p) => {
        const geo = prismGeometry(p.points, p.y0, p.y1);
        const c = p.points.reduce((s, q) => ({ x: s.x + q.x / p.points.length, y: s.y + q.y / p.points.length }), { x: 0, y: 0 });
        return { piece: p, geo, centre: new THREE.Vector3(c.x * MM, 0, c.y * MM), normal: new THREE.Vector3(p.normal.x, 0, p.normal.y) };
      }),
    [pieces],
  );
  useEffect(() => () => items.forEach((i) => i.geo.dispose()), [items]);
  const mats = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    for (let i = 0; i < items.length; i++) {
      const m = mats.current[i];
      if (!m) continue;
      let o = opacity;
      if (cutaway && items[i].piece.hostKind === "room") {
        tmp.copy(camera.position).sub(items[i].centre);
        tmp.y = 0;
        const facing = tmp.lengthSq() > 1e-6 ? tmp.normalize().dot(items[i].normal) : 0;
        // Only when looking from outside and not from straight above.
        const above = camera.position.y > 0 ? Math.atan2(camera.position.y - items[i].centre.y, Math.hypot(camera.position.x - items[i].centre.x, camera.position.z - items[i].centre.z)) : 0;
        if (facing > 0.15 && above < 1.35) o = Math.min(o, 0.12);
      }
      const transparent = o < 0.999;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = o;
      m.depthWrite = !transparent;
    }
  });

  return (
    <>
      {items.map(({ piece, geo }, i) => (
        <mesh key={piece.key} geometry={geo} receiveShadow onClick={onPick(piece.hostId)}>
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color={selection.has(piece.hostId) ? mixSelect(piece.color) : piece.color}
            roughness={0.9}
          />
        </mesh>
      ))}
    </>
  );
});

function mixSelect(hex: string): string {
  return new THREE.Color(hex).lerp(new THREE.Color(selectColor()), 0.35).getStyle();
}

function PlanBoxMesh({ box, highlight }: { box: PlanBox; highlight: boolean }) {
  const t = planTransform({ x: box.cx, y: box.cy, rotation: box.rot }, box.y0 + box.h / 2);
  const color = box.color ?? TONE_DEFAULTS[box.tone];
  return (
    <mesh position={t.position} rotation-y={t.rotationY} castShadow={box.tone !== "glass"}>
      <boxGeometry args={[box.w * MM, box.h * MM, box.d * MM]} />
      {box.tone === "glass" ? (
        <meshStandardMaterial color={color} transparent opacity={0.35} roughness={0.1} metalness={0.1} depthWrite={false} />
      ) : (
        <meshStandardMaterial color={highlight ? mixSelect(color) : color} roughness={0.7} emissive={box.tone === "exit" ? color : "#000000"} emissiveIntensity={box.tone === "exit" ? 0.8 : 0} />
      )}
    </mesh>
  );
}

const ObjectMesh = memo(function ObjectMesh({
  object: o,
  selected,
  onClick,
  onPointerDown,
}: {
  object: DesignObject;
  selected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const t = planTransform(o, o.elevation);
  return (
    <group position={t.position} rotation-y={t.rotationY} onClick={onClick} onPointerDown={onPointerDown} name={o.id}>
      <ObjectModel object={o} />
      {selected && <SelectionBox w={o.width} d={o.depth} h={o.height} />}
    </group>
  );
});

function SelectionBox({ w, d, h }: { w: number; d: number; h: number }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w * MM + 0.04, h * MM + 0.04, d * MM + 0.04)), [w, d, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position-y={(h * MM) / 2} userData={{ noSnapshot: true }} renderOrder={10}>
      <lineBasicMaterial color={selectColor()} depthTest={false} transparent />
    </lineSegments>
  );
}

// ---------------------------------------------------------- move mode ----

/** Drags an item across the floor plane; the whole drag is one undo step. */
function useMoveDrag(store: EditorStore, mode: Mode, readout: React.RefObject<HTMLDivElement | null>) {
  const { camera, gl, invalidate, size } = useThree();
  const state = useRef<{ id: string; start: THREE.Vector3; pointerId: number; x0: number; y0: number; sits: boolean } | null>(null);
  // Dragging happens on the horizontal plane at the item's own base height,
  // so it follows the finger exactly even on top of a stage.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);

  const hit = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    },
    [camera, gl, plane, ray],
  );

  const showReadout = (text: string | null) => {
    const el = readout.current;
    if (!el) return;
    el.textContent = text ?? "";
    el.classList.toggle("hidden", !text);
  };

  useEffect(() => {
    if (mode !== "move") return;
    const orbit = () => (gl.domElement as HTMLCanvasElement & { __orbit?: OrbitControls }).__orbit;
    const onMove = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const p = hit(e.clientX, e.clientY);
      if (!p) return;
      const m = store.getState().history.present;
      const ref = findEntity(m, s.id);
      if (!ref) return;
      const e0 = ref.entity as { x: number; y: number };
      // Alignment reach: about 14 screen px at the drag point's distance.
      const persp = camera as THREE.PerspectiveCamera;
      const pxPerMm = size.height / (2 * camera.position.distanceTo(p) * Math.tan((persp.fov * Math.PI) / 360)) * MM;
      const step = m.settings.snapGrid ? Math.min(m.settings.gridSize, 100) : 10;
      const proposed = { x: s.x0 + (p.x - s.start.x) / MM, y: s.y0 + (p.z - s.start.z) / MM };
      const a = m.settings.snapGeometry ? alignMove(m, s.id, proposed.x, proposed.y, 14 / pxPerMm, step) : { x: snapTo(proposed.x, step), y: snapTo(proposed.y, step), alignedX: null, alignedY: null };
      let next = translateEntity(m, s.id, a.x - e0.x, a.y - e0.y);
      let on = "";
      if (s.sits && ref.kind === "object") {
        // Something standing on a surface keeps standing on whatever is under it now.
        const moved = next.objects.find((o) => o.id === s.id)!;
        const elevation = surfaceBelow(next, moved);
        next = { ...next, objects: next.objects.map((o) => (o.id === s.id ? { ...o, elevation } : o)) };
        const under = elevation > 0 ? next.objects.find((o) => o.id !== s.id && !o.hidden && Math.abs(o.elevation + o.height - elevation) < 1 && pointInPolygon({ x: moved.x, y: moved.y }, footprint(o), 0)) : null;
        on = under ? ` · on ${under.name || "surface"}` : " · on the floor";
      }
      store.setDraft(next);
      const unit = m.settings.displayUnit;
      const aligned = [a.alignedX && `lined up with ${a.alignedX}`, a.alignedY && a.alignedY !== a.alignedX && `lined up with ${a.alignedY}`].filter(Boolean).join(", ");
      showReadout(`X ${formatLength(a.x, unit)} · Y ${formatLength(a.y, unit)}${on}${aligned ? ` · ${aligned}` : ""}`);
      invalidate();
    };
    const finish = (commit: boolean) => {
      state.current = null;
      if (commit) store.endDraft();
      else store.setDraft(null);
      showReadout(null);
      const o = orbit();
      if (o) o.enabled = true;
    };
    const onUp = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      finish(true);
    };
    // A cancelled touch (system gesture, incoming call) puts the item back.
    const onCancel = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (state.current) finish(true);
      const o = orbit();
      if (o) o.enabled = true;
    };
  }, [mode, store, gl, hit, invalidate, camera, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    start(id: string, e: ThreeEvent<PointerEvent>) {
      const p = hit(e.nativeEvent.clientX, e.nativeEvent.clientY);
      if (!p) return;
      // A drag only moves something already selected; the first touch selects it.
      if (!store.getState().selection.includes(id)) {
        store.select([id]);
        return;
      }
      const m = store.getState().history.present;
      const ref = findEntity(m, id);
      const ent = ref?.entity as { x: number; y: number; elevation?: number } | undefined;
      if (!ent) return;
      const elevation = ref?.kind === "object" ? (ent.elevation ?? 0) : 0;
      plane.constant = -elevation * MM;
      const p2 = hit(e.nativeEvent.clientX, e.nativeEvent.clientY);
      if (!p2) return;
      const sits = ref?.kind === "object" && Math.abs(elevation - surfaceBelow(m, ref.entity)) < 1;
      state.current = { id, start: p2, pointerId: e.pointerId, x0: ent.x, y0: ent.y, sits };
      const o = (gl.domElement as HTMLCanvasElement & { __orbit?: OrbitControls }).__orbit;
      if (o) o.enabled = false;
    },
  };
}
