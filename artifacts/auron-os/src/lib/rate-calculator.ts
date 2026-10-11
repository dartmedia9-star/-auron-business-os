/*
 * Rate Calculator engine: pure, framework-free and unit-tested
 * (scripts/test-rate-calculator.ts). No React, no network, no storage.
 *
 * It is an internal reference tool only: it never adds margin, GST, labour,
 * transport or any other charge, and nothing here creates a financial record.
 *
 * Arithmetic is exact. Every measurement and rate is parsed from its decimal
 * text into a BigInt fraction, so 16.5 × 12.25 × ₹30 never picks up binary
 * floating-point error. Two rounding steps, both half-up and both visible:
 *   1. the billable quantity (area, length, quantity) to 4 decimals, which is
 *      the figure shown and copied;
 *   2. the amount (billable quantity × unit rate) to 2 decimals (paise).
 * So the amount on screen always equals the quantity on screen × the rate on
 * screen, and the combined total is the exact sum of the line amounts.
 *
 * Pricing methods are a closed list mirrored from the API (OpenAPI enum
 * RateItemPricingMethod). Adding one means: add it to PRICING_METHODS, give
 * it a branch in measureLine(), and add it to the OpenAPI enum. There are no
 * free-text formulas, so nothing a user types is ever evaluated as code.
 */

import { formatMoney } from "./money";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const PRICING_METHODS = ["per_sqft", "per_sqm", "per_rft", "per_rmt", "per_unit", "fixed", "percentage"] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];

export const PERCENTAGE_BASES = ["manual", "selected_items", "all_other_items"] as const;
export type PercentageBase = (typeof PERCENTAGE_BASES)[number];

