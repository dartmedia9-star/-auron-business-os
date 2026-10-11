import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Edit, FolderPlus, Pencil, Plus, Power, PowerOff, Search, Tags, Trash2, X } from "lucide-react";
import {
  getListRateCategoriesQueryKey,
  getListRateItemsQueryKey,
  useCreateRateCategory,
  useDeleteRateCategory,
  useUpdateRateCategory,
  useUpdateRateItem,
  type RateCategory,
  type RateItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, ErrorState, TableSkeleton, errorMessage } from "@/components/ds/states";
import { useToast } from "@/hooks/use-toast";
import { PRICING_METHOD_INFO, formatRate } from "@/lib/rate-calculator";
import { cn } from "@/lib/utils";
import { searchScore, snapshotOf } from "./shared";
import type { ItemFormMode } from "./item-form";

/* Manage the master catalog: categories and items. Items are deactivated, never deleted. */

function CategoriesCard({ categories }: { categories: RateCategory[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateRateCategory();
  const update = useUpdateRateCategory();
  const remove = useDeleteRateCategory();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<RateCategory | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListRateCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRateItemsQueryKey() });
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { data: { name: n } },
      {
        onSuccess: (c) => {
          refresh();
          setName("");
          toast({ title: "Category added", description: c.name, duration: 1800 });
        },
        onError: (err) => toast({ title: "Couldn't add category", description: errorMessage(err), variant: "destructive" }),
      },
    );
  };

  const rename = () => {
    if (!editing) return;
    const n = editing.name.trim();
    if (!n) return;
    update.mutate(
      { id: editing.id, data: { name: n } },
      {
        onSuccess: () => {
          refresh();
          setEditing(null);
          toast({ title: "Category renamed", description: n, duration: 1800 });
        },
        onError: (err) => toast({ title: "Couldn't rename category", description: errorMessage(err), variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(
      { id: deleting.id },
      {
        onSuccess: () => {
          refresh();
          toast({ title: "Category deleted", description: deleting.name, duration: 1800 });
          setDeleting(null);
        },
        onError: (err) => {
          toast({ title: "Couldn't delete category", description: errorMessage(err), variant: "destructive" });
          setDeleting(null);
        },
      },
    );
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="h-4 w-4 text-gold-ink" /> Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={80} aria-label="New category name" />
          <Button type="submit" size="icon" aria-label="Add category" loading={create.isPending} disabled={!name.trim()}>
            {!create.isPending && <FolderPlus className="h-4 w-4" />}
          </Button>
        </form>
        {categories.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No categories yet. Add the first one above.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === c.id ? (
                  <form
                    className="flex flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <Input autoFocus className="h-8" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} />
                    <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Save name" loading={update.isPending}>
                      {!update.isPending && <Check className="h-4 w-4" />}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancel" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {c.activeItemCount}
                      {c.itemCount !== c.activeItemCount ? ` / ${c.itemCount}` : ""} item{c.itemCount === 1 ? "" : "s"}
                    </span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Delete ${c.name}`}
                      disabled={c.itemCount > 0}
                      title={c.itemCount > 0 ? "Only empty categories can be deleted" : undefined}
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Only empty categories can be deleted.</p>
      </CardContent>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This category has no items. It will be removed from the catalog.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function CatalogManager({
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateItem = useUpdateRateItem();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [toggling, setToggling] = useState<RateItem | null>(null);

  const filtered = useMemo(() => {
    return items
      .filter((i) => (status === "all" ? true : status === "active" ? i.isActive : !i.isActive))
      .filter((i) => category === "all" || String(i.categoryId) === category)
      .map((i) => ({ i, s: searchScore(i, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name))
      .map((x) => x.i);
  }, [items, query, category, status]);

  const confirmToggle = () => {
    if (!toggling) return;
    const next = !toggling.isActive;
    updateItem.mutate(
      { id: toggling.id, data: { isActive: next } },
      {
        onSuccess: (item) => {
          queryClient.invalidateQueries({ queryKey: getListRateItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListRateCategoriesQueryKey() });
          toast({ title: next ? "Item reactivated" : "Item deactivated", description: item.name, duration: 1800 });
          setToggling(null);
        },
        onError: (err) => {
          toast({ title: "Couldn't update item", description: errorMessage(err), variant: "destructive" });
          setToggling(null);
        },
      },
    );
  };

  const actions = (i: RateItem) => (
    <div className="flex items-center justify-end gap-0.5">
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${i.name}`} title="Edit" onClick={() => openForm({ kind: "edit", item: i })}>
        <Edit className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Duplicate ${i.name}`} title="Duplicate" onClick={() => openForm({ kind: "duplicate", item: i })}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label={i.isActive ? `Deactivate ${i.name}` : `Reactivate ${i.name}`}
        title={i.isActive ? "Deactivate" : "Reactivate"}
        onClick={() => setToggling(i)}
      >
        {i.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="shadow-card">
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Master rate items</CardTitle>
            <Button size="sm" onClick={() => openForm({ kind: "create", categoryId: category !== "all" ? Number(category) : undefined })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add item
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_140px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, alias, category" aria-label="Search catalog" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : error ? (
            <ErrorState compact title="Couldn't load the catalog" error={error} onRetry={onRetry} />
          ) : items.length === 0 ? (
            <EmptyState
              compact
              icon={Tags}
              title="Your rate catalog is empty"
              description="Create your master rate items first. Nothing is pre-loaded: every item, rate and category is yours to set."
              action={
                <Button size="sm" onClick={() => openForm({ kind: "create" })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add your first item
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState compact icon={Search} title="No items match" description="Change the search or filters." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Pricing</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => (
                      <TableRow key={i.id} className={cn(!i.isActive && "opacity-60")}>
                        <TableCell>
                          <div className="font-medium">
                            {i.name} {!i.isActive && <Badge variant="outline" className="ml-1 text-[10px]">Inactive</Badge>}
                          </div>
                          {i.aliases.length > 0 && <div className="truncate text-xs text-muted-foreground">{i.aliases.join(", ")}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {i.categoryName}
                          {i.subcategory && <span className="text-muted-foreground"> · {i.subcategory}</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {PRICING_METHOD_INFO[i.pricingMethod].label}
                          {i.relations.length > 0 && <span className="ml-1 text-xs">· {i.relations.length} rule{i.relations.length === 1 ? "" : "s"}</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatRate(snapshotOf(i)) ?? <span className="text-sm font-normal text-amber-700 dark:text-amber-400">No rate set</span>}
                        </TableCell>
                        <TableCell>{actions(i)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y md:hidden">
                {filtered.map((i) => (
                  <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", !i.isActive && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {i.name} {!i.isActive && <Badge variant="outline" className="ml-1 text-[10px]">Inactive</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.categoryName} · {PRICING_METHOD_INFO[i.pricingMethod].label}
                      </p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums">{formatRate(snapshotOf(i)) ?? "No rate set"}</p>
                    </div>
                    {actions(i)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      <div>
        <CategoriesCard categories={categories} />
      </div>

      <AlertDialog open={!!toggling} onOpenChange={(o) => !o && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggling?.isActive ? `Deactivate “${toggling?.name}”?` : `Reactivate “${toggling?.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.isActive
                ? "It stays in the catalog but no longer appears in the calculator search. Calculations that already include it keep their captured rate. You can reactivate it any time."
                : "It will appear in the calculator search again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateItem.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmToggle();
              }}
              disabled={updateItem.isPending}
            >
              {toggling?.isActive ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
