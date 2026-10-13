/**
 * Export dimension labels follow the chosen unit (V3), and printing in another
 * unit never changes the project.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/units-export.test.ts
 */
import { createEmptyModel, makeObject, makeRectRoom, type DisplayUnit, type ProjectModel } from "@workspace/design-model";
import { defaultExportOptions, layoutSheet } from "./export-plan";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const base = createEmptyModel({ venueName: "Hall", displayUnit: "m" });
const model: ProjectModel = { ...base, rooms: [makeRectRoom(0, 0, 18288, 12192, { name: "Hall" })], objects: [makeObject("counter", 6000, 4000, { width: 2438.4, depth: 609.6, height: 1066.8 })] };
const snapshot = JSON.stringify(model);
const texts = (unit: DisplayUnit) => {
  const m = { ...model, settings: { ...model.settings, displayUnit: unit } };
  return layoutSheet(m, defaultExportOptions(m)).prims.flatMap((p) => (p.k === "text" ? [p.text] : []));
};
check("metres: the 18.288 m wall is labelled in metres", texts("m").some((t) => t.includes("18.288")), true);
check("feet & inches: the same wall reads 60' 0\"", texts("ft").some((t) => t.includes(`60' 0"`)), true);
check("decimal feet: the same wall reads 60 ft", texts("ftd").some((t) => /\b60 ft\b/.test(t) || t === "60"), true);
check("millimetres: the same wall reads 18288", texts("mm").some((t) => t.includes("18288")), true);
check("decimal feet: the 40 ft wall reads 40", texts("ftd").some((t) => /\b40( ft)?\b/.test(t)), true);
check("laying out sheets in every unit leaves the project unchanged", JSON.stringify(model), snapshot);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
