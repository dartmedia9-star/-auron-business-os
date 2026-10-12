/**
 * Checks for floor-plan annotation placement
 * (plan-primitives.ts + annotation-layout.ts): every dimension value is drawn,
 * no two labels cover each other, and room/section names stay clear of
 * stages and backdrops, both at screen zoom levels and at export scale.
 * Uses the 6 m × 8 m reference hall: 1 m side strips, middle split 4×1 / 4×4 / 4×3.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/plan-layout.test.ts
 */
import {
  autoDimensions,
  convexOverlap,
  createEmptyModel,
  formatLength,
  makeObject,
  makeOpening,
  makeRectRoom,
  objectFootprint,
  pointInPolygon,
  sectionFillingRoom,
  splitSection,
  updateEntity,
  type ProjectModel,
  type Section,
} from "@workspace/design-model";
import { textBox, textWidthPx } from "./annotation-layout";
import { layoutSheet, pdfUnsupportedText } from "./export-plan";
import { buildPlan, layersFromSettings, type Prim } from "./plan-primitives";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

type Text = Extract<Prim, { k: "text" }>;
const texts = (prims: Prim[]) => prims.filter((p): p is Text => p.k === "text");

function referenceHall(): { model: ProjectModel; byName: Record<string, Section>; stageId: string; backdropId: string } {
  let model: ProjectModel = createEmptyModel({ venueName: "Reference hall" });
  const hall = makeRectRoom(0, 0, 6000, 8000, { name: "Hall" });
  model = { ...model, rooms: [hall] };
  const whole = sectionFillingRoom(hall)!;
  const cols = splitSection(whole, "x", [1000, 4000, 1000], ["Left strip", "Middle", "Right strip"]);
  if (!cols.ok) throw new Error(cols.error);
  const [left, middle, right] = cols.sections;
  const rows = splitSection(middle, "y", [1000, 4000, 3000], ["Upper", "Central", "Lower"]);
  if (!rows.ok) throw new Error(rows.error);
  const sections = [left, ...rows.sections, right];
  // A stage across the Central section with a backdrop behind it: the
  // section's natural label spot (its centre) is under the stage.
  const stage = makeObject("stage", 3000, 3000, { width: 4000, depth: 2400, name: "Main stage" });
  const backdrop = makeObject("backdrop", 3000, 1650, { width: 4000, depth: 200, name: "Backdrop" });
  const exit = makeOpening("emergency_exit", hall.id, hall.points[2].id, 2500, { width: 1000 });
  model = { ...model, sections, objects: [stage, backdrop], openings: [exit] };
  return { model, byName: Object.fromEntries(sections.map((s) => [s.name, s])), stageId: stage.id, backdropId: backdrop.id };
}

function overlappingPairs(list: Text[], pxPerMm: number): string[] {
  const boxes = list.map((t) => textBox(t, pxPerMm, 0));
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (convexOverlap(boxes[i], boxes[j], 0.01)) out.push(`${list[i].text} × ${list[j].text}`);
  return out;
}

const { model, byName, stageId, backdropId } = referenceHall();
const stagePoly = objectFootprint(model.objects.find((o) => o.id === stageId)!);
const backdropPoly = objectFootprint(model.objects.find((o) => o.id === backdropId)!);
const unit = model.settings.displayUnit;
const sectionNames = ["Left strip", "Upper", "Central", "Lower", "Right strip"];

function verify(label: string, pxPerMm: number, prims: Prim[], crowded: unknown[]) {
  const t = texts(prims);
  check(`${label}: nothing reported crowded`, crowded, []);
  check(`${label}: no two labels overlap`, overlappingPairs(t, pxPerMm), []);
  // Every automatic dimension has its value drawn, none dropped for size.
  const dims = autoDimensions(model, { pxPerMm });
  const want = dims.map((d) => formatLength(d.value, unit)).sort();
  const dimTexts = t.filter((x) => x.style.role === "dimText").map((x) => x.text).sort();
  check(`${label}: every dimension value is drawn (${want.length})`, dimTexts, want);
  for (const name of sectionNames) {
    const s = t.find((x) => x.text === name);
    check(`${label}: "${name}" is labelled`, !!s, true);
    if (!s) continue;
    const box = textBox(s, pxPerMm, 0);
    check(`${label}: "${name}" is inside its section`, box.every((q) => pointInPolygon(q, objectFootprint(byName[name]), 0.5)), true);
    check(`${label}: "${name}" is clear of the stage and backdrop`, convexOverlap(box, stagePoly, 0.01) || convexOverlap(box, backdropPoly, 0.01), false);
  }
  for (const s of t.filter((x) => x.entityId === model.rooms[0].id)) {
    const box = textBox(s, pxPerMm, 0);
    check(`${label}: room label "${s.text}" is clear of the stage and backdrop`, convexOverlap(box, stagePoly, 0.01) || convexOverlap(box, backdropPoly, 0.01), false);
  }
  // The 1 m strip reads across when the name fits in 1 m at this scale, along its length otherwise.
  const narrow = t.find((x) => x.text === "Left strip")!;
  const fitsAcross = textWidthPx("Left strip", narrow.size, true) + 8 <= 1000 * pxPerMm;
  check(`${label}: the 1 m strip is named ${fitsAcross ? "across" : "along its length"}`, Math.abs(narrow.angle), fitsAcross ? 0 : 90);
}

