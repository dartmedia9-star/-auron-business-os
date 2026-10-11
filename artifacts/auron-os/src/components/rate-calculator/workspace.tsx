import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  ClipboardCopy,
  Copy,
  CopyPlus,
  Info,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RateCategory, RateItem } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoneyInput } from "@/components/ds/money-input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ds/states";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  PRICING_METHOD_INFO,
  bundleWarnings,
  calculate,
  copyAmountText,
  copyDimensions,
  copyFullCalculationText,
  copyItemDetailsText,
  copyRateText,
  copyTotalText,
  duplicateLine,
  formatPaise,
  formatRate,
  refreshLineSnapshot,
  snapshotChanges,
  usesDimensions,
  type CalcLine,
  type CalcWarning,
  type DimensionUnit,
  type LineResult,
} from "@/lib/rate-calculator";
import { lineFromItem, relationsOf, searchScore, snapshotOf, useCopy, useWorkspaceLines } from "./shared";
import type { ItemFormMode } from "./item-form";

/*
 * The calculation workspace: catalog search (left), the current lines with
 * their own rate and amount (middle) and the combined total (right). On
 * phones the three areas become tabs over the same calculation.
 *
 * Nothing here talks to the server except reading the catalog. Lines are
 * priced from the rate snapshot they captured when added.
 */

type Panel = "catalog" | "items" | "total";

// ---------------------------------------------------------------------------
// Catalog search
// ---------------------------------------------------------------------------

