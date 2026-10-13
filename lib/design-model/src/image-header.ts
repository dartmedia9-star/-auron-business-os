// Identifies an image from its bytes (never from the file name) and reads its
// pixel size from the header, without decoding it. Used by the server to
// validate uploads and by the browser to reject files early. Only PNG, JPEG
// and WebP are accepted: they're what designers send and what every browser
// (including iPad Safari) can show as a texture. SVG is refused on purpose
// (it can carry scripts).

export const ASSET_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AssetMime = (typeof ASSET_MIMES)[number];

export const ASSET_LIMITS = {
  /** Largest accepted image file. */
  maxBytes: 25 * 1024 * 1024,
  /** Largest side in pixels (iPad Safari's canvas and texture limits sit around here). */
  maxSide: 16384,
  /** Largest image area in pixels; bigger images are too slow to decode on an iPad. */
  maxPixels: 50_000_000,
  /** Upload piece size: below Nginx's default 1 MB body limit with room for headers. */
  chunkBytes: 768 * 1024,
  /** Largest thumbnail (sent with the final upload step). */
  maxThumbBytes: 300 * 1024,
  /** Unfinished uploads are removed after this long. */
  uploadTtlHours: 24,
  /** Unfinished uploads one person can have at once. */
  maxOpenUploadsPerUser: 12,
} as const;

export type ImageHeader = { mime: AssetMime; width: number; height: number };
export type ImageHeaderResult = { ok: true; image: ImageHeader } | { ok: false; error: string };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): ImageHeaderResult {
  // Signature, then the IHDR chunk must come first.
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return { ok: false, error: "The PNG file is damaged (no image header)." };
  return { ok: true, image: { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20) } };
}

function jpeg(b: Uint8Array): ImageHeaderResult {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return { ok: false, error: "The JPEG file is damaged." };
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Markers without a length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = u16be(b, i + 2);
    if (len < 2) return { ok: false, error: "The JPEG file is damaged." };
    // Start-of-frame markers carry the size (C4, C8 and CC are other tables).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { ok: true, image: { mime: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) } };
    }
    i += 2 + len;
  }
  return { ok: false, error: "The JPEG file has no image size (it may be damaged)." };
}

function webp(b: Uint8Array): ImageHeaderResult {
  if (b.length < 30) return { ok: false, error: "The WebP file is damaged." };
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { ok: false, error: "The WebP file is damaged." };
    return { ok: true, image: { mime: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff } };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return { ok: false, error: "The WebP file is damaged." };
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { ok: true, image: { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 } };
  }
  if (chunk === "VP8X") return { ok: true, image: { mime: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 } };
  return { ok: false, error: "This WebP variant isn't supported." };
}

/** What kind of file the bytes are, for a clear message ("This is a PDF", "This is a HEIC photo"). */
export function sniffKind(b: Uint8Array): "png" | "jpeg" | "webp" | "pdf" | "gif" | "heic" | "svg" | "tiff" | "unknown" {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return "pdf";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|avif)$/.test(ascii(b, 8, 4))) return "heic";
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a))) return "tiff";
  const head = ascii(b, 0, Math.min(b.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return "unknown";
}

const UNSUPPORTED: Record<string, string> = {
  pdf: "This is a PDF. Open it with Import Reference to pick its pages or images.",
  gif: "GIF images aren't supported. Save it as PNG or JPEG and import that.",
  heic: "This is a HEIC/AVIF photo. On the iPad, share it as JPEG (or set Camera › Formats › Most Compatible) and import that.",
  svg: "SVG drawings aren't accepted (they can contain scripts). Export it as PNG and import that.",
  tiff: "TIFF images aren't supported. Save it as PNG or JPEG and import that.",
  unknown: "This file isn't a PNG, JPEG or WebP image.",
};

/** Checks the bytes are a supported image within the limits and reads its size. */
export function readImageHeader(b: Uint8Array): ImageHeaderResult {
  const kind = sniffKind(b);
  const r = kind === "png" ? png(b) : kind === "jpeg" ? jpeg(b) : kind === "webp" ? webp(b) : { ok: false as const, error: UNSUPPORTED[kind] };
  if (!r.ok) return r;
  const { width, height } = r.image;
  if (!(width > 0 && height > 0)) return { ok: false, error: "The image has no size (it may be damaged)." };
  if (width > ASSET_LIMITS.maxSide || height > ASSET_LIMITS.maxSide) return { ok: false, error: `The image is ${width} × ${height} pixels; the largest side allowed is ${ASSET_LIMITS.maxSide} pixels.` };
  if (width * height > ASSET_LIMITS.maxPixels) return { ok: false, error: `The image is ${Math.round((width * height) / 1e6)} megapixels; the limit is ${ASSET_LIMITS.maxPixels / 1e6}.` };
  return r;
}
