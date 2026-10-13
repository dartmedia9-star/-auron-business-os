import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { objectParts, partColor, type DesignObject, type Part, type Tone } from "@workspace/design-model";

export { TONE_DEFAULTS, partColor } from "@workspace/design-model";
import { MM, gridParts, partsGeometry } from "./scene-builders";

// Renders one event object (built-in or custom) from its shared parts: the
// same parts the plan symbol, thumbnails and tests use. Geometry is merged
// per colour and rebuilt only when the object changes; the previous buffers
// are disposed so editing sizes repeatedly never leaks GPU memory.

type Look = { roughness: number; metalness: number; transparent?: boolean; opacity?: number; emissive?: boolean };

const LOOK: Record<Tone, Look> = {
  body: { roughness: 0.75, metalness: 0 },
  accent: { roughness: 0.6, metalness: 0 },
  screen: { roughness: 0.3, metalness: 0, emissive: true },
  metal: { roughness: 0.35, metalness: 0.65 },
  glass: { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 },
  frame: { roughness: 0.6, metalness: 0.1 },
  exit: { roughness: 0.6, metalness: 0, emissive: true },
  dark: { roughness: 0.85, metalness: 0 },
  light: { roughness: 0.9, metalness: 0 },
  top: { roughness: 0.45, metalness: 0.05 },
};

export const ObjectModel = memo(function ObjectModel({
  object: o,
  highlight,
  parts: given,
}: {
  object: Pick<DesignObject, "type" | "width" | "depth" | "height" | "props" | "color" | "accentColor" | "custom">;
  highlight?: (hex: string) => string;
  /** Pre-built parts (the Custom Builder preview); otherwise built from the object. */
  parts?: Part[];
}) {
  const parts = useMemo(() => given ?? objectParts(o), [given, o]);
  const groups = useMemo(() => partsGeometry(parts, (p) => partColor(o, p)), [parts, o]);
  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);
  const grids = useMemo(() => gridParts(parts), [parts]);
  return (
    <>
      {groups.map((g) => {
        const look = LOOK[g.tone];
        const color = highlight && g.tone !== "glass" ? highlight(g.color) : g.color;
        return (
          <mesh key={g.key} geometry={g.geometry} castShadow={!look.transparent} receiveShadow>
            <meshStandardMaterial
              color={g.tone === "screen" ? "#05070b" : color}
              roughness={look.roughness}
              metalness={look.metalness}
              transparent={look.transparent ?? false}
              opacity={look.opacity ?? 1}
              depthWrite={!look.transparent}
              emissive={look.emissive ? g.color : "#000000"}
              emissiveIntensity={g.tone === "screen" ? 0.35 : g.tone === "exit" ? 0.8 : 0}
              side={look.transparent ? THREE.DoubleSide : THREE.FrontSide}
            />
          </mesh>
        );
      })}
      {grids.map((g, i) => (
        <ModuleGrid key={i} part={g} />
      ))}
    </>
  );
});

function ModuleGrid({ part }: { part: Extract<Part, { kind: "grid" }> }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const x0 = -part.w / 2;
    for (let x = 0; x <= part.w + 0.5; x += part.cell) pts.push(new THREE.Vector3((x0 + x) * MM, part.y * MM, 0), new THREE.Vector3((x0 + x) * MM, (part.y + part.h) * MM, 0));
    for (let y = 0; y <= part.h + 0.5; y += part.cell) pts.push(new THREE.Vector3(x0 * MM, (part.y + y) * MM, 0), new THREE.Vector3((x0 + part.w) * MM, (part.y + y) * MM, 0));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [part.w, part.h, part.y, part.cell]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position-z={part.z * MM}>
      <lineBasicMaterial color="#0f172a" transparent opacity={0.6} />
    </lineSegments>
  );
}
