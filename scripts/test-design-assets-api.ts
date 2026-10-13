/**
 * Integration test for Design Studio image assets and chunked uploads
 * (V3): authentication, starting an upload, pieces below 1 MB, resume
 * state, piece length and checksum checks, completion with whole-file
 * SHA-256 and content checks, de-duplication, unsupported and fake files,
 * thumbnails, caching headers, rename, delete protection, open-upload limit,
 * cancel, and removal of expired uploads.
 *
 * LOCAL / TEST DATABASES ONLY. It creates images, design projects and
 * custom objects (and deletes the ones it created). Never point it at
 * production.
 *
 * Prerequisites: migrations 0007–0009 applied to a disposable database and
 * an API server running against it at BASE_URL. DATABASE_URL (the same
 * disposable database) enables the expired-upload check, which back-dates
 * one upload with psql.
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... DATABASE_URL=postgres://... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-design-assets-api.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { ASSET_LIMITS, createEmptyModel, makeObject, makeRectRoom, readImageHeader, sniffKind } from "../lib/design-model/src/index";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

if (process.env.ALLOW_TEST_DATA !== "1") {
  console.error("Refusing to run: this test writes data. Set ALLOW_TEST_DATA=1 and use a disposable database.");
  process.exit(1);
}
if (!USERNAME || !PASSWORD) {
  console.error("TEST_USERNAME and TEST_PASSWORD environment variables are required.");
  process.exit(1);
}

let cookie = "";
let failures = 0;
let passes = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function api(method: string, path: string, body?: unknown, opts: { anonymous?: boolean; bytes?: Uint8Array; headers?: Record<string, string> } = {}): Promise<{ status: number; data: Json; headers: Headers; bytes: Buffer }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(opts.bytes ? { "content-type": "application/octet-stream" } : body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie && !opts.anonymous ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.bytes ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  for (const entry of res.headers.getSetCookie?.() ?? []) if (entry.startsWith("sid=")) cookie = entry.split(";")[0];
  const bytes = Buffer.from(await res.arrayBuffer());
  let data: Json = null;
  if (bytes.length && (res.headers.get("content-type") ?? "").includes("json")) {
    try {
      data = JSON.parse(bytes.toString("utf8"));
    } catch {
      data = bytes.toString("utf8");
    }
  }
  return { status: res.status, data, headers: res.headers, bytes };
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) passes++;
  else failures++;
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${condition || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// ------------------------------------------------------- test images ----
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A real PNG; `noise` makes it incompressible (so it needs several upload pieces). */
function makePng(w: number, h: number, noise: boolean): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const fill = noise ? randomBytes(raw.length) : null;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = fill ? fill[y * w * 3 + x] : (x * 7 + y * 3) & 255;
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw, { level: noise ? 0 : 6 })), pngChunk("IEND", Buffer.alloc(0))]);
}
/** A JPEG header with a frame size (enough for the server's content check; the browser test uses real JPEGs). */
function jpegHeader(w: number, h: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, randomBytes(64), Buffer.from([0xff, 0xd9])]);
}

async function uploadBytes(file: Buffer, name: string, opts: { thumbnail?: string | null; kind?: string } = {}) {
  const start = await api("POST", "/design-assets/uploads", { name, kind: opts.kind ?? "image", byteSize: file.length, sha256: sha(file), sourceName: `${name}.png` });
  if (start.data?.status === "exists") return { start, done: { status: 200, data: start.data.asset } };
  const { uploadId, chunkSize, chunkCount } = start.data;
  for (let i = 0; i < chunkCount; i++) {
    const piece = file.subarray(i * chunkSize, (i + 1) * chunkSize);
    const r = await api("PUT", `/design-assets/uploads/${uploadId}/chunks/${i}`, undefined, { bytes: piece, headers: { "x-chunk-sha256": sha(piece) } });
    if (r.status !== 204) return { start, done: r };
  }
  const done = await api("POST", `/design-assets/uploads/${uploadId}/complete`, { thumbnail: opts.thumbnail ?? null });
  return { start, done };
}

