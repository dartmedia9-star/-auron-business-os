import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, DraftingCompass, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  getListDesignProjectsQueryKey,
  useCreateDesignProject,
  useDeleteDesignProject,
  useDuplicateDesignProject,
  getListClientsQueryKey,
  useListClients,
  useListDesignProjects,
  useUpdateDesignProject,
  type DesignProjectSummary,
} from "@workspace/api-client-react";
import { createEmptyModel, DISPLAY_UNITS, UNIT_LABELS, type DisplayUnit } from "@workspace/design-model";
import { getDefaultUnit, setDefaultUnit } from "@/components/design-studio/unit-menu";
import { CustomObjectsSection } from "@/components/design-studio/custom-objects-section";
import { PageHeader } from "@/components/ds/page-header";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/ds/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

// Design Studio home: every hall layout the team has drawn, newest first.

export default function DesignStudioList() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useListDesignProjects();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<DesignProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<DesignProjectSummary | null>(null);

  const duplicate = useDuplicateDesignProject();
  const remove = useDeleteDesignProject();
  const refresh = () => qc.invalidateQueries({ queryKey: getListDesignProjectsQueryKey() });

  const projects = useMemo(() => {
    const list = data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((p) => [p.name, p.venueName, p.clientName, p.eventName].some((v) => v?.toLowerCase().includes(s)));
  }, [data, q]);

  const onDuplicate = (p: DesignProjectSummary) =>
    duplicate.mutate(
      { id: p.id, data: { name: `${p.name} (copy)`.slice(0, 200) } },
      {
        onSuccess: (copy) => {
          void refresh();
          toast({ title: "Design duplicated", description: copy.name });
        },
        onError: (err) => toast({ title: "Couldn't duplicate", description: err.message, variant: "destructive" }),
      },
    );

  const onDelete = () => {
    if (!deleting) return;
    const p = deleting;
    remove.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          setDeleting(null);
          void refresh();
          toast({ title: "Design deleted", description: p.name });
        },
        onError: (err) => toast({ title: "Couldn't delete", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design Studio"
        description="Measured hall layouts in 2D and 3D, ready to share with clients."
        icon={DraftingCompass}
        actions={
          <Button className="h-11" onClick={() => setCreateOpen(true)} data-testid="new-design">
            <Plus className="mr-2 h-4 w-4" /> New design
          </Button>
        }
      />

      {(data?.length ?? 0) > 4 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, venue or client" className="h-11 pl-9 text-[16px] md:text-sm" aria-label="Search designs" />
        </div>
      )}

      {isLoading ? (
        <CardsSkeleton count={6} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={DraftingCompass}
          title="No designs yet"
          description="Start with the hall's measurements, then add the stage, screens and sections."
          action={
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New design
            </Button>
          }
        />
      ) : projects.length === 0 ? (
        <EmptyState compact title="No matches" description={`Nothing matches “${q}”.`} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="design-list">
          {projects.map((p) => (
            <li key={p.id} className="glass-fill group relative rounded-2xl border border-[hsl(var(--glass-border))] transition-shadow hover:shadow-[var(--elev-2)]">
              <Link href={`/design-studio/${p.id}`} className="block rounded-2xl p-4 pr-14 outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`design-${p.id}`}>
                <p className="truncate text-base font-semibold">{p.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{[p.venueName, p.clientName].filter(Boolean).join(" · ") || "No venue or client yet"}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {p.roomCount} {p.roomCount === 1 ? "room" : "rooms"} · {p.objectCount} {p.objectCount === 1 ? "object" : "objects"}
                  {p.eventName ? ` · ${p.eventName}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Edited {formatDistanceToNowStrict(new Date(p.updatedAt), { addSuffix: true })}
                  {p.updatedByName ? ` by ${p.updatedByName}` : ""}
                </p>
              </Link>
              <div className="absolute right-2 top-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for ${p.name}`}>
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-11" onSelect={() => navigate(`/design-studio/${p.id}`)}>
                      <DraftingCompass className="mr-2 h-4 w-4" /> Open
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11" onSelect={() => setRenaming(p)}>
                      <Pencil className="mr-2 h-4 w-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11" onSelect={() => onDuplicate(p)}>
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={() => setDeleting(p)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CustomObjectsSection />

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => navigate(`/design-studio/${id}`)} />
      <RenameDialog project={renaming} onClose={() => setRenaming(null)} onDone={() => void refresh()} />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The floor plan, 3D layout, notes and checklist are removed for everyone. This can't be undone. Exported PDFs you already shared are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={remove.isPending}
              data-testid="confirm-delete"
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const create = useCreateDesignProject();
  const clients = useListClients({ limit: 200, sortBy: "name" }, { query: { enabled: open, queryKey: getListClientsQueryKey({ limit: 200, sortBy: "name" }) } });
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [client, setClient] = useState("");
  const [unit, setUnit] = useState<DisplayUnit>(getDefaultUnit);
  const clientList = clients.data?.data ?? [];

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const match = clientList.find((c) => c.name.trim().toLowerCase() === client.trim().toLowerCase());
    create.mutate(
      {
        data: {
          name: n,
          venueName: venue.trim() || null,
          clientName: match ? null : client.trim() || null,
          clientId: match?.id ?? null,
          model: createEmptyModel({ venueName: venue.trim(), title: n, client: match?.name ?? client.trim(), displayUnit: unit }) as unknown as Record<string, unknown>,
        },
      },
      {
        onSuccess: (p) => {
          setDefaultUnit(unit);
          onOpenChange(false);
          setName("");
          setVenue("");
          setClient("");
          onCreated(p.id);
        },
        onError: (err) => toast({ title: "Couldn't create the design", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New design</DialogTitle>
          <DialogDescription>You can change all of this later.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="dp-name">Design name</Label>
            <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Sharma wedding – main hall" className="h-11 text-[16px] md:text-sm" autoFocus data-testid="design-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-venue">Venue</Label>
            <Input id="dp-venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} placeholder="Hotel or hall name" className="h-11 text-[16px] md:text-sm" data-testid="design-venue" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-client">Client</Label>
            <Input id="dp-client" value={client} onChange={(e) => setClient(e.target.value)} maxLength={200} list="dp-clients" placeholder="Pick an existing client or type a name" className="h-11 text-[16px] md:text-sm" autoComplete="off" />
            <datalist id="dp-clients">
              {clientList.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-unit">Units</Label>
            <select id="dp-unit" value={unit} onChange={(e) => setUnit(e.target.value as DisplayUnit)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-[16px] md:text-sm" data-testid="design-unit">
              {DISPLAY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Remembered for your next design. You can switch any time without changing sizes.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={!name.trim() || create.isPending} data-testid="create-design">
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create and open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ project, onClose, onDone }: { project: DesignProjectSummary | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const update = useUpdateDesignProject();
  const [name, setName] = useState("");
  const [shownFor, setShownFor] = useState<number | null>(null);
  if (project && shownFor !== project.id) {
    setShownFor(project.id);
    setName(project.name);
  }
  const submit = () => {
    if (!project || !name.trim()) return;
    update.mutate(
      { id: project.id, data: { baseRevision: project.revision, name: name.trim() } },
      {
        onSuccess: () => {
          onDone();
          onClose();
          setShownFor(null);
        },
        onError: (err) => {
          const conflict = (err as { status?: number }).status === 409;
          toast({ title: "Couldn't rename", description: conflict ? "Someone saved this design a moment ago. Refresh and try again." : err.message, variant: "destructive" });
          if (conflict) onDone();
        },
      },
    );
  };
  return (
    <Dialog
      open={!!project}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setShownFor(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename design</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="h-11 text-[16px] md:text-sm" autoFocus aria-label="Design name" data-testid="rename-input" />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={!name.trim() || update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
