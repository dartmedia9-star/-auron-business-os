/**
 * Geometry checks for the Design Studio object library and Custom Builder
 * recipes (lib/design-model: parts.ts, objects/, custom.ts). Pure Node, no
 * browser or GPU: every object is checked through the same solid parts the
 * 3D view, the plan symbol and the library thumbnails are drawn from.
 *
 *   pnpm --filter @workspace/scripts exec tsx ./test-design-objects.ts
 */
import {
  OBJECT_DEFS,
  OBJECT_TYPES,
  applyTemplate,
  arcThrough,
  buildSpec,
  cleanupStroke,
  createEmptyModel,
  customDefinitionSchema,
  customParts,
  customSize,
  customSpecSchema,
  EXAMPLES,
  makeCustomObject,
  makeObject,
  objectFootprint,
  objectParts,
  parseProjectModel,
  partBounds,
  partFaces,
  partPlanOutline,
  partsBounds,
  partsFinite,
  pointInPolygon,
  rectsToParts,
  resizeCustom,
  rotate,
  simplifyPath,
  specToContent,
  triangulate,
  updateEntity,
  type BuilderContent,
  type CustomSpec,
  type DesignObject,
  type Part,
  type ProjectModel,
} from "../lib/design-model/src/index";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
const r1 = (n: number) => Math.round(n * 10) / 10;

const byRole = (parts: Part[], role: string | RegExp) => parts.filter((p) => (typeof role === "string" ? p.role === role : role.test(p.role ?? "")));
const bounds = (parts: Part[]) => partsBounds(parts);
const sizeOf = (parts: Part[]) => {
  const b = bounds(parts.filter((p) => !p.outside));
  return b ? [r1(b.max[0] - b.min[0]), r1(b.max[1] - b.min[1]), r1(b.max[2] - b.min[2])] : null;
};