// Screen zoom levels: phone, iPad fit-to-screen, zoomed in.
for (const [name, pxPerMm] of [["phone 0.045 px/mm", 0.045], ["iPad fit 0.056 px/mm", 0.056], ["zoomed 0.15 px/mm", 0.15]] as const) {
  const plan = buildPlan(model, { pxPerMm, unit });
  verify(name, pxPerMm, plan.prims, plan.crowded);
}

// Export scale, exactly as the PDF/PNG export lays the sheet out.
for (const paper of ["A4", "A3"] as const) {
  for (const orientation of ["landscape", "portrait"] as const) {
    const sheet = layoutSheet(model, { paper, orientation, layers: layersFromSettings(model), includeNotes: true, includeTitleBlock: true });
    const pxPerMm = 1 / sheet.denom / 0.25;
    verify(`export ${paper} ${orientation} 1:${sheet.denom}`, pxPerMm, sheet.prims, sheet.crowded);
    const off = texts(sheet.prims).filter((t) => !textBox(t, pxPerMm, 0).every((q) => {
      const m = sheet.map(q);
      return m.x >= sheet.plan.x - 0.5 && m.x <= sheet.plan.x + sheet.plan.w + 0.5 && m.y >= sheet.plan.y - 0.5 && m.y <= sheet.plan.y + sheet.plan.h + 0.5;
    })).map((t) => t.text);
    check(`export ${paper} ${orientation} 1:${sheet.denom}: every label is on the sheet`, off, []);
  }
}

// Same input, same layout.
{
  const a = buildPlan(model, { pxPerMm: 0.056, unit });
  const b = buildPlan(model, { pxPerMm: 0.056, unit });
  check("layout is deterministic", JSON.stringify(texts(a.prims)), JSON.stringify(texts(b.prims)));
}

// Values never change with zoom; only positions do.
{
  const at = (k: number) => texts(buildPlan(model, { pxPerMm: k, unit }).prims).filter((x) => x.style.role === "dimText").map((x) => x.text).sort();
  check("dimension values identical at every zoom", at(0.03), at(0.3));
}

// A short object dimension still shows its value (beyond the line, not hidden).
{
  const small = makeObject("structure", 600, 6500, { width: 300, depth: 300 });
  const m2: ProjectModel = { ...model, objects: [...model.objects, small], settings: { ...model.settings, showObjectDims: true } };
  const plan = buildPlan(m2, { pxPerMm: 0.05, unit, selectedId: small.id });
  check("a 300 mm dimension is labelled even when tiny on screen", texts(plan.prims).some((x) => x.style.role === "dimText" && x.text === formatLength(300, unit)), true);
}

// A backdrop standing on the stage, centred on it: both names still get a clear spot.
{
  const stage = model.objects.find((o) => o.id === stageId)!;
  const onStage = model.objects.map((o) => (o.id === backdropId ? { ...o, x: stage.x, y: stage.y, elevation: stage.height } : o));
  for (const k of [0.05, 0.065, 0.11]) {
    const plan = buildPlan({ ...model, objects: onStage }, { pxPerMm: k, unit, selectedId: backdropId });
    check(`backdrop on the stage @${k} px/mm: nothing crowded`, plan.crowded, []);
    check(`backdrop on the stage @${k} px/mm: no overlaps`, overlappingPairs(texts(plan.prims), k), []);
  }
}

// A manually moved label stays exactly where it was put.
{
  const central = byName["Central"];
  const moved = updateEntity(model, central.id, { labelOffset: { x: 0, y: 1500 } });
  const t = texts(buildPlan(moved, { pxPerMm: 0.056, unit }).prims).find((x) => x.text === "Central")!;
  check("manual label offset is honoured", [t.p.x, t.p.y], [central.x, central.y + 1500]);
  check("moved label knows its owner and anchor", t.owner, { id: central.id, base: { x: central.x, y: central.y } });
}

// Laying out an export never changes the project itself.
{
  const before = JSON.stringify(model);
  layoutSheet(model, { paper: "A4", orientation: "landscape", layers: layersFromSettings(model), includeNotes: true, includeTitleBlock: true });
  buildPlan(model, { pxPerMm: 0.05, unit, selectedId: stageId });
  check("export layout leaves the project unchanged", JSON.stringify(model) === before, true);
}

// Text the PDF's built-in font can't draw is reported (it would print as "?").
{
  const opts = { paper: "A4" as const, orientation: "landscape" as const, layers: layersFromSettings(model), includeNotes: false, includeTitleBlock: true };
  check("plain Latin names need no warning", pdfUnsupportedText(model, opts), []);
  const ml = updateEntity(model, byName["Central"].id, { name: "വേദി" });
  check("a Malayalam section name is reported", pdfUnsupportedText(ml, opts), ["വേദി"]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
