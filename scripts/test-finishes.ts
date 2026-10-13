/**
 * Design Studio V3 artwork on surfaces: schema and V2 compatibility, which
 * faces make up each named surface, orientation (never mirrored or upside
 * down), and the fit maths (contain, cover, stretch, custom, rotation,
 * offsets). No server or database needed.
 *
 *   npx tsx scripts/test-finishes.ts
 */
import {
  FACING_DIR,
  OBJECT_DEFS,
  OBJECT_TYPES,
  SCHEMA_VERSION,
  DEFAULT_FINISH,
  createEmptyModel,
  finishAssetIds,
  fitPlacement,
  imageCoords,
  makeObject,
  modelAssetIds,
  objectParts,
  objectSurfaces,
  parseProjectModel,
  surfaceLayout,
  surfacePointToImage,
  toSurface,
  type DesignObject,
  type Finish,
  type SurfaceFacing,
  type V3,
} from "../lib/design-model/src/index";
import { buildSpec, type BuilderContent } from "../lib/design-model/src/custom";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const finish = (f: Partial<Finish> = {}): Finish => ({ assetId: 1, ...DEFAULT_FINISH, ...f });

// ------------------------------------------------------------- schema ----
console.log("\n# Schema and older designs");
{
  check("schema version is 2", SCHEMA_VERSION, 2);
  const v1 = { ...createEmptyModel(), schemaVersion: 1, objects: [makeObject("counter", 0, 0)] };
  const r = parseProjectModel(JSON.parse(JSON.stringify(v1)));
  check("a V2 (schema 1) design opens", r.ok, true);
  check("…and is brought to schema 2 with no finishes added", r.ok && [r.model.schemaVersion, r.model.objects[0].finishes], [2, undefined]);

  const withArt = createEmptyModel();
  withArt.objects.push({ ...makeObject("backdrop", 0, 0), finishes: { front: finish({ assetId: 42, fit: "contain", rotation: 90 }) } });
  const back = parseProjectModel(JSON.parse(JSON.stringify(withArt)));
  check("finishes survive a save and load unchanged", back.ok && back.model.objects[0].finishes, { front: finish({ assetId: 42, fit: "contain", rotation: 90 }) });
  const minimal = createEmptyModel();
  minimal.objects.push({ ...makeObject("backdrop", 0, 0), finishes: { front: { assetId: 7 } as Finish } });
  const filled = parseProjectModel(JSON.parse(JSON.stringify(minimal)));
  check("a finish with only an image id gets the defaults (cover, no turn)", filled.ok && filled.model.objects[0].finishes?.front, finish({ assetId: 7 }));

  const bad = (f: unknown, key = "front") => {
    const m = createEmptyModel();
    m.objects.push({ ...makeObject("backdrop", 0, 0), finishes: { [key]: f } as never });
    return parseProjectModel(JSON.parse(JSON.stringify(m))).ok;
  };
  check("refuses an image id that isn't a number", bad({ assetId: "7" }), false);
  check("refuses an unknown fit", bad({ assetId: 7, fit: "tile" }), false);
  check("refuses a 45° turn", bad({ assetId: 7, rotation: 45 }), false);
  check("refuses a zero scale", bad({ assetId: 7, scale: 0 }), false);
  check("refuses a surface key with odd characters", bad({ assetId: 7 }, "Front Face!"), false);
  const many = createEmptyModel();
  many.objects.push({ ...makeObject("backdrop", 0, 0), finishes: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`s${i}`, finish()])) });
  check("refuses more than 16 surfaces with artwork", parseProjectModel(JSON.parse(JSON.stringify(many))).ok, false);
  const newer = { ...createEmptyModel(), schemaVersion: 3 };
  check("a design from a newer version is refused, not misread", parseProjectModel(newer).ok, false);

  // Unknown keys are dropped by the schema, so image bytes can never ride along in a finish.
  const sneaky = createEmptyModel();
  sneaky.objects.push({ ...makeObject("backdrop", 0, 0), finishes: { front: { assetId: 7, data: "AAAA" } as never } });
  const s = parseProjectModel(JSON.parse(JSON.stringify(sneaky)));
  check("extra fields in a finish (e.g. image data) are not stored", s.ok && "data" in (s.model.objects[0].finishes?.front ?? {}), false);

  check("asset ids of an object", finishAssetIds({ front: finish({ assetId: 3 }), rear: finish({ assetId: 3 }), side: finish({ assetId: 9 }) }), [3, 9]);
  check("asset ids of a design", modelAssetIds([{ finishes: { a: finish({ assetId: 1 }) } }, {}, { finishes: { b: finish({ assetId: 2 }) } }]), [1, 2]);
}

