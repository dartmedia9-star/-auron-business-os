/**
 * Checks for the Design Studio 3D scene builders
 * (artifacts/auron-os/src/components/design-studio/scene-builders.ts):
 * floor and wall geometry, openings cut into walls, parametric objects,
 * plan ↔ 3D axis mapping and camera framing. Runs in Node with three.js; no
 * browser or GPU needed.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/scene-builders.test.ts
 */
import * as THREE from "three";
import {
  createEmptyModel,
  makeLShapeRoom,
  makeObject,
  makeOpening,
  makePartition,
  makePillar,
  makeRectRoom,
  OBJECT_TYPES,
  offsetPolygon,
  polygonArea,
  rotate,
  translatePoints,
  updateEntity,
  type ProjectModel,
} from "@workspace/design-model";
import {
  floorGeometry,
  framePosition,
  MM,
  objectParts,
  openingDressing,
  pillarHeight,
  planTransform,
  prismGeometry,
  sceneBounds,
  toWorld,
  VIEW_DIRS,
  wallPieces,
} from "./scene-builders";

let failures = 0;
let passes = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes++;
  else failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Signed volume of a closed triangle mesh (positive when faces point outwards), m³. */
function meshVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}
function meshArea(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  let s = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    s += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  }
  return s;
}
const wallVolume = (m: ProjectModel) => wallPieces(m).reduce((s, p) => s + meshVolume(prismGeometry(p.points, p.y0, p.y1)), 0);

function hall(): ProjectModel {
  const m = createEmptyModel({ venueName: "Test" });
  m.rooms.push(makeRectRoom(0, 0, 6000, 8000, { name: "Hall", wallThickness: 200, wallHeight: 3000 }));
  return m;
}

// ------------------------------------------------------------- floors ----
{
  const m = hall();
  const g = floorGeometry(m.rooms[0].points, 0);
  check("floor of a 6 × 8 m hall is 48 m²", round(meshArea(g)), 48);
  const n = g.getAttribute("normal");
  let up = true;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0.999) up = false;
  check("floor faces up", up, true);
  const L = makeLShapeRoom(0, 0, 10000, 8000, 4000, 3000);
  check("L-shaped floor area matches the plan", round(meshArea(floorGeometry(L.points, 0)), 3), round(polygonArea(L.points) * MM * MM, 3));
}

// ------------------------------------------------------------- prisms ----
{
  const sq = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }];
  check("prism volume is exact and faces outward", round(meshVolume(prismGeometry(sq, 0, 3000))), 6);
  check("prism winding doesn't matter", round(meshVolume(prismGeometry([...sq].reverse(), 0, 3000))), 6);
  check("prism can float (window sill piece)", round(meshVolume(prismGeometry(sq, 900, 1200))), 0.6);
}

// -------------------------------------------------------------- walls ----
{
  const m = hall();
  const solid = (6.4 * 8.4 - 6 * 8) * 3;
  check("rectangular hall has 4 wall pieces", wallPieces(m).length, 4);
  check("wall volume = (outer − inner area) × height", round(wallVolume(m)), round(solid));
  check("walls rise to the wall height", wallPieces(m).every((p) => p.y0 === 0 && p.y1 === 3000), true);
  const room = m.rooms[0];
  const door = makeOpening("door", room.id, room.points[0].id, 1000, { width: 1000, height: 2100, sill: 0 });
  const withDoor = { ...m, openings: [door] };
  check("a door splits its wall into 2 pieces plus the head above", wallPieces(withDoor).length, 6);
  check("door removes exactly its own volume", round(wallVolume(withDoor)), round(solid - 1 * 2.1 * 0.2));
  const win = makeOpening("window", room.id, room.points[1].id, 2000, { width: 1500, height: 1200, sill: 900 });
  const withBoth = { ...withDoor, openings: [door, win] };
  check("a window adds the wall below the sill and above the head", wallPieces(withBoth).length, 9);
  check("window removes exactly its own volume", round(wallVolume(withBoth)), round(solid - 1 * 2.1 * 0.2 - 1.5 * 1.2 * 0.2));
  const tall = makeOpening("opening", room.id, room.points[2].id, 0, { width: 6000, height: 3000, sill: 0 });
  check("a full-height, full-width opening removes the wall entirely", wallPieces({ ...m, openings: [tall] }).filter((p) => p.edgeIndex === 2).length, 0);
  const hidden = { ...withDoor, openings: [{ ...door, hidden: true }] };
  check("hidden openings are not cut", wallPieces(hidden).length, 4);
  check("rooms with walls turned off have no walls", wallPieces({ ...m, rooms: [{ ...room, showWalls: false }] }).length, 0);
  check("hidden rooms have no walls", wallPieces({ ...m, rooms: [{ ...room, hidden: true }] }).length, 0);

  const L = makeLShapeRoom(0, 0, 10000, 8000, 4000, 3000, { wallThickness: 230, wallHeight: 4000 });
  const lm = { ...createEmptyModel(), rooms: [L] };
  const ring = (polygonArea(offsetPolygon(L.points, 230)) - polygonArea(L.points)) * MM * MM * 4;
  check("L-shaped walls (mitred corners) have the exact ring volume", round(wallVolume(lm), 3), round(ring, 3));
  check("each wall's normal points out of the room", wallPieces(m).map((p) => [round(p.normal.x), round(p.normal.y)]), [[0, -1], [1, 0], [0, 1], [-1, 0]]);
}

