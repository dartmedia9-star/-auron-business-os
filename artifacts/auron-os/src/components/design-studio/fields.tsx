import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MEASURE_STATUSES, parseLength, toInputValue, UNIT_LABELS, type DisplayUnit, type MeasureStatus } from "@workspace/design-model";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EditorContext } from "./commands";

// Touch-first form fields for the properties panel. Inputs are 44 px tall
// and 16 px text (no iOS focus zoom). Values commit on Enter, blur or
// "Done" on the iPad keyboard; Escape reverts. Invalid input is shown, never
// silently clamped. Focusing a field pans the plan so the selected item
// stays visible above the keyboard.

const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-background/60 px-3 text-[16px] tabular-nums shadow-xs transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 aria-[invalid=true]:border-destructive disabled:opacity-50";

export function FieldRow({ label, htmlFor, hint, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function useEnsureVisibleOnFocus() {
  // Optional: the same fields are used in the Custom Builder, which can open outside the editor.
  const store = useContext(EditorContext);
  return () => {
    if (!store) return;
    const sel = store.getState().selection;
    // Wait for the iPad keyboard to resize the viewport first.
    window.setTimeout(() => store.canvas?.ensureVisible(sel), 350);
  };
}

export function LengthField({
  label,
  valueMm,
  unit,
  onCommit,
  min = 0,
  max = 1_000_000,
  allowZero = false,
  hint,
  disabled,
  testId,
}: {
  label: ReactNode;
  valueMm: number;
  unit: DisplayUnit;
  onCommit: (mm: number) => void;
  min?: number;
  /** Largest accepted value in mm (default 1 km, the plan's storage limit). */
  max?: number;
  allowZero?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => toInputValue(valueMm, unit));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const latest = useRef(valueMm);
  latest.current = valueMm;
  const onFocus = useEnsureVisibleOnFocus();

  useEffect(() => {
    if (!focused.current) {
      setText(toInputValue(valueMm, unit));
      setError(null);
    }
  }, [valueMm, unit]);

  const commit = () => {
    const r = parseLength(text, unit);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.mm < min || (!allowZero && r.mm === 0 && min >= 0)) {
      setError(allowZero ? `Must be at least ${toInputValue(min, unit)}` : "Must be greater than zero");
      return;
    }
    if (r.mm > max) {
      setError(`Must be at most ${toInputValue(max, unit)} ${unit === "ft" ? "ft" : unit}`);
      return;
    }
    setError(null);
    if (Math.abs(r.mm - valueMm) > 0.05) onCommit(r.mm);
    setText(toInputValue(r.mm, unit));
    // If the change was refused, show the value that is actually stored.
    requestAnimationFrame(() => {
      if (!focused.current) setText(toInputValue(latest.current, unit));
    });
  };

  return (
    <FieldRow label={label} htmlFor={id} hint={error ? <span className="text-destructive">{error}</span> : hint}>
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          className={cn(inputClass, "pr-12")}
          inputMode={unit === "ft" ? "text" : "decimal"}
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={!!error}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
            onFocus();
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setText(toInputValue(valueMm, unit));
              setError(null);
              e.currentTarget.blur();
            }
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit === "ft" ? "ft-in" : unit}</span>
      </div>
    </FieldRow>
  );
}

export function NumberField({ label, value, onCommit, min, max, step = 1, suffix, hint, testId }: { label: ReactNode; value: number; onCommit: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; hint?: ReactNode; testId?: string }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const onFocus = useEnsureVisibleOnFocus();
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (!text.trim() || !Number.isFinite(n)) return setError("Enter a number");
    if (min != null && n < min) return setError(`At least ${min}`);
    if (max != null && n > max) return setError(`At most ${max}`);
    setError(null);
    const rounded = Math.round(n / step) * step;
    if (rounded !== value) onCommit(rounded);
    setText(String(rounded));
  };
  return (
    <FieldRow label={label} htmlFor={id} hint={error ? <span className="text-destructive">{error}</span> : hint}>
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          className={cn(inputClass, suffix && "pr-10")}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={!!error}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
            onFocus();
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setText(String(value));
              setError(null);
              e.currentTarget.blur();
            }
          }}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </FieldRow>
  );
}

export function TextField({ label, value, onCommit, placeholder, multiline, testId, maxLength = 200 }: { label: ReactNode; value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean; testId?: string; maxLength?: number }) {
  const id = useId();
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const common = {
    id,
    "data-testid": testId,
    value: text,
    placeholder,
    maxLength,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
  };
  return (
    <FieldRow label={label} htmlFor={id}>
      {multiline ? (
        <textarea {...common} rows={3} className={cn(inputClass, "h-auto min-h-[88px] py-2 leading-snug")} />
      ) : (
        <input
          {...common}
          className={inputClass}
          enterKeyHint="done"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </FieldRow>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, testId }: { label: ReactNode; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; testId?: string }) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} data-testid={testId} className="h-11 text-[16px] md:text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="min-h-10">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

export function ToggleRow({ label, checked, onChange, hint, testId }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm">
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} data-testid={testId} checked={checked} onCheckedChange={onChange} className="scale-125" />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-background/60 px-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-xs uppercase text-muted-foreground">{value}</span>
      </div>
    </FieldRow>
  );
}

const STATUS_LABEL: Record<MeasureStatus, string> = { measured: "Measured", estimated: "Estimated", to_confirm: "To confirm" };

/** Measured / estimated / to-confirm, so unverified numbers are never mistaken for site measurements. */
export function StatusField({ value, onChange }: { value: MeasureStatus; onChange: (v: MeasureStatus) => void }) {
  return (
    <FieldRow label="Measurement status">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Measurement status">
        {MEASURE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "min-h-10 rounded-md px-1 text-xs font-medium transition-colors",
              value === s ? (s === "measured" ? "bg-card text-success shadow-xs" : s === "estimated" ? "bg-card text-warning shadow-xs" : "bg-card text-destructive shadow-xs") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

export const UNIT_OPTIONS = (Object.keys(UNIT_LABELS) as DisplayUnit[]).map((u) => ({ value: u, label: UNIT_LABELS[u] }));

export function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-eyebrow font-semibold uppercase text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