// --------------------------------------------------------- orientation ----
console.log("\n# Orientation: every surface reads the right way round");
{
  // The viewer's right and up for each facing, in the object frame.
  const view: Record<SurfaceFacing, { right: V3; up: V3 }> = {
    front: { right: [1, 0, 0], up: [0, 1, 0] },
    back: { right: [-1, 0, 0], up: [0, 1, 0] },
    right: { right: [0, 0, -1], up: [0, 1, 0] },
    left: { right: [0, 0, 1], up: [0, 1, 0] },
    top: { right: [1, 0, 0], up: [0, 0, -1] },
  };
  for (const facing of Object.keys(view) as SurfaceFacing[]) {
    const { right, up } = view[facing];
    const o: V3 = [123, 456, 789];
    const [u0, v0] = toSurface(facing, o);
    const [ur, vr] = toSurface(facing, [o[0] + right[0], o[1] + right[1], o[2] + right[2]]);
    const [uu, vu] = toSurface(facing, [o[0] + up[0], o[1] + up[1], o[2] + up[2]]);
    check(`${facing}: the viewer's right is +u and up is +v`, [ur - u0, vr - v0, uu - u0, vu - v0], [1, 0, 0, 1]);
    // right × up must point back at the viewer, or the image would be mirrored.
    const c: V3 = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    check(`${facing}: not mirrored (right × up points at the viewer)`, c, FACING_DIR[facing]);
  }
  // On a real counter front, the top-left corner of the fascia shows the image's top-left pixel.
  const counter = makeObject("counter", 0, 0);
  const lay = surfaceLayout(objectParts(counter), objectSurfaces(counter));
  const front = lay.surfaces.find((s) => s.def.id === "front")!;
  const sw = front.rect.u1 - front.rect.u0;
  const sh = front.rect.v1 - front.rect.v0;
  const pl = fitPlacement(sw, sh, 2000, 1000, finish({ fit: "stretch" }));
  const zFront = 600 / 2 - 50; // fascia face of the default counter (depth 600, overhang 50)
  const tl = surfacePointToImage("front", front.rect, pl, [front.rect.u0, front.rect.v1, zFront]);
  const br = surfacePointToImage("front", front.rect, pl, [front.rect.u1, front.rect.v0, zFront]);
  check("counter front: viewer's top-left = image top-left", tl.map(r3), [0, 0]);
  check("counter front: viewer's bottom-right = image bottom-right", br.map(r3), [1, 1]);
  // Rear seen from behind: the viewer's left is the object's +x.
  const back = surfaceLayout(objectParts(makeObject("backdrop", 0, 0)), objectSurfaces(makeObject("backdrop", 0, 0))).surfaces.find((s) => s.def.id === "rear")!;
  const bpl = fitPlacement(back.rect.u1 - back.rect.u0, back.rect.v1 - back.rect.v0, 100, 50, finish({ fit: "stretch" }));
  const rearTL = surfacePointToImage("back", back.rect, bpl, [-back.rect.u0, back.rect.v1, -60]);
  check("backdrop rear: the corner on the viewer's top-left (object +x) is the image top-left", rearTL.map(r3), [0, 0]);
}

