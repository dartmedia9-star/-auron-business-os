import { useState } from "react";
import { Download, ImageIcon, MoreHorizontal, Ruler } from "lucide-react";
import { DISPLAY_UNITS, gridOptions, isImperial, UNIT_LABELS, unitSuffix, type DisplayUnit, type ProjectModel } from "@workspace/design-model";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useStore } from "./commands";
import { useEditor, type EditorStore } from "./store";

// Display units. A project's unit is saved with the project; the default for
// new designs is a per-device preference. Changing either only changes how
// lengths are shown and typed, never the geometry (lengths are stored in mm).

const DEFAULT_UNIT_KEY = "auron.designStudio.defaultUnit";

export function getDefaultUnit(): DisplayUnit {
  try {
    const v = localStorage.getItem(DEFAULT_UNIT_KEY);
    return (DISPLAY_UNITS as readonly string[]).includes(v ?? "") ? (v as DisplayUnit) : "m";
  } catch {
    return "m";
  }
}

export function setDefaultUnit(unit: DisplayUnit): void {
  try {
    localStorage.setItem(DEFAULT_UNIT_KEY, unit);
  } catch {
    // Private mode or blocked storage: the default just isn't remembered.
  }
}

/** The project's settings with a new display unit; keeps the grid if it suits the new unit. */
export function withDisplayUnit(settings: ProjectModel["settings"], displayUnit: DisplayUnit): ProjectModel["settings"] {
  const gridFits = gridOptions(displayUnit).some((g) => Math.abs(g.mm - settings.gridSize) < 0.1);
  return { ...settings, displayUnit, gridSize: gridFits ? settings.gridSize : isImperial(displayUnit) ? 304.8 : 500 };
}

export function setProjectUnit(store: EditorStore, unit: DisplayUnit): void {
  const m = store.getState().history.present;
  if (m.settings.displayUnit === unit) return;
  store.commit({ ...m, settings: withDisplayUnit(m.settings, unit) });
}

/**
 * Compact unit switcher for the editor's top bar. On a phone, pass onImages
 * and onExport: the menu then also holds those two, so the bar keeps room
 * for the project name.
 */
export function UnitMenu({ compact, onImages, onExport }: { compact?: boolean; onImages?: () => void; onExport?: () => void }) {
  const more = !!compact && !!(onImages || onExport);
  const store = useStore();
  const unit = useEditor(store, (s) => (s.draft ?? s.history.present).settings.displayUnit);
  const [defaultUnit, setDefault] = useState(getDefaultUnit);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={compact ? "h-11 w-11 px-0" : "h-11 px-2"} aria-label={more ? "More: images, export and units" : `Units: ${UNIT_LABELS[unit]}`} title={more ? "More" : "Units"} data-testid="unit-menu">
          {more ? <MoreHorizontal className="h-5 w-5" /> : <Ruler className="h-4 w-4" />}
          {!compact && <span className="ml-1 text-xs font-semibold tabular-nums">{unitSuffix(unit)}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {more && (
          <>
            {onImages && (
              <DropdownMenuItem className="min-h-11" onSelect={onImages} data-testid="images-open">
                <ImageIcon className="mr-2 h-4 w-4" /> Images
              </DropdownMenuItem>
            )}
            {onExport && (
              <DropdownMenuItem className="min-h-11" onSelect={onExport} data-testid="export-open">
                <Download className="mr-2 h-4 w-4" /> Export
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Show lengths in</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={unit} onValueChange={(v) => setProjectUnit(store, v as DisplayUnit)}>
          {DISPLAY_UNITS.map((u) => (
            <DropdownMenuRadioItem key={u} value={u} className="min-h-11" data-testid={`unit-${u}`}>
              {UNIT_LABELS[u]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          disabled={defaultUnit === unit}
          onSelect={() => {
            setDefaultUnit(unit);
            setDefault(unit);
          }}
          data-testid="unit-make-default"
        >
          {defaultUnit === unit ? `${UNIT_LABELS[unit]} is the default for new designs` : `Use ${UNIT_LABELS[unit].toLowerCase()} for new designs`}
        </DropdownMenuItem>
        <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">Changing units never changes any size.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
