import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, MoreHorizontal, Pencil, PenLine, Trash2 } from "lucide-react";
import {
  getListDesignObjectsQueryKey,
  useDeleteDesignObject,
  useDuplicateDesignObject,
  useListDesignObjects,
  useUpdateDesignObject,
} from "@workspace/api-client-react";
import { customParts, type Part } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseLibraryObject, plainError, type LibraryObject, type ParsedLibraryObject } from "./builder-types";
import { cachedThumbnail, type Thumb } from "./thumbnail";

// "My Custom Objects": the saved library list, its thumbnails and the
// duplicate / rename / delete actions, shared by the editor's object library
// and the Design Studio home page.

export function useCustomObjects() {
  const query = useListDesignObjects();
  const parsed = useMemo(() => (query.data ?? []).map(parseLibraryObject), [query.data]);
  return { ...query, items: parsed };
}

export function ObjectThumb({ thumb, className, label }: { thumb: Thumb | null; className?: string; label: string }) {
  return (
    // A light backdrop in both themes so dark finishes (stage decks, counter tops) stay readable.
    <span className={cn("flex items-center justify-center overflow-hidden rounded-lg bg-[#e6e9ef] dark:bg-[#c9ced8]", className)} aria-hidden>
      {thumb ? (
        <svg viewBox={thumb.viewBox} className="h-full w-full" role="img" aria-label={label}>
          {thumb.polys.map((p, i) => (
            <path key={i} d={p.d} fill={p.fill} fillOpacity={p.opacity} stroke="rgba(15,23,42,0.28)" strokeWidth={0.3} strokeLinejoin="round" />
          ))}
        </svg>
      ) : (
        <span className="text-[10px] text-slate-600">No preview</span>
      )}
    </span>
  );
}

export function customThumb(p: ParsedLibraryObject): Thumb | null {
  const d = p.definition;
  if (!d) return null;
  return cachedThumbnail(`lib:${p.item.id}:${p.item.revision}`, () => {
    let parts: Part[] = [];
    try {
      parts = customParts(d.spec);
    } catch {
      parts = [];
    }
    return { parts, color: d.color, accentColor: d.accentColor };
  });
}

/** Duplicate, rename and delete (with confirmation) for saved custom objects. */
export function useCustomObjectActions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [renaming, setRenaming] = useState<LibraryObject | null>(null);
  const [deleting, setDeleting] = useState<LibraryObject | null>(null);
  const duplicate = useDuplicateDesignObject();
  const update = useUpdateDesignObject();
  const remove = useDeleteDesignObject();
  const refresh = () => qc.invalidateQueries({ queryKey: getListDesignObjectsQueryKey() });

  const onDuplicate = (item: LibraryObject) =>
    duplicate.mutate(
      { id: item.id, data: {} },
      {
        onSuccess: (copy) => {
          void refresh();
          toast({ title: "Custom object duplicated", description: copy.name });
        },
        onError: (err) => toast({ title: "Couldn't duplicate", description: plainError(err), variant: "destructive" }),
      },
    );

  const dialogs = (
    <>
      <RenameDialog
        item={renaming}
        busy={update.isPending}
        onClose={() => setRenaming(null)}
        onSave={(name) => {
          if (!renaming) return;
          const item = renaming;
          update.mutate(
            { id: item.id, data: { baseRevision: item.revision, name } },
            {
              onSuccess: () => {
                setRenaming(null);
                void refresh();
                toast({ title: "Renamed", description: name });
              },
              onError: (err) => {
                const conflict = (err as { status?: number }).status === 409;
                toast({ title: "Couldn't rename", description: conflict ? "Someone else changed this object. The list has been refreshed; try again." : plainError(err), variant: "destructive" });
                if (conflict) void refresh();
              },
            },
          );
        }}
      />
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from My Custom Objects for everyone. Designs that already use it keep their copy and still open and export normally. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-custom"
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                const item = deleting;
                remove.mutate(
                  { id: item.id },
                  {
                    onSuccess: () => {
                      setDeleting(null);
                      void refresh();
                      toast({ title: "Custom object deleted", description: item.name });
                    },
                    onError: (err) => toast({ title: "Couldn't delete", description: plainError(err), variant: "destructive" }),
                  },
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { onDuplicate, onRename: setRenaming, onDelete: setDeleting, dialogs };
}

function RenameDialog({ item, busy, onClose, onSave }: { item: LibraryObject | null; busy: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => setName(item?.name ?? ""), [item]);
  const clean = name.trim();
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (clean) onSave(clean.slice(0, 120));
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename custom object</DialogTitle>
            <DialogDescription>Designs that already use it keep the name they were given.</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-1.5">
            <Label htmlFor="custom-rename">Name</Label>
            <Input id="custom-rename" className="h-11 text-base" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={!clean || busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One saved custom object: preview, name, and its actions. */
export function CustomObjectCard({
  entry,
  onAdd,
  onPick,
  onEdit,
  actions,
  selected,
}: {
  entry: ParsedLibraryObject;
  onAdd?: () => void;
  onPick?: () => void;
  onEdit: () => void;
  actions: ReturnType<typeof useCustomObjectActions>;
  selected?: boolean;
}) {
  const { item, definition, error } = entry;
  const thumb = useMemo(() => customThumb(entry), [entry]);
  return (
    <li className={cn("flex items-center gap-2 rounded-xl border bg-card p-2", selected && "border-primary/60 bg-primary/5")} data-custom-object={item.id}>
      <button type="button" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60" onClick={onPick ?? onEdit} disabled={!definition && !!onPick}>
        <ObjectThumb thumb={thumb} label={item.name} className="h-14 w-14 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{error ? "This saved object can't be read. Open it to repair it." : item.description || item.category}</span>
        </span>
      </button>
      {onAdd && (
        <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={onAdd} disabled={!definition} aria-label={`Add ${item.name} to the middle of the view`}>
          Add
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={`More actions for ${item.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-10" onSelect={onEdit}>
            <PenLine className="mr-2 h-4 w-4" /> Edit in Custom Builder
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={() => actions.onDuplicate(item)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={() => actions.onRename(item)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-10 text-destructive focus:text-destructive" onSelect={() => actions.onDelete(item)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