export const RELATION_TYPES = ["includes", "conflicts", "requires", "addon"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export type DimensionUnit = "ft" | "m";

export const PRICING_METHOD_INFO: Record<
  PricingMethod,
  { label: string; formula: string; inputs: "area" | "length" | "quantity" | "none" | "base" }
> = {
  per_sqft: { label: "Per square foot", formula: "Length × Width × Rate (sq ft)", inputs: "area" },
  per_sqm: { label: "Per square metre", formula: "Length × Width × Rate (sq m)", inputs: "area" },
  per_rft: { label: "Per running foot", formula: "Length × Rate (running ft)", inputs: "length" },
  per_rmt: { label: "Per running metre", formula: "Length × Rate (running m)", inputs: "length" },
  per_unit: { label: "Per piece / unit", formula: "Quantity × Rate", inputs: "quantity" },
  fixed: { label: "Fixed charge", formula: "Fixed amount", inputs: "none" },
  percentage: { label: "Percentage of a base", formula: "Base amount × Percentage", inputs: "base" },
};

export const PERCENTAGE_BASE_INFO: Record<PercentageBase, string> = {
  manual: "Base amount entered in the calculator",
  selected_items: "Sum of specific catalog items in the calculation",
  all_other_items: "Sum of all other included items in the calculation",
};

export const RELATION_INFO: Record<RelationType, { label: string; help: string }> = {
  includes: { label: "Includes (bundled)", help: "This item's rate already includes the other item. Selecting both warns about double-counting." },
  conflicts: { label: "Do not combine with", help: "Selecting both items shows a warning." },
  requires: { label: "Requires", help: "Shows a warning when this item is selected without the other item." },
  addon: { label: "Optional add-on", help: "Suggested as a quick add when this item is selected. No warning." },
};

/** Sanity limits on what can be entered, independent of per-item limits. */
export const LIMITS = {
  maxDimension: 100_000, // per side, in ft or m
  maxQuantity: 1_000_000,
  maxBaseAmount: 10_000_000_000, // ₹1,000 crore
  maxDecimals: 4,
} as const;

/**
 * The catalog values a line captured when it was added. The line is always
 * priced from this snapshot, never from the live catalog, so a later change
 * to the master rate cannot silently change an existing calculation.
 */
export interface RateSnapshot {
  itemId: number;
  name: string;
  categoryName: string | null;
  subcategory: string | null;
  pricingMethod: PricingMethod;
  /** Decimal text as configured, e.g. "30.00"; a percentage for "percentage". null = no rate configured. */
  rate: string | null;
  /** For per_unit, e.g. "piece", "chair", "day". */
  unitLabel: string | null;
  percentageBase: PercentageBase | null;
  percentageBaseItemIds: number[];
  minBillable: string | null;
  maxBillable: string | null;
  conditions: string | null;
}

export interface CalcLine {
  id: string;
  snapshot: RateSnapshot;
  length: string;
  width: string;
  dimensionUnit: DimensionUnit;
  quantity: string;
  /** Percentage items with a "manual" base. */
  baseAmount: string;
  /** Lines can be left out of the total without removing them. */
  included: boolean;
}

export type LineStatus = "ok" | "incomplete" | "invalid";

export interface LineResult {
  lineId: string;
  status: LineStatus;
  /** Why the line has no amount (blank field, bad value, missing rate, ...). */
  errors: string[];
  /** Field-level messages for the form, keyed by field. */
  fieldErrors: Partial<Record<"length" | "width" | "quantity" | "baseAmount", string>>;
  /** Informational notes, e.g. a configured minimum being applied. */
  notes: string[];
  /** What was measured, before any configured minimum, in the item's unit. */
  measured: string | null;
  /** Billable quantity in the item's unit (4 dp, trimmed), e.g. "192". */
  billable: string | null;
  /** Unit of `billable`, e.g. "sq ft", "running ft", "piece". */
  billableUnit: string;
  /** Percentage lines: the base amount and what it is made of. */
  baseAmount: number | null;
  baseDescription: string | null;
  /** Amount in paise (exact) and rupees; null when the line cannot be priced. */
  amountPaise: bigint | null;
  amount: number | null;
}

export interface CalcRelation {
  itemId: number;
  relatedItemId: number;
  relationType: RelationType;
  note: string | null;
}

export interface CalcWarning {
  key: string;
  relationType: Exclude<RelationType, "addon">;
  message: string;
  lineIds: string[];
}

// ---------------------------------------------------------------------------
// Exact decimal arithmetic (BigInt fractions)
// ---------------------------------------------------------------------------

/** n / d with d > 0. */
interface Frac {
  n: bigint;
  d: bigint;
}

const frac = (n: bigint, d: bigint = 1n): Frac => ({ n, d });
const mul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac): Frac => frac(a.n * b.d, a.d * b.n);
const cmp = (a: Frac, b: Frac): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};
const pow10 = (k: number): bigint => 10n ** BigInt(k);

/** Rounds a non-negative fraction half-up to `dp` decimals, as an integer scaled by 10^dp. */
function roundScaled(x: Frac, dp: number): bigint {
  const scaled = x.n * pow10(dp);
  const q = scaled / x.d;
  const r = scaled % x.d;
  return r * 2n >= x.d ? q + 1n : q;
}

/** 1 ft = 0.3048 m exactly. */
const M_PER_FT = frac(3048n, 10000n);

export type ParseResult = { ok: true; value: Frac } | { ok: false; reason: "blank" | "invalid" | "negative" | "precision" };

/**
 * Parses what a person typed into a measurement or amount field. Accepts
 * "16", "16.5", ".5", "1,250.50" and "₹1,250"; rejects anything else, a
 * minus sign, and more than `maxDecimals` decimals.
 */
export function parseDecimal(raw: string | number | null | undefined, maxDecimals: number = LIMITS.maxDecimals): ParseResult {
  if (raw == null) return { ok: false, reason: "blank" };
  let s = typeof raw === "number" ? numberToPlain(raw) : raw;
  if (s == null) return { ok: false, reason: "invalid" };
  s = s.replace(/[₹,\s]/g, "");
  if (s === "") return { ok: false, reason: "blank" };
  if (s.startsWith("-")) return /^-(\d+\.?\d*|\.\d+)$/.test(s) ? { ok: false, reason: "negative" } : { ok: false, reason: "invalid" };
  if (s.startsWith("+")) s = s.slice(1);
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return { ok: false, reason: "invalid" };
  const whole = m[1] || "0";
  const decimals = m[2] ?? "";
  if (decimals.length > maxDecimals) return { ok: false, reason: "precision" };
  return { ok: true, value: frac(BigInt(whole + decimals), pow10(decimals.length)) };
}

