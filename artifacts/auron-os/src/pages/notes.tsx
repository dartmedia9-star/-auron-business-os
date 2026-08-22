import { useMemo, useState } from "react";
import {
  useListNotes,
  getListNotesQueryKey,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "@workspace/api-client-react";
import type { Note } from "@workspace/api-client-react";
import { formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Search, RotateCcw, Pin, PinOff, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type PinFilter = "all" | "pinned" | "unpinned";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

export default function NotesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPin, setFilterPin] = useState<PinFilter>("all");

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Form state
  const [noteContent, setNoteContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const { data, isLoading } = useListNotes(undefined, {
    query: { queryKey: getListNotesQueryKey() }
  });
  const notes = useMemo(() => data ?? [], [data]);

  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
  };

  const resetForm = () => {
    setNoteContent("");
    setIsPinned(false);
  };

  const openEdit = (note: Note) => {
    setSelectedNote(note);
    setNoteContent(note.content);
    setIsPinned(note.is_pinned);
    setEditOpen(true);
  };

  const handleCreate = () => {
    const content = noteContent.trim();
    if (!content) {
      toast({ title: "Validation Error", description: "Note content is required", variant: "destructive" });
      return;
    }
    createNote.mutate({
      data: { content, is_pinned: isPinned },
    }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Note created" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to create note", description: errorMessage(err), variant: "destructive" }),
    });
  };

  const handleUpdate = () => {
    if (!selectedNote) return;
    const content = noteContent.trim();
    if (!content) {
      toast({ title: "Validation Error", description: "Note content is required", variant: "destructive" });
      return;
    }
    updateNote.mutate({
      id: selectedNote.id,
      data: { content, is_pinned: isPinned },
    }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Note updated" });
        setEditOpen(false);
        setSelectedNote(null);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to update note", description: errorMessage(err), variant: "destructive" }),
    });
  };

  // Pin/unpin straight from the row — one tap toggle.
  const togglePin = (note: Note) => {
    updateNote.mutate({
      id: note.id,
      data: { is_pinned: !note.is_pinned },
    }, {
      onSuccess: () => {
        invalidate();
        toast({ title: note.is_pinned ? "Note unpinned" : "Note pinned" });
      },
      onError: (err) => toast({ title: "Failed to update note", description: errorMessage(err), variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!selectedNote) return;
    deleteNote.mutate({ id: selectedNote.id }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Note deleted" });
        setDeleteOpen(false);
        setSelectedNote(null);
      },
      onError: (err) => toast({ title: "Failed to delete note", description: errorMessage(err), variant: "destructive" }),
    });
  };

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes
      .filter((note) => {
        if (q && !note.content.toLowerCase().includes(q)) return false;
        if (filterPin === "pinned" && !note.is_pinned) return false;
        if (filterPin === "unpinned" && note.is_pinned) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [notes, searchQuery, filterPin]);

  const isFiltered = searchQuery.trim() !== "" || filterPin !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setFilterPin("all");
  };

  const FormFields = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Content *</Label>
        <Textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Enter note content..."
          rows={4}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-sm">Pinned</span>
      </label>
    </div>
  );

  const NoteActions = ({ note }: { note: Note }) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", note.is_pinned ? "text-primary hover:text-primary" : "text-muted-foreground")}
        title={note.is_pinned ? "Unpin" : "Pin"}
        onClick={() => togglePin(note)}
      >
        {note.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(note)} title="Edit">
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => { setSelectedNote(note); setDeleteOpen(true); }}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notes</h2>
          <p className="text-muted-foreground mt-1">Quick reminders, ideas, and follow-ups.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Note
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notes..."
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterPin} onValueChange={(v) => setFilterPin(v as PinFilter)}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Notes</SelectItem>
                  <SelectItem value="pinned">Pinned</SelectItem>
                  <SelectItem value="unpinned">Unpinned</SelectItem>
                </SelectContent>
              </Select>
              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Reset filters"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading notes...</div>
          ) : filteredNotes.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <StickyNote className="h-8 w-8 opacity-40" />
              {isFiltered ? "No notes match your filters." : "No notes recorded."}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotes.map((note) => (
                      <TableRow key={note.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(note.created_at)}</TableCell>
                        <TableCell className="max-w-md">
                          <span className="whitespace-pre-wrap break-words">{note.content}</span>
                        </TableCell>
                        <TableCell>
                          {note.is_pinned ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                              <Pin className="h-3 w-3" /> Pinned
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded bg-muted text-muted-foreground text-xs">Active</span>
                          )}
                        </TableCell>
                        <TableCell><NoteActions note={note} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {filteredNotes.map((note) => (
                  <div key={note.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                      {note.is_pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                          <Pin className="h-3 w-3" /> Pinned
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                    <NoteActions note={note} />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          {FormFields}
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createNote.isPending}>
              {createNote.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          {FormFields}
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateNote.isPending}>
              {updateNote.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteNote.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNote.isPending ? "Deleting..." : "Delete Note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