/** Signed volume of a part's faces (mm³); positive when every face points outwards. */
function volume(p: Part): number {
  let v = 0;
  for (const f of partFaces(p)) {
    for (let i = 1; i < f.length - 1; i++) {
      const [a, b, c] = [f[0], f[i], f[i + 1]];
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return v;
}

function spec(content: BuilderContent): CustomSpec {
  const r = buildSpec(content);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
}

// ------------------------------------------------- every object type ----
{
  for (const type of OBJECT_TYPES) {
    if (type === "custom") continue;
    const o = makeObject(type, 0, 0);
    const parts = objectParts(o);
    const def = OBJECT_DEFS[type];
    check(`${def.label}: finite geometry`, partsFinite(parts), true);
    const size = sizeOf(parts)!;
    const fits = near(size[0], o.width) && near(size[1], o.height) && near(size[2], o.depth);
    check(`${def.label}: parts fill exactly ${o.width} × ${o.height} × ${o.depth}`, fits ? "exact" : size, "exact");
    const inward = parts.filter((p) => p.kind !== "grid" && p.render !== false && volume(p) <= 0).map((p) => p.role);
    check(`${def.label}: every solid faces outwards`, inward, []);
    check(`${def.label}: has a category, description and keywords`, !!def.category && def.description.length > 10 && def.keywords.length > 0, true);
    check(`${def.label}: is built from more than one part (not a plain block)`, type === "structure" || parts.filter((p) => p.kind !== "grid" && p.render !== false).length > 1, true);
  }
}

// ------------------------------------------------------------ box arch ----
{
  for (const style of ["truss", "box"] as const) {
    for (const [w, h, t] of [[8000, 5000, 300], [3000, 2500, 290], [12000, 6000, 400]]) {
      const o = makeObject("box_arch", 0, 0, { width: w, height: h, depth: 400, props: { style, trussSize: t } });
      const parts = objectParts(o);
      const L = bounds(byRole(parts, "leg-left"))!;
      const R = bounds(byRole(parts, "leg-right"))!;
      const B = bounds(byRole(parts, "beam"))!;
      const corners = byRole(parts, "corner").map((p) => partBounds(p)!);
      const label = `box arch (${style}, ${w}×${h}, ${t} section)`;
      check(`${label}: two separate vertical legs`, [r1(L.max[0] - L.min[0]), r1(R.max[0] - R.min[0]), L.max[0] < R.min[0]], [t, t, true]);
      check(`${label}: legs stand on the base plates and rise to the beam`, [r1(L.min[1]), r1(L.max[1]), r1(R.min[1]), r1(R.max[1])], [12, h - t, 12, h - t]);
      check(`${label}: legs at the outer edges`, [r1(L.min[0]), r1(R.max[0])], [-w / 2, w / 2]);
      check(`${label}: top beam spans between the legs at the top`, [r1(B.min[0]), r1(B.max[0]), r1(B.min[1]), r1(B.max[1])], [-w / 2 + t, w / 2 - t, h - t, h]);
      check(`${label}: corner blocks join each leg to the beam`, corners.map((c) => [r1(c.min[1]), r1(c.max[1]), near(c.max[0], B.min[0]) || near(c.min[0], B.max[0])]), [[h - t, h, true], [h - t, h, true]]);
      check(`${label}: truss section is ${t} deep`, [r1(B.max[2] - B.min[2]), r1(L.max[2] - L.min[2])], [t, t]);
      if (style === "truss") check(`${label}: members are chords and lacing, not solid blocks`, byRole(parts, "leg-left").filter((p) => p.kind === "beam").length >= 8, true);
    }
  }
  // Silhouette from the front is an arch: nothing solid in the opening.
  const o = makeObject("box_arch", 0, 0);
  const solidInOpening = objectParts(o).filter((p) => p.render !== false && p.kind !== "grid").some((p) => {
    const b = partBounds(p)!;
    return b.min[0] > -o.width / 2 + 400 && b.max[0] < o.width / 2 - 400 && b.max[1] < o.height - 400;
  });
  check("box arch: the opening between the legs is clear", solidInOpening, false);
  // The section never exceeds what the footprint allows.
  const thin = makeObject("box_arch", 0, 0, { depth: 200, props: { trussSize: 500 } });
  check("box arch: section clamps to the footprint depth", r1(bounds(byRole(objectParts(thin), "beam"))!.max[2] * 2), 200);
}

// ------------------------------------------------------------- counter ----
{
  for (const [w, d, h, ov] of [[2400, 600, 1050, 50], [1200, 500, 900, 0], [3000, 800, 1100, 150]]) {
    const o = makeObject("counter", 0, 0, { width: w, depth: d, height: h, props: { topOverhang: ov } });
    const parts = objectParts(o);
    const top = byRole(parts, "countertop")[0];
    const body = byRole(parts, "body")[0];
    const fascia = byRole(parts, "fascia")[0];
    const label = `counter ${w}×${d}×${h}, overhang ${ov}`;
    check(`${label}: has a body, fascia and countertop`, [!!top, !!body, !!fascia], [true, true, true]);
    if (top?.kind !== "box" || body?.kind !== "box" || fascia?.kind !== "box") continue;
    check(`${label}: countertop sits on the body`, r1(body.y + body.h), r1(top.y));
    check(`${label}: countertop is the full width and depth at the top`, [top.w, top.d, r1(top.y + top.h)], [w, d, h]);
    const fb = partBounds(fascia)!;
    check(`${label}: top overhangs the fascia at the front`, r1(d / 2 - fb.max[2]), Math.max(ov, 2));
    const sides = bounds(byRole(parts, /body|fascia|side-panel/))!;
    check(`${label}: top overhangs the sides`, [r1(sides.min[0]), r1(sides.max[0])], [-w / 2 + ov, w / 2 - ov]);
    check(`${label}: top colour differs from the body (reads as a counter)`, top.color !== undefined && top.color !== o.color, true);
  }
  const plain = makeObject("counter", 0, 0, { props: { sidePanels: false, brandPanel: false } });
  check("counter: side panels and brand panel are optional", [byRole(objectParts(plain), "side-panel").length, byRole(objectParts(plain), "brand-panel").length], [0, 0]);
  const branded = objectParts(makeObject("counter", 0, 0));
  check("counter: brand panel covers part of the front only", (() => {
    const bp = byRole(branded, "brand-panel")[0];
    return bp?.kind === "box" && bp.w < 2400 * 0.8 && bp.h < 1050 * 0.7;
  })(), true);
}

// --------------------------------------------------------------- stage ----
{
  const o = makeObject("stage", 0, 0, { width: 6000, depth: 4000, height: 900, props: { deckThickness: 50 } });
  const parts = objectParts(o);
  const deck = byRole(parts, "stage-deck")[0];
  check("stage: deck slab of the set thickness at the top", deck?.kind === "box" ? [deck.y, deck.h, deck.w, deck.d] : null, [850, 50, 6000, 4000]);
  check("stage: nothing below the floor or above the deck", [r1(bounds(parts)!.min[1]), r1(bounds(parts)!.max[1])], [0, 900]);
  check("stage: front, side and back skirting", [byRole(parts, "skirt-front").length, byRole(parts, "skirt-side").length, byRole(parts, "skirt-back").length], [1, 2, 1]);
  const bare = objectParts({ ...o, props: { skirting: false } });
  check("stage: skirting off removes all skirts", byRole(bare, /skirt/).length, 0);
  const steps = objectParts({ ...o, props: { frontSteps: true, stepWidth: 1500 } });
  const treads = byRole(steps, "tread");
  check("stage steps: treads rise towards the stage", treads.map((p) => (p.kind === "box" ? r1(p.y + p.h) : 0)), [180, 360, 540, 720]);
  check("stage steps: highest tread meets the stage front", treads.length > 0 && treads[treads.length - 1].kind === "box" && near((treads[treads.length - 1] as { z: number; d: number }).z - (treads[treads.length - 1] as { d: number }).d / 2, 2000), true);
  check("stage steps: risers under every tread", byRole(steps, "riser").length, treads.length);
  const multi = objectParts(makeObject("multi_level_stage", 0, 0));
  check("multi-level stage: two decks at two heights", [...new Set(byRole(multi, /deck/).map((p) => r1(partBounds(p)!.max[1])))].sort((a, b) => a - b), [450, 900]);
  check("multi-level stage: steps between the tiers start on the lower deck", byRole(multi, "riser").every((p) => p.kind === "box" && p.y === 450), true);
  const mod = objectParts(makeObject("modular_stage", 0, 0, { width: 4880, depth: 2440, props: { moduleWidth: 1220, moduleDepth: 2440 } }));
  check("modular stage: one deck per module (4 × 1)", byRole(mod, "deck-module").length, 4);
  const riser = makeObject("riser", 0, 0, { props: { skirting: true } });
  check("riser: skirting on all four sides", byRole(objectParts(riser), /skirt/).length, 4);
}

// ----------------------------------------------------- steps & skirting ----
{
  const s = objectParts(makeObject("steps", 0, 0, { props: { count: 4 } }));
  check("steps: four treads and four risers", [byRole(s, "tread").length, byRole(s, "riser").length], [4, 4]);
  const hr = objectParts(makeObject("steps", 0, 0, { props: { count: 3, handrail: true } }));
  check("steps: handrails add posts and rails", [byRole(hr, "handrail").length, byRole(hr, "handrail-post").length], [2, 4]);
  const pleated = objectParts(makeObject("skirting", 0, 0));
  const flat = objectParts(makeObject("skirting", 0, 0, { props: { pleated: false } }));
  check("skirting: pleats are separate ribs on a panel; flat is one panel", [byRole(pleated, "pleat").length > 5, byRole(flat, "pleat").length, byRole(flat, "panel").length], [true, 0, 1]);
}

// ------------------------------------------------- backdrops & screens ----
{
  const flat = makeObject("backdrop", 0, 0);
  const fp = objectParts(flat);
  const panel = byRole(fp, "panel")[0];
  check("flat backdrop: one thin panel facing the front", panel?.kind === "box" ? [panel.w, panel.h, panel.d < 200] : null, [7320, 3660, true]);
  const framed = objectParts(makeObject("framed_backdrop", 0, 0));
  const face = bounds(byRole(framed, "panel"))!;
  const frame = bounds(byRole(framed, /frame-/))!;
  check("framed backdrop: graphic face at the front, tube frame behind it", face.min[2] >= frame.max[2] - 0.5, true);
  check("framed backdrop: feet and braces reach the back of the footprint", r1(bounds(byRole(framed, "foot"))!.min[2]), -300);
  check("framed backdrop: uprights at both ends", byRole(framed, "frame-upright").length, 2);
  const edge = bounds(byRole(framed, "edge"))!;
  check("framed backdrop: a metal edge frames the graphic on the front, to the full size", [byRole(framed, "edge").length, r1(edge.max[0] - edge.min[0]), r1(edge.max[1] - edge.min[1]), r1(edge.max[2])], [4, 4880, 2440, 300]);
  const led = objectParts(makeObject("led_screen", 0, 0));
  check("LED wall: cabinet with a screen face at the front", [byRole(led, "cabinet").length, r1(partBounds(byRole(led, "screen")[0])!.max[2])], [1, 50]);
  const media = objectParts(makeObject("media_wall", 0, 0));
  check("media wall: screen sits in a bezel on the wall", [byRole(media, "screen").length, byRole(media, "bezel").length, byRole(media, "wall").length], [1, 1, 1]);
  const sr = objectParts(makeObject("step_repeat", 0, 0));
  check("step-and-repeat: logo tiles on the face", byRole(sr, "logo").length >= 6, true);
}

{
  const cb = objectParts(makeObject("corner_booth", 0, 0));
  const post = byRole(cb, "corner-post").map((p) => partBounds(p)!);
  check("corner booth: the fascia's open end stands on a front corner post", post.map((b) => [r1(b.max[0]), r1(b.max[1]), r1(b.max[2])]), [[1500, 2500, 1500]]);
  const right = objectParts(makeObject("corner_booth", 0, 0, { props: { wallSide: "right" } }));
  check("corner booth: with the wall on the right the post moves to the left", r1(partBounds(byRole(right, "corner-post")[0])!.min[0]), -1500);
  const bare = objectParts(makeObject("corner_booth", 0, 0, { props: { fascia: false } }));
  check("corner booth: no fascia, no corner post", byRole(bare, "corner-post").length, 0);
}

// -------------------------------------------- beams match parameters ----
{
  const tower = objectParts(makeObject("truss_tower", 0, 0, { props: { trussSize: 290 } }));
  const tb = bounds(byRole(tower, "tower"))!;
  check("truss tower: section matches the parameter", [r1(tb.max[0] - tb.min[0]), r1(tb.max[2] - tb.min[2])], [290, 290]);
  const gp = objectParts(makeObject("goalpost", 0, 0, { props: { tube: 80 } }));
  check("goalpost: tube size matches the parameter", byRole(gp, /leg|beam/).every((p) => p.kind === "box" && (p.w === 80 || p.h === 80) && (p.d === 80)), true);
  const beam = makeObject("truss_beam", 0, 0, { width: 9000, depth: 400, height: 400 });
  check("truss crossbar: spans its full length", sizeOf(objectParts(beam)), [9000, 400, 400]);
  const arch = objectParts(makeObject("circular_arch", 0, 0, { width: 3000, height: 3000, props: { tube: 60 } }));
  check("circular arch: legs plus a curved top of tube members", [byRole(arch, "leg-left").length, byRole(arch, "arch").length > 10], [1, true]);
  const low = objectParts(makeObject("circular_arch", 0, 0, { width: 4000, height: 1200 }));
  check("circular arch lower than half its span becomes a segment", sizeOf(low)![1] > 1199 && sizeOf(low)![1] < 1201, true);
}

// -------------------------------------------------- tables & seating ----
{
  const rt = objectParts(makeObject("round_table", 0, 0, { props: { seats: 10 } }));
  check("round table: 10 chairs, each with a back", [byRole(rt, "seat").length, byRole(rt, "chair-back").length], [10, 10]);
  const rect = objectParts(makeObject("rect_table", 0, 0, { props: { seats: 6 } }));
  check("rectangular table: top, four legs and six chairs", [byRole(rect, "top").length, byRole(rect, "leg").length, byRole(rect, "seat").length], [1, 4, 6]);
  const cloth = objectParts(makeObject("rect_table", 0, 0, { props: { cloth: true, seats: 0 } }));
  check("rectangular table: a cloth replaces the visible legs", [byRole(cloth, "cloth").length, byRole(cloth, "leg").length], [1, 0]);
  const chairs = byRole(rt, "seat").map((p) => partBounds(p)!);
  check("round table: chairs stand outside the table top", chairs.every((b) => Math.hypot((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2) > 900), true);
}

// ------------------------------------------------ rotation & footprint ----
{
  for (const type of ["counter", "box_arch", "booth_shell", "lectern", "reception_counter"] as const) {
    const o = makeObject(type, 5000, 3000, { rotation: 35 });
    const fp = objectFootprint(o);
    const outlines = objectParts(o).filter((p) => !p.outside).map(partPlanOutline).filter((x) => !!x);
    const inside = outlines.every((ol) => {
      const pts = ol!.kind === "poly" ? ol!.pts : [{ x: ol!.c.x + ol!.r, y: ol!.c.y }, { x: ol!.c.x - ol!.r, y: ol!.c.y }, { x: ol!.c.x, y: ol!.c.y + ol!.r }, { x: ol!.c.x, y: ol!.c.y - ol!.r }];
      return pts.every((q) => pointInPolygon(rotate({ x: o.x + q.x, y: o.y + q.y }, o.rotation, { x: o.x, y: o.y }), fp, 1));
    });
    check(`${OBJECT_DEFS[type].label} rotated 35°: plan outline stays inside its footprint`, inside, true);
  }
}

// ------------------------------------------- repeated parameter edits ----
{
  let ok = true;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400 && ok; i++) {
    const type = OBJECT_TYPES.filter((t) => t !== "custom")[i % (OBJECT_TYPES.length - 1)];
    const o = makeObject(type, 0, 0, { width: 50 + rand() * 12000, depth: 50 + rand() * 6000, height: 50 + rand() * 6000 });
    const parts = objectParts(o);
    if (!partsFinite(parts)) ok = false;
    const b = partsBounds(parts, (p) => !p.outside);
    if (!b || b.min[1] < -0.5 || b.max[1] > o.height + 0.5) ok = false;
  }
  check("400 random size edits across every type: finite, never below the floor or above the height", ok, true);
}

// ------------------------------------------------- custom: extrusion ----
{
  // An L-shaped profile drawn in the front view, extruded 300 mm.
  const content: BuilderContent = {
    sketch: { plane: "front", shapes: [{ kind: "poly", id: "a", closed: true, points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 400 }, { x: 400, y: 400 }, { x: 400, y: 2000 }, { x: 0, y: 2000 }] }], dims: [], labels: [] },
    construction: { method: "extrude", depth: 300, thickness: 18, section: 50, round: false, infill: false, feet: false },
    parts: [],
    template: null,
  };
  const s = spec(content);
  check("extrusion keeps the drawn width and height and the typed depth", customSize(s), { width: 1000, depth: 300, height: 2000 });
  const parts = customParts(s);
  const area = 1000 * 400 + 400 * 1600;
  check("extruded volume = profile area × depth", r1(parts.reduce((v, p) => v + volume(p), 0)), area * 300);
  check("extrusion stands on the floor, centred", [r1(bounds(parts)!.min[1]), r1(bounds(parts)!.min[0]), r1(bounds(parts)!.min[2])], [0, -500, -150]);
  // The drawing's top is up: the wide part of the L is at the top.
  const topSlice = triangulate([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]).length;
  check("triangulation helper works", topSlice, 1);
  const plan = spec({ ...content, sketch: { ...content.sketch, plane: "top" } });
  check("plan-view extrusion: drawn outline is the footprint, depth is the height", customSize(plan), { width: 1000, depth: 2000, height: 300 });
  // Self-intersecting outlines are refused with a clear reason.
  const bow = { ...content, sketch: { ...content.sketch, shapes: [{ kind: "poly" as const, id: "b", closed: true, points: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }] }] } };
  const r = buildSpec(bow);
  check("a self-intersecting outline is rejected", r.ok ? "accepted" : r.error, "The outline crosses itself. Move the points so its edges don't cross.");
  check("the schema refuses it too (server side)", customSpecSchema.safeParse({ method: "extrude", plane: "front", depth: 100, profiles: [bow.sketch.shapes[0].points] }).success, false);
  const sliver = buildSpec({ ...content, sketch: { ...content.sketch, shapes: [{ kind: "poly", id: "c", closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }] } });
  check("an outline with no real area is rejected", sliver.ok, false);
  const open = buildSpec({ ...content, sketch: { ...content.sketch, shapes: [{ kind: "poly", id: "d", closed: false, points: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }] } });
  check("extrusion without a closed shape explains what is missing", open.ok ? "" : open.error, "This method needs a closed shape. Draw a rectangle, circle or polygon, or close your outline.");
  const noDepth = buildSpec({ ...content, construction: { ...content.construction, depth: 0 } });
  check("extrusion without a depth asks for it", noDepth.ok ? "" : noDepth.error, "Enter the extrusion depth.");
  const huge = buildSpec({ ...content, sketch: { ...content.sketch, shapes: [{ kind: "rect", id: "e", x: 0, y: 0, w: 200_000, h: 1000 }] } });
  check("absurd sizes (over 100 m) are refused", huge.ok, false);
  const circle = spec({ ...content, sketch: { ...content.sketch, shapes: [{ kind: "circle", id: "f", cx: 0, cy: 0, r: 500 }] } });
  check("a circle extrudes as a round solid of its diameter", [customSize(circle).width, customSize(circle).height], [1000, 1000]);
}