// ------------------------------------------------------------ surfaces ----
console.log("\n# Surfaces per object");
{
  const expected: Record<string, string[]> = {
    backdrop: ["front", "rear"],
    framed_backdrop: ["front"],
    modular_backdrop: ["front", "rear"],
    step_repeat: ["front"],
    welcome_sign: ["front", "rear"],
    display_wall: ["header", "back"],
    media_wall: ["front", "screen"],
    counter: ["front", "left", "right", "rear"],
    reception_counter: ["front", "left", "right", "rear"],
    exhibition_counter: ["front", "left", "right", "rear"],
    info_desk: ["front"],
    stage: ["front", "left", "right", "rear"],
    riser: ["front", "left", "right", "rear"],
    modular_stage: ["front", "left", "right", "rear"],
    skirting: ["front"],
    led_screen: ["screen"],
    display_screen: ["screen"],
    projection_screen: ["screen"],
    entrance_gate: ["header", "upright-left", "upright-right", "header-rear"],
    photo_frame: ["front"],
  };
  for (const type of OBJECT_TYPES) {
    if (type === "custom") continue;
    const o = makeObject(type, 0, 0);
    const surfaces = objectSurfaces(o);
    const want = expected[type] ?? [];
    check(`${type}: surfaces ${want.join(", ") || "(none)"}`, surfaces.map((s) => s.id), want);
    if (!surfaces.length) continue;
    const lay = surfaceLayout(objectParts(o), surfaces);
    const empty = lay.surfaces.filter((s) => s.faces === 0 || !(s.rect.u1 > s.rect.u0 && s.rect.v1 > s.rect.v0)).map((s) => s.def.id);
    check(`${type}: every surface has faces and a real area`, empty, []);
    check(`${type}: surface ids are valid keys`, surfaces.every((s) => /^[a-z][a-z0-9-]{0,39}$/.test(s.id)), true);
  }

  // Box arch: truss has nothing to print on until the branding panels are on.
  const truss = makeObject("box_arch", 0, 0);
  check("box arch (truss): no surfaces without branding panels", objectSurfaces(truss).length, 0);
  const clad = { ...truss, props: { ...truss.props, cladding: true } };
  const cl = surfaceLayout(objectParts(clad), objectSurfaces(clad));
  check("box arch (truss + panels): header and both uprights", cl.surfaces.map((s) => [s.def.id, s.faces > 0]), [["header", true], ["upright-left", true], ["upright-right", true]]);
  const hdr = cl.surfaces[0].rect;
  check("box arch header spans the full width at the top", [r3(hdr.u1 - hdr.u0), r3(hdr.v1)], [clad.width, clad.height]);
  const boxStyle = { ...truss, props: { ...truss.props, style: "box" } };
  check("box arch (solid beams): surfaces without extra panels", objectSurfaces(boxStyle).length, 3);
  check("box arch (truss + panels) stays inside its footprint", (() => {
    const z = objectParts(clad).filter((p) => p.kind === "box" && p.role?.endsWith("panel"));
    return z.every((p) => p.kind === "box" && p.z + p.d / 2 <= clad.depth / 2 + 1e-6);
  })(), true);

  // Backdrop with an edge frame: artwork sits inside the frame.
  const bd = makeObject("backdrop", 0, 0);
  const bl = surfaceLayout(objectParts(bd), objectSurfaces(bd)).surfaces[0].rect;
  check("framed flat backdrop: printable area is inside the 75 mm frame", [bl.u0, bl.v0, bl.u1, bl.v1], [-bd.width / 2 + 75, 75, bd.width / 2 - 75, bd.height - 75]);

  // Modular backdrop: one image across all panels, not one per panel.
  const mb = makeObject("modular_backdrop", 0, 0);
  const ml = surfaceLayout(objectParts(mb), objectSurfaces(mb)).surfaces[0];
  check("modular backdrop: one surface across every panel", [r3(ml.rect.u0), r3(ml.rect.u1), ml.faces >= 6], [-mb.width / 2, mb.width / 2, true]);

  // Counter: the top is never part of an artwork surface.
  const c = makeObject("counter", 0, 0);
  const parts = objectParts(c);
  const cl2 = surfaceLayout(parts, objectSurfaces(c));
  const topIdx = parts.findIndex((p) => p.role === "countertop");
  check("counter: the top keeps its own material", Array.from(cl2.faceSurface[topIdx] ?? []).every((s) => s === -1), true);
  const front = cl2.surfaces[0].rect;
  check("counter front: from above the plinth to under the top", [r3(front.v0), r3(front.v1)], [100, 1010]);

  // Stage: the fascia includes the deck edge and the skirt below it.
  const st = makeObject("stage", 0, 0);
  const sl = surfaceLayout(objectParts(st), objectSurfaces(st)).surfaces[0].rect;
  check("stage front fascia covers the full width and height", [r3(sl.u1 - sl.u0), r3(sl.v0), r3(sl.v1)], [st.width, 0, st.height]);

  // LED screen artwork is lit.
  check("LED screen artwork is lit (stays readable)", objectSurfaces(makeObject("led_screen", 0, 0))[0].glow, true);

  // Custom objects.
  for (const method of ["panel", "extrude", "flat"] as const) {
    const content: BuilderContent = {
      sketch: { plane: method === "flat" ? "top" : "front", shapes: [{ kind: "rect", id: "r1", x: 0, y: 0, w: 2000, h: 1000 }], dims: [], labels: [] },
      construction: { method, depth: 300, thickness: 18, section: 50, round: false, infill: false, feet: false },
      parts: [],
      template: null,
    };
    const built = buildSpec(content);
    if (!built.ok) {
      check(`custom ${method}: builds`, built.error, null);
      continue;
    }
    const o: DesignObject = { ...makeObject("custom", 0, 0), custom: built.spec };
    const surf = objectSurfaces(o);
    const lay = surfaceLayout(objectParts(o), surf);
    check(`custom ${method}: surfaces have faces`, lay.surfaces.map((s) => [s.def.id, s.faces > 0]), surf.map((s) => [s.id, true]));
  }
}