function CatalogPanel({
  items,
  categories,
  isLoading,
  error,
  onRetry,
  onAdd,
  openForm,
}: {
  items: RateItem[];
  categories: RateCategory[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onAdd: (item: RateItem) => void;
  openForm: (mode: ItemFormMode) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = useMemo(() => items.filter((i) => i.isActive), [items]);
  const groups = useMemo(() => {
    const matches = active
      .filter((i) => categoryId == null || i.categoryId === categoryId)
      .map((i) => ({ i, s: searchScore(i, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name));
    const order = new Map(categories.map((c, idx) => [c.id, idx]));
    const byCat = new Map<number, RateItem[]>();
    for (const { i } of matches) byCat.set(i.categoryId, [...(byCat.get(i.categoryId) ?? []), i]);
    // Best match first when searching; catalog order when browsing.
    const keys = [...byCat.keys()];
    if (!query.trim()) keys.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return keys.map((k) => ({ categoryId: k, name: byCat.get(k)![0].categoryName, items: byCat.get(k)! }));
  }, [active, categories, categoryId, query]);
  const resultCount = groups.reduce((n, g) => n + g.items.length, 0);
  const usedCategories = categories.filter((c) => c.activeItemCount > 0);

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="pl-9 pr-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultCount > 0) {
                e.preventDefault();
                onAdd(groups[0].items[0]);
                setQuery("");
              }
            }}
            placeholder="Search items, aliases, categories"
            aria-label="Search catalog items"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {usedCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <CategoryChip active={categoryId == null} onClick={() => setCategoryId(null)}>
              All
            </CategoryChip>
            {usedCategories.map((c) => (
              <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                {c.name}
              </CategoryChip>
            ))}
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100dvh-20rem)]">
          {isLoading ? (
            <ListSkeleton rows={5} className="p-1" />
          ) : error ? (
            <ErrorState compact title="Couldn't load the catalog" error={error} onRetry={onRetry} />
          ) : items.length === 0 ? (
            <EmptyState
              compact
              icon={ListChecks}
              title="Create your master rate items first"
              description="The catalog is empty. Add your own items, rates and units; nothing is pre-loaded."
              action={
                <Button size="sm" onClick={() => openForm({ kind: "create" })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add your first item
                </Button>
              }
            />
          ) : active.length === 0 ? (
            <EmptyState compact icon={ListChecks} title="No active items" description="All catalog items are deactivated. Reactivate one in the Catalog tab." />
          ) : resultCount === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title={query.trim() ? `No items match “${query.trim()}”` : "No items in this category"}
              description="Nothing is created automatically. Add it to the catalog if you have a rate for it."
              action={
                <Button size="sm" variant="outline" onClick={() => openForm({ kind: "create", name: query.trim(), categoryId: categoryId ?? undefined })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add catalog item
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.categoryId}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{g.name}</p>
                  <ul className="space-y-1">
                    {g.items.map((i) => {
                      const rate = formatRate(snapshotOf(i));
                      return (
                        <li key={i.id}>
                          <button
                            type="button"
                            onClick={() => onAdd(i)}
                            className="group flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{i.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {PRICING_METHOD_INFO[i.pricingMethod].label}
                                {i.subcategory ? ` · ${i.subcategory}` : ""}
                              </span>
                              {i.conditions && (
                                <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span className="line-clamp-2">{i.conditions}</span>
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={cn("block text-sm tabular-nums", rate ? "font-medium" : "text-amber-700 dark:text-amber-400")}>{rate ?? "No rate"}</span>
                              <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-gold-ink opacity-70 group-hover:opacity-100">
                                <Plus className="h-3 w-3" /> Add
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active ? "border-primary/40 bg-primary/10 font-medium text-gold-ink" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// One line
// ---------------------------------------------------------------------------

function MeasureInput({
  id,
  label,
  value,
  onChange,
  error,
  suffix,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={!!error || undefined}
          className={cn("h-9 tabular-nums", suffix && "pr-9", error && "border-destructive focus-visible:ring-destructive/40")}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function UnitToggle({ value, onChange }: { value: DimensionUnit; onChange: (u: DimensionUnit) => void }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">Unit</span>
      <div className="inline-flex h-9 rounded-md border bg-card p-0.5" role="radiogroup" aria-label="Measurement unit">
        {(["ft", "m"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={value === u}
            onClick={() => onChange(u)}
            className={cn("rounded px-3 text-sm transition-colors", value === u ? "bg-primary/12 font-medium text-gold-ink" : "text-muted-foreground hover:text-foreground")}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Lets "₹550.00/chair" wrap after the slash instead of mid-word in a narrow column. */
function breakable(text: string): React.ReactNode {
  const parts = text.split("/");
  return parts.map((p, i) => (
    <span key={i}>
      {p}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ));
}

function Figure({
  label,
  value,
  sub,
  onCopy,
  emphasis,
  muted,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  onCopy?: () => void;
  emphasis?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-md px-2.5 py-2", emphasis ? "bg-primary/[0.07]" : "bg-muted/50", className)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-start justify-between gap-1">
        <p className={cn("min-w-0 break-words tabular-nums", emphasis ? "text-base font-semibold" : "text-sm font-medium", muted && "text-muted-foreground")}>{value}</p>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="-mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Copy ${label.replace(/^[×=]\s*/, "").toLowerCase()}`}
            title={`Copy ${label.replace(/^[×=]\s*/, "").toLowerCase()}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {sub && <p className="break-words text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function LineCard({
  index,
  line,
  result,
  warnings,
  highlighted,
  current,
  dimensionSources,
  addons,
  autoFocus,
  onChange,
  onDuplicate,
  onRemove,
  onRefresh,
  onAddItem,
  onEditCatalogItem,
}: {
  index: number;
  line: CalcLine;
  result: LineResult;
  warnings: CalcWarning[];
  highlighted: boolean;
  current: RateItem | undefined;
  dimensionSources: Array<{ line: CalcLine; index: number }>;
  addons: RateItem[];
  autoFocus: boolean;
  onChange: (line: CalcLine) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  onAddItem: (item: RateItem) => void;
  onEditCatalogItem: (item: RateItem) => void;
}) {
  const copy = useCopy();
  const s = line.snapshot;
  const info = PRICING_METHOD_INFO[s.pricingMethod];
  const rate = formatRate(s);
  const amount = copyAmountText(result);
  const changes = current ? snapshotChanges(s, snapshotOf(current)) : [];
  const currentRate = current ? formatRate(snapshotOf(current)) : null;
  const fid = (f: string) => `${line.id}-${f}`;
  const set = (patch: Partial<CalcLine>) => onChange({ ...line, ...patch });

  const quantityFigure = (() => {
    if (info.inputs === "area") return { label: "Area", value: result.billable ? `${result.billable} ${result.billableUnit}` : "—" };
    if (info.inputs === "length") return { label: "Length", value: result.billable ? `${result.billable} ${result.billableUnit}` : "—" };
    if (info.inputs === "quantity") return { label: "Quantity", value: result.billable ?? "—" };
    if (info.inputs === "base") return { label: "Base amount", value: result.baseAmount != null ? formatMoney(result.baseAmount) : "—", sub: result.baseDescription ?? undefined };
    return { label: "Charge", value: "Fixed" };
  })();
  const minApplied = result.measured != null && result.billable != null && result.measured !== result.billable;
  // Blank fields on a new line are just "not entered yet", not an error.
  const fieldError = (f: keyof LineResult["fieldErrors"]) => (result.status === "invalid" ? result.fieldErrors[f] : undefined);

  return (
    <Card
      id={`line-${line.id}`}
      className={cn(
        "shadow-card transition-[box-shadow,border-color,opacity] duration-200",
        warnings.length > 0 && "border-amber-500/40",
        highlighted && "ring-2 ring-amber-500/60",
        !line.included && "opacity-60",
      )}
    >
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{index}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{s.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[s.categoryName, s.subcategory, info.label].filter(Boolean).join(" · ")}
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Include this item in the combined total">
            <Switch checked={line.included} onCheckedChange={(c) => set({ included: c })} aria-label="Include in total" />
            <span className="hidden sm:inline">In total</span>
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Actions for ${s.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem disabled={!rate} onSelect={() => copy("Unit rate", copyRateText(line))}>
                <Copy className="mr-2 h-4 w-4" /> Copy unit rate
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!amount} onSelect={() => copy("Amount", amount)}>
                <Copy className="mr-2 h-4 w-4" /> Copy amount
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!amount} onSelect={() => copy("Item details", copyItemDetailsText(line, result))}>
                <ClipboardCopy className="mr-2 h-4 w-4" /> Copy item details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopyPlus className="mr-2 h-4 w-4" /> Duplicate line
              </DropdownMenuItem>
              {current && (
                <DropdownMenuItem onSelect={() => onEditCatalogItem(current)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit catalog item…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(info.inputs === "area" || info.inputs === "length") && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="w-[110px]">
              <MeasureInput id={fid("l")} label="Length" value={line.length} onChange={(v) => set({ length: v })} error={fieldError("length")} suffix={line.dimensionUnit} autoFocus={autoFocus} />
            </div>
            {info.inputs === "area" && (
              <>
                <span className="mt-7 text-sm text-muted-foreground">×</span>
                <div className="w-[110px]">
                  <MeasureInput id={fid("w")} label="Width" value={line.width} onChange={(v) => set({ width: v })} error={fieldError("width")} suffix={line.dimensionUnit} />
                </div>
              </>
            )}
            <UnitToggle value={line.dimensionUnit} onChange={(u) => set({ dimensionUnit: u })} />
            {dimensionSources.length > 0 && (
              <div className="space-y-1">
                <span aria-hidden className="block text-xs text-transparent">.</span>
                <Select
                  value=""
                  onValueChange={(id) => {
                    const src = dimensionSources.find((d) => d.line.id === id);
                    if (src) onChange(copyDimensions(src.line, line));
                  }}
                >
                  <SelectTrigger className="h-9 w-auto gap-1.5 text-muted-foreground" aria-label="Copy dimensions from another item">
                    <div className="flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Same as…
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {dimensionSources.map(({ line: l, index: i }) => (
                      <SelectItem key={l.id} value={l.id}>
                        Copy from {i}. {l.snapshot.name} ({l.length || "?"}
                        {PRICING_METHOD_INFO[l.snapshot.pricingMethod].inputs === "area" ? ` × ${l.width || "?"}` : ""} {l.dimensionUnit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        {info.inputs === "quantity" && (
          <div className="w-[140px]">
            <MeasureInput id={fid("q")} label="Quantity" value={line.quantity} onChange={(v) => set({ quantity: v })} error={fieldError("quantity")} suffix={s.unitLabel ?? undefined} autoFocus={autoFocus} />
          </div>
        )}
        {info.inputs === "base" && s.percentageBase === "manual" && (
          <div className="w-[180px] space-y-1">
            <Label htmlFor={fid("b")} className="text-xs text-muted-foreground">
              Base amount
            </Label>
            <MoneyInput id={fid("b")} value={line.baseAmount} onValueChange={(v) => set({ baseAmount: v })} autoFocus={autoFocus} className="h-9" />
            {fieldError("baseAmount") && <p className="text-xs text-destructive">{fieldError("baseAmount")}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <Figure label={quantityFigure.label} value={quantityFigure.value} sub={quantityFigure.sub} muted={!result.billable && info.inputs !== "none"} />
          <Figure label={info.inputs === "none" ? "Unit rate" : `× ${info.inputs === "base" ? "Percentage" : "Unit rate"}`} value={rate ? breakable(rate) : "Not set"} muted={!rate} onCopy={rate ? () => copy("Unit rate", rate) : undefined} />
          <Figure className="col-span-2 sm:col-span-1" label="= Amount" value={amount ?? "—"} emphasis muted={!amount} onCopy={amount ? () => copy("Amount", amount) : undefined} />
        </div>

        {result.status !== "ok" && result.errors.length > 0 && !Object.keys(result.fieldErrors).length && (
          <p className={cn("flex items-start gap-1.5 text-xs", result.status === "invalid" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {result.errors.join(" ")}
          </p>
        )}
        {result.status === "incomplete" && Object.keys(result.fieldErrors).length > 0 && (
          <p className="text-xs text-muted-foreground">Enter the measurements to calculate this item. It isn't in the total yet.</p>
        )}
        {minApplied && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {result.notes.join(" ")}
          </p>
        )}
        {s.conditions && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-500/[0.07] px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.conditions}
          </p>
        )}
        {warnings.map((w) => (
          <p key={w.key} className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w.message}
          </p>
        ))}
        {current && !current.isActive && (
          <p className="text-xs text-muted-foreground">This item has been deactivated in the catalog. The captured rate still applies here.</p>
        )}
        {changes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-muted-foreground">
              The catalog has changed ({changes.join(", ")}). {changes.includes("rate") && currentRate ? <>Catalog rate is now <span className="font-medium text-foreground">{currentRate}</span>; this line keeps <span className="font-medium text-foreground">{rate ?? "no rate"}</span>.</> : "This line keeps what it captured."}
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={onRefresh}>
              Use catalog values
            </Button>
          </div>
        )}
        {addons.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Optional add-ons:</span>
            {addons.map((a) => (
              <button key={a.id} type="button" onClick={() => onAddItem(a)} className="inline-flex items-center gap-0.5 rounded-full border bg-card px-2 py-0.5 hover:text-foreground">
                <Plus className="h-3 w-3" /> {a.name}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function Workspace({
  items,
  categories,
  isLoading,
  error,
  onRetry,
  openForm,
}: {
  items: RateItem[];
  categories: RateCategory[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  openForm: (mode: ItemFormMode) => void;
}) {
  const copy = useCopy();
  const [lines, setLines] = useWorkspaceLines();
  const [panel, setPanel] = useState<Panel>("catalog");
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [refreshing, setRefreshing] = useState<CalcLine | null>(null);

  const calc = useMemo(() => calculate(lines), [lines]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const relations = useMemo(() => relationsOf(items), [items]);
  const warnings = useMemo(() => bundleWarnings(lines, relations, new Map(items.map((i) => [i.id, i.name]))), [lines, relations, items]);

  useEffect(() => {
    if (highlight.length === 0) return;
    const t = window.setTimeout(() => setHighlight([]), 2400);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const addItem = (item: RateItem) => {
    const line = lineFromItem(item);
    setLines((ls) => [...ls, line]);
    setLastAdded(line.id);
    setPanel("items");
    window.setTimeout(() => document.getElementById(`line-${line.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };
  const updateLine = (line: CalcLine) => setLines((ls) => ls.map((l) => (l.id === line.id ? line : l)));
  const duplicate = (line: CalcLine) => {
    const copyLine = duplicateLine(line);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === line.id);
      return [...ls.slice(0, i + 1), copyLine, ...ls.slice(i + 1)];
    });
    setLastAdded(copyLine.id);
  };
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));
  const showLines = (ids: string[]) => {
    setPanel("items");
    setHighlight(ids);
    window.setTimeout(() => document.getElementById(`line-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  // Preview of an explicit "use catalog values" refresh.
  const refreshPreview = useMemo(() => {
    if (!refreshing) return null;
    const item = itemsById.get(refreshing.snapshot.itemId);
    if (!item) return null;
    const next = refreshLineSnapshot(refreshing, snapshotOf(item));
    const nextCalc = calculate(lines.map((l) => (l.id === next.id ? next : l)));
    const before = calc.lines.get(refreshing.id);
    const after = nextCalc.lines.get(next.id);
    return {
      next,
      oldRate: formatRate(refreshing.snapshot) ?? "no rate",
      newRate: formatRate(next.snapshot) ?? "no rate",
      oldAmount: before ? copyAmountText(before) ?? "—" : "—",
      newAmount: after ? copyAmountText(after) ?? "—" : "—",
      changes: snapshotChanges(refreshing.snapshot, next.snapshot),
    };
  }, [refreshing, itemsById, lines, calc]);

  const unpricedCount = calc.unpricedLineIds.length;
  const excludedCount = lines.length - calc.includedCount;

  const summary = (
    <Card className="shadow-card">
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Combined total</p>
          <p className="mt-1 text-[28px] font-semibold leading-tight tracking-tight tabular-nums" data-testid="combined-total">
            {formatPaise(calc.totalPaise)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sum of {calc.pricedCount} item amount{calc.pricedCount === 1 ? "" : "s"}
            {lines.length > 0 && ` · ${lines.length} line${lines.length === 1 ? "" : "s"} selected`}
          </p>
        </div>
        {calc.areaTotals.length > 0 && (
          <div className="space-y-0.5 text-sm">
            {calc.areaTotals.map((a) => (
              <p key={a.unit} className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total area</span>
                <span className="tabular-nums">
                  {a.value} {a.unit}
                </span>
              </p>
            ))}
          </div>
        )}
        {(unpricedCount > 0 || excludedCount > 0) && (
          <div className="space-y-1 text-xs">
            {unpricedCount > 0 && (
              <button type="button" onClick={() => showLines(calc.unpricedLineIds)} className="flex w-full items-start gap-1.5 text-left text-amber-700 hover:underline dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {unpricedCount} item{unpricedCount === 1 ? " has" : "s have"} no amount yet and {unpricedCount === 1 ? "is" : "are"} not in the total
              </button>
            )}
            {excludedCount > 0 && <p className="text-muted-foreground">{excludedCount} line{excludedCount === 1 ? " is" : "s are"} switched out of the total</p>}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              {warnings.length} combination warning{warnings.length === 1 ? "" : "s"}
            </p>
            {warnings.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => showLines(w.lineIds)}
                className="block w-full rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2 py-1.5 text-left text-xs text-amber-800 hover:bg-amber-500/[0.12] dark:text-amber-300"
              >
                {w.message} <span className="font-medium underline">Show items</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2">
          <Button onClick={() => copy("Combined total", copyTotalText(calc))} disabled={calc.pricedCount === 0}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy total
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              copy(
                "Full calculation",
                copyFullCalculationText(lines, calc),
                unpricedCount > 0 || excludedCount > 0 ? `Includes the ${calc.pricedCount} item${calc.pricedCount === 1 ? "" : "s"} in the total` : undefined,
              )
            }
            disabled={calc.pricedCount === 0}
          >
            <ClipboardCopy className="mr-1.5 h-4 w-4" /> Copy full calculation
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmClear(true)} disabled={lines.length === 0}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Clear calculation
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Internal base rates only. No margin, GST, labour, transport or other charges are added, and nothing here is saved as a quotation or financial record.
        </p>
      </CardContent>
    </Card>
  );

  const dimensionLines = lines.map((l, i) => ({ line: l, index: i + 1 })).filter((x) => usesDimensions(x.line.snapshot.pricingMethod) && x.line.length.trim() !== "");

  return (
    <div className="space-y-4">
      {/* Phone: one area at a time, the calculation is shared. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:hidden">
        <div className="grid grid-cols-3 rounded-lg border bg-card p-0.5 text-sm" role="tablist" aria-label="Calculator sections">
          {(
            [
              ["catalog", "Catalog"],
              ["items", `Items (${lines.length})`],
              ["total", "Total"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={panel === key}
              onClick={() => setPanel(key)}
              className={cn("rounded-md py-1.5 transition-colors", panel === key ? "bg-primary/12 font-medium text-gold-ink" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_290px] lg:items-start xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <div className={cn("lg:sticky lg:top-0 lg:block", panel !== "catalog" && "hidden")}>
          <CatalogPanel items={items} categories={categories} isLoading={isLoading} error={error} onRetry={onRetry} onAdd={addItem} openForm={openForm} />
        </div>

        <div className={cn("space-y-3 lg:block", panel !== "items" && "hidden")}>
          {lines.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No items in this calculation"
              description="Search the catalog and select items. Each one gets its own measurements, rate and amount."
              action={
                <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPanel("catalog")}>
                  <Search className="mr-1 h-3.5 w-3.5" /> Search catalog
                </Button>
              }
            />
          ) : (
            lines.map((line, idx) => {
              const result = calc.lines.get(line.id)!;
              const current = itemsById.get(line.snapshot.itemId);
              const presentIds = new Set(lines.map((l) => l.snapshot.itemId));
              const addons = relations
                .filter((r) => r.itemId === line.snapshot.itemId && r.relationType === "addon" && !presentIds.has(r.relatedItemId))
                .map((r) => itemsById.get(r.relatedItemId))
                .filter((i): i is RateItem => !!i && i.isActive);
              return (
                <LineCard
                  key={line.id}
                  index={idx + 1}
                  line={line}
                  result={result}
                  warnings={warnings.filter((w) => w.lineIds.includes(line.id))}
                  highlighted={highlight.includes(line.id)}
                  current={current}
                  dimensionSources={usesDimensions(line.snapshot.pricingMethod) ? dimensionLines.filter((d) => d.line.id !== line.id) : []}
                  addons={addons}
                  autoFocus={lastAdded === line.id}
                  onChange={updateLine}
                  onDuplicate={() => duplicate(line)}
                  onRemove={() => remove(line.id)}
                  onRefresh={() => setRefreshing(line)}
                  onAddItem={addItem}
                  onEditCatalogItem={(item) => openForm({ kind: "edit", item })}
                />
              );
            })
          )}
          {lines.length > 0 && (
            <Button variant="outline" size="sm" className="w-full lg:hidden" onClick={() => setPanel("catalog")}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add another item
            </Button>
          )}
        </div>

        <div className={cn("lg:sticky lg:top-0 lg:block", panel !== "total" && "hidden")}>{summary}</div>
      </div>

      {/* Phone: the total stays in reach while working on items. */}
      {panel !== "total" && lines.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-2 border-t bg-card/95 px-4 py-2.5 backdrop-blur md:-mx-6 md:-mb-6 md:px-6 lg:hidden">
          <button type="button" onClick={() => setPanel("total")} className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Combined total</span>
            <span className="block truncate text-lg font-semibold tabular-nums">{formatPaise(calc.totalPaise)}</span>
          </button>
          {warnings.length > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mr-1 h-3 w-3" /> {warnings.length}
            </Badge>
          )}
          <Button size="sm" onClick={() => copy("Combined total", copyTotalText(calc))} disabled={calc.pricedCount === 0}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </Button>
        </div>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this calculation?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes all {lines.length} line{lines.length === 1 ? "" : "s"} from this calculation. The catalog is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLines([]);
                setPanel("catalog");
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!refreshing} onOpenChange={(o) => !o && setRefreshing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use the current catalog values?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {refreshing?.snapshot.name}: {refreshPreview?.changes.join(", ")} will change. Measurements stay as entered.
                </p>
                {refreshPreview && (
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-2 gap-y-1 rounded-md bg-muted/60 p-2 tabular-nums">
                    <span>Rate</span>
                    <span className="text-right">{refreshPreview.oldRate}</span>
                    <span>→</span>
                    <span className="font-medium text-foreground">{refreshPreview.newRate}</span>
                    <span>Amount</span>
                    <span className="text-right">{refreshPreview.oldAmount}</span>
                    <span>→</span>
                    <span className="font-medium text-foreground">{refreshPreview.newAmount}</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep captured values</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (refreshPreview) updateLine(refreshPreview.next);
                setRefreshing(null);
              }}
            >
              Update line
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
