import { useEffect, useId, useState, type ComponentType, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Contrast, Layers, Monitor, Moon, RefreshCw, Sparkles, Sun, Waves, ZapOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useExperience, type ThemeChoice } from "@/lib/experience";
import { SPRING, type MotionIntensity } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; icon: ComponentType<{ className?: string }> };

const THEME_OPTIONS: Option<ThemeChoice>[] = [
  { value: "dark", label: "Midnight", icon: Moon },
  { value: "light", label: "Daylight", icon: Sun },
  { value: "system", label: "Device", icon: Monitor },
];

const MOTION_OPTIONS: Option<MotionIntensity>[] = [
  { value: "expressive", label: "Expressive", icon: Sparkles },
  { value: "balanced", label: "Balanced", icon: Waves },
  { value: "reduced", label: "Reduced", icon: ZapOff },
];

/*
 * Segmented control (radio group) with a sliding selection pill. Arrow keys
 * move the choice, as in a native segmented control.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const pillId = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("grid gap-1 rounded-xl border bg-muted/60 p-1", size === "sm" ? "text-xs" : "text-sm")}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === undefined && o === options[0]) ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-8 px-2" : "h-9 px-3",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                transition={SPRING.layout}
                className="absolute inset-0 rounded-lg border bg-card shadow-card"
                aria-hidden
              />
            )}
            <o.icon className="relative h-3.5 w-3.5 shrink-0" />
            <span className="relative truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  id,
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="flex min-w-0 cursor-pointer items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-1" />
    </div>
  );
}

/** Theme choice, safe before next-themes has read storage (no mismatch flash). */
export function useThemeChoice(): [ThemeChoice | undefined, (t: ThemeChoice) => void] {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return [mounted ? (theme as ThemeChoice | undefined) : undefined, setTheme];
}

/*
 * The full Appearance & Experience panel. `compact` is the header version
 * (theme, motion and glass); Settings shows everything with descriptions.
 */
export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useThemeChoice();
  const { prefs, setPref } = useExperience();
  const id = useId();
  const size = compact ? "sm" : "md";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Appearance</p>
        <Segmented label="Appearance" options={THEME_OPTIONS} value={theme} onChange={setTheme} size={size} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Animation</p>
        <Segmented label="Animation intensity" options={MOTION_OPTIONS} value={prefs.motion} onChange={(v) => setPref("motion", v)} size={size} />
      </div>
      <div className="divide-y">
        <ToggleRow
          id={`${id}-glass`}
          icon={Layers}
          title="Glass effects"
          description="Blur and translucency. Off uses solid surfaces."
          checked={prefs.glass}
          onCheckedChange={(v) => setPref("glass", v)}
        />
        <ToggleRow
          id={`${id}-contrast`}
          icon={Contrast}
          title="Enhanced contrast"
          description="Brighter secondary text and firmer borders."
          checked={prefs.enhancedContrast}
          onCheckedChange={(v) => setPref("enhancedContrast", v)}
        />
        {!compact && (
          <ToggleRow
            id={`${id}-live`}
            icon={RefreshCw}
            title="Command Center live updates"
            description="Refresh figures automatically while the page is open. Manual refresh is always available."
            checked={prefs.liveUpdates}
            onCheckedChange={(v) => setPref("liveUpdates", v)}
          />
        )}
      </div>
    </div>
  );
}
