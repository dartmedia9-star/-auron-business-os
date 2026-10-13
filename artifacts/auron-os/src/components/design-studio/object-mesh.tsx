import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  finishAssetIds,
  fitPlacement,
  objectParts,
  objectSurfaces,
  partColor,
  surfaceLayout,
  surfacePointToImage,
  toSurface,
  type DesignObject,
  type Part,
  type Tone,
} from "@workspace/design-model";

export { TONE_DEFAULTS, partColor } from "@workspace/design-model";
import { MM, gridParts, partsGeometry, type ArtMapping, type ArtSurface } from "./scene-builders";
import { MISSING_TILE_MM, missingArtTexture, patchArtMaterial, useArtTextures } from "./art-textures";

// Renders one event object (built-in or custom) from its shared parts: the
// same parts the plan symbol, thumbnails and tests use. Geometry is merged
// per colour and rebuilt only when the object changes; the previous buffers
// are disposed so editing sizes repeatedly never leaks GPU memory. Surfaces
// with artwork get the image mapped flat across them (see finishes.ts).

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
  object: Pick<DesignObject, "type" | "width" | "depth" | "height" | "props" | "color" | "accentColor" | "custom" | "finishes">;
  highlight?: (hex: string) => string;
  /** Pre-built parts (the Custom Builder preview); otherwise built from the object. */
  parts?: Part[];
}) {
  const parts = useMemo(() => given ?? objectParts(o), [given, o]);
  const art = useArtMapping(o, parts);
  const groups = useMemo(() => partsGeometry(parts, (p) => partColor(o, p), "render", art), [parts, o, art]);
  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);
  const grids = useMemo(() => gridParts(parts), [parts]);
  return (
    <>
      {groups.map((g) => {
        const look = LOOK[g.tone];
        const color = highlight && g.tone !== "glass" ? highlight(g.color) : g.color;
        if (g.art)
          return (
            <mesh key={g.key} geometry={g.geometry} castShadow receiveShadow>
              <ArtMaterial art={g.art} color={g.tone === "screen" ? "#05070b" : color} roughness={g.art.glow ? 0.3 : look.roughness} metalness={look.metalness} />
            </mesh>
          );
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

/** Where each surface's artwork goes, once its image has loaded (undefined while there's none). */
function useArtMapping(o: Pick<DesignObject, "type" | "width" | "depth" | "height" | "props" | "custom" | "finishes">, parts: Part[]): ArtMapping | undefined {
  const finishes = o.finishes;
  const hasArt = !!finishes && Object.keys(finishes).length > 0;
  const layout = useMemo(() => (hasArt ? surfaceLayout(parts, objectSurfaces(o)) : null), [hasArt, parts, o]);
  const ids = useMemo(() => finishAssetIds(finishes), [finishes]);
  const textures = useArtTextures(ids);
  return useMemo(() => {
    if (!layout || !finishes) return undefined;
    const surfaces = layout.surfaces.map(({ def, rect, faces }): ArtSurface | null => {
      const f = finishes[def.id];
      const t = f ? textures.get(f.assetId) : undefined;
      if (!f || !t || !faces || t.status === "loading") return null;
      if (t.status === "missing" || !t.texture)
        return {
          key: `missing:${def.id}`,
          texture: missingArtTexture(),
          glow: false,
          clip: false,
          uv: (q) => {
            const [u, v] = toSurface(def.facing, q);
            return [(u - rect.u0) / MISSING_TILE_MM, (rect.v1 - v) / MISSING_TILE_MM];
          },
        };
      const pl = fitPlacement(rect.u1 - rect.u0, rect.v1 - rect.v0, t.width, t.height, f);
      return { key: def.id, texture: t.texture, glow: !!def.glow, clip: true, uv: (q) => surfacePointToImage(def.facing, rect, pl, q) };
    });
    return surfaces.some(Boolean) ? { faceSurface: layout.faceSurface, surfaces } : undefined;
  }, [layout, finishes, textures]);
}

function ArtMaterial({ art, color, roughness, metalness }: { art: ArtSurface; color: string; roughness: number; metalness: number }) {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: art.texture });
    patchArtMaterial(m, { glow: art.glow, clip: art.clip });
    return m;
  }, [art.texture, art.glow, art.clip]);
  useEffect(() => () => material.dispose(), [material]);
  material.color.set(color);
  material.roughness = roughness;
  material.metalness = metalness;
  return <primitive object={material} attach="material" />;
}

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
