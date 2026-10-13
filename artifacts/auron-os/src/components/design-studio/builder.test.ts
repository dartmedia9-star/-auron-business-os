/**
 * Checks for the Custom Builder and library helpers: hit testing, moving and
 * reshaping shapes, erasing, snapping, thumbnails, and that the drawing, the
 * 3D parts and the plan symbol agree for custom objects.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/builder.test.ts
 */
import {
  EXAMPLES,
  OBJECT_TYPES,
  applyTemplate,
  buildSpec,
  customParts,
  customSize,
  makeCustomObject,
  makeObject,
  objectFootprint,
  objectParts,
  objectPlanShapes,
  partsBounds,
  type Sketch,
} from "@workspace/design-model";
import { dragHandle, eraseHits, hitSketch, moveShape, removeHits, shapeHandles, sketchBounds, snapSketch } from "./builder-sketch";
import { thumbnail } from "./thumbnail";
import { partElevation } from "./builder-canvas";
import { placementFor, sameJson, definitionFromSpec, parseLibraryObject } from "./builder-types";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const sketch: Sketch = {
  plane: "front",
  shapes: [
    { kind: "rect", id: "r1", x: 0, y: 0, w: 1000, h: 500 },
    { kind: "circle", id: "c1", cx: 2000, cy: 250, r: 250 },
    { kind: "poly", id: "l1", points: [{ x: 0, y: 1000 }, { x: 1000, y: 1000 }], closed: false },
  ],
  dims: [{ id: "d1", a: { x: 0, y: -200 }, b: { x: 1000, y: -200 }, offset: 0 }],
  labels: [{ id: "t1", x: 500, y: 1500, text: "Note" }],
};

// ------------------------------------------------------------ hit test ----
check("tap on a rectangle edge picks it", hitSketch(sketch, { x: 500, y: 3 }, 10), { kind: "shape", id: "r1" });
check("tap inside a rectangle picks it", hitSketch(sketch, { x: 500, y: 250 }, 10), { kind: "shape", id: "r1" });
check("tap on a circle picks it", hitSketch(sketch, { x: 2250, y: 250 }, 10), { kind: "shape", id: "c1" });
check("tap on a line picks it", hitSketch(sketch, { x: 400, y: 1005 }, 10), { kind: "shape", id: "l1" });
check("tap on a dimension picks it", hitSketch(sketch, { x: 300, y: -198 }, 10), { kind: "dim", id: "d1" });
check("tap on a note picks it", hitSketch(sketch, { x: 505, y: 1500 }, 10), { kind: "label", id: "t1" });
check("tap on empty space picks nothing", hitSketch(sketch, { x: 1500, y: 2000 }, 10), null);

// ------------------------------------------------------ move / reshape ----
check("moving a rectangle shifts its corner", moveShape(sketch.shapes[0], 100, 50), { kind: "rect", id: "r1", x: 100, y: 50, w: 1000, h: 500 });
check("rectangle has four corner grips", shapeHandles(sketch.shapes[0]).length, 4);
check("dragging the bottom-right corner resizes from the opposite corner", dragHandle(sketch.shapes[0], "c2", { x: 1200, y: 800 }), { kind: "rect", id: "r1", x: 0, y: 0, w: 1200, h: 800 });
check("dragging a corner past the opposite one flips without going negative", dragHandle(sketch.shapes[0], "c2", { x: -200, y: -100 }), { kind: "rect", id: "r1", x: -200, y: -100, w: 200, h: 100 });
check("a corner dragged onto the opposite corner is ignored (no zero size)", dragHandle(sketch.shapes[0], "c2", { x: 0, y: 0 }), sketch.shapes[0]);
check("dragging the circle grip sets the radius", (dragHandle(sketch.shapes[1], "r", { x: 2000, y: 650 }) as { r: number }).r, 400);
check("dragging a line end moves only that end", (dragHandle(sketch.shapes[2], "v1", { x: 1500, y: 1000 }) as { points: unknown }).points, [{ x: 0, y: 1000 }, { x: 1500, y: 1000 }]);

// --------------------------------------------------------------- erase ----
const hits = eraseHits(sketch, { x: -100, y: 250 }, { x: 2600, y: 250 }, 10);
check("an eraser stroke across the drawing removes the rectangle and circle it crosses", hits.map((h) => h.id).sort(), ["c1", "r1"]);
const after = removeHits(sketch, hits);
check("erasing keeps everything it didn't touch", [after.shapes.map((s) => s.id), after.dims.length, after.labels.length], [["l1"], 1, 1]);