// ------------------------------------------------ custom: beam frames ----
{
  const frame = spec(applyTemplate("frame", { width: 3000, height: 2500, depth: 0, section: 50, crossbars: 1, uprights: 0 }));
  check("frame template: 4 sides + 1 cross member = 5 beams", byRole(customParts(frame), "member").length, 5);
  check("frame template: overall size is the typed size (members inside it)", customSize(frame), { width: 3000, depth: 50, height: 2500 });
  const booth = spec(applyTemplate("photo_booth", { width: 2400, height: 2400, depth: 1200, section: 50, infill: true }));
  const bp = customParts(booth);
  check("photo booth: two frames of 3 members, 4 connectors, a backdrop panel", [byRole(bp, "member").length, byRole(bp, "connector").length, byRole(bp, "infill").length], [6, 4, 1]);
  check("photo booth: exact overall size", customSize(booth), { width: 2400, depth: 1200, height: 2400 });
  const verticals = byRole(bp, "member").filter((p) => p.kind === "beam" && Math.abs(p.a[0] - p.b[0]) < 1);
  check("photo booth: vertical members stand on the floor", verticals.every((p) => p.kind === "beam" && near(Math.min(p.a[1], p.b[1]), 0)), true);
  const noInfill = spec(applyTemplate("photo_booth", { infill: false }));
  check("photo booth backdrop is optional", byRole(customParts(noInfill), "infill").length, 0);
  // Lines drawn in plan become a cage: posts at each corner plus top and bottom beams.
  const cage = spec({
    sketch: { plane: "top", shapes: [{ kind: "rect", id: "r", x: 0, y: 0, w: 3000, h: 2000 }], dims: [], labels: [] },
    construction: { method: "frame", depth: 2500, thickness: 18, section: 50, round: false, infill: true, feet: false },
    parts: [],
    template: null,
  });
  const cp = customParts(cage);
  check("plan frame: 4 posts, 8 beams, 4 wall panels, exact size", [byRole(cp, "post").length, byRole(cp, "member").length, byRole(cp, "infill").length, customSize(cage)], [4, 8, 4, { width: 3000, depth: 2000, height: 2500 }]);
  const flatTop = buildSpec({ sketch: cage.method === "frame" ? { plane: "top", shapes: [{ kind: "rect", id: "r", x: 0, y: 0, w: 3000, h: 2000 }], dims: [], labels: [] } : (null as never), construction: { method: "frame", depth: 0, thickness: 18, section: 50, round: false, infill: false, feet: false }, parts: [], template: null });
  check("plan frame without a height asks for one", flatTop.ok ? "" : flatTop.error, "Enter the frame height (more than twice the beam size) for a frame drawn in plan.");
  const noLines = buildSpec({ sketch: { plane: "front", shapes: [], dims: [], labels: [] }, construction: { method: "frame", depth: 0, thickness: 18, section: 50, round: false, infill: false, feet: false }, parts: [], template: null });
  check("a frame with no lines explains what to draw", noLines.ok ? "" : noLines.error, "A frame needs lines. Draw lines, a polyline or a rectangle for the members.");
  const beam = spec(applyTemplate("beam", { width: 4000, section: 100 }));
  check("beam template: one member, length × section", [byRole(customParts(beam), "member").length, customSize(beam)], [1, { width: 4000, depth: 100, height: 100 }]);
}

