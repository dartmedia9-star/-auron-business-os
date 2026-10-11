import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useAnimate } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ClipboardCopy,
  Copy,
  CopyPlus,
  Info,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
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
import { DURATION, EASE_OUT, useReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  PRICING_METHOD_INFO,
  billableUnitLabel,
  bundleWarnings,
  calculate,
  copyAmountText,
  copyBaseRateText,
  copyDimensions,
  copyFullCalculationText,
  copyItemDetailsText,
  copyRateText,
  copyTotalText,
  duplicateLine,
  formatMargin,
  formatPaise,
  formatRate,
  refreshLineSnapshot,
  snapshotChanges,
  usesDimensions,
  type CalcLine,
  type CalcWarning,
  type DimensionUnit,
  type LineResult,
  type RateSnapshot,
} from "@/lib/rate-calculator";
import { lineFromItem, relationsOf, searchScore, snapshotOf, useCopy, useWorkspaceLines } from "./shared";
import { CopyFigureButton, CopyGlyph, RollingMoney, reveal, useCopyFeedback } from "./motion";
import type { ItemFormMode } from "./item-form";

/*
 * The calculation workspace: catalog search (left), the current lines with
 * their own rate, margin and amount (middle) and the combined total (right).
 * Below 1280px the catalog and items become tabs over the same calculation
 * (with the total beside them from 1024px, and as a third tab on phones).
 *
 * Nothing here talks to the server except reading the catalog. Lines are
 * priced from the rate snapshot they captured when added; a line's margin
 * lives on the line only and never changes the catalog.
 */