// ---------------------------------------------------------------- snap ----
check("snaps to a nearby corner first", snapSketch(sketch, { x: 1008, y: 6 }, { grid: 50, points: true, tol: 20 }), { p: { x: 1000, y: 0 }, kind: "point" });
check("snaps to a circle's centre", snapSketch(sketch, { x: 1990, y: 255 }, { grid: null, points: true, tol: 20 }).p, { x: 2000, y: 250 });
check("otherwise snaps to the grid", snapSketch(sketch, { x: 1312, y: 1688 }, { grid: 50, points: true, tol: 20 }), { p: { x: 1300, y: 1700 }, kind: "grid" });
check("no grid, no point: the drawn point is kept", snapSketch(sketch, { x: 1312.34, y: 1688.21 }, { grid: null, points: false, tol: 20 }), { p: { x: 1312.3, y: 1688.2 }, kind: "none" });
check("a nearly level line is straightened", snapSketch(sketch, { x: 3000, y: 2030 }, { grid: null, points: false, tol: 20, from: { x: 0, y: 2000 } }), { p: { x: 3000, y: 2000 }, kind: "angle" });
check("a nearly upright line is straightened and its length kept on the grid", snapSketch(sketch, { x: 5020, y: 3333 }, { grid: 100, points: false, tol: 20, from: { x: 5000, y: 0 } }).p, { x: 5000, y: 3300 });
check("crossing of two lines is a snap point", snapSketch({ ...sketch, shapes: [{ kind: "poly", id: "a", points: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], closed: false }, { kind: "poly", id: "b", points: [{ x: 0, y: 1000 }, { x: 1000, y: 0 }], closed: false }] }, { x: 510, y: 495 }, { grid: null, points: true, tol: 30 }).p, { x: 500, y: 500 });
check("bounds include shapes, dimensions and notes", sketchBounds(sketch), { minX: 0, minY: -200, maxX: 2250, maxY: 1500 });

// ---------------------------------------------------------- thumbnails ----
let thumbsOk = 0;
for (const t of OBJECT_TYPES) {
  if (t === "custom") continue;
  const o = makeObject(t, 0, 0);
  const th = thumbnail(objectParts(o), o);
  if (th && th.polys.length > 0 && th.polys.every((p) => !p.d.includes("NaN"))) thumbsOk++;
}
check("every built-in object has a preview with no NaN coordinates", thumbsOk, OBJECT_TYPES.length - 1);
for (const ex of EXAMPLES) {
  const r = buildSpec(ex.content());
  const th = r.ok ? thumbnail(customParts(r.spec), ex) : null;
  check(`example "${ex.label}" has a preview`, !!th && th.polys.length > 0, true);
}
check("an object with no parts has no preview (shown as 'No preview')", thumbnail([], { color: "#000000", accentColor: "#000000" }), null);

// ------------------------------------- drawing, 3D and plan agree ----
for (const ex of EXAMPLES) {
  const r = buildSpec(ex.content());
  if (!r.ok) continue;
  const o = makeCustomObject(r.spec, 5000, 5000, { color: ex.color, accentColor: ex.accentColor });
  const b = partsBounds(objectParts(o))!;
  const size = customSize(r.spec);
  check(`"${ex.label}": object size = 3D size`, [o.width, o.depth, o.height], [size.width, size.depth, size.height]);
  check(`"${ex.label}": 3D parts fill exactly that size`, [Math.round(b.max[0] - b.min[0]), Math.round(b.max[2] - b.min[2]), Math.round(b.max[1] - b.min[1])], [Math.round(size.width), Math.round(size.depth), Math.round(size.height)]);
  const plan = objectPlanShapes(o);
  check(`"${ex.label}": the plan draws every visible part`, plan.length > 0, true);
  const fp = objectFootprint(o);
  const xs = fp.map((p) => p.x);
  const ys = fp.map((p) => p.y);
  check(`"${ex.label}": plan footprint matches the 3D width and depth`, [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))], [Math.round(size.width), Math.round(size.depth)]);
}
{
  // Front-view drawing: the drawn width becomes the 3D width, the drawn height the 3D height.
  const content = applyTemplate("panel", { width: 2400, height: 1200, thickness: 18, feet: false });
  const r = buildSpec(content);
  check("a 2400 × 1200 front-view panel is 2400 wide and 1200 high in 3D", r.ok ? [customSize(r.spec).width, customSize(r.spec).height] : r, [2400, 1200]);
}

{
  // Assembly parts in the drawing: front elevation, floor at y = 0, matching the 3D part.
  const counter = applyTemplate("counter", { width: 2000, height: 1050, depth: 600 });
  const top = counter.parts.find((q) => q.name === "Countertop")!;
  const e = partElevation(top);
  check("countertop drawn at its 3D height and width in the drawing", [Math.round(-e.y), Math.round(e.w)], [1050, Math.round(top.w)]);
  const lowest = Math.max(...counter.parts.map((q) => partElevation(q).y + partElevation(q).h));
  check("parts in the drawing stand on the floor line", lowest, 0);
}

// ----------------------------------------------- library round trip ----
{
  const r = buildSpec(applyTemplate("photo_booth", {}));
  if (r.ok) {
    const def = definitionFromSpec(r.spec, "#111111", "#222222");
    const item = { id: 7, name: "Booth", category: "Other", description: null, definition: def, revision: 3, schemaVersion: 1, createdAt: "", updatedAt: "" };
    const parsed = parseLibraryObject(item);
    check("a saved definition parses", parsed.error, null);
    const pl = parsed.definition ? placementFor(item, parsed.definition) : null;
    check("placing from the library links the instance to that entry and revision", pl ? [pl.libraryId, pl.libraryRevision, pl.name] : null, [7, 3, "Booth"]);
    check("key order doesn't matter when comparing recipes", sameJson({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }), true);
    check("different recipes are different", sameJson(r.spec, { ...r.spec, section: 51 }), false);
    const broken = parseLibraryObject({ ...item, definition: { v: 1 } as never });
    check("a damaged saved definition is reported, not crashed on", [broken.definition, typeof broken.error], [null, "string"]);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