// ---------------------------------------------- custom: panel, assembly ----
{
  const panel = spec(applyTemplate("panel", { width: 2400, height: 1200, thickness: 18, feet: true }));
  const pp = customParts(panel);
  check("panel template: one panel of the typed thickness on two feet", [byRole(pp, "panel").length, byRole(pp, "foot").length, r1(partBounds(byRole(pp, "panel")[0])!.max[2] * 2)], [1, 2, 18]);
  const counter = spec(applyTemplate("counter", { width: 2000, height: 1050, depth: 600 }));
  check("counter template: separate editable parts", counter.method === "assembly" ? counter.parts.map((p) => p.name) : [], ["Plinth", "Cabinet body", "Front fascia", "Countertop", "Side panel", "Side panel", "Brand panel"]);
  check("counter template: exact size", customSize(counter), { width: 2000, depth: 600, height: 1050 });
  // Resizing a template assembly rebuilds it exactly (top thickness stays 40).
  const taller = resizeCustom(counter, { height: 1200, width: 2600 });
  const top = taller.method === "assembly" ? taller.parts.find((p) => p.name === "Countertop") : undefined;
  check("resized counter: new size, top still 40 mm on the body", [customSize(taller), top?.h, top?.y], [{ width: 2600, depth: 600, height: 1200 }, 40, 1160]);
  // A hand-built assembly stretches but keeps thin parts at their thickness against their edge.
  const hand: CustomSpec = { method: "assembly", template: null, parts: [
    { id: "a", name: "Body", shape: "box", x: 0, y: 0, z: 0, w: 1000, h: 960, d: 500, tone: "body", color: null },
    { id: "b", name: "Top", shape: "box", x: 0, y: 960, z: 0, w: 1100, h: 40, d: 550, tone: "top", color: "#222222" },
  ] };
  const stretched = resizeCustom(hand, { height: 1200 });
  const sTop = stretched.method === "assembly" ? stretched.parts.find((p) => p.name === "Top") : undefined;
  check("hand-built assembly: top keeps 40 mm and stays on top", [customSize(stretched).height, sTop?.h, sTop?.y], [1200, 40, 1160]);
  // Parts drawn as rectangles become assembly parts.
  const fromRects = rectsToParts({ plane: "front", shapes: [{ kind: "rect", id: "x", x: 0, y: 0, w: 1000, h: 100 }, { kind: "rect", id: "y", x: 100, y: 100, w: 800, h: 900 }], dims: [], labels: [] }, 400);
  check("rectangles from a front drawing become stacked parts", fromRects.map((p) => [p.w, p.h, p.y, p.d]), [[1000, 100, 900, 400], [800, 900, 0, 400]]);
  const none = buildSpec({ sketch: { plane: "front", shapes: [], dims: [], labels: [] }, construction: { method: "assembly", depth: 0, thickness: 18, section: 50, round: false, infill: false, feet: false }, parts: [], template: null });
  check("an assembly with no parts says so", none.ok ? "" : none.error, "Add at least one part, or use rectangles from the drawing as parts.");
}

