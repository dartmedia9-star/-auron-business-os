import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

/**
 * ₹10,000.00: the app-wide money format (see lib/money.ts). `exact` is kept
 * for existing callers; every amount now shows two decimals.
 */
export function formatINR(value: number | null | undefined, _opts: { exact?: boolean } = {}): string {
  return formatMoney(value);
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
