import { useCallback, useEffect, useState } from "react";
import type { RateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  PRICING_METHODS,
  createLine,
  type CalcLine,
  type CalcRelation,
  type DimensionUnit,
  type RateSnapshot,
} from "@/lib/rate-calculator";

/* Glue between the catalog API, the calculation engine and the browser. */

const decimal = (v: number | null | undefined): string | null => (v == null ? null : String(v));

/** The pricing values a line captures from a catalog item when it is added. */
export function snapshotOf(item: RateItem): RateSnapshot {
  return {
    itemId: item.id,
    name: item.name,
    categoryName: item.categoryName || null,
    subcategory: item.subcategory ?? null,
    pricingMethod: item.pricingMethod,
    rate: decimal(item.rate),
    unitLabel: item.unitLabel ?? null,
    percentageBase: item.percentageBase ?? null,
    percentageBaseItemIds: item.percentageBaseItemIds ?? [],
    minBillable: decimal(item.minBillable),
    maxBillable: decimal(item.maxBillable),
    conditions: item.conditions ?? null,
  };
}

export function lineFromItem(item: RateItem): CalcLine {
  return createLine(snapshotOf(item), {
    defaultLength: decimal(item.defaultLength),
    defaultWidth: decimal(item.defaultWidth),
    defaultQuantity: decimal(item.defaultQuantity),
    defaultDimensionUnit: (item.defaultDimensionUnit as DimensionUnit | null | undefined) ?? null,
  });
}

export function relationsOf(items: RateItem[]): CalcRelation[] {
  return items.flatMap((i) =>
    (i.relations ?? []).map((r) => ({ itemId: i.id, relatedItemId: r.relatedItemId, relationType: r.relationType, note: r.note ?? null })),
  );
}

/** Lower-cased text an item is found by: name, aliases/keywords, category, subcategory. */
export function searchScore(item: RateItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const name = item.name.toLowerCase();
  const aliases = (item.aliases ?? []).map((a) => a.toLowerCase());
  const other = [item.categoryName, item.subcategory ?? "", item.description ?? ""].join(" ").toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = `${name} ${aliases.join(" ")} ${other}`;
  if (!tokens.every((t) => haystack.includes(t))) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (aliases.some((a) => a === q || a.startsWith(q))) return 70;
  if (name.includes(q)) return 60;
  if (aliases.some((a) => a.includes(q))) return 50;
  return 10;
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/** Writes text to the clipboard; true only when the write actually succeeded. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy with a small confirmation, or an error toast when the clipboard refused. */
export function useCopy() {
  const { toast } = useToast();
  return useCallback(
    async (label: string, text: string | null, extra?: string) => {
      if (text == null) {
        toast({ title: `Nothing to copy`, description: `${label} isn't available yet.`, variant: "destructive" });
        return false;
      }
      const ok = await writeClipboard(text);
      if (ok) {
        const preview = text.includes("\n") ? undefined : text;
        toast({ title: `Copied ${label.toLowerCase()}`, description: [preview, extra].filter(Boolean).join(" · ") || undefined, duration: 1800 });
      } else {
        toast({
          title: "Couldn't copy",
          description: "Your browser blocked clipboard access. Select the figure and copy it manually.",
          variant: "destructive",
        });
      }
      return ok;
    },
    [toast],
  );
}

// ---------------------------------------------------------------------------
// Workspace persistence (this browser only; never sent to the server)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "auron.rate-calculator.workspace.v1";

function isLine(v: unknown): v is CalcLine {
  const l = v as CalcLine;
  return (
    !!l &&
    typeof l.id === "string" &&
    !!l.snapshot &&
    typeof l.snapshot.itemId === "number" &&
    typeof l.snapshot.name === "string" &&
    (PRICING_METHODS as readonly string[]).includes(l.snapshot.pricingMethod) &&
    Array.isArray(l.snapshot.percentageBaseItemIds) &&
    typeof l.length === "string" &&
    typeof l.width === "string" &&
    typeof l.quantity === "string" &&
    typeof l.baseAmount === "string" &&
    (l.dimensionUnit === "ft" || l.dimensionUnit === "m") &&
    typeof l.included === "boolean"
  );
}

function loadLines(): CalcLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

/**
 * The current calculation, kept in this browser so a reload or a visit to
 * another page doesn't lose it. Lines keep their captured rate snapshots.
 */
export function useWorkspaceLines() {
  const [lines, setLines] = useState<CalcLine[]>(loadLines);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage full or blocked: the calculation still works for this visit
    }
  }, [lines]);
  return [lines, setLines] as const;
}
