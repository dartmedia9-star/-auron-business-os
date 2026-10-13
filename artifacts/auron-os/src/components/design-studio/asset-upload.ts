import {
  abortDesignAssetUpload,
  completeDesignAssetUpload,
  getDesignAssetUpload,
  startDesignAssetUpload,
  type DesignAsset,
} from "@workspace/api-client-react";
import { ASSET_LIMITS, readImageHeader, type ImageHeader } from "@workspace/design-model";

// Uploads an image to the Design Studio asset store in pieces below 1 MB
// (Nginx's default body limit), with a checksum per piece and for the whole
// file. A file the server already has (same SHA-256) isn't sent again. A
// failed piece is retried; an interrupted upload resumes from the pieces the
// server already has. Everything runs in the browser and our own API.

export type UploadMeta = { name: string; kind: "image" | "pdf-image" | "pdf-page"; sourceName?: string | null; sourcePage?: number | null };
export type UploadProgress = { phase: "checking" | "uploading" | "finishing"; fraction: number };

export const assetFileUrl = (id: number) => `/api/design-assets/${id}/file`;
export const assetThumbUrl = (id: number) => `/api/design-assets/${id}/thumb`;

// ------------------------------------------------------------- SHA-256 ----
// crypto.subtle only exists on https (and localhost); fall back to a small
// plain implementation so imports also work on a plain-http address.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Plain(data: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32));
  view.setUint32(total - 4, (len * 8) >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const d = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return sha256Plain(data);
}

// ------------------------------------------------------------ previews ----

/** A small JPEG preview (longest side 480 px) for the gallery, made from a decoded image. */
export async function makeThumbnail(source: CanvasImageSource & { width: number; height: number }): Promise<Uint8Array | null> {
  const scale = Math.min(1, 480 / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Transparent PNG artwork reads better on white than on black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  canvas.width = canvas.height = 0;
  if (!blob || blob.size > ASSET_LIMITS.maxThumbBytes) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Checks the bytes are a supported image and that the browser can actually decode it. */
export async function checkImage(bytes: Uint8Array): Promise<{ ok: true; header: ImageHeader; bitmap: ImageBitmap } | { ok: false; error: string }> {
  if (bytes.length > ASSET_LIMITS.maxBytes) return { ok: false, error: `The file is ${(bytes.length / 1048576).toFixed(1)} MB; the largest image accepted is ${ASSET_LIMITS.maxBytes / 1048576} MB.` };
  const h = readImageHeader(bytes);
  if (!h.ok) return h;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as unknown as ArrayBuffer], { type: h.image.mime }));
    return { ok: true, header: h.image, bitmap };
  } catch {
    return { ok: false, error: "The image couldn't be opened (it may be damaged, or this browser can't read this variant)." };
  }
}

// -------------------------------------------------------------- upload ----

async function putPiece(uploadId: string, index: number, piece: Uint8Array, signal?: AbortSignal): Promise<void> {
  const hash = await sha256Hex(piece);
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    try {
      const res = await fetch(`/api/design-assets/uploads/${uploadId}/chunks/${index}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/octet-stream", "x-chunk-sha256": hash },
        body: piece as unknown as BodyInit,
        signal,
      });
      if (res.ok) return;
      const body = await res.json().catch(() => null);
      lastError = body?.error ?? `The server answered ${res.status}.`;
      // Only network trouble and server errors are worth retrying.
      if (res.status < 500 && res.status !== 408 && res.status !== 429) throw new Error(lastError);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      if (err instanceof Error && err.message === lastError) throw err;
      lastError = "The connection dropped.";
    }
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  throw new Error(`${lastError} (piece ${index + 1} failed three times)`);
}

/**
 * Uploads bytes already checked with `checkImage`. Returns the stored asset
 * and whether it was already there.
 */
export async function uploadAsset(
  bytes: Uint8Array,
  meta: UploadMeta,
  thumb: Uint8Array | null,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<{ asset: DesignAsset; existed: boolean }> {
  opts.onProgress?.({ phase: "checking", fraction: 0 });
  const sha256 = await sha256Hex(bytes);
  const start = await startDesignAssetUpload({ name: meta.name.slice(0, 200) || "Image", kind: meta.kind, byteSize: bytes.length, sha256, sourceName: meta.sourceName ?? null, sourcePage: meta.sourcePage ?? null });
  if (start.status === "exists" && start.asset) return { asset: start.asset, existed: true };
  const { uploadId, chunkSize, chunkCount } = start as Required<typeof start>;
  try {
    for (let i = 0; i < chunkCount; i++) {
      opts.onProgress?.({ phase: "uploading", fraction: i / chunkCount });
      await putPiece(uploadId, i, bytes.subarray(i * chunkSize, (i + 1) * chunkSize), opts.signal);
    }
    // If anything went missing on the way, send just those pieces again.
    const state = await getDesignAssetUpload(uploadId);
    const have = new Set(state.received);
    for (let i = 0; i < chunkCount; i++) if (!have.has(i)) await putPiece(uploadId, i, bytes.subarray(i * chunkSize, (i + 1) * chunkSize), opts.signal);
    opts.onProgress?.({ phase: "finishing", fraction: 1 });
    const asset = await completeDesignAssetUpload(uploadId, { thumbnail: thumb ? toBase64(thumb) : null });
    return { asset, existed: false };
  } catch (err) {
    abortDesignAssetUpload(uploadId).catch(() => undefined);
    throw err;
  }
}