/** A JS number as plain decimal text (no exponent), or null if it can't be. */
function numberToPlain(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  const s = String(n);
  return /e/i.test(s) ? null : s;
}

/** Scaled integer → "1,234.5" (trailing zeros trimmed) or fixed decimals. */
function formatScaled(v: bigint, dp: number, opts: { trim?: boolean; group?: boolean } = {}): string {
  const { trim = true, group = true } = opts;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(dp + 1, "0");
  let int = dp > 0 ? s.slice(0, -dp) : s;
  let dec = dp > 0 ? s.slice(-dp) : "";
  if (trim) dec = dec.replace(/0+$/, "");
  if (group) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${int}${dec ? `.${dec}` : ""}`;
}

function fracToNumberText(x: Frac, dp = 4): string {
  return formatScaled(roundScaled(x, dp), dp);
}

const paiseToRupees = (p: bigint): number => Number(p) / 100;

/** ₹ text for an exact paise amount, using the app's one money format. */
export function formatPaise(p: bigint): string {
  return formatMoney(paiseToRupees(p));
}

/** Configured rate as paise (rates are stored with at most 2 decimals). */
function rateToPaise(rate: string): bigint | null {
  const parsed = parseDecimal(rate, 2);
  return parsed.ok ? roundScaled(parsed.value, 2) : null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** The unit a line is billed in, e.g. "sq ft", "running m", "piece". */
export function billableUnitLabel(s: Pick<RateSnapshot, "pricingMethod" | "unitLabel">): string {
  switch (s.pricingMethod) {
    case "per_sqft":
      return "sq ft";
    case "per_sqm":
      return "sq m";
    case "per_rft":
      return "running ft";
    case "per_rmt":
      return "running m";
    case "per_unit":
      return s.unitLabel?.trim() || "unit";
    case "fixed":
      return "fixed";
    case "percentage":
      return "%";
  }
}

/** "₹30.00/sq ft", "₹550.00/piece", "₹5,000.00 (fixed)", "10%"; null when no rate is configured. */
export function formatRate(s: Pick<RateSnapshot, "pricingMethod" | "unitLabel" | "rate">): string | null {
  if (s.rate == null) return null;
  const paise = rateToPaise(s.rate);
  if (paise == null) return null;
  if (s.pricingMethod === "percentage") return `${formatScaled(paise, 2)}%`;
  if (s.pricingMethod === "fixed") return `${formatPaise(paise)} (fixed)`;
  return `${formatPaise(paise)}/${billableUnitLabel(s)}`;
}

// ---------------------------------------------------------------------------
// Line calculation
// ---------------------------------------------------------------------------

function dimensionMessage(label: string, reason: Exclude<ParseResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "blank":
      return `Enter the ${label.toLowerCase()}`;
    case "negative":
      return `${label} can't be negative`;
    case "precision":
      return `${label} can have at most ${LIMITS.maxDecimals} decimals`;
    default:
      return `${label} must be a number`;
  }
}

type Measure =
  | { ok: true; measured: Frac }
  | { ok: false; incomplete: boolean; fieldErrors: LineResult["fieldErrors"] };

/** Reads one positive measurement within `max`. */
function readPositive(
  raw: string,
  field: "length" | "width" | "quantity" | "baseAmount",
  label: string,
  max: number,
  maxDecimals: number = LIMITS.maxDecimals,
): { ok: true; value: Frac } | { ok: false; blank: boolean; message: string; field: typeof field } {
  const p = parseDecimal(raw, maxDecimals);
  if (!p.ok) return { ok: false, blank: p.reason === "blank", message: dimensionMessage(label, p.reason), field };
  if (p.value.n === 0n) return { ok: false, blank: false, message: `${label} must be greater than 0`, field };
  if (cmp(p.value, frac(BigInt(max))) > 0) {
    return { ok: false, blank: false, message: `${label} is too large (max ${max.toLocaleString("en-US")})`, field };
  }
  return { ok: true, value: p.value };
}

