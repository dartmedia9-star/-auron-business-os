/**
 * Unit checks for the Design Studio shared project model
 * (lib/design-model): units, geometry, rooms and walls, edge-length edits,
 * sections (including the 6 × 8 reference hall), openings, validation,
 * dimension annotations, undo/redo, serialization and 2D/3D shared data.
 * No server or database needed.
 *
 *   pnpm --filter @workspace/scripts exec tsx ./test-design-model.ts
 */
import {
  asRect,
  autoDimensions,
  createEmptyModel,
  createHistory,
  deleteEntities,
  dimLinePoints,
  duplicateEntities,
  edgesOf,
  findEntity,
  formatArea,
  formatFeetInches,
  formatLength,
  insertVertex,
  isSelfIntersecting,
  makeLShapeRoom,
  makeNote,
  makeObject,
  makeOpening,
  makePillar,
  makePolygonRoom,
  makeRectRoom,
  makeSectionTL,
  modelBounds,
  moveVertex,
  nearestWall,
  offsetPolygon,
  openingGeometry,
  parseLength,
  parseProjectModel,
  polygonArea,
  pushHistory,
  redo,
  removeVertex,
  sectionFillingRoom,
  serializeProjectModel,
  setEdgeLength,
  setRectSize,
  snapAngle,
  snapVec,
  splitSection,
  toInputValue,
  undo,
  updateEntity,
  validateModel,
  type ProjectModel,
  type Section,
} from "../lib/design-model/src/index";

let failures = 0;
let passes = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes++;
  else failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------ units
check("6 m is 6000 mm", parseLength("6", "m"), { ok: true, mm: 6000 });
check("explicit mm wins over display unit", parseLength("450mm", "m"), { ok: true, mm: 450 });
check("cm display", parseLength("250", "cm"), { ok: true, mm: 2500 });
check("12' 6\" = 3810 mm", parseLength("12' 6\"", "m"), { ok: true, mm: 3810 });
check("12ft 6in", parseLength("12ft 6in", "ft"), { ok: true, mm: 3810 });
check("bare number in ft display is feet", parseLength("10", "ft"), { ok: true, mm: 3048 });
check("6\" = 152.4 mm", parseLength('6"', "m"), { ok: true, mm: 152.4 });
check("comma decimal", parseLength("2,5", "m"), { ok: true, mm: 2500 });
check("inches >= 12 rejected", parseLength("5' 12\"", "ft").ok, false);
check("garbage rejected", parseLength("abc", "m").ok, false);
check("empty rejected", parseLength("  ", "m").ok, false);
check("format m", formatLength(6000, "m"), "6 m");
check("format m decimals", formatLength(1234.5, "m"), "1.235 m");
check("format cm", formatLength(2505, "cm"), "250.5 cm");
check("format mm", formatLength(450, "mm"), "450 mm");
check("format ft-in", formatFeetInches(3810), "12' 6\"");
check("format ft-in eighths", formatFeetInches(3822.7), "12' 6½\"");
check("area m²", formatArea(48e6, "m"), "48 m²");
check("area sq ft", formatArea(304.8 * 304.8 * 100, "ft"), "100 sq ft");
check("input value round trip m", parseLength(toInputValue(3810, "m"), "m"), { ok: true, mm: 3810 });
check("input value round trip ft", parseLength(toInputValue(3810, "ft"), "ft"), { ok: true, mm: 3810 });

// --------------------------------------------------------------- geometry
check("snap to 500 grid", snapVec({ x: 740, y: 1260 }, 500), { x: 500, y: 1500 });
const sa = snapAngle({ x: 0, y: 0 }, { x: 1000, y: 80 }, 45);
check("angle snap to horizontal", [Math.round(sa.x), Math.round(sa.y)], [1003, 0]);
check("square area", polygonArea([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]), 1e6);
check("bow-tie is self intersecting", isSelfIntersecting([{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }]), true);
const off = offsetPolygon([{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 8000 }, { x: 0, y: 8000 }], 230);
check("outward offset of rectangle", off.map((p) => [Math.round(p.x), Math.round(p.y)]), [[-230, -230], [6230, -230], [6230, 8230], [-230, 8230]]);

