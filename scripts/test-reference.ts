/**
 * Design Studio V3 reference pictures in the Custom Builder: pixel ↔
 * drawing mapping, two-point calibration in any unit, turning about the
 * centre, saved data, and tracing over a calibrated picture into exact,
 * editable 3D geometry. No server or database needed.
 *
 *   npx tsx scripts/test-reference.ts
 */
import {
  buildSpec,
  calibrateReference,
  customSize,
  drawingToRef,
  newReference,
  parseCustomDefinition,
  parseLength,
  refToDrawing,
  referenceBounds,
  scaleReference,
  turnReference,
  type BuilderContent,
  type ReferenceImage,
} from "../lib/design-model/src/index";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

const base: ReferenceImage = { assetId: 5, x: 100, y: -200, mmPerPx: 2.5, rotation: 0, opacity: 0.5, locked: false, hidden: false, calibration: null };

console.log("\n# Mapping");
{
  check("pixel (0,0) is the picture's top-left corner", refToDrawing(base, { x: 0, y: 0 }), { x: 100, y: -200 });
  check("pixel (400, 200) at 2.5 mm/px", refToDrawing(base, { x: 400, y: 200 }), { x: 1100, y: 300 });
  const turned = { ...base, rotation: 90 };
  const p = refToDrawing(turned, { x: 100, y: 0 });
  check("a 90° clockwise turn sends the picture's top edge downwards on screen", [r3(p.x), r3(p.y)], [100, 50]);
  let ok = true;
  for (let i = 0; i < 40; i++) {
    const r = { ...base, rotation: -170 + i * 9.3, mmPerPx: 0.3 + i * 0.7, x: i * 37 - 500, y: 900 - i * 11 };
    const px = { x: (i * 53) % 1700, y: (i * 97) % 900 };
    const back = drawingToRef(r, refToDrawing(r, px));
    if (Math.abs(back.x - px.x) > 1e-6 || Math.abs(back.y - px.y) > 1e-6) ok = false;
  }
  check("drawing → pixel undoes pixel → drawing for 40 placements", ok, true);
  check("bounds of an unturned picture", referenceBounds(base, 400, 200), { minX: 100, minY: -200, maxX: 1100, maxY: 300 });
}

console.log("\n# Calibration");
{
  const a = refToDrawing(base, { x: 100, y: 100 });
  const b = refToDrawing(base, { x: 1100, y: 100 }); // 1000 px apart
  for (const [text, unit, mm] of [["6 m", "m", 6000], ["600 cm", "cm", 6000], ["19' 8\"", "ft", 5994.4], ["19.5 ft", "ftd", 5943.6], ["4500", "mm", 4500]] as const) {
    const len = parseLength(text, unit);
    if (!len.ok) {
      check(`parse ${text}`, len.error, null);
      continue;
    }
    const r = calibrateReference(base, a, b, len.mm);
    if (!r.ok) {
      check(`calibrate with ${text}`, r.error, null);
      continue;
    }
    const a2 = refToDrawing(r.ref, { x: 100, y: 100 });
    const b2 = refToDrawing(r.ref, { x: 1100, y: 100 });
    check(`"${text}" (${unit}): A–B now measures ${mm} mm`, r1(dist(a2, b2)), mm);
    check(`"${text}": point A stays where it was`, [r3(a2.x), r3(a2.y)], [r3(a.x), r3(a.y)]);
  }
  // On a turned picture, calibration still keeps A and gets the length right.
  const t = { ...base, rotation: 33 };
  const ta = refToDrawing(t, { x: 50, y: 400 });
  const tb = refToDrawing(t, { x: 650, y: 80 });
  const tr = calibrateReference(t, ta, tb, 2400);
  check("turned picture: calibrates to 2400 mm with A fixed", tr.ok && [r1(dist(refToDrawing(tr.ref, { x: 50, y: 400 }), refToDrawing(tr.ref, { x: 650, y: 80 }))), r3(refToDrawing(tr.ref, { x: 50, y: 400 }).x)], [2400, r3(ta.x)]);
  check("calibration is recorded with the points in pixels", tr.ok && tr.ref.calibration?.lengthMm, 2400);
  check("refuses two points on top of each other", calibrateReference(base, a, { x: a.x + 1, y: a.y }, 1000).ok, false);
  check("refuses a zero length", calibrateReference(base, a, b, 0).ok, false);
  check("refuses a nonsense length", calibrateReference(base, a, b, Number.NaN).ok, false);
}

