/**
 * Design Studio V3 custom objects with artwork: definitions carry image
 * references (never image data), older definitions still load, placed and
 * duplicated instances keep their artwork, and the artwork lands on the
 * custom object's own surfaces. No server or database needed.
 *
 *   npx tsx scripts/test-custom-artwork.ts
 */
import {
  DEFAULT_FINISH,
  buildSpec,
  createEmptyModel,
  duplicateEntities,
  makeCustomObject,
  objectParts,
  objectSurfaces,
  parseCustomDefinition,
  parseProjectModel,
  surfaceLayout,
  type BuilderContent,
  type Finish,
} from "../lib/design-model/src/index";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const F = (assetId: number, f: Partial<Finish> = {}): Finish => ({ assetId, ...DEFAULT_FINISH, ...f });

const content: BuilderContent = {
  sketch: { plane: "front", shapes: [{ kind: "rect", id: "r", x: 0, y: 0, w: 2400, h: 1200 }], dims: [], labels: [] },
  construction: { method: "panel", depth: 300, thickness: 30, section: 50, round: false, infill: false, feet: true },
  parts: [],
  template: null,
};
const built = buildSpec(content);
if (!built.ok) throw new Error(built.error);
const spec = built.spec;
const def = { v: 1, ...content, spec, color: "#ffffff", accentColor: "#000000", elevation: 0 };

console.log("\n# Library definitions");
{
  const withArt = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, finishes: { front: F(4, { fit: "contain" }), rear: F(5) } })));
  check("a custom object saves its artwork per surface", withArt.ok && withArt.definition.finishes, { front: F(4, { fit: "contain" }), rear: F(5) });
  const old = parseCustomDefinition(JSON.parse(JSON.stringify(def)));
  check("a V2 custom object (no artwork) still loads", old.ok && old.definition.finishes, undefined);
  const sneaky = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, finishes: { front: { ...F(4), pixels: "AAAA" } } })));
  check("image data can't ride along in a saved custom object", sneaky.ok && "pixels" in (sneaky.definition.finishes?.front ?? {}), false);
  const bad = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, finishes: { front: { assetId: -1 } } })));
  check("a bad image id is refused", bad.ok, false);
}

console.log("\n# Instances");
{
  const o = { ...makeCustomObject(spec, 1000, 1000, { name: "Panel" }), finishes: { front: F(4), rear: F(5, { rotation: 180 }) } };
  const surfaces = objectSurfaces(o);
  check("a custom panel offers front and rear", surfaces.map((s) => s.id), ["front", "rear"]);
  const lay = surfaceLayout(objectParts(o), surfaces);
  check("front and rear map onto the panel's faces (the feet stay plain)", lay.surfaces.map((s) => s.faces > 0), [true, true]);
  const footIdx = objectParts(o).findIndex((p) => p.role === "foot");
  check("feet carry no artwork", Array.from(lay.faceSurface[footIdx] ?? []).every((x) => x === -1), true);
  const front = lay.surfaces[0].rect;
  check("the front surface is the full 2.4 × 1.2 m panel", [Math.round(front.u1 - front.u0), Math.round(front.v1 - front.v0)], [2400, 1200]);

  const m = createEmptyModel();
  m.objects.push(o);
  const saved = parseProjectModel(JSON.parse(JSON.stringify(m)));
  check("a placed custom object keeps its artwork through save and load", saved.ok && saved.model.objects[0].finishes, o.finishes);
  const dup = duplicateEntities(m, [o.id]);
  const copy = dup.model.objects.find((x) => x.id === dup.ids[0]);
  check("duplicating keeps the artwork", copy?.finishes, o.finishes);
  check("…and the recipe", JSON.stringify(copy?.custom) === JSON.stringify(o.custom), true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