// ------------------------------------------------------------------ rooms
const room = makeRectRoom(0, 0, 6000, 8000, { name: "Hall" });
check("rect room has 4 walls", edgesOf(room.points).length, 4);
check("wall lengths are exact", edgesOf(room.points).map((e) => e.length), [6000, 8000, 6000, 8000]);
check("asRect recognises it", asRect(room), { x: 0, y: 0, width: 6000, length: 8000 });
check("vertex ids are unique", new Set(room.points.map((p) => p.id)).size, 4);
const ccw = makePolygonRoom([{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }]);
check("counter-clockwise input normalised to clockwise", ccw.points.map((p) => [p.x, p.y]), [[1000, 0], [1000, 1000], [0, 1000], [0, 0]]);
const resized = setRectSize(room, 6500, 7500);
check("setRectSize keeps origin", asRect(resized), { x: 0, y: 0, width: 6500, length: 7500 });
check("setRectSize keeps vertex ids", resized.points.map((p) => p.id), room.points.map((p) => p.id));

const e0 = setEdgeLength(room.points, 0, 7000);
check("top wall to 7 m widens the room", edgesOf(e0.points).map((e) => e.length), [7000, 8000, 7000, 8000]);
check("two vertices moved", e0.moved.length, 2);
const e1 = setEdgeLength(room.points, 1, 9000);
check("right wall to 9 m lengthens the room", edgesOf(e1.points).map((e) => e.length), [6000, 9000, 6000, 9000]);

const L = makeLShapeRoom(0, 0, 10000, 8000, 4000, 3000);
check("L-shape walls", edgesOf(L.points).map((e) => e.length), [10000, 5000, 4000, 3000, 6000, 8000]);
check("L-shape area", polygonArea(L.points), 10000 * 8000 - 4000 * 3000);
const L2 = setEdgeLength(L.points, 1, 6000);
check("L-shape: right wall +1 m keeps the notch", edgesOf(L2.points).map((e) => e.length), [10000, 6000, 4000, 3000, 6000, 9000]);
check("L-shape stays rectilinear", edgesOf(L2.points).every((e) => near(e.a.x, e.b.x) || near(e.a.y, e.b.y)), true);

const ins = insertVertex(room.points, 0, { x: 2000, y: 50 });
check("insert vertex projects onto the wall", [ins.points[1].x, ins.points[1].y], [2000, 0]);
check("insert keeps total wall length", edgesOf(ins.points).reduce((s, e) => s + e.length, 0), 28000);
const mv = moveVertex(room.points, room.points[2].id, { x: 6500, y: 8000 });
check("move vertex", [mv[2].x, mv[2].y], [6500, 8000]);

