import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  getListRateCategoriesQueryKey,
  getListRateItemsQueryKey,
  useCreateRateCategory,
  useCreateRateItem,
  useUpdateRateItem,
  type RateCategory,
  type RateItem,
  type RateItemInput,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ds/money-input";
import { errorMessage } from "@/components/ds/states";
import { useToast } from "@/hooks/use-toast";
import {
  PERCENTAGE_BASE_INFO,
  PERCENTAGE_BASES,
  PRICING_METHOD_INFO,
  PRICING_METHODS,
  RELATION_INFO,
  RELATION_TYPES,
  parseDecimal,
  type PercentageBase,
  type PricingMethod,
  type RelationType,
} from "@/lib/rate-calculator";

/*
 * Add / edit / duplicate a master rate item. Every field is entered by the
 * person; nothing is pre-filled from a rate card. Changing a rate here only
 * affects items added to a calculation afterwards.
 */

type RelationRow = { key: string; relatedItemId: string; relationType: RelationType; note: string };

interface FormState {
  name: string;
  categoryId: string;
  subcategory: string;
  description: string;
  aliases: string;
  rate: string;
  pricingMethod: PricingMethod;
  unitLabel: string;
  percentageBase: PercentageBase | "";
  percentageBaseItemIds: number[];
  defaultLength: string;
  defaultWidth: string;
  defaultQuantity: string;
  defaultDimensionUnit: "ft" | "m" | "";
  minBillable: string;
  maxBillable: string;
  conditions: string;
  notes: string;
  isActive: boolean;
  relations: RelationRow[];
}

const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));
let relKey = 0;
const nextKey = () => `r${++relKey}`;

function emptyForm(name = "", categoryId = ""): FormState {
  return {
    name,
    categoryId,
    subcategory: "",
    description: "",
    aliases: "",
    rate: "",
    pricingMethod: "per_sqft",
    unitLabel: "",
    percentageBase: "",
    percentageBaseItemIds: [],
    defaultLength: "",
    defaultWidth: "",
    defaultQuantity: "",
    defaultDimensionUnit: "",
    minBillable: "",
    maxBillable: "",
    conditions: "",
    notes: "",
    isActive: true,
    relations: [],
  };
}

function formFromItem(item: RateItem, nameOverride?: string): FormState {
  return {
    name: nameOverride ?? item.name,
    categoryId: String(item.categoryId),
    subcategory: item.subcategory ?? "",
    description: item.description ?? "",
    aliases: (item.aliases ?? []).join(", "),
    rate: str(item.rate),
    pricingMethod: item.pricingMethod,
    unitLabel: item.unitLabel ?? "",
    percentageBase: item.percentageBase ?? "",
    percentageBaseItemIds: [...(item.percentageBaseItemIds ?? [])],
    defaultLength: str(item.defaultLength),
    defaultWidth: str(item.defaultWidth),
    defaultQuantity: str(item.defaultQuantity),
    defaultDimensionUnit: item.defaultDimensionUnit ?? "",
    minBillable: str(item.minBillable),
    maxBillable: str(item.maxBillable),
    conditions: item.conditions ?? "",
    notes: item.notes ?? "",
    isActive: item.isActive,
    relations: (item.relations ?? []).map((r) => ({ key: nextKey(), relatedItemId: String(r.relatedItemId), relationType: r.relationType, note: r.note ?? "" })),
  };
}

export type ItemFormMode =
  | { kind: "create"; name?: string; categoryId?: number }
  | { kind: "edit"; item: RateItem }
  | { kind: "duplicate"; item: RateItem };

/** Parses an optional measurement field; returns undefined for blank, or an error message. */
function optionalNumber(raw: string, label: string, opts: { dp: number; positive?: boolean }): { value: number | null } | { error: string } {
  if (raw.trim() === "") return { value: null };
  const p = parseDecimal(raw, opts.dp);
  if (!p.ok) {
    if (p.reason === "negative") return { error: `${label} can't be negative` };
    if (p.reason === "precision") return { error: `${label} can have at most ${opts.dp} decimals` };
    return { error: `${label} must be a number` };
  }
  const n = Number(raw.replace(/[₹,\s]/g, ""));
  if (opts.positive && n === 0) return { error: `${label} must be greater than 0` };
  return { value: n };
}

