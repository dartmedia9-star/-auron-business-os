import { useEffect, useMemo, useReducer } from "react";
import * as THREE from "three";
import { assetFileUrl } from "./asset-upload";

// Artwork textures for the 3D view, one per image however many surfaces
// use it. Loaded from our own asset store, decoded in the browser, scaled
// down to a size a tablet GPU handles comfortably, and released (after a
// short grace period, so undo / redo doesn't reload) once nothing uses them.

export type ArtTexture = {
  status: "loading" | "ready" | "missing";
  texture: THREE.Texture | null;
  /** The image's own size in pixels (its aspect drives the fit). */
  width: number;
  height: number;
};

type Entry = ArtTexture & { refs: number; listeners: Set<() => void>; release: ReturnType<typeof setTimeout> | null; done: Promise<void> };

const cache = new Map<number, Entry>();
const RELEASE_AFTER_MS = 20_000;

/**
 * Longest texture side. A 4096 px RGBA texture with mipmaps is about 85 MB of
 * GPU memory, so touch devices (iPad) get 2048 px, which still gives about
 * 3 mm per pixel on a 6 m backdrop.
 */
export function artTextureMaxSide(): number {
  const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  return touch ? 2048 : 4096;
}

async function load(id: number, e: Entry): Promise<void> {
  try {
    const res = await fetch(assetFileUrl(id), { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const bitmap = await createImageBitmap(await res.blob());
    const { width, height } = bitmap;
    const max = artTextureMaxSide();
    let source: TexImageSource = bitmap;
    if (Math.max(width, height) > max) {
      const k = max / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * k));
      canvas.height = Math.max(1, Math.round(height * k));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      source = canvas;
    }
    const texture = new THREE.Texture(source as never);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Image rows run top to bottom; our image coordinates do too.
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    Object.assign(e, { status: "ready", texture, width, height });
  } catch {
    Object.assign(e, { status: "missing", texture: null, width: 0, height: 0 });
  }
  e.listeners.forEach((l) => l());
}

function acquire(id: number, onChange: () => void): () => void {
  let e = cache.get(id);
  if (!e) {
    e = { status: "loading", texture: null, width: 0, height: 0, refs: 0, listeners: new Set(), release: null, done: Promise.resolve() };
    cache.set(id, e);
    e.done = load(id, e);
  }
  const entry = e;
  if (entry.release) {
    clearTimeout(entry.release);
    entry.release = null;
  }
  entry.refs++;
  entry.listeners.add(onChange);
  return () => {
    entry.listeners.delete(onChange);
    entry.refs--;
    if (entry.refs > 0) return;
    entry.release = setTimeout(() => {
      if (entry.refs > 0) return;
      entry.texture?.dispose();
      const src = entry.texture?.image as { close?: () => void } | undefined;
      src?.close?.();
      cache.delete(id);
    }, RELEASE_AFTER_MS);
  };
}

const LOADING: ArtTexture = { status: "loading", texture: null, width: 0, height: 0 };

/** The textures for these asset ids; re-renders as each one finishes loading. */
export function useArtTextures(ids: number[]): ReadonlyMap<number, ArtTexture> {
  const key = [...ids].sort((a, b) => a - b).join(",");
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!key) return;
    const offs = key.split(",").map((s) => acquire(Number(s), bump));
    return () => offs.forEach((off) => off());
  }, [key]);
  return useMemo(() => {
    const out = new Map<number, ArtTexture>();
    if (key) for (const s of key.split(",")) out.set(Number(s), cache.get(Number(s)) ?? LOADING);
    return out;
    // `version` changes when a texture finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}

/** Resolves once every listed image has loaded or failed (for snapshots and exports). */
export async function artSettled(ids: number[]): Promise<void> {
  await Promise.all(ids.map((id) => cache.get(id)?.done ?? Promise.resolve()));
}

// ---------------------------------------------------- missing pattern ----

let missing: THREE.CanvasTexture | null = null;

/** A tiled "Missing image" pattern for surfaces whose image is gone or unreadable. */
export function missingArtTexture(): THREE.CanvasTexture {
  if (missing) return missing;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 10;
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(18, 104, 220, 48);
  ctx.fillStyle = "#9f1239";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Missing image", 128, 129);
  missing = new THREE.CanvasTexture(c);
  missing.colorSpace = THREE.SRGBColorSpace;
  missing.flipY = false;
  missing.wrapS = missing.wrapT = THREE.RepeatWrapping;
  return missing;
}

/** Size of one tile of the missing pattern on a surface, in mm. */
export const MISSING_TILE_MM = 600;

// ------------------------------------------------------------ material ----

/**
 * Makes a standard material show its map only inside the image (UVs 0–1)
 * and the material colour outside it, so "contain" leaves clean bands in
 * the surface colour and transparent PNG artwork sits on that colour
 * instead of being tinted by it. Glowing surfaces (screens) also emit the
 * image so it stays readable under any lighting.
 */
export function patchArtMaterial(m: THREE.MeshStandardMaterial, opts: { glow: boolean; clip: boolean }): void {
  const diffuse = opts.glow ? "0.25" : "1.0";
  const glow = opts.glow ? "0.9" : "0.0";
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `
float artA = 0.0;
vec3 artRgb = vec3(0.0);
#ifdef USE_MAP
  vec4 artTexel = texture2D( map, vMapUv );
  float artInside = ${opts.clip ? "step(0.0, vMapUv.x) * step(vMapUv.x, 1.0) * step(0.0, vMapUv.y) * step(vMapUv.y, 1.0)" : "1.0"};
  artA = artTexel.a * artInside;
  artRgb = artTexel.rgb;
  diffuseColor.rgb = mix( diffuseColor.rgb, artRgb * ${diffuse}, artA );
#endif
`,
      )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += artRgb * artA * ${glow};`);
  };
  m.customProgramCacheKey = () => `art:${opts.glow ? 1 : 0}:${opts.clip ? 1 : 0}`;
  m.needsUpdate = true;
}
