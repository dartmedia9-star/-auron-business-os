import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, PenLine, RefreshCw, Undo2 } from "lucide-react";
import { getListDesignObjectsQueryKey, useCreateDesignObject, useUpdateDesignObject } from "@workspace/api-client-react";
import { CUSTOM_LIMITS, customSpecSchema, type CustomSpec, type DesignObject, type ProjectModel } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { LengthField, PanelSection, ToggleRow } from "./fields";
import { definitionFromSpec, plainError, sameJson, useOpenBuilder } from "./builder-types";
import { useCustomObjects } from "./custom-library";

// Inspector section for a placed custom object. Edits here change this
// object only (its own copy of the recipe); the library entry changes only
// through the explicit "Update library definition" action.

type Patch = (p: Record<string, unknown>, key?: string) => void;

const METHOD_LABEL: Record<CustomSpec["method"], string> = {
  extrude: "Extruded outline",
  panel: "Panel",
  frame: "Beam frame",
  assembly: "Assembly of parts",
  flat: "Flat outline",
};

export function describeSpec(spec: CustomSpec): string {
  switch (spec.method) {
    case "extrude":
      return `${spec.profiles.length} outline${spec.profiles.length === 1 ? "" : "s"} drawn in ${spec.plane === "front" ? "front view" : "plan"}, extruded`;
    case "panel":
      return `${spec.profiles.length} outline${spec.profiles.length === 1 ? "" : "s"}, ${spec.feet ? "on feet" : "no feet"}`;
    case "flat":
      return `${spec.profiles.length} outline${spec.profiles.length === 1 ? "" : "s"} on the floor`;
    case "frame":
      return `${spec.segments.length} member${spec.segments.length === 1 ? "" : "s"}, ${spec.round ? "round" : "square"} section`;
    case "assembly":
      return `${spec.parts.length} part${spec.parts.length === 1 ? "" : "s"}${spec.template ? ` (from the ${spec.template.id.replace("_", " ")} template)` : ""}`;
  }
}