export function ItemFormDialog({
  mode,
  onClose,
  categories,
  items,
  onSaved,
}: {
  mode: ItemFormMode | null;
  onClose: () => void;
  categories: RateCategory[];
  items: RateItem[];
  onSaved?: (item: RateItem) => void;
}) {
  const open = mode !== null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createItem = useCreateRateItem();
  const updateItem = useUpdateRateItem();
  const createCategory = useCreateRateCategory();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    setNewCategory(null);
    if (mode.kind === "create") {
      const fallbackCategory = mode.categoryId ?? (categories.length === 1 ? categories[0].id : undefined);
      setForm(emptyForm(mode.name ?? "", fallbackCategory ? String(fallbackCategory) : ""));
    } else if (mode.kind === "edit") {
      setForm(formFromItem(mode.item));
    } else {
      setForm(formFromItem(mode.item, `${mode.item.name} (copy)`));
    }
    // Only when the dialog opens with a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const editingId = mode?.kind === "edit" ? mode.item.id : null;
  const info = PRICING_METHOD_INFO[form.pricingMethod];
  const isPct = form.pricingMethod === "percentage";
  const otherItems = useMemo(() => items.filter((i) => i.id !== editingId), [items, editingId]);
  const baseCandidates = useMemo(() => otherItems.filter((i) => i.pricingMethod !== "percentage"), [otherItems]);

  const saving = createItem.isPending || updateItem.isPending;

  const addCategory = () => {
    const name = newCategory?.trim();
    if (!name) return;
    createCategory.mutate(
      { data: { name } },
      {
        onSuccess: (cat) => {
          queryClient.invalidateQueries({ queryKey: getListRateCategoriesQueryKey() });
          set("categoryId", String(cat.id));
          setNewCategory(null);
          toast({ title: "Category added", description: cat.name, duration: 1800 });
        },
        onError: (err) => toast({ title: "Couldn't add category", description: errorMessage(err), variant: "destructive" }),
      },
    );
  };

  const buildPayload = (): RateItemInput | string => {
    if (!form.name.trim()) return "Enter the item name";
    if (!form.categoryId) return "Choose a category";
    const rate = optionalNumber(form.rate, isPct ? "Percentage" : "Rate", { dp: 2 });
    if ("error" in rate) return rate.error;
    if (isPct && rate.value != null && rate.value > 1000) return "Percentage can be at most 1000";
    if (isPct && !form.percentageBase) return "Choose what the percentage is calculated on";
    if (isPct && form.percentageBase === "selected_items" && form.percentageBaseItemIds.length === 0) {
      return "Choose at least one item the percentage is calculated on";
    }
    const fields = {
      defaultLength: optionalNumber(form.defaultLength, "Default length", { dp: 4, positive: true }),
      defaultWidth: optionalNumber(form.defaultWidth, "Default width", { dp: 4, positive: true }),
      defaultQuantity: optionalNumber(form.defaultQuantity, "Default quantity", { dp: 4, positive: true }),
      minBillable: optionalNumber(form.minBillable, "Minimum", { dp: 4 }),
      maxBillable: optionalNumber(form.maxBillable, "Maximum", { dp: 4, positive: true }),
    };
    for (const f of Object.values(fields)) if ("error" in f) return f.error;
    const v = (k: keyof typeof fields) => (fields[k] as { value: number | null }).value;
    const min = v("minBillable");
    const max = v("maxBillable");
    if (min != null && max != null && min > max) return "Minimum can't be greater than maximum";
    const relations = form.relations.filter((r) => r.relatedItemId);
    return {
      name: form.name.trim(),
      categoryId: Number(form.categoryId),
      subcategory: form.subcategory.trim() || null,
      description: form.description.trim() || null,
      aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      rate: rate.value,
      pricingMethod: form.pricingMethod,
      unitLabel: form.unitLabel.trim() || null,
      percentageBase: isPct ? (form.percentageBase as PercentageBase) : null,
      percentageBaseItemIds: isPct && form.percentageBase === "selected_items" ? form.percentageBaseItemIds : [],
      defaultLength: v("defaultLength"),
      defaultWidth: v("defaultWidth"),
      defaultQuantity: v("defaultQuantity"),
      defaultDimensionUnit: form.defaultDimensionUnit || null,
      minBillable: min,
      maxBillable: max,
      conditions: form.conditions.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
      relations: relations.map((r) => ({ relatedItemId: Number(r.relatedItemId), relationType: r.relationType, note: r.note.trim() || null })),
    };
  };

  const submit = () => {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    const done = (item: RateItem, verb: string) => {
      queryClient.invalidateQueries({ queryKey: getListRateItemsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListRateCategoriesQueryKey() });
      toast({ title: `Item ${verb}`, description: item.name, duration: 1800 });
      onSaved?.(item);
      onClose();
    };
    const fail = (err: unknown) => setError(errorMessage(err));
    if (mode?.kind === "edit") {
      updateItem.mutate({ id: mode.item.id, data: payload }, { onSuccess: (item) => done(item, "updated"), onError: fail });
    } else {
      createItem.mutate({ data: payload }, { onSuccess: (item) => done(item, "added"), onError: fail });
    }
  };

  const title = mode?.kind === "edit" ? "Edit item" : mode?.kind === "duplicate" ? "Duplicate item" : "Add item";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode?.kind === "edit"
              ? "Changes apply to items added to a calculation from now on. Calculations already in progress keep the rate they captured."
              : "A master rate item you can search and add to any calculation."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ri-name">Item name *</Label>
              <Input id="ri-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. the name you search for" autoFocus maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              {newCategory === null ? (
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => (v === "__new__" ? setNewCategory("") : set("categoryId", v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={categories.length ? "Choose a category" : "No categories yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ New category…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="New category name"
                    maxLength={80}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setNewCategory(null);
                      }
                    }}
                  />
                  <Button type="button" size="sm" className="h-9" onClick={addCategory} loading={createCategory.isPending} disabled={!newCategory.trim()}>
                    Add
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setNewCategory(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ri-sub">Subcategory</Label>
              <Input id="ri-sub" value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="Optional" maxLength={80} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ri-aliases">Search aliases and keywords</Label>
              <Input id="ri-aliases" value={form.aliases} onChange={(e) => set("aliases", e.target.value)} placeholder="Comma separated, e.g. other names people use" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ri-desc">Description</Label>
              <Textarea id="ri-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">Pricing</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pricing unit and calculation *</Label>
                <Select value={form.pricingMethod} onValueChange={(v) => set("pricingMethod", v as PricingMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PRICING_METHOD_INFO[m].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Amount = {info.formula}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ri-rate">{isPct ? "Percentage" : form.pricingMethod === "fixed" ? "Fixed amount" : "Unit rate"}</Label>
                {isPct ? (
                  <div className="relative">
                    <Input
                      id="ri-rate"
                      inputMode="decimal"
                      value={form.rate}
                      onChange={(e) => set("rate", e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="e.g. 10"
                      className="pr-8 tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                ) : (
                  <MoneyInput id="ri-rate" value={form.rate} onValueChange={(v) => set("rate", v)} />
                )}
                <p className="text-xs text-muted-foreground">Leave blank if you don't have a rate yet; the calculator will say it's missing.</p>
              </div>
              {form.pricingMethod === "per_unit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ri-unit">Unit name</Label>
                  <Input id="ri-unit" value={form.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="e.g. piece, chair, day" maxLength={30} />
                </div>
              )}
              {isPct && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Calculated on *</Label>
                  <Select value={form.percentageBase} onValueChange={(v) => set("percentageBase", v as PercentageBase)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose the calculation base" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERCENTAGE_BASES.map((b) => (
                        <SelectItem key={b} value={b}>
                          {PERCENTAGE_BASE_INFO[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.percentageBase === "selected_items" && (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
                      {baseCandidates.length === 0 ? (
                        <p className="p-2 text-sm text-muted-foreground">Create the items this percentage applies to first.</p>
                      ) : (
                        baseCandidates.map((i) => {
                          const checked = form.percentageBaseItemIds.includes(i.id);
                          return (
                            <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  set(
                                    "percentageBaseItemIds",
                                    c ? [...form.percentageBaseItemIds, i.id] : form.percentageBaseItemIds.filter((id) => id !== i.id),
                                  )
                                }
                              />
                              <span className="min-w-0 flex-1 truncate">{i.name}</span>
                              <span className="text-xs text-muted-foreground">{i.categoryName}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Other percentage items are never part of a base.</p>
                </div>
              )}
            </div>
          </section>

          {info.inputs !== "none" && info.inputs !== "base" && (
            <section className="space-y-4">
              <p className="text-sm font-medium">Defaults and limits <span className="font-normal text-muted-foreground">(optional)</span></p>
              <div className="grid gap-4 sm:grid-cols-3">
                {(info.inputs === "area" || info.inputs === "length") && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ri-dl">Default length</Label>
                      <Input id="ri-dl" inputMode="decimal" value={form.defaultLength} onChange={(e) => set("defaultLength", e.target.value)} />
                    </div>
                    {info.inputs === "area" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="ri-dw">Default width</Label>
                        <Input id="ri-dw" inputMode="decimal" value={form.defaultWidth} onChange={(e) => set("defaultWidth", e.target.value)} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Measured in</Label>
                      <Select value={form.defaultDimensionUnit || "auto"} onValueChange={(v) => set("defaultDimensionUnit", v === "auto" ? "" : (v as "ft" | "m"))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Same as pricing unit</SelectItem>
                          <SelectItem value="ft">Feet</SelectItem>
                          <SelectItem value="m">Metres</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {info.inputs === "quantity" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ri-dq">Default quantity</Label>
                    <Input id="ri-dq" inputMode="decimal" value={form.defaultQuantity} onChange={(e) => set("defaultQuantity", e.target.value)} />
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ri-min">Minimum billable {info.inputs === "area" ? "area" : info.inputs === "length" ? "length" : "quantity"}</Label>
                  <Input id="ri-min" inputMode="decimal" value={form.minBillable} onChange={(e) => set("minBillable", e.target.value)} />
                  <p className="text-xs text-muted-foreground">Smaller measurements are billed at this minimum, with a visible note.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ri-max">Maximum allowed</Label>
                  <Input id="ri-max" inputMode="decimal" value={form.maxBillable} onChange={(e) => set("maxBillable", e.target.value)} />
                  <p className="text-xs text-muted-foreground">Larger measurements are rejected with a message.</p>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ri-cond">Pricing conditions or warnings</Label>
              <Textarea id="ri-cond" rows={2} value={form.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="Shown on the item in the calculator" maxLength={1000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ri-notes">Internal notes</Label>
              <Textarea id="ri-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Bundles and combinations</p>
                <p className="text-xs text-muted-foreground">Only what you set here triggers warnings. Nothing is inferred from item names.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={otherItems.length === 0}
                onClick={() => set("relations", [...form.relations, { key: nextKey(), relatedItemId: "", relationType: "includes", note: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add rule
              </Button>
            </div>
            {form.relations.length > 0 && (
              <div className="space-y-2">
                {form.relations.map((r, idx) => (
                  <div key={r.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[180px_1fr_auto]">
                    <Select
                      value={r.relationType}
                      onValueChange={(v) => set("relations", form.relations.map((x, i) => (i === idx ? { ...x, relationType: v as RelationType } : x)))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {RELATION_INFO[t].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.relatedItemId}
                      onValueChange={(v) => set("relations", form.relations.map((x, i) => (i === idx ? { ...x, relatedItemId: v } : x)))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose item" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherItems.map((i) => (
                          <SelectItem key={i.id} value={String(i.id)}>
                            {i.name} · {i.categoryName}
                            {i.isActive ? "" : " (inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove rule"
                      onClick={() => set("relations", form.relations.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Input
                      className="sm:col-span-3"
                      value={r.note}
                      onChange={(e) => set("relations", form.relations.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)))}
                      placeholder="Note shown with the warning (optional)"
                      maxLength={300}
                    />
                    <p className="text-xs text-muted-foreground sm:col-span-3">{RELATION_INFO[r.relationType].help}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">Inactive items are kept but hidden from the calculator search.</span>
            </span>
            <Switch checked={form.isActive} onCheckedChange={(c) => set("isActive", c)} />
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {mode?.kind === "edit" ? "Save changes" : "Save item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
