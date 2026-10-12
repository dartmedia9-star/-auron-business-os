/**
 * Checks for move alignment (interaction.ts alignMove), used when dragging in 3D.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/interaction.test.ts
 */
import { createEmptyModel, makeObject, makeRectRoom, type ProjectModel } from "@workspace/design-model";
import { alignMove } from "./interaction";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const room = makeRectRoom(0, 0, 6000, 8000, { name: "Hall" });
const stage = makeObject("stage", 3000, 2000, { width: 4000, depth: 2000, name: "Stage" });
const counter = makeObject("counter", 1000, 6000, { width: 1200, depth: 600, name: "Bar" });
const model: ProjectModel = { ...createEmptyModel({}), rooms: [room], objects: [stage, counter] };

// The bar's left edge is 600 mm from its centre; proposing x = 630 puts it 30 mm off the wall.
const nearWall = alignMove(model, counter.id, 630, 6000, 60, 100);
check("left edge snaps flush to the wall face", [nearWall.x, nearWall.alignedX], [600, "wall"]);

// Proposing a centre 40 mm left of the stage's centre line lines it up with the stage centre.
const centred = alignMove(model, counter.id, 2960, 6020, 60, 100);
// (The hall's centre line is the same x here, so either may be named.)
check("centre lines up with the stage/hall centre line", [centred.x, /centre$/.test(centred.alignedX ?? "")], [3000, true]);

// Back edge 20 mm off the stage's front edge (y = 3000): butts up against it.
const butt = alignMove(model, counter.id, 2500, 3320, 60, 100);
check("back edge butts against the stage front", [butt.y, butt.alignedY], [3300, "Stage"]);

const free = alignMove(model, counter.id, 2234, 4567, 60, 100);
check("away from everything it rounds to the grid", [free.x, free.y, free.alignedX, free.alignedY], [2200, 4600, null, null]);

const rotated = alignMove({ ...model, objects: [stage, { ...counter, rotation: 90 }] }, counter.id, 330, 6000, 60, 100);
check("a turned item uses its turned footprint (300 mm half-depth to the wall)", rotated.x, 300);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
