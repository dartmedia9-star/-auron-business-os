import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAmount, parseAmount, sanitizeAmountInput } from "@/lib/money";

type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue"> & {
  /** Plain numeric string ("10000.5"), never with commas. "" when empty. */
  value: string;
  onValueChange: (value: string) => void;
  allowNegative?: boolean;
  /** Show a ₹ prefix inside the field (default true). */
  symbol?: boolean;
  /** Extra classes for the ₹ prefix (e.g. to match a larger field). */
  symbolClassName?: string;
};

/*
 * Money field. While focused it shows the plain number so typing, cursor
 * movement and deleting behave normally; when it loses focus it shows
 * 10,000.00. The value handed back is always a plain numeric string, so
 * existing `Number(value)` submit code keeps working.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, allowNegative = false, symbol = true, symbolClassName, className, onFocus, onBlur, placeholder = "0.00", ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const parsed = parseAmount(value);
    const display = focused || parsed == null ? value : formatAmount(parsed);

    return (
      <div className="relative w-full">
        {symbol && (
          <span
            aria-hidden="true"
            className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground", symbolClassName)}
          >
            ₹
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={display}
          onChange={(e) => onValueChange(sanitizeAmountInput(e.target.value, { allowNegative }))}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            // Tidy partial input ("12." → "12") without changing the amount.
            const clean = parseAmount(value);
            if (clean != null && String(clean) !== value) onValueChange(String(clean));
            onBlur?.(e);
          }}
          className={cn("tabular-nums", symbol && "pl-7", className)}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
