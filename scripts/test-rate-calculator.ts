/**
 * Unit checks for the Rate Calculator engine
 * (artifacts/auron-os/src/lib/rate-calculator.ts): pricing methods, unit
 * conversion, validation, rounding, totals, snapshots, bundle warnings,
 * per-line margin and copy-ready text. No server or database needed.
 *
 *   npx tsx ./test-rate-calculator.ts      (from scripts/)
 *
 * The items below are test fixtures built in memory only. Nothing here is
 * written to a catalog.
 */
import {
  bundleWarnings,
  calculate,
  copyAmountText,
  copyBaseRateText,
  copyDimensions,
  copyFullCalculationText,
  copyItemDetailsText,
  copyRateText,
  copyTotalText,
  createLine,
  duplicateLine,
  formatEffectiveRate,
  formatRate,
  parseDecimal,
  parseMargin,
  refreshLineSnapshot,
  snapshotChanges,
  type CalcLine,
  type RateSnapshot,
} from "../artifacts/auron-os/src/lib/rate-calculator";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const norm = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
  const ok = Object.is(actual, expected) || norm(actual) === norm(expected);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : ` — got ${norm(actual)}, expected ${norm(expected)}`}`);
}

let nextId = 1;
function item(over: Partial<RateSnapshot> & Pick<RateSnapshot, "name" | "pricingMethod" | "rate">): RateSnapshot {
  return {
    itemId: over.itemId ?? nextId++,
    categoryName: null,
    subcategory: null,
    unitLabel: null,
    percentageBase: null,
    percentageBaseItemIds: [],
    minBillable: null,
    maxBillable: null,
    conditions: null,
    ...over,
  };
}
function line(s: RateSnapshot, fields: Partial<CalcLine> = {}, id?: string): CalcLine {
  return { ...createLine(s, undefined, id), ...fields };
}
const one = (l: CalcLine) => calculate([l]).lines.get(l.id)!;

const stage = item({ name: "Stage", pricingMethod: "per_sqft", rate: "30.00" });
const carpet = item({ name: "Fresh Carpet", pricingMethod: "per_sqft", rate: "9.00" });

// 1. Square foot
const s1 = line(stage, { length: "16", width: "12" }, "s1");
check("1. 16 ft × 12 ft area", one(s1).billable, "192");
check("1. 16 × 12 × ₹30 = ₹5,760.00", copyAmountText(one(s1)), "₹5,760.00");

// 2. Running foot
const rft = item({ name: "Frame edge", pricingMethod: "per_rft", rate: "45.50" });
check("2. 40 rft × ₹45.50 = ₹1,820.00", copyAmountText(one(line(rft, { length: "40" }))), "₹1,820.00");
check("2. Running ft ignores width", one(line(rft, { length: "10", width: "" })).status, "ok");

// 3. Per piece
const piece = item({ name: "Foam letter", pricingMethod: "per_unit", rate: "550", unitLabel: "piece" });
check("3. 4 pieces × ₹550 = ₹2,200.00", copyAmountText(one(line(piece, { quantity: "4" }))), "₹2,200.00");
check("3. New per-unit line defaults quantity 1", createLine(piece).quantity, "1");

// 4. Fixed
const fixed = item({ name: "Site visit", pricingMethod: "fixed", rate: "5000" });
const fx = one(line(fixed));
check("4. Fixed charge needs no measurements", fx.status, "ok");
check("4. Fixed amount", copyAmountText(fx), "₹5,000.00");

// 5. Square metre and conversions
const sqm = item({ name: "Truss cover", pricingMethod: "per_sqm", rate: "100" });
check("5. 4 m × 3 m = 12 sq m", one(line(sqm, { length: "4", width: "3", dimensionUnit: "m" })).billable, "12");
check("5. 4 m × 3 m × ₹100 = ₹1,200.00", copyAmountText(one(line(sqm, { length: "4", width: "3", dimensionUnit: "m" }))), "₹1,200.00");
const sqmFromFt = one(line(sqm, { length: "16", width: "12", dimensionUnit: "ft" }));
check("5. 16 ft × 12 ft → 17.8374 sq m (0.09290304 sq m per sq ft)", sqmFromFt.billable, "17.8374");
check("5. Amount = shown area × rate", copyAmountText(sqmFromFt), "₹1,783.74");
const sqftFromM = one(line(stage, { length: "3", width: "2", dimensionUnit: "m" }));
check("5. 3 m × 2 m → 64.5835 sq ft", sqftFromM.billable, "64.5835");
check("5. 64.5835 sq ft × ₹30 = ₹1,937.51", copyAmountText(sqftFromM), "₹1,937.51");
const rmt = item({ name: "Skirting", pricingMethod: "per_rmt", rate: "200" });
check("5. 10 ft → 3.048 running m", one(line(rmt, { length: "10", dimensionUnit: "ft" })).billable, "3.048");
check("5. 3.048 rmt × ₹200 = ₹609.60", copyAmountText(one(line(rmt, { length: "10", dimensionUnit: "ft" }))), "₹609.60");
check("5. New sq m line defaults to metres", createLine(sqm).dimensionUnit, "m");

// 6. Percentage with explicit bases
const pctSel = item({ name: "Design fee", pricingMethod: "percentage", rate: "10", percentageBase: "selected_items", percentageBaseItemIds: [stage.itemId] });
const pctAll = item({ name: "Supervision", pricingMethod: "percentage", rate: "5", percentageBase: "all_other_items" });
const pctManual = item({ name: "Handling", pricingMethod: "percentage", rate: "2.5", percentageBase: "manual" });
const pctNone = item({ name: "Unconfigured %", pricingMethod: "percentage", rate: "10", percentageBase: null });
const c1 = line(carpet, { length: "16", width: "12" }, "c1");
const pS = line(pctSel, {}, "pS");
const pA = line(pctAll, {}, "pA");
const pM = line(pctManual, { baseAmount: "20000" }, "pM");
const pN = line(pctNone, {}, "pN");
const calcPct = calculate([s1, c1, pS, pA, pM, pN]);
check("6. 10% of Stage only = ₹576.00", copyAmountText(calcPct.lines.get("pS")!), "₹576.00");
check("6. Base names shown", calcPct.lines.get("pS")!.baseDescription, "Stage");
check("6. 5% of all other non-% items (7,488) = ₹374.40", copyAmountText(calcPct.lines.get("pA")!), "₹374.40");
check("6. Percentages never feed other percentages", calcPct.lines.get("pA")!.baseAmount, 7488);
check("6. 2.5% of manual ₹20,000 = ₹500.00", copyAmountText(calcPct.lines.get("pM")!), "₹500.00");
check("6. No base configured → no amount", calcPct.lines.get("pN")!.amountPaise, null);
check("6. No base configured → incomplete", calcPct.lines.get("pN")!.status, "incomplete");
check("6. Selected-items base missing from calc → no amount", calculate([c1, pS]).lines.get("pS")!.amountPaise, null);
check("6. Manual base blank → incomplete", one(line(pctManual)).status, "incomplete");
check("6. Rate shows as a percentage", copyRateText(pS), "10%");

// 7. Decimal dimensions
const dec = one(line(stage, { length: "16.5", width: "12.25" }));
check("7. 16.5 × 12.25 = 202.125 sq ft", dec.billable, "202.125");
check("7. 202.125 × ₹30 = ₹6,063.75", copyAmountText(dec), "₹6,063.75");
check("7. Commas accepted in input", one(line(stage, { length: "1,000", width: "1" })).billable, "1,000");

// 8–9. Multiple items, independent dimensions
const c2 = line(carpet, { length: "20", width: "10" }, "c2");
const multi = calculate([s1, c2]);
check("8. Two lines priced", multi.pricedCount, 2);
check("9. Stage keeps its own 16 × 12", multi.lines.get("s1")!.billable, "192");
check("9. Carpet keeps its own 20 × 10", multi.lines.get("c2")!.billable, "200");
check("8. Total 5,760 + 1,800", copyTotalText(multi), "₹7,560.00");

// 10. Explicit dimension copying
const copied = copyDimensions(s1, line(carpet, {}, "c3"));
check("10. Copies length", copied.length, "16");
check("10. Copies width", copied.width, "12");
check("10. Keeps its own item and rate", copied.snapshot.rate, "9.00");
check("10. Running target copies length only", copyDimensions(s1, line(rft)).width, "");
check("10. Quantity target unchanged", copyDimensions(s1, line(piece, { quantity: "3" })).quantity, "3");
const edited = { ...copied, length: "18" };
check("10. Copied values stay editable and independent", [edited.length, s1.length], ["18", "16"]);

// 11–12. Live recalculation
check("11. Changing length recalculates", copyAmountText(one({ ...s1, length: "20" })), "₹7,200.00");
check("12. Changing quantity recalculates", copyAmountText(one(line(piece, { quantity: "5" }))), "₹2,750.00");

// 13–14. Individual and combined accuracy
const exact = calculate([s1, c1]);
check("13. Stage amount", exact.lines.get("s1")!.amount, 5760);
check("13. Carpet amount", exact.lines.get("c1")!.amount, 1728);
check("14. Combined = ₹7,488.00", copyTotalText(exact), "₹7,488.00");
check("14. Excluded lines are not in the total", calculate([s1, { ...c1, included: false }]).total, 5760);
check("14. Total area (sq ft) of included lines", exact.areaTotals, [{ unit: "sq ft", value: "384" }]);

// 15. Precision and rounding
const tiny = item({ name: "Tiny", pricingMethod: "per_sqft", rate: "0.10" });
const sum = calculate([line(tiny, { length: "1", width: "1" }, "a"), line(tiny, { length: "1", width: "2" }, "b")]);
check("15. 0.10 + 0.20 = ₹0.30 exactly", copyTotalText(sum), "₹0.30");
check("15. Half-up rounding of amount (1.005 → 1.01)", copyAmountText(one(line(item({ name: "r", pricingMethod: "per_unit", rate: "1.00" }), { quantity: "1.005" }))), "₹1.01");
check("15. 33.3333 × ₹3 = ₹100.00", copyAmountText(one(line(item({ name: "r3", pricingMethod: "per_unit", rate: "3" }), { quantity: "33.3333" }))), "₹100.00");

// 16. Invalid input
check("16. Blank → incomplete", one(line(stage, { length: "", width: "12" })).status, "incomplete");
check("16. Blank → no amount", one(line(stage, { length: "", width: "12" })).amount, null);
check("16. Negative → invalid", one(line(stage, { length: "-5", width: "12" })).status, "invalid");
check("16. Negative message", one(line(stage, { length: "-5", width: "12" })).fieldErrors.length, "Length (ft) can't be negative");
check("16. Zero → invalid, not ₹0.00", one(line(stage, { length: "0", width: "12" })).amount, null);
check("16. Zero message", one(line(stage, { length: "0", width: "12" })).fieldErrors.length, "Length (ft) must be greater than 0");
check("16. Text → invalid", one(line(stage, { length: "abc", width: "12" })).status, "invalid");
check("16. Too large → invalid", one(line(stage, { length: "100001", width: "1" })).status, "invalid");
check("16. Too many decimals → invalid", one(line(stage, { length: "1.23456", width: "1" })).status, "invalid");
check("16. Quantity over 1,000,000 → invalid", one(line(piece, { quantity: "1000001" })).status, "invalid");
check("16. Invalid lines are left out of the total", calculate([s1, line(stage, { length: "-1", width: "2" }, "bad")]).total, 5760);
check("16. ... and listed as unpriced", calculate([s1, line(stage, { length: "-1", width: "2" }, "bad")]).unpricedLineIds, ["bad"]);
check("16. parseDecimal rejects 1e5", parseDecimal("1e5").ok, false);

// Configured limits
const limited = item({ name: "Limited", pricingMethod: "per_sqft", rate: "10", minBillable: "100", maxBillable: "500" });
const minRes = one(line(limited, { length: "5", width: "5" }));
check("Limits. Below minimum bills the configured minimum", minRes.billable, "100");
check("Limits. Measured value still shown", minRes.measured, "25");
check("Limits. Minimum is noted, not silent", minRes.notes.length, 1);
check("Limits. Minimum amount", copyAmountText(minRes), "₹1,000.00");
check("Limits. Above maximum → invalid", one(line(limited, { length: "30", width: "20" })).status, "invalid");

// 17. Missing rate
const noRate = item({ name: "Unpriced", pricingMethod: "per_sqft", rate: null });
const nr = one(line(noRate, { length: "10", width: "10" }));
check("17. Missing rate → no amount", nr.amount, null);
check("17. Missing rate → incomplete with message", nr.status === "incomplete" && nr.errors[0].includes("No rate"), true);
check("17. Copy rate unavailable", copyRateText(line(noRate)), null);

// 18. Snapshots vs master rate changes
const captured = line(stage, { length: "16", width: "12" }, "snap");
const newMaster = { ...stage, rate: "32.00" };
check("18. Captured line still priced at ₹30", copyAmountText(one(captured)), "₹5,760.00");
check("18. Rate change detected", snapshotChanges(captured.snapshot, newMaster), ["rate"]);
check("18. Same rate written differently is no change", snapshotChanges(captured.snapshot, { ...stage, rate: "30" }), []);
const refreshed = refreshLineSnapshot(captured, newMaster);
check("18. Explicit refresh uses new rate", copyAmountText(one(refreshed)), "₹6,144.00");
check("18. Refresh keeps measurements", [refreshed.length, refreshed.width], ["16", "12"]);
const dup = duplicateLine(captured);
check("18. Duplicate keeps snapshot and measurements", [dup.snapshot.rate, dup.length, dup.id !== captured.id], ["30.00", "16", true]);

// 19. Bundle warnings
const platform = item({ name: "Platform with carpet", pricingMethod: "per_sqft", rate: "38" });
const names = new Map([[platform.itemId, platform.name], [carpet.itemId, carpet.name], [stage.itemId, stage.name], [piece.itemId, piece.name]]);
const pl = line(platform, { length: "16", width: "12" }, "pl");
const cp = line(carpet, { length: "16", width: "12" }, "cp");
const rel = [{ itemId: platform.itemId, relatedItemId: carpet.itemId, relationType: "includes" as const, note: "Carpet is part of the platform rate" }];
const w = bundleWarnings([pl, cp], rel, names);
check("19. Includes + both selected → one warning", w.length, 1);
check("19. Warning names both items", w[0].message.includes("Platform with carpet") && w[0].message.includes("Fresh Carpet"), true);
check("19. Warning points at both lines", w[0].lineIds, ["pl", "cp"]);
check("19. Rates and amounts are untouched", calculate([pl, cp]).total, 7296 + 1728);
check("19. No warning when only one is selected", bundleWarnings([pl], rel, names).length, 0);
check("19. No warning when the other is excluded", bundleWarnings([pl, { ...cp, included: false }], rel, names).length, 0);
check("19. Nothing inferred from names", bundleWarnings([pl, cp], [], names).length, 0);
const conf = [{ itemId: stage.itemId, relatedItemId: platform.itemId, relationType: "conflicts" as const, note: null }];
check("19. Conflict warns once", bundleWarnings([s1, pl], conf, names).length, 1);
const req = [{ itemId: stage.itemId, relatedItemId: piece.itemId, relationType: "requires" as const, note: null }];
check("19. Requires warns when missing", bundleWarnings([s1], req, names)[0].message, "Stage requires Foam letter, which is not in this calculation.");
check("19. Requires satisfied", bundleWarnings([s1, line(piece)], req, names).length, 0);
check("19. Add-ons never warn", bundleWarnings([s1], [{ itemId: stage.itemId, relatedItemId: carpet.itemId, relationType: "addon", note: null }], names).length, 0);

// 25–29. Copy output
check("25. Copy rate", copyRateText(s1), "₹30.00/sq ft");
check("25. Copy rate per piece", copyRateText(line(piece)), "₹550.00/piece");
check("25. Copy rate fixed", formatRate(fixed), "₹5,000.00 (fixed)");
check("25. Copy rate running", formatRate(rft), "₹45.50/running ft");
check("26. Copy amount", copyAmountText(exact.lines.get("s1")!), "₹5,760.00");
check("26. Copy amount unavailable without an amount", copyAmountText(nr), null);
check(
  "27. Copy item details",
  copyItemDetailsText(s1, exact.lines.get("s1")!),
  "Stage\nDimensions: 16 ft × 12 ft\nArea: 192 sq ft\nUnit rate: ₹30.00/sq ft\nIndividual amount: ₹5,760.00",
);
check(
  "27. Copy details, per piece",
  copyItemDetailsText(line(piece, { quantity: "4" }, "pp"), calculate([line(piece, { quantity: "4" }, "pp")]).lines.get("pp")!),
  "Foam letter\nQuantity: 4\nUnit rate: ₹550.00/piece\nIndividual amount: ₹2,200.00",
);
check(
  "27. Copy details, percentage",
  copyItemDetailsText(pS, calcPct.lines.get("pS")!),
  "Design fee\nPercentage: 10%\nCalculation base: Stage\nBase amount: ₹5,760.00\nIndividual amount: ₹576.00",
);
check(
  "27. Copy details, fixed",
  copyItemDetailsText(line(fixed, {}, "fx"), calculate([line(fixed, {}, "fx")]).lines.get("fx")!),
  "Site visit\nUnit rate: ₹5,000.00 (fixed)\nIndividual amount: ₹5,000.00",
);
check(
  "27. Copy details, minimum applied",
  copyItemDetailsText(line(limited, { length: "5", width: "5" }, "lm"), calculate([line(limited, { length: "5", width: "5" }, "lm")]).lines.get("lm")!),
  "Limited\nDimensions: 5 ft × 5 ft\nArea: 25 sq ft\nBillable area (minimum): 100 sq ft\nUnit rate: ₹10.00/sq ft\nIndividual amount: ₹1,000.00",
);
check("27. No details without an amount", copyItemDetailsText(line(noRate), nr), null);
check("28. Copy total", copyTotalText(exact), "₹7,488.00");
check(
  "29. Copy full calculation",
  copyFullCalculationText([s1, c1], exact),
  [
    "AURON EVENTS — INTERNAL RATE CALCULATION",
    "",
    "1. Stage",
    "    Dimensions: 16 ft × 12 ft",
    "    Area: 192 sq ft",
    "    Unit rate: ₹30.00/sq ft",
    "    Individual amount: ₹5,760.00",
    "2. Fresh Carpet",
    "    Dimensions: 16 ft × 12 ft",
    "    Area: 192 sq ft",
    "    Unit rate: ₹9.00/sq ft",
    "    Individual amount: ₹1,728.00",
    "",
    "COMBINED TOTAL: ₹7,488.00",
  ].join("\n"),
);
const withBad = [s1, line(stage, { length: "", width: "" }, "blank"), c1];
check("29. Full calculation lists exactly the lines in the total", copyFullCalculationText(withBad, calculate(withBad)).includes("2. Fresh Carpet"), true);
check("29. No ids or JSON in output", /l[0-9a-z]{6,}|[{}]/.test(copyFullCalculationText([s1, c1], exact)), false);

// ---------------------------------------------------------------------------
// Margin per line
// ---------------------------------------------------------------------------
const m42 = item({ name: "Backdrop", pricingMethod: "per_sqft", rate: "42.00" });
const mA = line(m42, { length: "24", width: "25", margin: "1" }, "mA");
const rA = one(mA);
check("M1. 24 × 25 ft = 600 sq ft", rA.billable, "600");
check("M1. Effective rate ₹42 + ₹1 = ₹43.00/sq ft", formatEffectiveRate(mA), "₹43.00/sq ft");
check("M1. Base amount ₹25,200.00", rA.basePaise, 2520000n);
check("M1. Margin amount ₹600.00", rA.marginAmountPaise, 60000n);
check("M1. Final amount ₹25,800.00", copyAmountText(rA), "₹25,800.00");
check("M1. Catalog snapshot rate unchanged", mA.snapshot.rate, "42.00");
check("M1. Base rate copy is the catalog rate", copyBaseRateText(mA), "₹42.00/sq ft");
check("M1. Rate copy is the final rate", copyRateText(mA), "₹43.00/sq ft");

// M2. Zero margin reproduces the original calculation exactly
check("M2. New lines default to blank margin (₹0)", createLine(m42).margin, "");
const z0 = line(stage, { length: "16", width: "12", margin: "" }, "z0");
const z1 = line(stage, { length: "16", width: "12", margin: "0" }, "z1");
const z2 = line(stage, { length: "16", width: "12", margin: "0.00" }, "z2");
for (const z of [z0, z1, z2]) {
  const r = one(z);
  check(`M2. margin "${z.margin}" amount = ₹5,760.00`, copyAmountText(r), "₹5,760.00");
  check(`M2. margin "${z.margin}" margin amount 0`, r.marginAmountPaise, 0n);
  check(`M2. margin "${z.margin}" details unchanged`, copyItemDetailsText(z, r), copyItemDetailsText(s1, one(s1)));
}
check("M2. Zero-margin rate copy unchanged", copyRateText(z1), "₹30.00/sq ft");
const zc = calculate([z1, line(carpet, { length: "16", width: "12", margin: "0" }, "zc")]);
check("M2. Zero-margin full calculation has no margin lines", copyFullCalculationText([z1], zc).includes("MARGIN"), false);
check("M2. Zero-margin totals: base = total", [zc.totalBasePaise, zc.totalMarginPaise, zc.totalPaise], [748800n, 0n, 748800n]);

// M3. Per-line independence
const ia = line(m42, { length: "10", width: "10", margin: "2" }, "ia");
const ib = line(m42, { length: "10", width: "10", margin: "" }, "ib");
const ic = calculate([ia, ib]);
check("M3. Line A has its own margin", copyAmountText(ic.lines.get("ia")!), "₹4,400.00");
check("M3. Line B (same item) keeps zero margin", copyAmountText(ic.lines.get("ib")!), "₹4,200.00");
check("M3. Duplicate copies the margin", duplicateLine(ia).margin, "2");
check("M3. Copy dimensions keeps target's margin", copyDimensions(ia, ib).margin, "");
check("M3. Refreshing the snapshot keeps the margin", refreshLineSnapshot(ia, { ...m42, rate: "50.00" }).margin, "2");
check("M3. Refresh: new base rate + same margin", copyRateText(refreshLineSnapshot(ia, { ...m42, rate: "50.00" })), "₹52.00/sq ft");

// M4. Dimension changes recalculate base and margin
const d2 = one({ ...mA, length: "30" });
check("M4. 30 × 25 = 750 sq ft: base ₹31,500", d2.basePaise, 3150000n);
check("M4. 750 × ₹1 margin = ₹750", d2.marginAmountPaise, 75000n);
check("M4. Final ₹32,250.00", copyAmountText(d2), "₹32,250.00");

// M5. Unit switching: margin is per the item's billing unit
const um = one(line(m42, { length: "10", width: "10", dimensionUnit: "m", margin: "1" }));
check("M5. 10 m × 10 m = 1,076.391 sq ft", um.billable, "1,076.391");
check("M5. Margin follows billable sq ft (₹1,076.39)", um.marginAmountPaise, 107639n);
check("M5. Final = base + margin", um.amountPaise, um.basePaise! + um.marginAmountPaise!);
const sqmM = item({ name: "Floor sqm", pricingMethod: "per_sqm", rate: "100" });
const um2 = one(line(sqmM, { length: "10", width: "10", dimensionUnit: "ft", margin: "5" }));
check("M5. Per sq m margin on 9.2903 sq m = ₹46.45", um2.marginAmountPaise, 4645n);
check("M5. Per sq m margin label", formatEffectiveRate(line(sqmM, { margin: "5" })), "₹105.00/sq m");

// M6. Per-method semantics
const rftM = one(line(rft, { length: "40", margin: "4.50" }));
check("M6. Running ft: 40 × (₹45.50 + ₹4.50) = ₹2,000.00", copyAmountText(rftM), "₹2,000.00");
check("M6. Running ft margin ₹180", rftM.marginAmountPaise, 18000n);
const rmtM = one(line(item({ name: "Rail", pricingMethod: "per_rmt", rate: "200" }), { length: "3", dimensionUnit: "m", margin: "10" }));
check("M6. Running m: 3 × ₹10 margin = ₹30", rmtM.marginAmountPaise, 3000n);
const unitM = line(piece, { quantity: "4", margin: "50" });
check("M6. Per piece: 4 × (₹550 + ₹50) = ₹2,400.00", copyAmountText(one(unitM)), "₹2,400.00");
check("M6. Per piece effective rate", formatEffectiveRate(unitM), "₹600.00/piece");
const fixM = line(fixed, { margin: "500" }, "fixM");
const fixR = one(fixM);
check("M6. Fixed: flat margin kind", fixR.marginKind, "flat");
check("M6. Fixed: ₹5,000 + ₹500 flat = ₹5,500.00", copyAmountText(fixR), "₹5,500.00");
check("M6. Fixed effective rate", formatEffectiveRate(fixM), "₹5,500.00 (fixed)");
const pctIns = item({ name: "Insurance", pricingMethod: "percentage", rate: "10", percentageBase: "manual" });
const pmM = line(pctIns, { baseAmount: "1000", margin: "5" }, "pmM");
const pmR = one(pmM);
check("M6. Percentage: ₹5 margin is ₹5, not 5% (₹100 + ₹5)", copyAmountText(pmR), "₹105.00");
check("M6. Percentage: percentage amount ₹100", pmR.basePaise, 10000n);
check("M6. Percentage: flat margin kind", pmR.marginKind, "flat");
check("M6. Percentage effective rate text", formatEffectiveRate(pmM), "10% + ₹5.00");
check("M6. Minimum billable: margin uses billable quantity", one(line(limited, { length: "5", width: "5", margin: "1" })).marginAmountPaise, 10000n);

// M7. Invalid margin
for (const [raw, msg] of [
  ["-1", "Margin can't be negative"],
  ["abc", "Margin must be a number"],
  ["1.005", "Margin can have at most 2 decimals"],
  ["Infinity", "Margin must be a number"],
  ["NaN", "Margin must be a number"],
  ["1e3", "Margin must be a number"],
  ["99999999999", "Margin is too large (max 10,000,000,000)"],
] as const) {
  const r = one(line(m42, { length: "10", width: "10", margin: raw }));
  check(`M7. margin "${raw}" invalid`, [r.status, r.fieldErrors.margin, r.amountPaise], ["invalid", msg, null]);
}
check("M7. parseMargin(Infinity number)", parseMargin(Infinity as unknown as string).ok, false);
check("M7. Margin with ₹ and commas accepted", parseMargin("₹1,000.50"), { ok: true, paise: 100050n });
const badM = line(m42, { length: "10", width: "10", margin: "-5" }, "badM");
const badCalc = calculate([badM, line(m42, { length: "10", width: "10" }, "okM")]);
check("M7. Invalid-margin line left out of total", [badCalc.totalPaise, badCalc.unpricedLineIds], [420000n, ["badM"]]);
check("M7. Effective rate ignores an invalid margin", formatEffectiveRate(badM), "₹42.00/sq ft");

// M8. Inclusion / exclusion and totals
const t1 = line(m42, { length: "24", width: "25", margin: "1" }, "t1");
const t2 = line(piece, { quantity: "2", margin: "50" }, "t2");
const t3 = line(fixed, { margin: "1000", included: false }, "t3");
const tc = calculate([t1, t2, t3]);
check("M8. Total = sum of included final amounts", tc.totalPaise, 2580000n + 120000n);
check("M8. Total base cost", tc.totalBasePaise, 2520000n + 110000n);
check("M8. Total margin", tc.totalMarginPaise, 60000n + 10000n);
check("M8. Base + margin = total", tc.totalBasePaise + tc.totalMarginPaise, tc.totalPaise);
check("M8. Excluded line still priced on its own", copyAmountText(tc.lines.get("t3")!), "₹6,000.00");

// M9. Percentage bases and bundle warnings with margin
const pAll = item({ name: "Service", pricingMethod: "percentage", rate: "10", percentageBase: "all_other_items" });
const pc = calculate([t1, t2, line(pAll, {}, "pAllL")]);
const pr = pc.lines.get("pAllL")!;
check("M9. % base uses amounts before margin (25,200 + 1,100)", pr.baseAmount, 26300);
check("M9. 10% of ₹26,300 = ₹2,630.00 (margin not compounded)", copyAmountText(pr), "₹2,630.00");
check("M9. % base flags that margin was left out", pr.baseExcludesMargin, true);
const pSel = item({ name: "Sel", pricingMethod: "percentage", rate: "10", percentageBase: "selected_items", percentageBaseItemIds: [m42.itemId] });
const ps = calculate([t1, line(pSel, { margin: "70" }, "pSelL")]);
check("M9. Selected-items %: 10% of ₹25,200 + ₹70 flat", copyAmountText(ps.lines.get("pSelL")!), "₹2,590.00");
const pEx = calculate([{ ...t1, included: false }, t2, line(pAll, {}, "pAllL")]);
check("M9. Excluded lines stay out of the % base", pEx.lines.get("pAllL")!.baseAmount, 1100);
const bundleA = item({ name: "Stage pkg", pricingMethod: "per_sqft", rate: "40" });
const bundleB = item({ name: "Carpet pkg", pricingMethod: "per_sqft", rate: "9" });
const bw = bundleWarnings(
  [line(bundleA, { margin: "5" }, "ba"), line(bundleB, { margin: "1" }, "bb")],
  [{ itemId: bundleA.itemId, relatedItemId: bundleB.itemId, relationType: "includes", note: null }],
  new Map(),
);
check("M9. Bundle warning unaffected by margin", bw.map((w) => w.relationType), ["includes"]);

// M10. Copy outputs with margin
check(
  "M10. Item details with margin",
  copyItemDetailsText(mA, rA),
  [
    "Backdrop",
    "Dimensions: 24 ft × 25 ft",
    "Area: 600 sq ft",
    "Base rate: ₹42.00/sq ft",
    "Margin: ₹1.00/sq ft",
    "Final rate: ₹43.00/sq ft",
    "Base amount: ₹25,200.00",
    "Margin amount: ₹600.00",
    "Final amount: ₹25,800.00",
  ].join("\n"),
);
check(
  "M10. Fixed item details with flat margin",
  copyItemDetailsText(fixM, fixR),
  "Site visit\nBase rate: ₹5,000.00 (fixed)\nMargin: ₹500.00 (flat)\nFinal rate: ₹5,500.00 (fixed)\nBase amount: ₹5,000.00\nMargin amount: ₹500.00\nFinal amount: ₹5,500.00",
);
check(
  "M10. Percentage item details with flat margin",
  copyItemDetailsText(pmM, pmR),
  "Insurance\nPercentage: 10%\nCalculation base: Entered base amount\nBase amount: ₹1,000.00\nPercentage amount: ₹100.00\nMargin (flat): ₹5.00\nFinal amount: ₹105.00",
);
check("M10. % details mark a base before margin", copyItemDetailsText(line(pAll, {}, "pAllL"), pr)!.includes("Calculation base: Backdrop, Foam letter (before margin)"), true);
check("M10. Copy amount = final amount", copyAmountText(tc.lines.get("t1")!), "₹25,800.00");
check("M10. Copy total = final total", copyTotalText(tc), "₹27,000.00");
check(
  "M10. Full calculation with margin",
  copyFullCalculationText([t1, t2, t3], tc),
  [
    "AURON EVENTS — INTERNAL RATE CALCULATION",
    "",
    "1. Backdrop",
    "    Dimensions: 24 ft × 25 ft",
    "    Area: 600 sq ft",
    "    Base rate: ₹42.00/sq ft",
    "    Margin: ₹1.00/sq ft",
    "    Final rate: ₹43.00/sq ft",
    "    Base amount: ₹25,200.00",
    "    Margin amount: ₹600.00",
    "    Final amount: ₹25,800.00",
    "2. Foam letter",
    "    Quantity: 2",
    "    Base rate: ₹550.00/piece",
    "    Margin: ₹50.00/piece",
    "    Final rate: ₹600.00/piece",
    "    Base amount: ₹1,100.00",
    "    Margin amount: ₹100.00",
    "    Final amount: ₹1,200.00",
    "",
    "TOTAL BASE COST: ₹26,300.00",
    "TOTAL MARGIN: ₹700.00",
    "COMBINED TOTAL: ₹27,000.00",
  ].join("\n"),
);

// M11. Rounding: base and margin each to paise, final is their exact sum
const rr = one(line(item({ name: "r", pricingMethod: "per_unit", rate: "1.00" }), { quantity: "1.005", margin: "0.01" }));
check("M11. Base 1.005 × ₹1 = ₹1.01, margin 1.005 × ₹0.01 = ₹0.01", [rr.basePaise, rr.marginAmountPaise, rr.amountPaise], [101n, 1n, 102n]);

console.log(failures === 0 ? "\nAll rate calculator checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
