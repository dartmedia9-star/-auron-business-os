/**
 * Design Studio V3 unit system: exact conversions, typed input in every
 * supported form, rounding, invalid input, unit switching without geometry
 * drift, and older projects. No server or database needed.
 *
 *   pnpm --filter @workspace/scripts exec tsx ./test-units.ts
 */
import {
  DISPLAY_UNITS,
  MM_PER_FOOT,
  MM_PER_INCH,
  createEmptyModel,
  formatArea,
  formatLength,
  gridOptions,
  lengthEdit,
  makeObject,
  makeRectRoom,
  mmToUnit,
  objectParts,
  parseLength,
  parseProjectModel,
  partsBounds,
  toInputValue,
  unitSuffix,
  unitToMm,
  unitWords,
  type DisplayUnit,
  type ProjectModel,
} from "../lib/design-model/src/index";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const mm = (s: string, u: DisplayUnit = "m") => {
  const r = parseLength(s, u);
  return r.ok ? r.mm : `error: ${r.error}`;
};

// ------------------------------------------------------- exact factors ----
check("1 ft = 304.8 mm exactly", MM_PER_FOOT, 304.8);
check("1 in = 25.4 mm exactly", MM_PER_INCH, 25.4);
check("1 m = 1000 mm", unitToMm(1, "m"), 1000);
check("1 cm = 10 mm", unitToMm(1, "cm"), 10);
check("10 ft = 3048 mm", unitToMm(10, "ftd"), 3048);
check("3048 mm = 10 ft", mmToUnit(3048, "ftd"), 10);
check("254 mm = 10 in", mmToUnit(254, "in"), 10);

// ------------------------------------------------- the brief's formats ----
check('"6 ft"', mm("6 ft"), 1828.8);
check(`"6'"`, mm("6'"), 1828.8);
check(`"6' 3\\""`, mm(`6' 3"`), 1905);
check('"6 ft 3 in"', mm("6 ft 3 in"), 1905);
check('"6.5 ft"', mm("6.5 ft"), 1981.2);
check('"1.5 m"', mm("1.5 m", "ft"), 1500);
check('"450 mm"', mm("450 mm", "ft"), 450);
check('"120 cm"', mm("120 cm", "ftd"), 1200);
check('spaces and case: "  6 FT  3 IN "', mm("  6 FT  3 IN "), 1905);
check("curly quotes from an iPad keyboard: 6’ 3”", mm("6’ 3”"), 1905);
check('words: "2 metres"', mm("2 metres", "ft"), 2000);
check('words: "12 inches"', mm("12 inches"), 304.8);
check('words: "3 feet"', mm("3 feet"), 914.4);
check('no space: "6\'3"', mm("6'3"), 1905);
check("decimal comma: 1,5 m", mm("1,5 m", "mm"), 1500);
check("bare number reads in the display unit (m)", mm("2.4", "m"), 2400);
check("bare number reads in the display unit (cm)", mm("240", "cm"), 2400);
check("bare number reads in the display unit (feet & inches = feet)", mm("8", "ft"), 2438.4);
check("bare number reads in the display unit (decimal feet)", mm("8.25", "ftd"), 2514.6);

// ----------------------------------------------------- invalid input ----
check("empty is refused", parseLength("  ", "m").ok, false);
check("letters are refused", parseLength("abc", "m").ok, false);
check("unknown unit is refused with a reason", parseLength("5 yards", "m"), { ok: false, error: 'Unknown unit "yards" (use m, cm, mm, ft or in)' });
check("12 inches or more inside feet-and-inches is refused", parseLength(`5' 12"`, "ft").ok, false);
check("Infinity is refused", parseLength("Infinity", "m").ok, false);
check("NaN is refused", parseLength("NaN", "m").ok, false);
check("1e9 notation is refused", parseLength("1e9", "m").ok, false);
check("two numbers are refused", parseLength("1 2 m", "m").ok, false);
check("negative values parse as negative (fields that need positive sizes refuse them)", mm("-2 m"), -2000);