type Panel = "catalog" | "items" | "total";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

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
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reduce = useReduceMotion();

  useEffect(() => {
    if (justAdded == null) return;
    const t = window.setTimeout(() => setJustAdded(null), 1200);
    return () => window.clearTimeout(t);
  }, [justAdded]);

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

  const add = (item: RateItem) => {
    onAdd(item);
    setJustAdded(item.id);
  };

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Catalog</p>
          <p className="text-xs text-muted-foreground">{isLoading ? "Loading items…" : `${active.length} active item${active.length === 1 ? "" : "s"}`}</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 shrink-0 text-gold-ink" onClick={() => openForm({ kind: "create" })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New item
        </Button>
      </div>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="h-10 pl-9 pr-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultCount > 0) {
                e.preventDefault();
                add(groups[0].items[0]);
                setQuery("");
              }
            }}
            placeholder="Search items, aliases, categories"
            aria-label="Search catalog items"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: DURATION.fast }}
                className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground", focusRing)}
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {usedCategories.length > 1 && (
          // Chips scroll sideways inside their own strip; the page never does.
          <LayoutGroup id="rc-category-chips">
            <div
              className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-4 sm:px-4 [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filter by category"
              data-testid="category-chips"
            >
              <CategoryChip active={categoryId == null} onClick={() => setCategoryId(null)}>
                All
              </CategoryChip>
              {usedCategories.map((c) => (
                <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                  {c.name}
                </CategoryChip>
              ))}
            </div>
          </LayoutGroup>
        )}

        <div className="-mx-1 max-h-[60vh] overflow-y-auto overflow-x-hidden px-1 xl:max-h-[calc(100dvh-22rem)]">
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
            <div className="space-y-4 pb-1">
              {groups.map((g) => (
                <div key={g.categoryId}>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{g.name}</p>
                  <ul className="space-y-1.5">
                    {g.items.map((i, idx) => {
                      const rate = formatRate(snapshotOf(i));
                      const added = justAdded === i.id;
                      return (
                        <motion.li
                          key={i.id}
                          initial={reduce ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: DURATION.base, ease: EASE_OUT, delay: Math.min(idx, 8) * 0.02 }}
                        >
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.985 }}
                            onClick={() => add(i)}
                            className={cn(
                              "group flex w-full items-start gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/40 hover:shadow-sm",
                              added && "border-primary/50 bg-primary/[0.05]",
                              focusRing,
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block break-words text-sm font-medium leading-snug">{i.name}</span>
                              <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                                {PRICING_METHOD_INFO[i.pricingMethod].label}
                                {i.subcategory ? ` · ${i.subcategory}` : ""}
                              </span>
                              {i.conditions && (
                                <span className="mt-1 flex items-start gap-1 text-xs text-warning">
                                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span className="line-clamp-2 break-words">{i.conditions}</span>
                                </span>
                              )}
                            </span>
                            <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-1 text-right">
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                                  rate ? "bg-muted font-medium text-foreground" : "bg-warning/10 text-warning",
                                )}
                              >
                                {rate ? breakable(rate) : "No rate"}
                              </span>
                              <span className="relative inline-flex h-4 items-center text-xs text-gold-ink">
                                <AnimatePresence initial={false} mode="wait">
                                  {added ? (
                                    <motion.span key="added" className="inline-flex items-center gap-0.5" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.fast }}>
                                      <Check className="h-3 w-3" /> Added
                                    </motion.span>
                                  ) : (
                                    <motion.span key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.fast }}>
                                      <span className="inline-flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                                        <Plus className="h-3 w-3" /> Add
                                      </span>
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </span>
                            </span>
                          </motion.button>
                        </motion.li>
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
        "relative shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-primary/40 font-medium text-gold-ink" : "bg-card text-muted-foreground hover:text-foreground",
        focusRing,
      )}
    >
      {active && <motion.span layoutId="rc-chip-active" className="absolute inset-0 rounded-full bg-primary/12" transition={{ duration: DURATION.base, ease: EASE_OUT }} />}
      <span className="relative">{children}</span>
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
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
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
          className={cn("h-10 w-full min-w-0 tabular-nums", suffix && "pr-12", error && "border-destructive focus-visible:ring-destructive/40")}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 max-w-[2.75rem] -translate-y-1/2 truncate text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p {...reveal} className="overflow-hidden text-xs text-destructive" role="alert">
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function UnitToggle({ id, value, onChange }: { id: string; value: DimensionUnit; onChange: (u: DimensionUnit) => void }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">Unit</span>
      <LayoutGroup id={`unit-${id}`}>
        <div className="inline-flex h-10 rounded-md border bg-muted/40 p-0.5" role="radiogroup" aria-label="Measurement unit">
          {(["ft", "m"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={value === u}
              onClick={() => onChange(u)}
              className={cn("relative min-w-[2.75rem] rounded px-3 text-sm transition-colors", value === u ? "font-medium text-gold-ink" : "text-muted-foreground hover:text-foreground", focusRing)}
            >
              {value === u && <motion.span layoutId="active" className="absolute inset-0 rounded bg-card shadow-sm ring-1 ring-primary/30" transition={{ duration: DURATION.fast, ease: EASE_OUT }} />}
              <span className="relative">{u}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
    </div>
  );
}

/** Margin field wording per pricing method, so ₹ is never read as % and flat is never read as per-unit. */
function marginCopy(s: Pick<RateSnapshot, "pricingMethod" | "unitLabel">): { label: string; help: string } {
  if (s.pricingMethod === "fixed") return { label: "Fixed-charge margin", help: "Flat ₹ added once to the fixed charge." };
  if (s.pricingMethod === "percentage") return { label: "Flat margin (₹)", help: "Added once in rupees, after the percentage. Not a percentage." };
  return { label: `Margin per ${billableUnitLabel(s)}`, help: `Added to the catalog rate for every billable ${billableUnitLabel(s)}.` };
}

function MarginField({ id, line, result, onChange }: { id: string; line: CalcLine; result: LineResult; onChange: (margin: string) => void }) {
  const { label, help } = marginCopy(line.snapshot);
  const hasMargin = result.marginPaise > 0n;
  const error = result.fieldErrors.margin;
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed px-3 py-2.5 transition-colors",
        hasMargin ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-muted/20",
        error && "border-destructive/50",
      )}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40 space-y-1 @md:max-w-[220px]">
          <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
            {label}
          </Label>
          <MoneyInput
            id={id}
            value={line.margin}
            onValueChange={onChange}
            placeholder="0.00"
            aria-invalid={!!error || undefined}
            aria-describedby={`${id}-help`}
            className={cn("h-10", error && "border-destructive focus-visible:ring-destructive/40")}
          />
        </div>
        <AnimatePresence initial={false}>
          {line.margin.trim() !== "" && (
            <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: DURATION.fast }}>
              <Button type="button" variant="ghost" size="sm" className="h-10 text-muted-foreground" onClick={() => onChange("")}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to ₹0
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p id={`${id}-help`} className="mt-1.5 text-xs text-muted-foreground">
        {help} The catalog rate is not changed.
      </p>
      <FieldError message={error} />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
  action,
  testId,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "margin" | "muted";
  strong?: boolean;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1" data-testid={testId}>
      <dt className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start justify-end gap-0.5">
        <span
          className={cn(
            "min-w-0 break-words text-right text-sm tabular-nums",
            strong && "font-semibold",
            tone === "margin" && "text-gold-ink",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </span>
        {action}
      </dd>
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
  const baseRate = formatRate(s);
  const finalRate = copyRateText(line);
  const amount = copyAmountText(result);
  const hasMargin = result.marginPaise > 0n;
  const priced = result.amountPaise != null;
  const changes = current ? snapshotChanges(s, snapshotOf(current)) : [];
  const currentRate = current ? formatRate(snapshotOf(current)) : null;
  const fid = (f: string) => `${line.id}-${f}`;
  const set = (patch: Partial<CalcLine>) => onChange({ ...line, ...patch });

  const quantity = (() => {
    if (info.inputs === "area") return { label: "Area", value: result.billable ? `${result.billable} ${result.billableUnit}` : "—" };
    if (info.inputs === "length") return { label: "Length", value: result.billable ? `${result.billable} ${result.billableUnit}` : "—" };
    if (info.inputs === "quantity") return { label: "Quantity", value: result.billable ? `${result.billable} ${result.billableUnit}` : "—" };
    if (info.inputs === "base")
      return {
        label: "Calculation base",
        value: result.baseAmount != null ? formatMoney(result.baseAmount) : "—",
        sub: result.baseDescription ? `${result.baseDescription}${result.baseExcludesMargin ? " (before margin)" : ""}` : undefined,
      };
    return null;
  })();
  const rateLabel = info.inputs === "none" ? "Fixed charge" : info.inputs === "base" ? "Percentage" : hasMargin ? "Base rate" : "Unit rate";
  const baseAmountLabel = info.inputs === "base" ? "Percentage amount" : info.inputs === "none" ? "Base charge" : "Base amount";
  const minApplied = result.measured != null && result.billable != null && result.measured !== result.billable;
  // Blank fields on a new line are just "not entered yet", not an error.
  const fieldError = (f: keyof LineResult["fieldErrors"]) => (result.status === "invalid" ? result.fieldErrors[f] : undefined);
  const otherErrors = result.status !== "ok" && result.errors.length > 0 && !Object.keys(result.fieldErrors).length;

  return (
    <Card
      id={`line-${line.id}`}
      data-testid="rate-line"
      className={cn(
        "overflow-hidden shadow-card transition-[box-shadow,border-color,opacity] duration-200",
        warnings.length > 0 && "border-warning/40",
        highlighted && "ring-2 ring-warning/60",
        !line.included && "opacity-60",
      )}
    >
      <CardContent className="@container space-y-4 p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 px-1.5 text-xs font-semibold tabular-nums text-gold-ink">{index}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold leading-snug">{s.name}</p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{[s.categoryName, s.subcategory, info.label].filter(Boolean).join(" · ")}</p>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground" title="Include this item in the combined total">
            <Switch checked={line.included} onCheckedChange={(c) => set({ included: c })} aria-label="Include in total" />
            <span className="hidden @sm:inline">In total</span>
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Actions for ${s.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled={!finalRate} onSelect={() => copy(hasMargin ? "Final rate" : "Unit rate", finalRate)}>
                <Copy className="mr-2 h-4 w-4" /> {hasMargin ? "Copy final rate" : "Copy unit rate"}
              </DropdownMenuItem>
              {hasMargin && (
                <DropdownMenuItem disabled={!baseRate} onSelect={() => copy("Base rate", copyBaseRateText(line))}>
                  <Copy className="mr-2 h-4 w-4" /> Copy base rate
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={!amount} onSelect={() => copy(hasMargin ? "Final amount" : "Amount", amount)}>
                <Copy className="mr-2 h-4 w-4" /> {hasMargin ? "Copy final amount" : "Copy amount"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!amount} onSelect={() => copy("Item details", copyItemDetailsText(line, result))}>
                <ClipboardCopy className="mr-2 h-4 w-4" /> Copy item details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {line.margin.trim() !== "" && (
                <DropdownMenuItem onSelect={() => set({ margin: "" })}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset margin to ₹0
                </DropdownMenuItem>
              )}
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

        {/* Inputs */}
        {(info.inputs === "area" || info.inputs === "length") && (
          <div className="space-y-2">
            <div className={cn("grid items-start gap-2.5", info.inputs === "area" ? "grid-cols-2 @md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto] @md:max-w-sm")}>
              <MeasureInput id={fid("l")} label="Length" value={line.length} onChange={(v) => set({ length: v })} error={fieldError("length")} suffix={line.dimensionUnit} autoFocus={autoFocus} />
              {info.inputs === "area" && <MeasureInput id={fid("w")} label="Width" value={line.width} onChange={(v) => set({ width: v })} error={fieldError("width")} suffix={line.dimensionUnit} />}
              <UnitToggle id={line.id} value={line.dimensionUnit} onChange={(u) => set({ dimensionUnit: u })} />
            </div>
            {dimensionSources.length > 0 && (
              <Select
                value=""
                onValueChange={(id) => {
                  const src = dimensionSources.find((d) => d.line.id === id);
                  if (src) onChange(copyDimensions(src.line, line));
                }}
              >
                <SelectTrigger className="h-8 w-auto max-w-full gap-1.5 border-dashed text-xs text-muted-foreground" aria-label="Copy dimensions from another item">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Same dimensions as…</span>
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
            )}
          </div>
        )}
        {info.inputs === "quantity" && (
          <div className="@md:max-w-[220px]">
            <MeasureInput id={fid("q")} label="Quantity" value={line.quantity} onChange={(v) => set({ quantity: v })} error={fieldError("quantity")} suffix={s.unitLabel ?? undefined} autoFocus={autoFocus} />
          </div>
        )}
        {info.inputs === "base" && s.percentageBase === "manual" && (
          <div className="space-y-1 @md:max-w-[220px]">
            <Label htmlFor={fid("b")} className="text-xs font-medium text-muted-foreground">
              Base amount
            </Label>
            <MoneyInput id={fid("b")} value={line.baseAmount} onValueChange={(v) => set({ baseAmount: v })} autoFocus={autoFocus} className="h-10" />
            <FieldError message={fieldError("baseAmount")} />
          </div>
        )}

        <MarginField id={fid("m")} line={line} result={result} onChange={(margin) => set({ margin })} />

        {/* Pricing: rate side and amount side, stacked on phones */}
        {/* Two columns only when the card itself is wide enough (container query), not the window. */}
        <div className="@container">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 rounded-lg border bg-muted/25 @lg:grid-cols-2" data-testid="line-pricing">
            <dl className="min-w-0 px-3 py-2">
              {quantity && (
                <>
                  <Row label={quantity.label} value={quantity.value} tone={!result.billable && !result.baseAmount ? "muted" : undefined} testId="line-quantity" />
                  {quantity.sub && <p className="-mt-0.5 break-words pb-1 text-right text-xs text-muted-foreground">{quantity.sub}</p>}
                </>
              )}
              <Row
                label={rateLabel}
                value={baseRate ? breakable(baseRate) : "Not set"}
                tone={!baseRate ? "muted" : undefined}
                testId="line-base-rate"
                action={<CopyFigureButton label={hasMargin ? "Base rate" : "Unit rate"} text={baseRate} />}
              />
              <AnimatePresence initial={false}>
                {hasMargin && (
                  <motion.div {...reveal} className="overflow-hidden">
                    <Row label={result.marginKind === "flat" ? "Margin (flat)" : "Margin"} value={`+ ${breakableText(formatMargin(s, result.marginPaise))}`} tone="margin" testId="line-margin" />
                    {info.inputs !== "base" && (
                      <Row
                        label="Final rate"
                        value={finalRate ? breakable(finalRate) : "—"}
                        strong
                        testId="line-final-rate"
                        action={<CopyFigureButton label="Final rate" text={finalRate} />}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </dl>
            <dl className="min-w-0 border-t px-3 py-2 @lg:border-l @lg:border-t-0">
              <AnimatePresence initial={false}>
                {hasMargin && priced && (
                  <motion.div {...reveal} className="overflow-hidden">
                    <Row label={baseAmountLabel} value={formatPaise(result.basePaise!)} testId="line-base-amount" />
                    <Row label="Margin amount" value={`+ ${formatPaise(result.marginAmountPaise!)}`} tone="margin" testId="line-margin-amount" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex flex-wrap items-end justify-between gap-x-3 pt-1">
                <span className="pb-1 text-xs font-medium text-muted-foreground">{hasMargin ? "Final amount" : "Amount"}</span>
                <span className="ml-auto flex min-w-0 max-w-full items-center gap-0.5">
                  {priced ? (
                    <RollingMoney paise={result.amountPaise!} testId="line-amount" className="min-w-0 break-all text-right text-lg font-semibold tabular-nums leading-tight" />
                  ) : (
                    <span className="text-lg font-semibold text-muted-foreground" data-testid="line-amount" data-value="">
                      —
                    </span>
                  )}
                  <CopyFigureButton label={hasMargin ? "Final amount" : "Amount"} text={amount} />
                </span>
              </div>
            </dl>
          </div>
        </div>

        {/* Messages */}
        <AnimatePresence initial={false}>
          {otherErrors && (
            <motion.p
              {...reveal}
              className={cn("flex items-start gap-1.5 overflow-hidden text-xs", result.status === "invalid" ? "text-destructive" : "text-warning")}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="min-w-0 break-words">{result.errors.join(" ")}</span>
            </motion.p>
          )}
          {result.status === "incomplete" && Object.keys(result.fieldErrors).length > 0 && (
            <motion.p {...reveal} className="overflow-hidden text-xs text-muted-foreground">
              Enter the measurements to calculate this item. It isn't in the total yet.
            </motion.p>
          )}
        </AnimatePresence>
        {minApplied && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="min-w-0 break-words">{result.notes.join(" ")}</span>
          </p>
        )}
        {s.conditions && (
          <p className="flex items-start gap-1.5 rounded-md bg-warning/[0.07] px-2.5 py-2 text-xs text-warning">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="min-w-0 break-words">{s.conditions}</span>
          </p>
        )}
        <AnimatePresence initial={false}>
          {warnings.map((w) => (
            <motion.p
              key={w.key}
              {...reveal}
              className="flex items-start gap-1.5 overflow-hidden rounded-md border border-warning/30 bg-warning/[0.07] px-2.5 py-2 text-xs text-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="min-w-0 break-words">{w.message}</span>
            </motion.p>
          ))}
        </AnimatePresence>
        {current && !current.isActive && <p className="text-xs text-muted-foreground">This item has been deactivated in the catalog. The captured rate still applies here.</p>}
        {changes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 basis-48 break-words text-muted-foreground">
              The catalog has changed ({changes.join(", ")}).{" "}
              {changes.includes("rate") && currentRate ? (
                <>
                  Catalog rate is now <span className="font-medium text-foreground">{currentRate}</span>; this line keeps <span className="font-medium text-foreground">{baseRate ?? "no rate"}</span>.
                </>
              ) : (
                "This line keeps what it captured."
              )}
              {hasMargin && " Your margin stays as entered."}
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
              <motion.button
                key={a.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onAddItem(a)}
                className={cn("inline-flex max-w-full items-center gap-0.5 rounded-full border bg-card px-2.5 py-0.5 hover:border-primary/40 hover:text-foreground", focusRing)}
              >
                <Plus className="h-3 w-3 shrink-0" /> <span className="break-words text-left">{a.name}</span>
              </motion.button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Plain-text variant of breakable(), for values built into a template string. */
function breakableText(text: string): string {
  return text.replace(/\//g, "/​");
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

/** Fades and lifts a panel in when it becomes the visible one on phones. */
function usePanelEntrance(visible: boolean) {
  const [scope, animateEl] = useAnimate<HTMLDivElement>();
  const reduce = useReduceMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!visible || !scope.current || window.matchMedia("(min-width: 1280px)").matches) return;
    void animateEl(scope.current, reduce ? { opacity: [0, 1] } : { opacity: [0, 1], y: [8, 0] }, { duration: DURATION.base, ease: EASE_OUT });
  }, [visible, animateEl, scope, reduce]);
  return scope;
}

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
  const [copied, copyWithFeedback] = useCopyFeedback();
  const [lines, setLines] = useWorkspaceLines();
  const [panel, setPanel] = useState<Panel>("catalog");
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [refreshing, setRefreshing] = useState<CalcLine | null>(null);
  const reduce = useReduceMotion();

  const calc = useMemo(() => calculate(lines), [lines]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const relations = useMemo(() => relationsOf(items), [items]);
  const warnings = useMemo(() => bundleWarnings(lines, relations, new Map(items.map((i) => [i.id, i.name]))), [lines, relations, items]);

  const catalogRef = usePanelEntrance(panel === "catalog");
  const itemsRef = usePanelEntrance(panel === "items");
  const totalRef = usePanelEntrance(panel === "total");

  // From lg the total sits beside the list, so "total" is not a tab there.
  useEffect(() => {
    if (panel !== "total") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const leave = () => mq.matches && setPanel("items");
    leave();
    mq.addEventListener("change", leave);
    return () => mq.removeEventListener("change", leave);
  }, [panel]);

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
    window.setTimeout(() => document.getElementById(`line-${line.id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }), 80);
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
    window.setTimeout(() => document.getElementById(`line-${ids[0]}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }), 60);
  };

  // Preview of an explicit "use catalog values" refresh. The line's margin is kept.
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
      oldAmount: before ? (copyAmountText(before) ?? "—") : "—",
      newAmount: after ? (copyAmountText(after) ?? "—") : "—",
      changes: snapshotChanges(refreshing.snapshot, next.snapshot),
      hasMargin: (after?.marginPaise ?? 0n) > 0n,
    };
  }, [refreshing, itemsById, lines, calc]);

  const unpricedCount = calc.unpricedLineIds.length;
  const excludedCount = lines.length - calc.includedCount;
  const hasMargin = calc.totalMarginPaise > 0n;

  const summary = (
    <Card className="overflow-hidden shadow-card">
      <div className="relative border-b bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent px-4 pb-4 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-ink">Combined total</p>
        <RollingMoney
          paise={calc.totalPaise}
          testId="combined-total"
          className={cn("mt-1 block break-all font-semibold leading-tight tracking-tight tabular-nums", formatPaise(calc.totalPaise).length > 15 ? "text-2xl" : "text-[30px]")}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Sum of {calc.pricedCount} {hasMargin ? "final " : ""}item amount{calc.pricedCount === 1 ? "" : "s"}
          {lines.length > 0 && ` · ${lines.length} line${lines.length === 1 ? "" : "s"} selected`}
        </p>
      </div>
      <CardContent className="space-y-4 p-4">
        <dl className="divide-y text-sm">
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground">Base cost</dt>
            <dd className="text-right tabular-nums" data-testid="total-base">
              {formatPaise(calc.totalBasePaise)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground">Margin</dt>
            <dd className={cn("text-right tabular-nums", hasMargin ? "font-medium text-gold-ink" : "text-muted-foreground")} data-testid="total-margin">
              {hasMargin ? `+ ${formatPaise(calc.totalMarginPaise)}` : formatPaise(0n)}
            </dd>
          </div>
          {calc.areaTotals.map((a) => (
            <div key={a.unit} className="flex justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">Total area</dt>
              <dd className="text-right tabular-nums">
                {a.value} {a.unit}
              </dd>
            </div>
          ))}
        </dl>
        <AnimatePresence initial={false}>
          {(unpricedCount > 0 || excludedCount > 0) && (
            <motion.div {...reveal} className="space-y-1 overflow-hidden text-xs">
              {unpricedCount > 0 && (
                <button type="button" onClick={() => showLines(calc.unpricedLineIds)} className={cn("flex w-full items-start gap-1.5 rounded text-left text-warning hover:underline", focusRing)}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {unpricedCount} item{unpricedCount === 1 ? " has" : "s have"} no amount yet and {unpricedCount === 1 ? "is" : "are"} not in the total
                </button>
              )}
              {excludedCount > 0 && <p className="text-muted-foreground">{excludedCount} line{excludedCount === 1 ? " is" : "s are"} switched out of the total</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {warnings.length > 0 && (
            <motion.div {...reveal} className="space-y-1.5 overflow-hidden">
              <p className="text-xs font-medium text-warning">
                {warnings.length} combination warning{warnings.length === 1 ? "" : "s"}
              </p>
              {warnings.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => showLines(w.lineIds)}
                  className={cn("block w-full break-words rounded-md border border-warning/30 bg-warning/[0.07] px-2.5 py-2 text-left text-xs text-warning hover:bg-warning/[0.12]", focusRing)}
                >
                  {w.message} <span className="font-medium underline">Show items</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grid gap-2">
          <motion.div whileTap={calc.pricedCount === 0 ? undefined : { scale: 0.98 }}>
            <Button className="w-full" onClick={() => void copyWithFeedback("total", "Combined total", copyTotalText(calc))} disabled={calc.pricedCount === 0}>
              <CopyGlyph copied={copied === "total"} className="mr-1.5 h-4 w-4" /> {copied === "total" ? "Copied" : "Copy total"}
            </Button>
          </motion.div>
          <motion.div whileTap={calc.pricedCount === 0 ? undefined : { scale: 0.98 }}>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                void copyWithFeedback(
                  "full",
                  "Full calculation",
                  copyFullCalculationText(lines, calc),
                  unpricedCount > 0 || excludedCount > 0 ? `Includes the ${calc.pricedCount} item${calc.pricedCount === 1 ? "" : "s"} in the total` : undefined,
                )
              }
              disabled={calc.pricedCount === 0}
            >
              {copied === "full" ? <Check className="mr-1.5 h-4 w-4 text-success" /> : <ClipboardCopy className="mr-1.5 h-4 w-4" />}
              {copied === "full" ? "Copied" : "Copy full calculation"}
            </Button>
          </motion.div>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmClear(true)} disabled={lines.length === 0}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Clear calculation
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Internal rates only. The only addition is the margin you enter on each line; no GST, labour, transport or other charges are added, and nothing here is saved as a quotation or financial record.
        </p>
      </CardContent>
    </Card>
  );

  const dimensionLines = lines.map((l, i) => ({ line: l, index: i + 1 })).filter((x) => usesDimensions(x.line.snapshot.pricingMethod) && x.line.length.trim() !== "");
  const presentIds = new Set(lines.map((l) => l.snapshot.itemId));

  return (
    <div className="min-w-0 space-y-4">
      {/* Phones: one area at a time. Tablets/small laptops: catalog or items, with the total beside them. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:hidden">
        <LayoutGroup id="rc-panels">
          <div className="grid grid-cols-3 rounded-lg border bg-muted/40 p-0.5 text-sm lg:grid-cols-2" role="tablist" aria-label="Calculator sections">
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
                className={cn("relative min-w-0 truncate rounded-md px-1 py-1.5 transition-colors", panel === key ? "font-medium text-gold-ink" : "text-muted-foreground", key === "total" && "lg:hidden", focusRing)}
              >
                {panel === key && <motion.span layoutId="pill" className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-primary/25" transition={{ duration: DURATION.base, ease: EASE_OUT }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <div ref={catalogRef} className={cn("min-w-0 xl:sticky xl:top-0 xl:block", panel !== "catalog" && "hidden")}>
          <CatalogPanel items={items} categories={categories} isLoading={isLoading} error={error} onRetry={onRetry} onAdd={addItem} openForm={openForm} />
        </div>

        <div ref={itemsRef} className={cn("min-w-0 xl:block", panel !== "items" && "hidden")}>
          {lines.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No items in this calculation"
              description="Search the catalog and select items. Each one gets its own measurements, rate, margin and amount."
              action={
                <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setPanel("catalog")}>
                  <Search className="mr-1 h-3.5 w-3.5" /> Search catalog
                </Button>
              }
            />
          ) : (
            <div className="relative flex flex-col gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {lines.map((line, idx) => {
                  const result = calc.lines.get(line.id)!;
                  const current = itemsById.get(line.snapshot.itemId);
                  const addons = relations
                    .filter((r) => r.itemId === line.snapshot.itemId && r.relationType === "addon" && !presentIds.has(r.relatedItemId))
                    .map((r) => itemsById.get(r.relatedItemId))
                    .filter((i): i is RateItem => !!i && i.isActive);
                  return (
                    <motion.div
                      key={line.id}
                      layout="position"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: DURATION.fast } }}
                      transition={{ duration: DURATION.base, ease: EASE_OUT }}
                      className="min-w-0"
                    >
                      <LineCard
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
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <motion.div layout="position">
                <Button variant="outline" size="sm" className="w-full border-dashed xl:hidden" onClick={() => setPanel("catalog")}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add another item
                </Button>
              </motion.div>
            </div>
          )}
        </div>

        <div ref={totalRef} className={cn("min-w-0 lg:sticky lg:top-16 lg:block xl:top-0", panel !== "total" && "hidden")}>
          {summary}
        </div>
      </div>

      {/* Phone: the total stays in reach while working on items. */}
      <AnimatePresence>
        {panel !== "total" && lines.length > 0 && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-2 border-t glass-fill px-4 py-2.5 shadow-[var(--elev-2)] md:-mx-6 md:-mb-6 md:px-6 lg:hidden"
            data-testid="mobile-total-bar"
          >
            <button type="button" onClick={() => setPanel("total")} className={cn("min-w-0 flex-1 rounded text-left", focusRing)}>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-gold-ink">Combined total</span>
              <RollingMoney paise={calc.totalPaise} className="block truncate text-lg font-semibold tabular-nums" />
            </button>
            {warnings.length > 0 && (
              <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">
                <AlertTriangle className="mr-1 h-3 w-3" /> {warnings.length}
              </Badge>
            )}
            <Button size="sm" className="shrink-0" onClick={() => void copyWithFeedback("bar", "Combined total", copyTotalText(calc))} disabled={calc.pricedCount === 0}>
              <CopyGlyph copied={copied === "bar"} className="mr-1 h-3.5 w-3.5" /> {copied === "bar" ? "Copied" : "Copy"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this calculation?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes all {lines.length} line{lines.length === 1 ? "" : "s"} (and their margins) from this calculation. The catalog is not affected.
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
                  {refreshing?.snapshot.name}: {refreshPreview?.changes.join(", ")} will change. Measurements{refreshPreview?.hasMargin ? " and margin" : ""} stay as entered.
                </p>
                {refreshPreview && (
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-2 gap-y-1 rounded-md bg-muted/60 p-2 tabular-nums">
                    <span>Base rate</span>
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