// ----------------------------------------------------------------- fit ----
console.log("\n# Fit maths");
{
  const sw = 6000, sh = 3000;
  // 4000 × 1500 is wider than the 2:1 surface.
  const c = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "contain" }));
  check("contain: whole image fits, touching left and right", [r3(c.w), r3(c.h), c.cx, c.cy], [6000, 2250, 3000, 1500]);
  const cv = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "cover" }));
  check("cover: fills the surface, touching top and bottom", [r3(cv.w), r3(cv.h)], [8000, 3000]);
  const st = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "stretch" }));
  check("stretch: exactly the surface", [st.w, st.h], [6000, 3000]);
  const cu = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "custom", scale: 0.5 }));
  check("custom 50% with aspect lock: half the width, aspect kept", [r3(cu.w), r3(cu.h)], [3000, 1125]);
  const cu2 = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "custom", scale: 0.5, scaleY: 0.25, lockAspect: false }));
  check("custom without aspect lock: width and height set separately", [r3(cu2.w), r3(cu2.h)], [3000, 750]);
  const rot = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "contain", rotation: 90 }));
  check("contain turned 90°: the image's long side runs up", [r3(rot.w), r3(rot.h)], [1125, 3000]);
  const off = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "contain", offsetX: 0.1, offsetY: -0.2 }));
  check("offsets move the centre by a fraction of the surface", [off.cx, off.cy], [3600, 900]);

  // The corners of the placed image map to the image's own corners, for every turn.
  for (const rotation of [0, 90, 180, 270] as const) {
    const pl = fitPlacement(sw, sh, 4000, 1500, finish({ fit: "contain", rotation }));
    const x0 = pl.cx - pl.w / 2, x1 = pl.cx + pl.w / 2, y0 = pl.cy - pl.h / 2, y1 = pl.cy + pl.h / 2;
    const tl = imageCoords(x0, y1, pl).map(r3);
    const tr = imageCoords(x1, y1, pl).map(r3);
    // Turning clockwise moves the image's top-left to: 0 → top-left, 90 → top-right, 180 → bottom-right, 270 → bottom-left.
    const where = { 0: imageCoords(x0, y1, pl), 90: imageCoords(x1, y1, pl), 180: imageCoords(x1, y0, pl), 270: imageCoords(x0, y0, pl) }[rotation].map(r3);
    check(`turn ${rotation}°: the image's top-left pixel lands where a clockwise turn puts it`, where, [0, 0]);
    check(`turn ${rotation}°: corners stay inside 0–1`, [...tl, ...tr].every((v) => v === 0 || v === 1), true);
  }
  // Outside the image (contain bands) shows the surface colour.
  const band = imageCoords(3000, 100, c);
  check("contain: the band below the image is outside it (surface colour)", band[1] > 1, true);

  // Resizing the object keeps the chosen fit: contain still fits, cover still covers.
  let ok = true;
  for (let i = 0; i < 50; i++) {
    const w = 500 + ((i * 7919) % 9000);
    const h = 300 + ((i * 104729) % 5000);
    const iw = 100 + ((i * 31) % 4000);
    const ih = 100 + ((i * 17) % 3000);
    const a = fitPlacement(w, h, iw, ih, finish({ fit: "contain" }));
    const b = fitPlacement(w, h, iw, ih, finish({ fit: "cover" }));
    const fits = a.w <= w + 1e-6 && a.h <= h + 1e-6 && (near(a.w, w, 1e-6) || near(a.h, h, 1e-6));
    const covers = b.w >= w - 1e-6 && b.h >= h - 1e-6 && (near(b.w, w, 1e-6) || near(b.h, h, 1e-6));
    const aspect = near(a.w / a.h, iw / ih, 1e-9) && near(b.w / b.h, iw / ih, 1e-9);
    if (!fits || !covers || !aspect) ok = false;
  }
  check("50 sizes: contain always fits, cover always covers, aspect always kept", ok, true);
  check("cropping (cover) never changes the surface", (() => {
    const o = makeObject("backdrop", 0, 0);
    const before = surfaceLayout(objectParts(o), objectSurfaces(o)).surfaces[0].rect;
    fitPlacement(1, 1, 99999, 1, finish({ fit: "cover" }));
    const after = surfaceLayout(objectParts(o), objectSurfaces(o)).surfaces[0].rect;
    return JSON.stringify(before) === JSON.stringify(after);
  })(), true);
  check("a broken image size falls back to the surface size", (() => {
    const p = fitPlacement(100, 50, 0, 0, finish({ fit: "contain" }));
    return [p.w, p.h];
  })(), [100, 50]);
}

// Every object type still builds the same parts when it has finishes (artwork never changes geometry).
console.log("\n# Artwork never changes geometry");
{
  let same = true;
  for (const type of OBJECT_TYPES) {
    if (type === "custom") continue;
    const o = makeObject(type, 0, 0);
    const a = JSON.stringify(objectParts(o));
    const b = JSON.stringify(objectParts({ ...o, finishes: { front: finish() } } as DesignObject));
    if (a !== b) same = false;
  }
  check("parts are identical with and without artwork, for every type", same, true);
  check("every built-in surface definition is reachable from the registry", Object.values(OBJECT_DEFS).filter((d) => d.surfaces).length >= 20, true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