// ---------------------------------------------------- 6 × 8 reference hall
// Overall 6 × 8; left and right strips 1 × 8; upper 4 × 1; central 4 × 4;
// lower 4 × 3. Built with the split-section tool exactly as a user would.
{
  let model: ProjectModel = createEmptyModel({ venueName: "Reference hall" });
  const hall = makeRectRoom(0, 0, 6000, 8000, { name: "Hall" });
  model = { ...model, rooms: [hall] };
  const whole = sectionFillingRoom(hall)!;
  check("section fills the room", [whole.width, whole.depth, whole.x, whole.y], [6000, 8000, 3000, 4000]);
  const cols = splitSection(whole, "x", [1000, 4000, 1000], ["Left strip", "Middle", "Right strip"]);
  check("split into 1 / 4 / 1", cols.ok, true);
  if (cols.ok) {
    const [left, middle, right] = cols.sections;
    const rows = splitSection(middle, "y", [1000, 4000, 3000], ["Upper", "Central", "Lower"]);
    check("split middle into 1 / 4 / 3", rows.ok, true);
    if (rows.ok) {
      const all: Section[] = [left, ...rows.sections, right];
      model = { ...model, sections: all };
      const dims = (s: Section) => [s.width / 1000, s.depth / 1000];
      const byName = Object.fromEntries(all.map((s) => [s.name, s]));
      check("left strip 1 × 8", dims(byName["Left strip"]), [1, 8]);
      check("right strip 1 × 8", dims(byName["Right strip"]), [1, 8]);
      check("upper 4 × 1", dims(byName["Upper"]), [4, 1]);
      check("central 4 × 4", dims(byName["Central"]), [4, 4]);
      check("lower 4 × 3", dims(byName["Lower"]), [4, 3]);
      check("upper sits at top between strips", [byName["Upper"].x - 2000, byName["Upper"].y - 500], [1000, 0]);
      check("central starts 1 m down", byName["Central"].y - 2000, 1000);
      check("lower starts 5 m down", byName["Lower"].y - 1500, 5000);
      check("right strip starts at 5 m", byName["Right strip"].x - 500, 5000);
      check("first part keeps the original id", left.id, whole.id);
      const area = all.reduce((s, x) => s + x.width * x.depth, 0);
      check("sections cover the hall exactly (48 m²)", area, 48e6);
      check("no warnings for a valid partition", validateModel(model).map((i) => i.message), []);
      // Sections are dimensioned as chains outside the top and left walls.
      const dimsNow = autoDimensions(model);
      const chainX = dimsNow.filter((d) => d.key.startsWith("cx:"));
      const chainY = dimsNow.filter((d) => d.key.startsWith("cy:"));
      check("top chain reads 1 | 4 | 1 m", chainX.map((d) => d.value), [1000, 4000, 1000]);
      check("left chain reads 1 | 4 | 3 m", chainY.map((d) => d.value), [1000, 4000, 3000]);
      const xBreaks = new Set(chainX.flatMap((d) => [d.a.x, d.b.x]));
      const yBreaks = new Set(chainY.flatMap((d) => [d.a.y, d.b.y]));
      check(
        "every section edge is on a chain (no size is lost)",
        all.every((sec) => xBreaks.has(sec.x - sec.width / 2) && xBreaks.has(sec.x + sec.width / 2) && yBreaks.has(sec.y - sec.depth / 2) && yBreaks.has(sec.y + sec.depth / 2)),
        true,
      );
      check("no per-section dims inside narrow strips", dimsNow.filter((d) => d.key.startsWith("sw:") || d.key.startsWith("sd:")).length, 0);
      const topWall = dimsNow.find((d) => d.kind === "wall" && d.normal.y < -0.99)!;
      check("top wall dim moves one ring outside the chain", topWall.offset > chainX[0].offset, true);
      const bottomWall = dimsNow.find((d) => d.kind === "wall" && d.normal.y > 0.99)!;
      check("walls without a chain keep their place", bottomWall.offset, chainX[0].offset);
      const selDims = autoDimensions(model, { selectedId: byName["Central"].id }).filter((d) => d.entityId === byName["Central"].id).map((d) => d.value);
      check("a selected section also shows its own size", selDims, [4000, 4000]);
      const zoomedOut = autoDimensions(model, { pxPerMm: 0.01 });
      const zt = zoomedOut.find((d) => d.kind === "wall" && d.normal.y < -0.99)!;
      const zc = zoomedOut.find((d) => d.key.startsWith("cx:"))!;
      check("zoomed out, stacked lines stay ≥ 30 px apart", Math.round((zt.offset - zc.offset) * 0.01), 30);
      check("values never change with zoom", zoomedOut.map((d) => d.value), dimsNow.map((d) => d.value));
      const wallDims = autoDimensions(model).filter((d) => d.kind === "wall").map((d) => d.value);
      check("wall dimension labels 6 / 8 / 6 / 8", wallDims, [6000, 8000, 6000, 8000]);
      // Too-big section is flagged, not silently fixed.
      const bad = updateEntity(model, byName["Lower"].id, { depth: 3500 });
      const msgs = validateModel(bad).map((i) => i.message);
      check("oversized section flagged as not fitting", msgs.some((m) => m.includes("Lower does not fit")), true);
      check("oversized section flagged as overlapping", msgs.some((m) => m.includes("overlaps")), true);
    }
  }
  check("split with wrong total is rejected", splitSection(whole, "x", [1000, 4000], undefined).ok, false);
  check("split with zero size is rejected", splitSection(whole, "x", [0, 6000]).ok, false);
}