// ---------------------------------------------------------- rounding ----
check("typed values round once to 0.1 mm", mm("1.23456 m"), 1234.6);
check("1/16 inch is kept to 0.1 mm", mm(`0' 0.0625"`), 1.6);
check("feet & inches labels round to 1/8 inch", formatLength(1000, "ft"), `3' 3⅜"`);
check("decimal feet labels show 2 decimals", formatLength(1000, "ftd"), "3.28 ft");
check("metre labels", formatLength(2438.4, "m"), "2.438 m");
check("centimetre labels", formatLength(2438.4, "cm"), "243.8 cm");
check("millimetre labels", formatLength(2438.4, "mm"), "2438 mm");
check("decimal feet field value has 4 decimals", toInputValue(1000, "ftd"), "3.2808");
check("areas: sq ft for both feet units", [formatArea(304.8 * 304.8 * 100, "ft"), formatArea(304.8 * 304.8 * 100, "ftd")], ["100 sq ft", "100 sq ft"]);
check("suffixes", DISPLAY_UNITS.map(unitSuffix), ["m", "cm", "mm", "ft-in", "ft"]);
check("plain words for export notes", unitWords("ftd"), "decimal feet");
check("decimal feet uses the imperial grid", gridOptions("ftd")[1].mm, 304.8);

// --------------------------------- untouched fields never write back ----
// 1000 mm shows as 3' 3⅜" (rounded); leaving the field must not store 1000.1.
for (const u of DISPLAY_UNITS) {
  for (const v of [1000, 1234.5, 3048, 2438.4, 7.3]) {
    check(`untouched ${u} field for ${v} mm is not written back`, lengthEdit(toInputValue(v, u), v, u), { ok: true, unchanged: true });
  }
}
check("an edited field is parsed", lengthEdit("2.5", 1000, "m"), { ok: true, mm: 2500 });
check("an invalid edit is refused, nothing is written", lengthEdit("2.5 parsecs", 1000, "m").ok, false);

// ------------------------- switching units never changes the geometry ----
function geometryOf(m: ProjectModel) {
  return JSON.stringify({ rooms: m.rooms, objects: m.objects, walls: m.walls, sections: m.sections, pillars: m.pillars, openings: m.openings, dimensions: m.dimensions });
}
{
  let model = createEmptyModel({ venueName: "Hall", displayUnit: "ft" });
  model = { ...model, rooms: [makeRectRoom(0, 0, 18288, 12192, { name: "Hall" })], objects: [makeObject("counter", 4000, 3000, { width: 2438.4, depth: 609.6, height: 1066.8 })] };
  const before = geometryOf(model);
  const counterBounds = partsBounds(objectParts(model.objects[0]));
  let m = model;
  for (let i = 0; i < 50; i++) {
    const u = DISPLAY_UNITS[i % DISPLAY_UNITS.length];
    m = { ...m, settings: { ...m.settings, displayUnit: u } };
  }
  check("50 unit switches: rooms and objects identical", geometryOf(m), before);
  check("50 unit switches: counter 3D bounds identical", partsBounds(objectParts(m.objects[0])), counterBounds);
  check("an 8 ft counter shows as 8' 0\" and 2.438 m", [formatLength(m.objects[0].width, "ft"), formatLength(m.objects[0].width, "m")], [`8' 0"`, "2.438 m"]);
  check("its 3D width is exactly 2438.4 mm", Math.round((counterBounds!.max[0] - counterBounds!.min[0]) * 10) / 10, 2438.4);
}

// ----------------------------------------------- older projects ----
{
  const v2 = createEmptyModel({ venueName: "Old", displayUnit: "ft" });
  const r = parseProjectModel(JSON.parse(JSON.stringify(v2)));
  check("a V2 project in feet & inches still opens in feet & inches", r.ok ? r.model.settings.displayUnit : r, "ft");
  const v3 = { ...v2, settings: { ...v2.settings, displayUnit: "ftd" } };
  const r3 = parseProjectModel(JSON.parse(JSON.stringify(v3)));
  check("a project saved in decimal feet opens in decimal feet", r3.ok ? r3.model.settings.displayUnit : r3, "ftd");
  const bad = parseProjectModel(JSON.parse(JSON.stringify({ ...v2, settings: { ...v2.settings, displayUnit: "furlongs" } })));
  check("an unknown unit is refused by validation", bad.ok, false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
