import { Suspense, lazy, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BuilderRequest } from "./builder-types";
import { CustomObjectCard, useCustomObjectActions, useCustomObjects } from "./custom-library";

const CustomBuilder = lazy(() => import("./custom-builder"));

/** "My Custom Objects" on the Design Studio home page: manage the library and open the Custom Builder. */
export function CustomObjectsSection() {
  const { items, isLoading, error, refetch } = useCustomObjects();
  const actions = useCustomObjectActions();
  const [builder, setBuilder] = useState<BuilderRequest | null>(null);
  return (
    <section className="space-y-3" aria-labelledby="custom-objects-heading" data-testid="custom-objects-section">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="custom-objects-heading" className="text-lg font-semibold">
            My Custom Objects
          </h2>
          <p className="text-sm text-muted-foreground">Draw your own structures once and place them in any design.</p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => setBuilder({ kind: "new" })} data-testid="open-builder">
          <PenLine className="mr-2 h-4 w-4" /> Custom Builder
        </Button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed p-4 text-sm">
          Couldn't load your custom objects.{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No custom objects yet. Open the Custom Builder to draw one or start from an exact-size template.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => (
            <CustomObjectCard key={e.item.id} entry={e} onEdit={() => setBuilder({ kind: "library", item: e.item })} actions={actions} />
          ))}
        </ul>
      )}
      {actions.dialogs}
      {builder && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening the Custom Builder…
            </div>
          }
        >
          <CustomBuilder request={builder} onClose={() => setBuilder(null)} />
        </Suspense>
      )}
    </section>
  );
}
