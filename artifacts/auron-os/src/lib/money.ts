/*
 * The one money formatting module for Auron OS.
 *
 * Display format everywhere: ₹#,##0.00 (thousands separators, exactly two
 * decimals), e.g. ₹10,000.00, ₹1,250.50, ₹0.00, -₹1,234.50.
 *
 * Every money display in the app goes through formatMoney (re-exported as
 * formatCurrency from lib/utils and formatINR from components/ds/money), and
 * every money input through MoneyInput, which uses formatAmount / parseAmount
 * below. Values stay plain numbers; commas exist only on screen.
 */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rounds to paise without the classic 1.005 → 1.00 floating-point slip. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7) / 100;
  return rounded === 0 ? 0 : rounded; // never -0
}

function normalise(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/** ₹10,000.00. Null, undefined and non-numbers show as an em dash. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = normalise(value);
  return n == null ? "—" : MONEY.format(n);
}

/** 10,000.00 (no symbol), e.g. inside a field that already shows ₹. */
export function formatAmount(value: number | string | null | undefined): string {
  const n = normalise(value);
  return n == null ? "" : AMOUNT.format(n);
}

/** Short axis label for charts only (₹1.5L, ₹2Cr, ₹25k). Never for amounts people read as values. */
export function formatAxisMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
  return `${sign}₹${trim(abs)}`;
}

/**
 * Cleans what a person typed or pasted into a money field into a plain
 * numeric string: drops ₹, commas and spaces, keeps one decimal point and at
 * most two decimals, and an optional leading minus when allowed. Returns ""
 * for an empty field. Partial input such as "12." stays editable.
 */
export function sanitizeAmountInput(raw: string, opts: { allowNegative?: boolean } = {}): string {
  let s = raw.replace(/[₹,\s]/g, "");
  const negative = opts.allowNegative === true && s.startsWith("-");
  s = s.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  }
  if (s.startsWith(".")) s = `0${s}`;
  return negative ? `-${s}` : s;
}

/** Parses a money field's value (with or without commas) to a number, or null when empty/invalid. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? roundMoney(raw) : null;
  const s = raw.replace(/[₹,\s]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/** Adds money values without floating-point drift (e.g. 0.1 + 0.2 = 0.30). */
export function sumMoney(...values: Array<number | null | undefined>): number {
  let paise = 0;
  for (const v of values) paise += Math.round((v ?? 0) * 100);
  return roundMoney(paise / 100);
}