/** Converts a length entered in `unit` to the unit the item is priced in. */
function toItemLength(value: Frac, unit: DimensionUnit, itemUnit: DimensionUnit): Frac {
  if (unit === itemUnit) return value;
  return unit === "ft" ? mul(value, M_PER_FT) : div(value, M_PER_FT);
}

function measureLine(line: CalcLine): Measure {
  const method = line.snapshot.pricingMethod;
  const inputs = PRICING_METHOD_INFO[method].inputs;
  const unit = line.dimensionUnit;
  const unitName = unit === "ft" ? "ft" : "m";
  const fail = (results: Array<ReturnType<typeof readPositive>>): Measure | null => {
    const errs = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
    if (errs.length === 0) return null;
    const fieldErrors: LineResult["fieldErrors"] = {};
    for (const e of errs) fieldErrors[e.field] = e.message;
    return { ok: false, incomplete: errs.every((e) => e.blank), fieldErrors };
  };

  if (inputs === "area") {
    const l = readPositive(line.length, "length", `Length (${unitName})`, LIMITS.maxDimension);
    const w = readPositive(line.width, "width", `Width (${unitName})`, LIMITS.maxDimension);
    const bad = fail([l, w]);
    if (bad || !l.ok || !w.ok) return bad!;
    const itemUnit: DimensionUnit = method === "per_sqft" ? "ft" : "m";
    return { ok: true, measured: mul(toItemLength(l.value, unit, itemUnit), toItemLength(w.value, unit, itemUnit)) };
  }
  if (inputs === "length") {
    const l = readPositive(line.length, "length", `Length (${unitName})`, LIMITS.maxDimension);
    const bad = fail([l]);
    if (bad || !l.ok) return bad!;
    return { ok: true, measured: toItemLength(l.value, unit, method === "per_rft" ? "ft" : "m") };
  }
  if (inputs === "quantity") {
    const q = readPositive(line.quantity, "quantity", "Quantity", LIMITS.maxQuantity);
    const bad = fail([q]);
    if (bad || !q.ok) return bad!;
    return { ok: true, measured: q.value };
  }
  return { ok: true, measured: frac(1n) };
}

function emptyResult(line: CalcLine): LineResult {
  return {
    lineId: line.id,
    status: "ok",
    errors: [],
    fieldErrors: {},
    notes: [],
    measured: null,
    billable: null,
    billableUnit: billableUnitLabel(line.snapshot),
    baseAmount: null,
    baseDescription: null,
    amountPaise: null,
    amount: null,
  };
}

function priceMeasuredLine(line: CalcLine): LineResult {
  const s = line.snapshot;
  const result = emptyResult(line);

  if (s.rate == null || rateToPaise(s.rate) == null) {
    result.status = "incomplete";
    result.errors.push("No rate is configured for this item in the catalog. Set its rate in the catalog first.");
    return result;
  }
  const ratePaise = rateToPaise(s.rate)!;

  const m = measureLine(line);
  if (!m.ok) {
    result.status = m.incomplete ? "incomplete" : "invalid";
    result.fieldErrors = m.fieldErrors;
    result.errors.push(...Object.values(m.fieldErrors).filter((e): e is string => !!e));
    return result;
  }

  if (s.pricingMethod === "fixed") {
    result.billable = "1";
    result.amountPaise = ratePaise;
    result.amount = paiseToRupees(ratePaise);
    return result;
  }

  const unit = billableUnitLabel(s);
  let measured4 = roundScaled(m.measured, 4);
  result.measured = formatScaled(measured4, 4);
  if (measured4 === 0n) {
    result.status = "invalid";
    result.errors.push(`The measured quantity rounds to 0 ${unit}`);
    return result;
  }

  const max = s.maxBillable != null ? parseDecimal(s.maxBillable) : null;
  if (max?.ok && max.value.n > 0n && cmp(frac(measured4, pow10(4)), max.value) > 0) {
    result.status = "invalid";
    result.errors.push(`${result.measured} ${unit} exceeds this item's configured maximum of ${fracToNumberText(max.value)} ${unit}`);
    return result;
  }

  let billable4 = measured4;
  const min = s.minBillable != null ? parseDecimal(s.minBillable) : null;
  if (min?.ok && min.value.n > 0n && cmp(frac(measured4, pow10(4)), min.value) < 0) {
    billable4 = roundScaled(min.value, 4);
    result.notes.push(`Configured minimum of ${fracToNumberText(min.value)} ${unit} applied (measured ${result.measured} ${unit})`);
  }

  result.billable = formatScaled(billable4, 4);
  // amount (paise) = billable × rate = (billable4 / 10^4) × ratePaise
  const amountPaise = roundScaled(frac(billable4 * ratePaise, pow10(4)), 0);
  return withAmount(result, amountPaise);
}

