import { useMemo, useState } from "react";
import { Clock, PenLine, Plus, Search, Star, X } from "lucide-react";
import { OBJECT_CATEGORIES, OBJECT_DEFS, OBJECT_TYPES, objectParts, makeObject, type ObjectCategory, type ObjectType } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dropPoint, placeCustomObject, placeObject, useStore } from "./commands";
import { useEditor } from "./store";
import { placementFor, type BuilderRequest, type ParsedLibraryObject } from "./builder-types";
import { CustomObjectCard, ObjectThumb, customThumb, useCustomObjectActions, useCustomObjects } from "./custom-library";
import { cachedThumbnail } from "./thumbnail";

// The object library: built-in objects (searchable, by category, with
// previews drawn from their real geometry, favourites and recents) and
// My Custom Objects saved from the Custom Builder.

const BUILT_IN = OBJECT_TYPES.filter((t) => t !== "custom");
const RECENT_KEY = "auron.designStudio.recentObjects";
const FAV_KEY = "auron.designStudio.favouriteObjects";
const RECENT_MAX = 8;

function readList(key: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* private mode or storage full: favourites just aren't remembered */
  }
}

function builtInThumb(t: ObjectType) {
  return cachedThumbnail(`type:${t}`, () => {
    const o = makeObject(t, 0, 0);
    return { parts: objectParts(o), color: o.color, accentColor: o.accentColor };
  });
}

function matches(t: ObjectType, q: string): boolean {
  const d = OBJECT_DEFS[t];
  return [d.label, d.description, d.category, ...d.keywords].some((s) => s.toLowerCase().includes(q));
}

type Tab = "built-in" | "custom";
type Filter = "all" | "favourites" | ObjectCategory;