// ------------------------------------------- custom: resizing recipes ----
{
  const frame = spec(applyTemplate("frame", { width: 3000, height: 2500, section: 60 }));
  const wider = resizeCustom(frame, { width: 4500 });
  check("frame resize: new width, same section", [customSize(wider).width, wider.method === "frame" ? wider.section : 0], [4500, 60]);
  const deeper = resizeCustom(frame, { depth: 800 });
  check("frame resize in depth: two frames joined", [customSize(deeper).depth, byRole(customParts(deeper), "connector").length], [800, 4]);
  const ext = spec(applyTemplate("box", { width: 1000, height: 500, depth: 300 }));
  check("block resize: every axis", customSize(resizeCustom(ext, { width: 1200, height: 800, depth: 450 })), { width: 1200, depth: 450, height: 800 });
  let s = frame;
  let fine = true;
  for (let i = 0; i < 100; i++) {
    s = resizeCustom(s, { width: 500 + ((i * 377) % 5000), height: 500 + ((i * 211) % 4000), depth: (i * 97) % 1500 });
    if (!partsFinite(customParts(s)) || !customSpecSchema.safeParse(s).success) fine = false;
  }
  check("100 successive resizes keep a valid, finite recipe", fine, true);
}

// -------------------------------------- custom objects in the project ----
{
  let model: ProjectModel = createEmptyModel({ venueName: "Test hall" });
  const booth = spec(applyTemplate("photo_booth", {}));
  const o = makeCustomObject(booth, 3000, 2000, { name: "Photo booth", props: { libraryId: 12 } });
  model = { ...model, objects: [o] };
  check("custom object size equals what its recipe builds", [o.width, o.depth, o.height], [2400, 1200, 2400]);
  const resized = updateEntity(model, o.id, { width: 3000 });
  const ro = resized.objects[0];
  check("typing a width resizes the recipe, the object and its 3D parts", [ro.width, customSize(ro.custom!).width, sizeOf(objectParts(ro))![0]], [3000, 3000, 3000]);
  check("the original (library) recipe is unchanged by editing the instance", customSize(booth).width, 2400);
  const json = JSON.parse(JSON.stringify(resized));
  const back = parseProjectModel(json);
  check("a project with a custom object round-trips through save and load", back.ok && JSON.stringify(back.model.objects[0].custom) === JSON.stringify(ro.custom), true);
  const missing = parseProjectModel({ ...json, objects: [{ ...json.objects[0], custom: undefined }] });
  check("a custom object without its recipe is refused", missing.ok ? "accepted" : missing.error.includes("custom"), true);
  const bad = parseProjectModel({ ...json, objects: [{ ...json.objects[0], custom: { method: "frame", plane: "front", segments: [], section: 50, round: false, depth: 0, infill: false } }] });
  check("an invalid recipe can't poison a saved project", bad.ok, false);
  // A project saved before the new object types still loads unchanged.
  const old = { ...JSON.parse(JSON.stringify(createEmptyModel({ venueName: "Old" }))), objects: [{ ...makeObject("counter", 0, 0) }] };
  delete (old.objects[0] as Partial<DesignObject>).custom;
  const oldParsed = parseProjectModel(old);
  check("an older project with a counter still loads", oldParsed.ok && oldParsed.model.objects[0].type === "counter" && oldParsed.model.objects[0].custom === undefined, true);
  // Duplicate an instance and edit one: the other keeps its size.
  const dupModel = { ...model, objects: [o, { ...o, id: "obj_copy" }] };
  const edited = updateEntity(dupModel, "obj_copy", { height: 3000 });
  check("editing one instance never changes another", [edited.objects[0].height, edited.objects[1].height], [2400, 3000]);
}