console.log("\n# Turn, scale, new picture");
{
  const t = turnReference(base, 400, 200, 45);
  const c0 = refToDrawing(base, { x: 200, y: 100 });
  const c1 = refToDrawing(t, { x: 200, y: 100 });
  check("turning keeps the picture's centre in place", [r3(c1.x), r3(c1.y)], [r3(c0.x), r3(c0.y)]);
  const s = scaleReference({ ...base, calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, lengthMm: 5 } }, 4);
  check("typing a picture width replaces the calibration", [s.mmPerPx, s.calibration], [4, null]);
  check("a first picture is as wide as the drawing", (() => {
    const n = newReference(9, 2000, { minX: -500, minY: 0, maxX: 3500, maxY: 1000 });
    return [n.mmPerPx * 2000, n.x, n.y, n.opacity, n.calibration];
  })(), [4000, -500, 0, 0.5, null]);
  check("a first picture on an empty drawing is 3 m wide", r3(newReference(9, 1500, null).mmPerPx * 1500), 3000);
}

console.log("\n# Saved with the custom object");
{
  const content: BuilderContent = {
    sketch: { plane: "front", shapes: [{ kind: "rect", id: "a", x: 0, y: 0, w: 1000, h: 500 }], dims: [], labels: [], references: { front: base, top: { ...base, assetId: 6, rotation: 90 } } },
    construction: { method: "panel", depth: 300, thickness: 18, section: 50, round: false, infill: false, feet: false },
    parts: [],
    template: null,
  };
  const spec = buildSpec(content);
  check("a drawing with reference pictures still builds", spec.ok, true);
  if (spec.ok) {
    const def = { v: 1, sketch: content.sketch, construction: content.construction, parts: [], template: null, spec: spec.spec, color: "#ffffff", accentColor: "#000000", elevation: 0 };
    const back = parseCustomDefinition(JSON.parse(JSON.stringify(def)));
    check("front and plan pictures (with placement, opacity, lock, hide) survive save and load", back.ok && back.definition.sketch.references, { front: base, top: { ...base, assetId: 6, rotation: 90 } });
    const old = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, sketch: { ...content.sketch, references: undefined } })));
    check("a V2 custom object (no pictures) still loads", old.ok && old.definition.sketch.references, undefined);
    const bad = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, sketch: { ...content.sketch, references: { front: { ...base, mmPerPx: 0 } } } })));
    check("refuses a zero scale", bad.ok, false);
    const sneaky = parseCustomDefinition(JSON.parse(JSON.stringify({ ...def, sketch: { ...content.sketch, references: { front: { ...base, data: "AAAA" } } } })));
    check("image data can't ride along in a reference", sneaky.ok && "data" in (sneaky.definition.sketch.references?.front ?? {}), false);
  }
}

console.log("\n# Tracing a calibrated picture gives exact, editable geometry");
{
  // A 2000 × 1000 px front elevation of a counter: the counter's outline runs
  // from pixel (200, 300) to (1800, 820), and the drawing says it's 2.4 m wide.
  const ref = newReference(11, 2000, null);
  const cal = calibrateReference(ref, refToDrawing(ref, { x: 200, y: 820 }), refToDrawing(ref, { x: 1800, y: 820 }), 2400);
  if (!cal.ok) check("calibrate", cal.error, null);
  else {
    const tl = refToDrawing(cal.ref, { x: 200, y: 300 });
    const br = refToDrawing(cal.ref, { x: 1800, y: 820 });
    // Tracing = drawing a rectangle on the two corners (what tapping them does).
    const content: BuilderContent = {
      sketch: { plane: "front", shapes: [{ kind: "rect", id: "t", x: r1(tl.x), y: r1(tl.y), w: r1(br.x - tl.x), h: r1(br.y - tl.y) }], dims: [], labels: [], references: { front: cal.ref } },
      construction: { method: "extrude", depth: 600, thickness: 18, section: 50, round: false, infill: false, feet: false },
      parts: [],
      template: null,
    };
    const spec = buildSpec(content);
    check("the traced outline builds a solid", spec.ok, true);
    if (spec.ok) {
      const size = customSize(spec.spec);
      check("traced width is the calibrated 2400 mm, height follows the picture (780 mm), depth as typed", [r1(size.width), r1(size.height), r1(size.depth)], [2400, 780, 600]);
      // Editable: changing the shape changes the solid, the picture stays a guide.
      const edited = buildSpec({ ...content, sketch: { ...content.sketch, shapes: [{ ...(content.sketch.shapes[0] as { kind: "rect"; id: string; x: number; y: number; w: number; h: number }), h: 1050 }] } });
      check("the traced shape stays editable (height typed as 1050 mm)", edited.ok && r1(customSize(edited.spec).height), 1050);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