function withAmount(result: LineResult, amountPaise: bigint): LineResult {
  if (amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
    result.status = "invalid";
    result.errors.push("The amount is too large to calculate");
    return result;
  }
  result.amountPaise = amountPaise;
  result.amount = paiseToRupees(amountPaise);
  return result;
}

function pricePercentageLine(line: CalcLine, lines: CalcLine[], priced: Map<string, LineResult>): LineResult {
  const s = line.snapshot;
  const result = emptyResult(line);
  const pct = s.rate != null ? parseDecimal(s.rate, 2) : null;
  if (!pct || !pct.ok) {
    result.status = "incomplete";
    result.errors.push("No percentage is configured for this item in the catalog. Set it in the catalog first.");
    return result;
  }
  if (!s.percentageBase) {
    result.status = "incomplete";
    result.errors.push("This percentage item has no calculation base configured. Choose its base in the catalog first.");
    return result;
  }
  const pct100 = roundScaled(pct.value, 2); // percent × 100

  let basePaise: bigint;
  if (s.percentageBase === "manual") {
    const b = readPositive(line.baseAmount, "baseAmount", "Base amount", LIMITS.maxBaseAmount, 2);
    if (!b.ok) {
      result.status = b.blank ? "incomplete" : "invalid";
      result.fieldErrors.baseAmount = b.message;
      result.errors.push(b.message);
      return result;
    }
    basePaise = roundScaled(b.value, 2);
    result.baseDescription = "Entered base amount";
  } else {
    // Only included, priced, non-percentage lines form a base, so a
    // percentage can never feed another percentage.
    const candidates = lines.filter((l) => {
      if (l.id === line.id || !l.included || l.snapshot.pricingMethod === "percentage") return false;
      if (s.percentageBase === "selected_items") return s.percentageBaseItemIds.includes(l.snapshot.itemId);
      return true;
    });
    if (candidates.length === 0) {
      result.status = "incomplete";
      result.errors.push(
        s.percentageBase === "selected_items"
          ? "None of the items this percentage is calculated on are included in this calculation"
          : "Add other items to this calculation to form the base for this percentage",
      );
      return result;
    }
    const pending = candidates.filter((l) => priced.get(l.id)?.amountPaise == null);
    if (pending.length > 0) {
      result.status = "incomplete";
      result.errors.push(`Complete ${pending.map((l) => l.snapshot.name).join(", ")} first: this percentage is calculated on it`);
      return result;
    }
    basePaise = candidates.reduce((sum, l) => sum + priced.get(l.id)!.amountPaise!, 0n);
    result.baseDescription = candidates.map((l) => l.snapshot.name).join(", ");
  }

  result.baseAmount = paiseToRupees(basePaise);
  result.billable = formatScaled(pct100, 2);
  // amount (paise) = basePaise × pct / 100 = basePaise × pct100 / 10^4
  return withAmount(result, roundScaled(frac(basePaise * pct100, pow10(4)), 0));
}

export interface CalculationResult {
  lines: Map<string, LineResult>;
  /** Exact sum of included lines that have an amount. */
  totalPaise: bigint;
  total: number;
  includedCount: number;
  pricedCount: number;
  /** Included lines that have no amount yet (left out of the total). */
  unpricedLineIds: string[];
  /** Total area of included priced area lines, per unit (only when meaningful). */
  areaTotals: Array<{ unit: string; value: string }>;
}