// --------------------------------------------- library definitions ----
{
  const content = applyTemplate("photo_booth", {});
  const def = { v: 1, ...content, spec: spec(content), color: "#1d1f26", accentColor: "#c8a24a", elevation: 0 };
  check("a library definition validates", customDefinitionSchema.safeParse(def).success, true);
  check("a library definition with an oversize payload is refused", customDefinitionSchema.safeParse({ ...def, sketch: { ...def.sketch, shapes: Array.from({ length: 151 }, (_, i) => ({ kind: "rect", id: `r${i}`, x: 0, y: 0, w: 10, h: 10 })) } }).success, false);
  const back = specToContent(def.spec);
  check("a placed recipe reopens in the builder and rebuilds the same object", JSON.stringify(customParts(spec(back))) === JSON.stringify(customParts(def.spec)), true);
}

// ------------------------------------------------- required examples ----
{
  const sizes: Record<string, [number, number, number]> = {};
  for (const ex of EXAMPLES) {
    const content = ex.content();
    const r = buildSpec(content);
    check(`example "${ex.label}" builds a valid recipe`, r.ok, true);
    if (!r.ok) continue;
    const parts = customParts(r.spec);
    const b = partsBounds(parts)!;
    const sz = customSize(r.spec);
    sizes[ex.id] = [sz.width, sz.depth, sz.height];
    check(`example "${ex.label}" has finite parts sitting on the floor`, [partsFinite(parts), Math.abs(b.min[1]) < 0.01], [true, true]);
    const def = { v: 1, ...content, spec: r.spec, color: ex.color, accentColor: ex.accentColor, elevation: 0 };
    check(`example "${ex.label}" saves as a library definition`, customDefinitionSchema.safeParse(def).success, true);
  }
  check("photo booth example: 2.4 m wide, 1.2 m deep, 2.4 m high", sizes.photo_booth, [2400, 1200, 2400]);
  check("display counter example: 1.8 m × 0.6 m × 1.05 m", sizes.display_counter, [1800, 600, 1050]);
  check("product launch example: podium width, overall depth, header top", sizes.product_launch, [4800, 2400, 4000]);
  check("decorative star example: 1.5 m across and high (outer points top, bottom and sides), 100 mm deep", [Math.round(sizes.star_extrusion[0]), sizes.star_extrusion[1], Math.round(sizes.star_extrusion[2])], [1500, 100, 1500]);
  const launch = buildSpec(EXAMPLES.find((x) => x.id === "product_launch")!.content());
  if (launch.ok) {
    const resized = resizeCustom(launch.spec, { width: 6000 });
    check("product launch structure resizes as one object", Math.round(customSize(resized).width), 6000);
  }
}

// ---------------------------------------------------- drawing helpers ----
{
  const arc = arcThrough({ x: 0, y: 0 }, { x: 500, y: -500 }, { x: 1000, y: 0 }, 8)!;
  check("arc through three points: ends where asked, passes the middle", [arc[0], arc[8], arc[4]], [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: -500 }]);
  check("three points in a line are not an arc", arcThrough({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), null);
  const wobbly = Array.from({ length: 50 }, (_, i) => ({ x: i * 20, y: (i % 2) * 3 }));
  check("simplify removes hand wobble within tolerance", simplifyPath(wobbly, 5).length, 2);
  const square = [{ x: 0, y: 0 }, { x: 503, y: 6 }, { x: 498, y: 497 }, { x: 4, y: 502 }, { x: 8, y: 9 }];
  const cleaned = cleanupStroke(square, { tolerance: 10, squareAngles: true, closeGap: 30 });
  check("clean-up closes a nearly closed stroke and squares its edges", [cleaned.closed, cleaned.points.length, cleaned.points[1].y === cleaned.points[0].y], [true, 4, true]);
  const untouched = cleanupStroke(square, { tolerance: 0.1, squareAngles: false, closeGap: 0 });
  check("without clean-up options the drawn points are kept", untouched.points.length, 5);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