// --------------------------------------------------------- partitions ----
{
  const m = hall();
  const part = makePartition([{ x: 3000, y: 0 }, { x: 3000, y: 5000 }, { x: 6000, y: 5000 }], { thickness: 100, height: 2400 });
  m.partitions.push(part);
  const pieces = wallPieces(m).filter((p) => p.hostKind === "partition");
  check("an L partition has 2 pieces", pieces.length, 2);
  const door = makeOpening("door", part.id, part.points[0].id, 2000, { width: 900, height: 2100, sill: 0 });
  const cut = wallPieces({ ...m, openings: [door] }).filter((p) => p.hostKind === "partition");
  check("a partition door cuts the run", cut.length, 4);
  const vol = (ps: typeof pieces) => ps.reduce((s, p) => s + meshVolume(prismGeometry(p.points, p.y0, p.y1)), 0);
  check("partition door removes its volume", round(vol(pieces) - vol(cut)), round(0.9 * 2.1 * 0.1));
}

// ----------------------------------------------------------- openings ----
{
  const m = hall();
  const room = m.rooms[0];
  const win = makeOpening("window", room.id, room.points[0].id, 1000, { width: 1500, height: 1200, sill: 900 });
  const dress = openingDressing(m, win);
  check("windows get glass", dress.filter((b) => b.tone === "glass").length, 1);
  const glass = dress.find((b) => b.tone === "glass")!;
  check("glass sits in the middle of the wall", [glass.cx, glass.cy, glass.y0, glass.h], [1750, -100, 900, 1200]);
  const exit = makeOpening("emergency_exit", room.id, room.points[2].id, 1000, { width: 1200, height: 2100, sill: 0 });
  check("emergency exits get a green sign", openingDressing(m, exit).some((b) => b.tone === "exit"), true);
  check("door frames: two jambs and a head", openingDressing(m, makeOpening("door", room.id, room.points[0].id, 3000, { width: 1000, height: 2100, sill: 0 })).filter((b) => b.tone === "frame").length, 3);
  // Openings follow their wall when the room moves (they are hosted, not placed).
  const moved = { ...m, rooms: [{ ...room, points: translatePoints(room.points, 2000, 500) }] };
  const g2 = openingDressing(moved, win).find((b) => b.tone === "glass")!;
  check("openings move with their room", [g2.cx - glass.cx, g2.cy - glass.cy], [2000, 500]);
  check("an opening on a deleted wall draws nothing", openingDressing({ ...m, rooms: [] }, win).length, 0);
}