// --------------------------------------------------- dimension annotation
{
  let model = createEmptyModel();
  const hall = makeRectRoom(0, 0, 6000, 8000);
  model = { ...model, rooms: [hall] };
  const top = autoDimensions(model).find((d) => d.kind === "wall")!;
  const { p1, p2 } = dimLinePoints(top);
  check("top wall dim drawn outside the wall", [p1.y, p2.y], [-(230 + 600), -(230 + 600)]);
  const resizedModel = { ...model, rooms: [setRectSize(hall, 7000, 8000)] };
  check("dims update after a resize", autoDimensions(resizedModel).filter((d) => d.kind === "wall").map((d) => d.value), [7000, 8000, 7000, 8000]);
  const ext = { ...model, settings: { ...model.settings, showExternalDims: true } };
  check("external dims include walls", autoDimensions(ext).filter((d) => d.kind === "external").map((d) => d.value), [6460, 8460]);
  const L = { ...model, rooms: [makeLShapeRoom(0, 0, 10000, 8000, 4000, 3000)] };
  check("overall dims shown for a non-rectangular room", autoDimensions(L).filter((d) => d.kind === "overall").map((d) => d.value), [10000, 8000]);
}

// --------------------------------------------------------------- openings
{
  let model = createEmptyModel();
  const hall = makeRectRoom(0, 0, 6000, 8000);
  model = { ...model, rooms: [hall] };
  const hit = nearestWall(model, { x: 2000, y: 120 }, 300)!;
  check("nearest wall finds the top wall", [hit.hostId === hall.id, hit.startVertexId === hall.points[0].id, Math.round(hit.offset)], [true, true, 2000]);
  const door = makeOpening("door", hall.id, hit.startVertexId, 1550);
  model = { ...model, openings: [door] };
  const g = openingGeometry(model, door)!;
  check("door endpoints on the internal face", [g.a, g.b], [{ x: 1550, y: 0 }, { x: 2450, y: 0 }]);
  check("outward normal of top wall points up", [g.normal.x, g.normal.y].map((n) => Math.round(n) + 0), [0, -1]);
  check("valid door, no warnings", validateModel(model).length, 0);
  const longDoor = updateEntity(model, door.id, { offset: 5500 });
  check("door past wall end is flagged", validateModel(longDoor).some((i) => i.message.includes("past the end")), true);
  // Inserting a vertex on another wall doesn't re-target the door.
  const withVertex = updateEntity(model, hall.id, { points: insertVertex(hall.points, 2, { x: 3000, y: 8000 }).points });
  check("door keeps its wall after an insert elsewhere", openingGeometry(withVertex, door)!.a, { x: 1550, y: 0 });
  // Removing the door's start vertex moves it to the merged wall, same place.
  const withMid = updateEntity(model, hall.id, { points: insertVertex(hall.points, 0, { x: 1000, y: 0 }).points });
  const midRoom = findEntity(withMid, hall.id)!.entity as typeof hall;
  const doorOnSecond = updateEntity(withMid, door.id, { startVertexId: midRoom.points[1].id, offset: 550 });
  check("door on split wall at 1550", openingGeometry(doorOnSecond, door)!.a, { x: 1550, y: 0 });
  const merged = removeVertex(doorOnSecond, hall.id, midRoom.points[1].id);
  const mergedDoor = merged.openings[0];
  check("door re-hosted on merged wall", [mergedDoor.startVertexId === hall.points[0].id, mergedDoor.offset], [true, 1550]);
  check("door position unchanged after vertex removal", openingGeometry(merged, mergedDoor)!.a, { x: 1550, y: 0 });
  // Deleting the room deletes its openings but keeps notes.
  const noted = { ...model, notes: [makeNote("Fire door, keep clear", "measured", door.id)] };
  const deleted = deleteEntities(noted, [hall.id]);
  check("deleting a room removes its openings", deleted.openings.length, 0);
  check("notes survive as project notes", [deleted.notes.length, deleted.notes[0].targetId], [1, null]);
}

