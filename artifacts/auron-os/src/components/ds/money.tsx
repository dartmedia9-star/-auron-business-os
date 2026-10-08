import { cn } from "@/lib/utils";

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** ₹ amount for display; whole rupees by default, paise kept when present. */
export function formatINR(value: number | null | undefined, opts: { exact?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (opts.exact ? inr2 : inr0).format(value);
}

/*
 * A money value with an unambiguous direction: money in is green with "+",
 * money out is red with "−". `signed` shows the sign; `tone="neutral"` keeps
 * the colour off (e.g. revenue, which is not cash).
 */
export function Money({
  value,
  signed = false,
  tone = "auto",
  exact = true,
  className,
}: {
  value: number;
  signed?: boolean;
  tone?: "auto" | "neutral" | "in" | "out" | "muted";
  exact?: boolean;
  className?: string;
}) {
  const direction = tone === "auto" ? (value > 0 ? "in" : value < 0 ? "out" : "neutral") : tone;
  const text = formatINR(Math.abs(value), { exact });
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        direction === "in" && "text-money-in",
        direction === "out" && "text-money-out",
        direction === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {sign}
      {text}
    </span>
  );
}
