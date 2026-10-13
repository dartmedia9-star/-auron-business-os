// Units. Every length in the project model is stored in millimetres; the
// display unit only changes how values are shown and typed. 1 ft = 304.8 mm
// exactly, 1 in = 25.4 mm exactly.
//
// Rounding policy: typed values are rounded once, to 0.1 mm (the model's
// precision), when they are parsed. Display rounding (1/8 inch, 0.01 ft,
// 1 mm, ...) is only ever applied to text; a displayed value is never parsed
// back into the model unless the user actually changed it, so switching units
// can't move anything.

export const DISPLAY_UNITS = ["m", "cm", "mm", "ft", "ftd"] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];

export const UNIT_LABELS: Record<DisplayUnit, string> = {
  m: "Metres",
  cm: "Centimetres",
  mm: "Millimetres",
  ft: "Feet & inches",
  ftd: "Decimal feet",
};

/** Feet & inches and decimal feet: imperial grids, sq ft areas. */
export const isImperial = (unit: DisplayUnit): boolean => unit === "ft" || unit === "ftd";

/** Short suffix shown next to a field or in a legend. */
export function unitSuffix(unit: DisplayUnit): string {
  return unit === "ft" ? "ft-in" : unit === "ftd" ? "ft" : unit;
}

/** Plain-words unit name for sentences ("Dimensions in ..."). */
export function unitWords(unit: DisplayUnit): string {
  return unit === "ft" ? "feet and inches" : unit === "ftd" ? "decimal feet" : UNIT_LABELS[unit].toLowerCase();
}

/** Exact conversions (no rounding). */
export const mmToUnit = (mm: number, unit: Exclude<DisplayUnit, "ft"> | "in"): number =>
  unit === "m" ? mm / 1000 : unit === "cm" ? mm / 10 : unit === "mm" ? mm : unit === "in" ? mm / MM_PER_INCH : mm / MM_PER_FOOT;
export const unitToMm = (value: number, unit: Exclude<DisplayUnit, "ft"> | "in"): number =>
  unit === "m" ? value * 1000 : unit === "cm" ? value * 10 : unit === "mm" ? value : unit === "in" ? value * MM_PER_INCH : value * MM_PER_FOOT;

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

/** Round to 0.1 mm, the model's working precision (removes float noise). */
export function roundMm(mm: number): number {
  return Math.round(mm * 10) / 10;
}

/** Fixed decimals with half-up rounding that isn't fooled by binary floats (1.2345 → 1.235). */
function fixed(value: number, decimals: number): string {
  const p = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return ((sign * Math.round(Math.abs(value) * p + 1e-7)) / p).toFixed(decimals);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Feet-and-inches text, rounded to the nearest 1/8 inch: 12' 6½". */
export function formatFeetInches(mm: number): string {
  const sign = mm < 0 ? "-" : "";
  const eighths = Math.round((Math.abs(mm) / MM_PER_INCH) * 8);
  const feet = Math.floor(eighths / 96);
  const restEighths = eighths - feet * 96;
  const inches = Math.floor(restEighths / 8);
  const frac = restEighths - inches * 8;
  const fracText = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"][frac];
  if (feet === 0) return `${sign}${inches}${fracText}"`;
  return `${sign}${feet}' ${inches}${fracText}"`;
}

/**
 * A length for display. `compact` drops the unit suffix for m/cm/mm when the
 * context already names it (the drawing's legend does).
 */
export function formatLength(mm: number, unit: DisplayUnit, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (!Number.isFinite(mm)) return "—";
  const suffix = opts.compact ? "" : ` ${unit}`;
  switch (unit) {
    case "m":
      return `${trimZeros(fixed(mm / 1000, opts.decimals ?? 3))}${suffix}`;
    case "cm":
      return `${trimZeros(fixed(mm / 10, opts.decimals ?? 1))}${suffix}`;
    case "mm":
      return `${trimZeros(fixed(mm, opts.decimals ?? 0))}${suffix}`;
    case "ft":
      return formatFeetInches(mm);
    case "ftd":
      return `${trimZeros(fixed(mm / MM_PER_FOOT, opts.decimals ?? 2))}${opts.compact ? "" : " ft"}`;
  }
}

/** Area for display: m² for metric units, sq ft for imperial. */
export function formatArea(mm2: number, unit: DisplayUnit): string {
  if (!Number.isFinite(mm2)) return "—";
  if (isImperial(unit)) return `${trimZeros(fixed(mm2 / (MM_PER_FOOT * MM_PER_FOOT), 1))} sq ft`;
  return `${trimZeros(fixed(mm2 / 1e6, 2))} m²`;
}

/** A value in the display unit as a plain number string for an input field. */
export function toInputValue(mm: number, unit: DisplayUnit): string {
  if (!Number.isFinite(mm)) return "";
  switch (unit) {
    case "m":
      return trimZeros((mm / 1000).toFixed(4));
    case "cm":
      return trimZeros((mm / 10).toFixed(2));
    case "mm":
      return trimZeros(mm.toFixed(1));
    case "ft": {
      const eighths = Math.round((Math.abs(mm) / MM_PER_INCH) * 8);
      const feet = Math.floor(eighths / 96);
      const inches = (eighths - feet * 96) / 8;
      const sign = mm < 0 ? "-" : "";
      return inches === 0 ? `${sign}${feet}'` : `${sign}${feet}' ${trimZeros(inches.toFixed(3))}"`;
    }
    case "ftd":
      return trimZeros((mm / MM_PER_FOOT).toFixed(4));
  }
}

export type ParseResult = { ok: true; mm: number } | { ok: false; error: string };

const UNIT_FACTORS: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: MM_PER_INCH,
  '"': MM_PER_INCH,
  ft: MM_PER_FOOT,
  "'": MM_PER_FOOT,
};