/**
 * Prices every line, then the combined total. Percentage lines are priced
 * after the lines they are based on.
 */
export function calculate(lines: CalcLine[]): CalculationResult {
  const results = new Map<string, LineResult>();
  for (const l of lines) if (l.snapshot.pricingMethod !== "percentage") results.set(l.id, priceMeasuredLine(l));
  for (const l of lines) if (l.snapshot.pricingMethod === "percentage") results.set(l.id, pricePercentageLine(l, lines, results));

  let totalPaise = 0n;
  let pricedCount = 0;
  const unpriced: string[] = [];
  const areas = new Map<string, bigint>();
  const included = lines.filter((l) => l.included);
  for (const l of included) {
    const r = results.get(l.id)!;
    if (r.amountPaise == null) {
      unpriced.push(l.id);
      continue;
    }
    totalPaise += r.amountPaise;
    pricedCount++;
    if (PRICING_METHOD_INFO[l.snapshot.pricingMethod].inputs === "area" && r.billable) {
      const unit = r.billableUnit;
      const v = parseDecimal(r.billable);
      if (v.ok) areas.set(unit, (areas.get(unit) ?? 0n) + roundScaled(v.value, 4));
    }
  }
  return {
    lines: results,
    totalPaise,
    total: paiseToRupees(totalPaise),
    includedCount: included.length,
    pricedCount,
    unpricedLineIds: unpriced,
    areaTotals: [...areas.entries()].map(([unit, v]) => ({ unit, value: formatScaled(v, 4) })),
  };
}

// ---------------------------------------------------------------------------
// Lines: create, copy dimensions, snapshots
// ---------------------------------------------------------------------------