// ------------------------------------------------- objects, 2D <-> 3D data
{
  let model = createEmptyModel();
  const hall = makeRectRoom(0, 0, 20000, 30000);
  const stage = makeObject("stage", 10000, 3000, { width: 9760, depth: 4880, height: 900 });
  const backdrop = makeObject("backdrop", 10000, 600, { width: 9760, height: 4000 });
  const pillar = makePillar(5000, 15000);
  model = { ...model, rooms: [hall], objects: [stage, backdrop], pillars: [pillar] };
  check("stage keeps exact dimensions", [stage.width, stage.depth, stage.height], [9760, 4880, 900]);
  check("backdrop on the floor intersects the stage", validateModel(model).some((i) => i.message.includes("intersects")), true);
  const raised = updateEntity(model, backdrop.id, { elevation: 900 });
  check("raised backdrop no longer intersects", validateModel(raised).some((i) => i.message.includes("intersects")), false);
  const moved = updateEntity(raised, stage.id, { x: 11000, rotation: 15 });
  const s2 = findEntity(moved, stage.id)!.entity as typeof stage;
  check("position and rotation update", [s2.x, s2.rotation], [11000, 15]);
  check("other objects untouched by an edit", findEntity(moved, backdrop.id)!.entity, findEntity(raised, backdrop.id)!.entity);
  const dup = duplicateEntities(moved, [stage.id]);
  check("duplicate gives a new id", dup.ids.length === 1 && dup.ids[0] !== stage.id, true);
  const copy = findEntity(dup.model, dup.ids[0])!.entity as typeof stage;
  check("duplicate copies props and dims", [copy.width, copy.height, copy.props.skirting, copy.x], [9760, 900, true, 11500]);
  check("duplicate props are a separate object", copy.props !== s2.props, true);
  const removed = deleteEntities(dup.model, [dup.ids[0]]);
  check("delete removes only the copy", removed.objects.map((o) => o.id), [stage.id, backdrop.id]);
  const outside = updateEntity(model, stage.id, { x: -5000 });
  check("object outside the room is flagged", validateModel(outside).some((i) => i.message.includes("outside the room")), true);
  const ceil = { ...raised, venue: { ...raised.venue, ceilingHeight: 4500 } };
  check("object above the ceiling is flagged", validateModel(ceil).some((i) => i.message.includes("ceiling")), true);
  check("bounds include the room and its dimension space", modelBounds(model)!.minX < -230, true);

  // Save + reopen preserves every editable property, including 3D-only ones.
  const json = serializeProjectModel(moved);
  const back = parseProjectModel(JSON.parse(json));
  check("round trip parses", back.ok, true);
  if (back.ok) {
    const canon = (x: unknown): string => JSON.stringify(x, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
    check("round trip is lossless", canon(back.model), canon(moved));
    const st = findEntity(back.model, stage.id)!.entity as typeof stage;
    check("3D-only properties survive (elevation, height, props)", [st.elevation, st.height, st.props.frontSteps], [0, 900, false]);
  }
}

// ------------------------------------------------------- malformed input
check("rejects non-object", parseProjectModel("hello").ok, false);
check("rejects missing version", parseProjectModel({}).ok, false);
check("rejects newer version", parseProjectModel({ ...createEmptyModel(), schemaVersion: 99 }).ok, false);
{
  const m = createEmptyModel();
  const bad = { ...m, rooms: [{ ...makeRectRoom(0, 0, 1000, 1000), wallHeight: -5 }] };
  const res = parseProjectModel(bad);
  check("rejects negative wall height", res.ok, false);
  if (!res.ok) check("error names the field", res.error.includes("rooms.0.wallHeight"), true);
  const r1 = makeRectRoom(0, 0, 1000, 1000);
  check("rejects duplicate ids", parseProjectModel({ ...m, rooms: [r1, { ...r1 }] }).ok, false);
  check("rejects NaN coordinates", parseProjectModel({ ...m, pillars: [{ ...makePillar(0, 0), x: Number.NaN }] }).ok, false);
  const minimal = { ...m, rooms: [{ ...r1, notes: undefined, locked: undefined }] };
  const filled = parseProjectModel(JSON.parse(JSON.stringify(minimal)));
  check("missing optional fields get defaults", filled.ok && filled.model.rooms[0].notes === "" && filled.model.rooms[0].locked === false, true);
}

// ---------------------------------------------------------------- history
{
  let h = createHistory(1);
  h = pushHistory(h, 2, { now: 0 });
  h = pushHistory(h, 3, { now: 10 });
  check("undo", undo(h).present, 2);
  check("undo then redo", redo(undo(h)).present, 3);
  check("new change clears redo", pushHistory(undo(h), 9, { now: 20 }).future.length, 0);
  let t = createHistory("a");
  t = pushHistory(t, "ab", { key: "field", now: 0 });
  t = pushHistory(t, "abc", { key: "field", now: 300 });
  check("typing in one field coalesces into one step", [t.past.length, undo(t).present], [1, "a"]);
  t = pushHistory(t, "abcd", { key: "field", now: 5000 });
  check("a pause starts a new step", t.past.length, 2);
  check("undo at start is a no-op", undo(createHistory(0)).present, 0);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