export function ObjectLibrary({
  open,
  onOpenChange,
  side,
  onOpenBuilder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side: "left" | "bottom";
  onOpenBuilder: (req: BuilderRequest) => void;
}) {
  const store = useStore();
  const options = useEditor(store, (s) => s.toolOptions);
  const [tab, setTab] = useState<Tab>("built-in");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => readList(RECENT_KEY));
  const [favs, setFavs] = useState<string[]>(() => readList(FAV_KEY));
  const custom = useCustomObjects();
  const actions = useCustomObjectActions();

  const q = query.trim().toLowerCase();
  const remember = (key: string) => {
    const next = [key, ...recents.filter((k) => k !== key)].slice(0, RECENT_MAX);
    setRecents(next);
    writeList(RECENT_KEY, next);
  };
  const toggleFav = (key: string) => {
    const next = favs.includes(key) ? favs.filter((k) => k !== key) : [key, ...favs];
    setFavs(next);
    writeList(FAV_KEY, next);
  };

  const pickBuiltIn = (type: ObjectType, now: boolean) => {
    remember(`t:${type}`);
    if (now) {
      placeObject(store, type, dropPoint(store));
      store.setTool("select");
    } else store.setTool("object", { objectType: type, custom: null });
    onOpenChange(false);
  };
  const pickCustom = (entry: ParsedLibraryObject, now: boolean) => {
    if (!entry.definition) return;
    remember(`c:${entry.item.id}`);
    const placement = placementFor(entry.item, entry.definition);
    if (now) {
      placeCustomObject(store, placement, dropPoint(store));
      store.setTool("select");
    } else store.setTool("object", { custom: placement });
    onOpenChange(false);
  };
  const openBuilder = (req: BuilderRequest) => {
    onOpenChange(false);
    onOpenBuilder(req);
  };

  const visible = useMemo(() => {
    let list = BUILT_IN;
    if (q) list = list.filter((t) => matches(t, q));
    if (filter === "favourites") list = list.filter((t) => favs.includes(`t:${t}`));
    else if (filter !== "all") list = list.filter((t) => OBJECT_DEFS[t].category === filter);
    return list;
  }, [q, filter, favs]);

  const customVisible = useMemo(() => {
    if (!q) return custom.items;
    return custom.items.filter(({ item }) => [item.name, item.category, item.description ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [custom.items, q]);

  const recentTypes = recents.filter((k) => k.startsWith("t:")).map((k) => k.slice(2) as ObjectType).filter((t) => OBJECT_DEFS[t] && t !== "custom");
  const recentCustom = recents.filter((k) => k.startsWith("c:")).map((k) => custom.items.find((e) => `c:${e.item.id}` === k)).filter((e): e is ParsedLibraryObject => !!e?.definition);
  const showRecent = !q && filter === "all" && tab === "built-in" && (recentTypes.length > 0 || recentCustom.length > 0);
  const groups = filter === "all" && !q ? OBJECT_CATEGORIES.filter((c) => visible.some((t) => OBJECT_DEFS[t].category === c)) : null;
  const currentKey = options.custom ? `c:${options.custom.libraryId}` : `t:${options.objectType}`;

  const card = (t: ObjectType) => {
    const d = OBJECT_DEFS[t];
    const key = `t:${t}`;
    const fav = favs.includes(key);
    return (
      <li key={t} className={cn("relative flex flex-col rounded-xl border bg-card", currentKey === key && "border-primary/60 bg-primary/5")}>
        <button type="button" className="flex min-h-[8.5rem] flex-1 flex-col items-stretch gap-1.5 p-2 text-left" onClick={() => pickBuiltIn(t, false)} data-object={t} aria-label={`Place ${d.label}: tap the plan after choosing`}>
          <ObjectThumb thumb={builtInThumb(t)} label={d.label} className="aspect-[4/3] w-full" />
          <span className="text-sm font-medium leading-tight">{d.label}</span>
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{d.description}</span>
        </button>
        <button
          type="button"
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:text-slate-900"
          onClick={() => toggleFav(key)}
          aria-pressed={fav}
          aria-label={fav ? `Remove ${d.label} from favourites` : `Add ${d.label} to favourites`}
        >
          <Star className={cn("h-4 w-4", fav && "fill-primary text-primary")} />
        </button>
        <div className="px-2 pb-2">
          <Button variant="outline" size="sm" className="h-10 w-full" onClick={() => pickBuiltIn(t, true)} aria-label={`Add ${d.label} to the middle of the view`}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </li>
    );
  };

  const grid = (types: ObjectType[]) => <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2">{types.map(card)}</ul>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn("flex flex-col gap-0 p-0", side === "bottom" ? "h-[85dvh] rounded-t-2xl" : "w-[26rem] max-w-[92vw]")} data-testid="object-library">
        <SheetHeader className="space-y-1 px-4 pb-3 pt-4 text-left">
          <SheetTitle>Objects</SheetTitle>
          <SheetDescription>Choose an object, then tap the plan to place it, or use Add to put it in the middle of the view.</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 border-b px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects" aria-label="Search objects" className="h-11 pl-9 pr-10 text-base" data-testid="library-search" />
            {query && (
              <button type="button" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Object library">
            {(["built-in", "custom"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={cn("h-10 rounded-md text-sm font-medium", tab === t ? "bg-background shadow-sm" : "text-muted-foreground")}
                onClick={() => setTab(t)}
                data-testid={`library-tab-${t}`}
              >
                {t === "built-in" ? "Built-in" : `My Custom Objects${custom.items.length ? ` (${custom.items.length})` : ""}`}
              </button>
            ))}
          </div>
          {tab === "built-in" && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" aria-label="Categories">
              {(["all", "favourites", ...OBJECT_CATEGORIES] as Filter[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn("h-9 shrink-0 rounded-full border px-3 text-xs font-medium", filter === c ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
                  onClick={() => setFilter(c)}
                  aria-pressed={filter === c}
                >
                  {c === "all" ? "All" : c === "favourites" ? "★ Favourites" : c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {tab === "built-in" && (
            <div className="space-y-5">
              {showRecent && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1 text-eyebrow font-semibold uppercase text-muted-foreground">
                    <Clock className="h-3 w-3" /> Recent
                  </h3>
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                    {recentTypes.map((t) => (
                      <button key={t} type="button" className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card p-1.5" onClick={() => pickBuiltIn(t, false)} aria-label={`Place ${OBJECT_DEFS[t].label}`}>
                        <ObjectThumb thumb={builtInThumb(t)} label={OBJECT_DEFS[t].label} className="h-12 w-full" />
                        <span className="line-clamp-2 text-center text-[10px] leading-tight">{OBJECT_DEFS[t].label}</span>
                      </button>
                    ))}
                    {recentCustom.map((e) => (
                      <button key={e.item.id} type="button" className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card p-1.5" onClick={() => pickCustom(e, false)} aria-label={`Place ${e.item.name}`}>
                        <span className="h-12 w-full text-[10px] text-muted-foreground">
                          <CustomMiniThumb entry={e} />
                        </span>
                        <span className="line-clamp-2 text-center text-[10px] leading-tight">{e.item.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center" data-testid="library-empty">
                  <p className="text-sm font-medium">{filter === "favourites" && !q ? "No favourites yet" : "No built-in objects match"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {filter === "favourites" && !q ? "Tap the star on any object to keep it here." : "Try another word, or draw it yourself in the Custom Builder."}
                  </p>
                  {!(filter === "favourites" && !q) && (
                    <Button className="mt-3 h-11" variant="outline" onClick={() => openBuilder({ kind: "new" })}>
                      <PenLine className="mr-1.5 h-4 w-4" /> Open Custom Builder
                    </Button>
                  )}
                </div>
              ) : groups ? (
                groups.map((c) => (
                  <section key={c}>
                    <h3 className="mb-2 text-eyebrow font-semibold uppercase text-muted-foreground">{c}</h3>
                    {grid(visible.filter((t) => OBJECT_DEFS[t].category === c))}
                  </section>
                ))
              ) : (
                grid(visible)
              )}
            </div>
          )}

          {tab === "custom" && (
            <div className="space-y-3">
              <Button className="h-11 w-full" onClick={() => openBuilder({ kind: "new" })} data-testid="new-custom-object">
                <PenLine className="mr-1.5 h-4 w-4" /> Create in Custom Builder
              </Button>
              {custom.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
                  ))}
                </div>
              ) : custom.error ? (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">Couldn't load your custom objects</p>
                  <Button variant="outline" className="mt-3 h-11" onClick={() => void custom.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : customVisible.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center" data-testid="custom-empty">
                  <p className="text-sm font-medium">{q ? "No custom objects match" : "No custom objects yet"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {q ? "Try another word." : "Draw a shape or start from an exact-size template, then save it here to reuse it in any design."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {customVisible.map((e) => (
                    <CustomObjectCard
                      key={e.item.id}
                      entry={e}
                      selected={currentKey === `c:${e.item.id}`}
                      onPick={() => pickCustom(e, false)}
                      onAdd={() => pickCustom(e, true)}
                      onEdit={() => openBuilder({ kind: "library", item: e.item })}
                      actions={actions}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {actions.dialogs}
      </SheetContent>
    </Sheet>
  );
}

function CustomMiniThumb({ entry }: { entry: ParsedLibraryObject }) {
  return <ObjectThumb thumb={customThumb(entry)} label={entry.item.name} className="h-full w-full" />;
}