let lineCounter = 0;
export function newLineId(): string {
  lineCounter = (lineCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `l${Date.now().toString(36)}${lineCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface CatalogDefaults {
  defaultLength: string | null;
  defaultWidth: string | null;
  defaultQuantity: string | null;
  defaultDimensionUnit: DimensionUnit | null;
}

/** A new line for an item, with the item's configured defaults pre-filled. */
export function createLine(snapshot: RateSnapshot, defaults?: Partial<CatalogDefaults>, id: string = newLineId()): CalcLine {
  const method = snapshot.pricingMethod;
  const unit: DimensionUnit = defaults?.defaultDimensionUnit ?? (method === "per_sqm" || method === "per_rmt" ? "m" : "ft");
  return {
    id,
    snapshot,
    length: defaults?.defaultLength ?? "",
    width: defaults?.defaultWidth ?? "",
    dimensionUnit: unit,
    quantity: defaults?.defaultQuantity ?? (method === "per_unit" ? "1" : ""),
    baseAmount: "",
    included: true,
  };
}

/** A copy of a line (same snapshot and measurements), with a new id. */
export function duplicateLine(line: CalcLine, id: string = newLineId()): CalcLine {
  return { ...line, id, snapshot: { ...line.snapshot, percentageBaseItemIds: [...line.snapshot.percentageBaseItemIds] } };
}

export function usesDimensions(method: PricingMethod): boolean {
  const i = PRICING_METHOD_INFO[method].inputs;
  return i === "area" || i === "length";
}

/**
 * Explicitly copies measurements from one line to another: length and width
 * (or just length for running items) and the measurement unit. The target
 * keeps its own item, rate and every other field, and stays editable.
 */
export function copyDimensions(from: CalcLine, to: CalcLine): CalcLine {
  const target = PRICING_METHOD_INFO[to.snapshot.pricingMethod].inputs;
  if (target === "area") return { ...to, length: from.length, width: from.width, dimensionUnit: from.dimensionUnit };
  if (target === "length") return { ...to, length: from.length, dimensionUnit: from.dimensionUnit };
  return to;
}

const SNAPSHOT_FIELDS: Array<{ key: keyof RateSnapshot; label: string }> = [
  { key: "name", label: "name" },
  { key: "rate", label: "rate" },
  { key: "pricingMethod", label: "pricing method" },
  { key: "unitLabel", label: "unit" },
  { key: "percentageBase", label: "percentage base" },
  { key: "percentageBaseItemIds", label: "percentage base items" },
  { key: "minBillable", label: "minimum" },
  { key: "maxBillable", label: "maximum" },
];

function sameValue(key: keyof RateSnapshot, a: RateSnapshot, b: RateSnapshot): boolean {
  if (key === "rate" || key === "minBillable" || key === "maxBillable") {
    const pa = a[key] == null ? null : parseDecimal(a[key] as string);
    const pb = b[key] == null ? null : parseDecimal(b[key] as string);
    if (pa == null || pb == null) return pa === pb;
    if (!pa.ok || !pb.ok) return a[key] === b[key];
    return cmp(pa.value, pb.value) === 0;
  }
  if (key === "percentageBaseItemIds") {
    return [...a.percentageBaseItemIds].sort().join(",") === [...b.percentageBaseItemIds].sort().join(",");
  }
  if (key === "unitLabel") return (a.unitLabel ?? "") === (b.unitLabel ?? "") || (a.pricingMethod !== "per_unit" && b.pricingMethod !== "per_unit");
  return a[key] === b[key];
}

/** Which pricing-relevant fields differ between a line's snapshot and the current catalog item. */
export function snapshotChanges(captured: RateSnapshot, current: RateSnapshot): string[] {
  return SNAPSHOT_FIELDS.filter((f) => !sameValue(f.key, captured, current)).map((f) => f.label);
}

/** Replaces a line's snapshot with the current catalog values. Only on an explicit user action. */
export function refreshLineSnapshot(line: CalcLine, current: RateSnapshot): CalcLine {
  return { ...line, snapshot: { ...current, percentageBaseItemIds: [...current.percentageBaseItemIds] } };
}

// ---------------------------------------------------------------------------
// Bundle / combination warnings
// ---------------------------------------------------------------------------

/**
 * Warnings from explicitly configured relations only; nothing is inferred
 * from item names. Rates and lines are never changed: the warning says which
 * lines are involved and leaves the decision to the person. Only lines that
 * count towards the total are considered.
 */
export function bundleWarnings(lines: CalcLine[], relations: CalcRelation[], itemNames: Map<number, string>): CalcWarning[] {
  const included = lines.filter((l) => l.included);
  const byItem = new Map<number, CalcLine[]>();
  for (const l of included) byItem.set(l.snapshot.itemId, [...(byItem.get(l.snapshot.itemId) ?? []), l]);
  const nameOf = (id: number) => byItem.get(id)?.[0]?.snapshot.name ?? itemNames.get(id) ?? `item #${id}`;
  const warnings: CalcWarning[] = [];
  const seen = new Set<string>();

  for (const r of relations) {
    if (r.relationType === "addon") continue;
    const a = byItem.get(r.itemId);
    if (!a) continue;
    const b = byItem.get(r.relatedItemId);
    const note = r.note?.trim() ? ` Note: ${r.note.trim()}` : "";

    if (r.relationType === "includes" && b) {
      const key = `includes:${r.itemId}:${r.relatedItemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        key,
        relationType: "includes",
        message: `${nameOf(r.itemId)} already includes ${nameOf(r.relatedItemId)} in its rate. Adding ${nameOf(r.relatedItemId)} separately may double-count it.${note}`,
        lineIds: [...a, ...b].map((l) => l.id),
      });
    } else if (r.relationType === "conflicts" && b) {
      const pair = [r.itemId, r.relatedItemId].sort((x, y) => x - y);
      const key = `conflicts:${pair[0]}:${pair[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        key,
        relationType: "conflicts",
        message: `${nameOf(r.itemId)} is configured not to be combined with ${nameOf(r.relatedItemId)}.${note}`,
        lineIds: [...a, ...b].map((l) => l.id),
      });
    } else if (r.relationType === "requires" && !b) {
      const key = `requires:${r.itemId}:${r.relatedItemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        key,
        relationType: "requires",
        message: `${nameOf(r.itemId)} requires ${nameOf(r.relatedItemId)}, which is not in this calculation.${note}`,
        lineIds: a.map((l) => l.id),
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Copy-ready text
// ---------------------------------------------------------------------------

export const FULL_CALCULATION_HEADING = "AURON EVENTS — INTERNAL RATE CALCULATION";

/** Copy unit rate: "₹30.00/sq ft". */
export function copyRateText(line: CalcLine): string | null {
  return formatRate(line.snapshot);
}

/** Copy individual amount: "₹5,760.00". */
export function copyAmountText(result: LineResult): string | null {
  return result.amountPaise == null ? null : formatPaise(result.amountPaise);
}

/** Copy combined total: "₹7,488.00". */
export function copyTotalText(calc: CalculationResult): string {
  return formatPaise(calc.totalPaise);
}

function measurementText(value: string, unit: DimensionUnit): string {
  const p = parseDecimal(value);
  return `${p.ok ? fracToNumberText(p.value) : value.trim()} ${unit}`;
}

/** The detail lines of one item, without its name. Null when the line has no amount. */
function detailLines(line: CalcLine, r: LineResult): string[] | null {
  if (r.amountPaise == null) return null;
  const s = line.snapshot;
  const rate = formatRate(s);
  const out: string[] = [];
  const inputs = PRICING_METHOD_INFO[s.pricingMethod].inputs;
  const minApplied = r.measured != null && r.billable != null && r.measured !== r.billable;

  if (inputs === "area") {
    out.push(`Dimensions: ${measurementText(line.length, line.dimensionUnit)} × ${measurementText(line.width, line.dimensionUnit)}`);
    if (minApplied) {
      out.push(`Area: ${r.measured} ${r.billableUnit}`);
      out.push(`Billable area (minimum): ${r.billable} ${r.billableUnit}`);
    } else {
      out.push(`Area: ${r.billable} ${r.billableUnit}`);
    }
  } else if (inputs === "length") {
    const converted = line.dimensionUnit !== (s.pricingMethod === "per_rft" ? "ft" : "m");
    out.push(`Length: ${measurementText(line.length, line.dimensionUnit)}${converted ? ` (${r.measured} ${r.billableUnit})` : ""}`);
    if (minApplied) out.push(`Billable length (minimum): ${r.billable} ${r.billableUnit}`);
  } else if (inputs === "quantity") {
    out.push(`Quantity: ${r.measured}`);
    if (minApplied) out.push(`Billable quantity (minimum): ${r.billable}`);
  } else if (inputs === "base") {
    out.push(`Percentage: ${rate}`);
    out.push(`Calculation base: ${r.baseDescription}`);
    out.push(`Base amount: ${formatMoney(r.baseAmount)}`);
    out.push(`Individual amount: ${formatPaise(r.amountPaise)}`);
    return out;
  }
  out.push(`Unit rate: ${rate}`);
  out.push(`Individual amount: ${formatPaise(r.amountPaise)}`);
  return out;
}

/** Copy item details: the item's name and its full calculation. */
export function copyItemDetailsText(line: CalcLine, result: LineResult): string | null {
  const lines = detailLines(line, result);
  return lines ? [line.snapshot.name, ...lines].join("\n") : null;
}

/**
 * Copy full calculation: every included line that has an amount, numbered,
 * with its own breakdown, then the combined total (which is the sum of
 * exactly those lines).
 */
export function copyFullCalculationText(lines: CalcLine[], calc: CalculationResult): string {
  const blocks: string[] = [];
  let n = 0;
  for (const l of lines) {
    if (!l.included) continue;
    const r = calc.lines.get(l.id);
    const details = r ? detailLines(l, r) : null;
    if (!details) continue;
    n++;
    blocks.push([`${n}. ${l.snapshot.name}`, ...details.map((d) => `    ${d}`)].join("\n"));
  }
  return [FULL_CALCULATION_HEADING, "", ...blocks, "", `COMBINED TOTAL: ${formatPaise(calc.totalPaise)}`].join("\n");
}