async function main() {
  // --------------------------------------------------------- sign-in ----
  check("listing images requires sign-in", (await api("GET", "/design-assets", undefined, { anonymous: true })).status === 401);
  check("starting an upload requires sign-in", (await api("POST", "/design-assets/uploads", { name: "x", kind: "image", byteSize: 10, sha256: "0".repeat(64) }, { anonymous: true })).status === 401);
  check("fetching image bytes requires sign-in", (await api("GET", "/design-assets/1/file", undefined, { anonymous: true })).status === 401);
  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("signed in", login.status === 200 && !!cookie, login.status);

  const created: number[] = [];

  // ------------------------------------------------- start validation ----
  check("start: a malformed checksum is refused", (await api("POST", "/design-assets/uploads", { name: "x", kind: "image", byteSize: 10, sha256: "abc" })).status === 400);
  const tooBig = await api("POST", "/design-assets/uploads", { name: "big", kind: "image", byteSize: ASSET_LIMITS.maxBytes + 1, sha256: "a".repeat(64) });
  check("start: a file over 25 MB is refused with the limit in the message", tooBig.status === 400 && /25 MB/.test(tooBig.data?.error), tooBig.data);
  check("start: an unknown kind is refused", (await api("POST", "/design-assets/uploads", { name: "x", kind: "video", byteSize: 10, sha256: "a".repeat(64) })).status === 400);
  check("start: a blank name is refused", (await api("POST", "/design-assets/uploads", { name: "   ", kind: "image", byteSize: 10, sha256: "a".repeat(64) })).status === 400);

  // -------------------------------------- multi-piece upload of a PNG ----
  const big = makePng(1200, 900, true);
  const bigSha = sha(big);
  check("test PNG is real and over 3 MB", readImageHeader(big).ok && big.length > 3_000_000, big.length);
  const start = await api("POST", "/design-assets/uploads", { name: "Stage backdrop", kind: "image", byteSize: big.length, sha256: bigSha, sourceName: "stage.png" });
  check("start: 201 with an upload id", start.status === 201 && start.data.status === "upload" && typeof start.data.uploadId === "string", start.data);
  const { uploadId, chunkSize, chunkCount } = start.data;
  check("pieces are below 1 MB (Nginx's default body limit)", chunkSize < 1_000_000 && chunkSize === ASSET_LIMITS.chunkBytes, chunkSize);
  check("piece count covers the whole file", chunkCount === Math.ceil(big.length / chunkSize), chunkCount);

  const piece = (i: number) => big.subarray(i * chunkSize, (i + 1) * chunkSize);
  check("a piece with the wrong length is refused", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/0`, undefined, { bytes: piece(0).subarray(0, 1000) })).status === 400);
  check("a piece whose checksum doesn't match is refused", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/0`, undefined, { bytes: piece(0), headers: { "x-chunk-sha256": "0".repeat(64) } })).status === 400);
  check("a piece number out of range is refused", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/${chunkCount}`, undefined, { bytes: piece(0) })).status === 400);
  const oversized = await api("PUT", `/design-assets/uploads/${uploadId}/chunks/0`, undefined, { bytes: randomBytes(ASSET_LIMITS.chunkBytes + 1) });
  check("a piece over the piece limit is refused before it is read (413)", oversized.status === 413, oversized.status);
  check("a piece sent as JSON is refused", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/0`, { a: 1 })).status === 400);

  check("piece 0 accepted", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/0`, undefined, { bytes: piece(0), headers: { "x-chunk-sha256": sha(piece(0)) } })).status === 204);
  check("piece 2 accepted out of order", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/2`, undefined, { bytes: piece(2) })).status === 204);
  check("re-sending a piece (a retry) is accepted", (await api("PUT", `/design-assets/uploads/${uploadId}/chunks/2`, undefined, { bytes: piece(2) })).status === 204);
  const state = await api("GET", `/design-assets/uploads/${uploadId}`);
  check("resume state lists the pieces received", state.status === 200 && JSON.stringify(state.data.received) === "[0,2]", state.data);
  const early = await api("POST", `/design-assets/uploads/${uploadId}/complete`, {});
  check("completing with pieces missing is refused and names the first missing piece", early.status === 400 && /first missing: 1/.test(early.data?.error), early.data);
  for (let i = 1; i < chunkCount; i++) if (i !== 2) await api("PUT", `/design-assets/uploads/${uploadId}/chunks/${i}`, undefined, { bytes: piece(i) });
  const thumb = makePng(64, 48, false);
  const badThumb = await api("POST", `/design-assets/uploads/${uploadId}/complete`, { thumbnail: Buffer.from("not an image").toString("base64") });
  check("an invalid preview image is refused", badThumb.status === 400, badThumb.data);
  const done = await api("POST", `/design-assets/uploads/${uploadId}/complete`, { thumbnail: thumb.toString("base64") });
  check("complete: 201 with the image's real type and size", done.status === 201 && done.data.mime === "image/png" && done.data.width === 1200 && done.data.height === 900 && done.data.byteSize === big.length && done.data.sha256 === bigSha && done.data.hasThumb, done.data);
  const assetId: number = done.data.id;
  created.push(assetId);
  check("the upload session is gone after completion", (await api("GET", `/design-assets/uploads/${uploadId}`)).status === 404);

  const file = await api("GET", `/design-assets/${assetId}/file`);
  check("the stored bytes are identical to the original", file.status === 200 && Buffer.compare(file.bytes, big) === 0, file.bytes.length);
  check("served with its type, nosniff and an immutable cache", file.headers.get("content-type") === "image/png" && file.headers.get("x-content-type-options") === "nosniff" && /immutable/.test(file.headers.get("cache-control") ?? ""));
  const etag = file.headers.get("etag") ?? "";
  check("a repeat request with its ETag gets 304", (await api("GET", `/design-assets/${assetId}/file`, undefined, { headers: { "if-none-match": etag } })).status === 304);
  const th = await api("GET", `/design-assets/${assetId}/thumb`);
  check("the thumbnail is served separately", th.status === 200 && Buffer.compare(th.bytes, thumb) === 0);
  const list = await api("GET", "/design-assets");
  const listed = (list.data as Json[]).find((a) => a.id === assetId);
  check("the gallery list has the image's metadata, without its bytes", !!listed && listed.name === "Stage backdrop" && listed.sourceName === "stage.png" && !("data" in listed), listed);

  // ------------------------------------------------------ duplicates ----
  const again = await api("POST", "/design-assets/uploads", { name: "Same file again", kind: "image", byteSize: big.length, sha256: bigSha });
  check("the same file again is recognised and not stored twice", again.status === 200 && again.data.status === "exists" && again.data.asset.id === assetId, again.data);

  // ------------------------------------------------- bad content ----
  const a = makePng(40, 30, false);
  const b = makePng(41, 30, false);
  const mis = await api("POST", "/design-assets/uploads", { name: "mismatch", kind: "image", byteSize: b.length, sha256: sha(a) });
  await api("PUT", `/design-assets/uploads/${mis.data.uploadId}/chunks/0`, undefined, { bytes: b });
  const misDone = await api("POST", `/design-assets/uploads/${mis.data.uploadId}/complete`, {});
  check("a file whose checksum doesn't match is refused (damaged on the way)", misDone.status === 400 && /checksum/.test(misDone.data?.error), misDone.data);
  check("…and that upload is discarded", (await api("GET", `/design-assets/uploads/${mis.data.uploadId}`)).status === 404);

  for (const [label, bytes, re] of [
    ["a text file renamed .png", Buffer.from("hello, this is not an image at all"), /isn't a PNG, JPEG or WebP/],
    ["a PDF", Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n"), /PDF/],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), /SVG/],
    ["a HEIC photo", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), randomBytes(40)]), /HEIC/],
  ] as const) {
    const s = await api("POST", "/design-assets/uploads", { name: label, kind: "image", byteSize: bytes.length, sha256: sha(bytes) });
    const r = await api("PUT", `/design-assets/uploads/${s.data.uploadId}/chunks/0`, undefined, { bytes });
    check(`${label} is refused at the first piece with a clear reason`, r.status === 400 && re.test(r.data?.error), r.data);
  }
  check("content check: sniffKind reads the bytes, not the name", sniffKind(Buffer.from("%PDF-1.4")) === "pdf");

  const huge = makePng(17000, 10, false);
  const hugeUp = await uploadBytes(huge, "too wide");
  check("an image wider than 16,384 px is refused", hugeUp.done.status === 400 && /16384/.test(hugeUp.done.data?.error), hugeUp.done.data);

  const jpg = jpegHeader(3000, 2000);
  const jpgUp = await uploadBytes(jpg, "Counter fascia");
  check("a JPEG is stored with its size read from the frame header", jpgUp.done.status === 201 && jpgUp.done.data.mime === "image/jpeg" && jpgUp.done.data.width === 3000 && jpgUp.done.data.height === 2000, jpgUp.done.data);
  if (jpgUp.done.data?.id) created.push(jpgUp.done.data.id);

  // ---------------------------------------------------------- rename ----
  const ren = await api("PATCH", `/design-assets/${assetId}`, { name: "Stage backdrop v2" });
  check("rename", ren.status === 200 && ren.data.name === "Stage backdrop v2", ren.data);
  check("rename to blank is refused", (await api("PATCH", `/design-assets/${assetId}`, { name: "  " })).status === 400);

  // ------------------------------------------------ delete protection ----
  const model = createEmptyModel({ venueName: "Asset test" });
  const backdrop = makeObject("backdrop", 4000, 3000);
  const withArt = { ...model, rooms: [makeRectRoom(0, 0, 10000, 8000, { name: "Hall" })], objects: [{ ...backdrop, finishes: { front: { assetId, fit: "cover" } } }] };
  const proj = await api("POST", "/design-projects", { name: "Asset test project", model: withArt });
  const projectSaved = proj.status === 201;
  check("a design that uses the image saves", projectSaved, proj.data);
  if (projectSaved) {
    const usage = await api("GET", `/design-assets/${assetId}/usage`);
    check("usage lists the design", usage.status === 200 && usage.data.some((u: Json) => u.type === "project" && u.id === proj.data.id), usage.data);
    const del = await api("DELETE", `/design-assets/${assetId}`);
    check("an image used by a design can't be deleted (409, names the design)", del.status === 409 && del.data.usedBy?.[0]?.name === "Asset test project", del.data);
    check("…and is still there", (await api("GET", `/design-assets/${assetId}`)).status === 200);
    const plain = { ...withArt, objects: [backdrop] };
    const upd = await api("PATCH", `/design-projects/${proj.data.id}`, { baseRevision: proj.data.revision, model: plain });
    check("removing the artwork from the design saves", upd.status === 200, upd.data);
    await api("DELETE", `/design-projects/${proj.data.id}`);
  }
  const del2 = await api("DELETE", `/design-assets/${assetId}`);
  check("once nothing uses it, the image can be deleted", del2.status === 204, del2.data);
  check("…and is gone", (await api("GET", `/design-assets/${assetId}/file`)).status === 404);
  created.splice(created.indexOf(assetId), 1);

  // ------------------------------------------- open-upload limit, cancel ----
  const open: string[] = [];
  let limited: { status: number; data: Json } | null = null;
  for (let i = 0; i < ASSET_LIMITS.maxOpenUploadsPerUser + 1; i++) {
    const f = randomBytes(100);
    const r = await api("POST", "/design-assets/uploads", { name: `open ${i}`, kind: "image", byteSize: 100, sha256: sha(f) });
    if (r.status === 201) open.push(r.data.uploadId);
    else limited = r;
  }
  check(`more than ${ASSET_LIMITS.maxOpenUploadsPerUser} unfinished uploads are refused (429)`, limited?.status === 429, limited);
  let cancelled = 0;
  for (const id of open) if ((await api("DELETE", `/design-assets/uploads/${id}`)).status === 204) cancelled++;
  check("unfinished uploads can be cancelled", cancelled === open.length, { cancelled, open: open.length });

  // ------------------------------------------- expired uploads removed ----
  if (DATABASE_URL) {
    const f = makePng(30, 20, false);
    const s = await api("POST", "/design-assets/uploads", { name: "abandoned", kind: "image", byteSize: f.length, sha256: sha(f) });
    await api("PUT", `/design-assets/uploads/${s.data.uploadId}/chunks/0`, undefined, { bytes: f });
    execFileSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-qc", `UPDATE design_asset_uploads SET expires_at = now() - interval '1 hour' WHERE id = '${s.data.uploadId}'`]);
    check("an expired upload can't receive pieces", (await api("PUT", `/design-assets/uploads/${s.data.uploadId}/chunks/0`, undefined, { bytes: f })).status === 404);
    const g = randomBytes(50);
    await api("POST", "/design-assets/uploads", { name: "trigger", kind: "image", byteSize: 50, sha256: sha(g) }).then((r) => r.data?.uploadId && api("DELETE", `/design-assets/uploads/${r.data.uploadId}`));
    const left = execFileSync("psql", [DATABASE_URL, "-tAc", `SELECT (SELECT count(*) FROM design_asset_uploads WHERE id = '${s.data.uploadId}') || ',' || (SELECT count(*) FROM design_asset_upload_chunks WHERE upload_id = '${s.data.uploadId}')`]).toString().trim();
    check("an expired upload and its pieces are removed", left === "0,0", left);
  } else {
    console.log("[SKIP] expired-upload removal (set DATABASE_URL to the same disposable database)");
  }

  for (const id of created) await api("DELETE", `/design-assets/${id}`);
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