const UNIT_WORDS: Record<string, string> = {
  mm: "mm", millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  m: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  in: "in", inch: "in", inches: "in", '"': "in",
  ft: "ft", feet: "ft", foot: "ft", "'": "ft",
};

/**
 * Parses a typed length. A bare number is read in the display unit; an
 * explicit unit always wins, so "450mm" works while the display is metres.
 * Accepts feet and inches as 12' 6", 12ft 6in, 12'6, 6" and 12.5'.
 */
export function parseLength(input: string, unit: DisplayUnit): ParseResult {
  const raw = input.trim().toLowerCase().replace(/,/g, ".").replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!raw) return { ok: false, error: "Enter a value" };

  const feetInches = /^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/.exec(raw);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    if (inches >= 12) return { ok: false, error: "Inches must be less than 12" };
    const sign = feet < 0 || raw.startsWith("-") ? -1 : 1;
    return { ok: true, mm: roundMm(sign * (Math.abs(feet) * MM_PER_FOOT + inches * MM_PER_INCH)) };
  }

  const withUnit = /^(-?\d*\.?\d+)\s*([a-z"']+)?$/.exec(raw);
  if (!withUnit) return { ok: false, error: "Not a valid length" };
  const value = Number(withUnit[1]);
  if (!Number.isFinite(value)) return { ok: false, error: "Not a valid length" };
  const explicit = withUnit[2] ? UNIT_WORDS[withUnit[2]] : undefined;
  if (withUnit[2] && !explicit) return { ok: false, error: `Unknown unit "${withUnit[2]}" (use m, cm, mm, ft or in)` };
  const factor = explicit ? UNIT_FACTORS[explicit] : isImperial(unit) ? MM_PER_FOOT : UNIT_FACTORS[unit];
  return { ok: true, mm: roundMm(value * factor) };
}

/** Grid sizes offered per unit system (in mm). */
export function gridOptions(unit: DisplayUnit): Array<{ mm: number; label: string }> {
  if (isImperial(unit)) {
    return [
      { mm: MM_PER_INCH * 6, label: '6"' },
      { mm: MM_PER_FOOT, label: "1'" },
      { mm: MM_PER_FOOT * 2, label: "2'" },
      { mm: MM_PER_FOOT * 5, label: "5'" },
    ];
  }
  return [
    { mm: 50, label: "5 cm" },
    { mm: 100, label: "10 cm" },
    { mm: 250, label: "25 cm" },
    { mm: 500, label: "50 cm" },
    { mm: 1000, label: "1 m" },
  ];
}

/**
 * The result of editing a length field. Text that still equals the rounded
 * display of the stored value is "unchanged" and must not be written back,
 * so focusing a field (or switching units) never nudges a size.
 */
export function lengthEdit(text: string, currentMm: number, unit: DisplayUnit): ParseResult | { ok: true; unchanged: true } {
  if (text.trim() === toInputValue(currentMm, unit)) return { ok: true, unchanged: true };
  return parseLength(text, unit);
}