export function CustomObjectFields({ o, model, patch }: { o: DesignObject; model: ProjectModel; patch: Patch }) {
  const spec = o.custom;
  const unit = model.settings.displayUnit;
  const openBuilder = useOpenBuilder();
  const { toast } = useToast();
  const qc = useQueryClient();
  const library = useCustomObjects();
  const create = useCreateDesignObject();
  const update = useUpdateDesignObject();
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  if (!spec) return null;

  const libraryId = typeof o.props.libraryId === "number" ? o.props.libraryId : null;
  const entry = libraryId != null ? library.items.find((e) => e.item.id === libraryId) : undefined;
  const differs = !!entry?.definition && (!sameJson(entry.definition.spec, spec) || !sameJson(entry.definition.finishes ?? {}, o.finishes ?? {}));

  const setSpec = (next: CustomSpec, key: string) => {
    const r = customSpecSchema.safeParse(next);
    if (!r.success) {
      toast({ title: "That value can't be used", description: r.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    patch({ custom: r.data }, `${o.id}:custom:${key}`);
  };

  const saveNew = () =>
    create.mutate(
      { data: { name: o.name.slice(0, 120) || "Custom object", category: "Other", definition: definitionFromSpec(spec, o.color, o.accentColor, 0, o.finishes) } },
      {
        onSuccess: (item) => {
          void qc.invalidateQueries({ queryKey: getListDesignObjectsQueryKey() });
          patch({ props: { ...o.props, libraryId: item.id, libraryRevision: item.revision } });
          toast({ title: "Saved to My Custom Objects", description: item.name });
        },
        onError: (err) => toast({ title: "Couldn't save", description: plainError(err), variant: "destructive" }),
      },
    );

  const updateLibrary = () => {
    if (!entry) return;
    update.mutate(
      { id: entry.item.id, data: { baseRevision: entry.item.revision, definition: definitionFromSpec(spec, o.color, o.accentColor, entry.definition?.elevation ?? 0, o.finishes) } },
      {
        onSuccess: (item) => {
          setConfirmUpdate(false);
          void qc.invalidateQueries({ queryKey: getListDesignObjectsQueryKey() });
          patch({ props: { ...o.props, libraryRevision: item.revision } });
          toast({ title: "Library definition updated", description: "Objects already placed in other designs keep their own copy." });
        },
        onError: (err) => {
          setConfirmUpdate(false);
          const conflict = (err as { status?: number }).status === 409;
          if (conflict) void qc.invalidateQueries({ queryKey: getListDesignObjectsQueryKey() });
          toast({ title: "Couldn't update the library", description: conflict ? "Someone else changed it first. The library has been refreshed; try again." : plainError(err), variant: "destructive" });
        },
      },
    );
  };

  const resetToLibrary = () => {
    if (!entry?.definition) return;
    patch({ custom: entry.definition.spec, finishes: entry.definition.finishes, props: { ...o.props, libraryRevision: entry.item.revision } });
  };

  return (
    <PanelSection title="Custom object">
      <div className="rounded-lg bg-muted/50 p-3 text-xs" data-testid="custom-summary">
        <p className="font-medium text-foreground">{METHOD_LABEL[spec.method]}</p>
        <p className="mt-0.5 text-muted-foreground">{describeSpec(spec)}</p>
        <p className="mt-1 text-muted-foreground">
          {libraryId == null ? "Not saved in My Custom Objects." : entry ? (differs ? `Changed here; “${entry.item.name}” in the library is unchanged.` : `Same as “${entry.item.name}” in the library.`) : library.isLoading ? "Checking the library…" : "Its library entry was deleted; this copy still works."}
        </p>
      </div>

      {spec.method === "frame" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <LengthField label="Beam size" valueMm={spec.section} unit={unit} min={1} onCommit={(section) => setSpec({ ...spec, section }, "section")} />
            <LengthField label={spec.plane === "front" ? "Overall depth" : "Height"} valueMm={spec.depth} unit={unit} allowZero onCommit={(depth) => setSpec({ ...spec, depth }, "depth")} hint={spec.plane === "front" ? "0 = a single flat frame" : undefined} />
          </div>
          <ToggleRow label="Round tube" checked={spec.round} onChange={(round) => setSpec({ ...spec, round }, "round")} />
          <ToggleRow label="Panel infill" checked={spec.infill} onChange={(infill) => setSpec({ ...spec, infill }, "infill")} />
        </>
      )}
      {spec.method === "extrude" && <LengthField label={spec.plane === "front" ? "Extrusion depth" : "Extrusion height"} valueMm={spec.depth} unit={unit} min={1} onCommit={(depth) => setSpec({ ...spec, depth }, "depth")} />}
      {spec.method === "panel" && (
        <>
          <LengthField label="Thickness" valueMm={spec.thickness} unit={unit} min={1} onCommit={(thickness) => setSpec({ ...spec, thickness }, "thickness")} />
          <ToggleRow label="Feet" checked={spec.feet} onChange={(feet) => setSpec({ ...spec, feet }, "feet")} />
        </>
      )}
      {spec.method === "flat" && <LengthField label="Thickness" valueMm={spec.thickness} unit={unit} min={1} onCommit={(thickness) => setSpec({ ...spec, thickness: Math.min(500, thickness) }, "thickness")} />}
      {spec.method === "assembly" && <p className="text-xs text-muted-foreground">Edit the individual parts in the Custom Builder. Width, depth and height above resize the whole object.</p>}

      <div className="grid gap-2">
        {openBuilder && (
          <Button
            variant="outline"
            className="h-11 justify-start"
            data-testid="edit-in-builder"
            onClick={() => openBuilder({ kind: "instance", objectId: o.id, name: o.name, spec, color: o.color, accentColor: o.accentColor, libraryId, finishes: o.finishes })}
          >
            <PenLine className="mr-2 h-4 w-4" /> Edit in Custom Builder
          </Button>
        )}
        {libraryId == null || (!entry && !library.isLoading) ? (
          <Button variant="outline" className="h-11 justify-start" onClick={saveNew} disabled={create.isPending} data-testid="save-to-library">
            <BookmarkPlus className="mr-2 h-4 w-4" /> Save to My Custom Objects
          </Button>
        ) : (
          entry &&
          differs && (
            <>
              <Button variant="outline" className="h-11 justify-start" onClick={() => setConfirmUpdate(true)} disabled={update.isPending} data-testid="update-library">
                <RefreshCw className="mr-2 h-4 w-4" /> Update library definition
              </Button>
              <Button variant="ghost" className="h-11 justify-start" onClick={resetToLibrary}>
                <Undo2 className="mr-2 h-4 w-4" /> Reset to the library version
              </Button>
            </>
          )
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Up to {CUSTOM_LIMITS.parts} parts or {CUSTOM_LIMITS.segments} beam members per object.</p>

      <AlertDialog open={confirmUpdate} onOpenChange={setConfirmUpdate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update “{entry?.item.name}” in the library?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved definition is replaced with this object's shape and colours, so new placements use it. Objects already placed in this or other designs keep their own copy and don't change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={(e) => {
                e.preventDefault();
                updateLibrary();
              }}
            >
              Update library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelSection>
  );
}