// ------------------------------------------------------------ objects ----
{
  for (const type of OBJECT_TYPES) {
    const o = makeObject(type, 0, 0);
    const parts = objectParts(o);
    const finite = parts.every((p) => Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v)));
    const solids = parts.filter((p) => p.kind !== "grid");
    const top = Math.max(...solids.map((p) => p.y + p.h));
    check(`${type}: builds ${parts.length} finite parts reaching its height`, [parts.length > 0, finite, near(top, o.height, 0.5)], [true, true, true]);
  }
  const stage = makeObject("stage", 0, 0, { width: 6000, depth: 4000, height: 900 });
  const inside = (o: typeof stage) =>
    objectParts(o).every((p) => {
      if (p.kind === "box") return Math.abs(p.x) + p.w / 2 <= o.width / 2 + 0.5 && Math.abs(p.z) + p.d / 2 <= o.depth / 2 + 0.5;
      if (p.kind === "cylinder") return Math.hypot(p.x, p.z) + p.r <= o.width / 2 + 0.5;
      return true;
    });
  check("stage parts stay within the footprint", inside(stage), true);
  const withSteps = { ...stage, props: { ...stage.props, frontSteps: true } };
  const extra = objectParts(withSteps).length - objectParts(stage).length;
  check("front steps: 900 mm stage gets 4 steps", extra, 4);
  check("front steps stand in front of the stage", objectParts(withSteps).slice(-extra).every((p) => p.kind === "box" && p.z - p.d / 2 >= stage.depth / 2 - 0.5), true);
  const steps = makeObject("steps", 0, 0, { width: 1200, depth: 900, height: 600, props: { count: 3 } });
  const sp = objectParts(steps);
  check("steps: count parts rising towards the back", sp.map((p) => (p.kind === "box" ? [round(p.h), round(p.z)] : null)), [[200, 300], [400, 0], [600, -300]]);
  const led = makeObject("led_screen", 0, 0, { width: 6000, height: 3000, props: { moduleSize: 500, showModules: true } });
  check("LED screen draws its module grid", objectParts(led).some((p) => p.kind === "grid"), true);
  const huge = makeObject("led_screen", 0, 0, { width: 100000, height: 3000, props: { moduleSize: 100, showModules: true } });
  check("LED grid is skipped when it would be too dense", objectParts(huge).some((p) => p.kind === "grid"), false);
  const table = makeObject("round_table", 0, 0, { props: { seats: 8 } });
  check("round table with 8 seats", objectParts(table).filter((p) => p.kind === "cylinder" && p.tone === "accent").length, 8);
  const arch = makeObject("box_arch", 0, 0);
  check("box arch fits inside its footprint", inside(arch), true);
  // Numeric edits change the 3D object.
  const m = hall();
  m.objects.push(stage);
  const wider = updateEntity(m, stage.id, { width: 8000 });
  const deck = objectParts(wider.objects[0])[0];
  check("changing width in the panel resizes the 3D deck", deck.kind === "box" ? deck.w : null, 8000);
}

// ---------------------------------------------------- axes and camera ----
{
  check("plan (1000, 2000) is world (1, 0, 2)", toWorld({ x: 1000, y: 2000 }).toArray(), [1, 0, 2]);
  const o = makeObject("structure", 2000, 3000, { rotation: 30, elevation: 600 });
  const t = planTransform(o, o.elevation);
  const obj = new THREE.Object3D();
  obj.position.set(...t.position);
  obj.rotation.y = t.rotationY;
  obj.updateMatrixWorld();
  const corner = new THREE.Vector3((o.width / 2) * MM, 0, (o.depth / 2) * MM).applyMatrix4(obj.matrixWorld);
  const planCorner = rotate({ x: o.x + o.width / 2, y: o.y + o.depth / 2 }, 30, { x: o.x, y: o.y });
  check("a rotated object's corner lands where the plan draws it", [round(corner.x / MM, 2), round(corner.z / MM, 2), round(corner.y / MM, 2)], [round(planCorner.x, 2), round(planCorner.y, 2), 600]);

  const m = hall();
  const b = sceneBounds(m);
  check("bounds include the outside of the walls", [round(b.size.x, 3), round(b.size.y, 3), round(b.size.z, 3)], [6.4, 3, 8.4]);
  const cam = new THREE.PerspectiveCamera(45, 4 / 3, 0.05, 5000);
  cam.position.copy(framePosition(b, VIEW_DIRS.top, 45, 4 / 3));
  cam.lookAt(b.center);
  cam.updateMatrixWorld();
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  check("top view: screen-up is plan-up (no mirroring)", [round(up.x, 2), round(up.z, 2)], [0, -1]);
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  check("top view: screen-right is plan-right", [round(right.x, 2), round(right.z, 2)], [1, 0]);
  // Every corner of the hall is inside the frame for every preset view.
  const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => new THREE.Vector3(b.center.x + (i - 0.5) * b.size.x, b.center.y + (j - 0.5) * b.size.y, b.center.z + (k - 0.5) * b.size.z))));
  for (const [view, dir] of Object.entries(VIEW_DIRS)) {
    for (const aspect of [0.7, 1.45]) {
      const c = new THREE.PerspectiveCamera(45, aspect, 0.05, 5000);
      c.position.copy(framePosition(b, dir, 45, aspect));
      c.lookAt(b.center);
      c.updateMatrixWorld();
      const ok = corners.every((p) => {
        const q = p.clone().project(c);
        return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1;
      });
      check(`${view} view (aspect ${aspect}) fits the whole hall`, ok, true);
    }
  }
  const empty = sceneBounds(createEmptyModel());
  check("an empty project still gets a sensible camera", empty.radius > 1, true);
  m.pillars.push(makePillar(3000, 4000, { height: 0 }));
  check("full-height pillars take the room's height", pillarHeight(m, m.pillars[0]), 3000);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
