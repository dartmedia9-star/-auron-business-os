import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, CheckCircle2, Copy, FileText, ImagePlus, Images, Loader2, MoreHorizontal, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { getListDesignAssetsQueryKey, useDeleteDesignAsset, useListDesignAssets, useRenameDesignAsset, type DesignAsset } from "@workspace/api-client-react";
import { sniffKind } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { assetFileUrl, assetThumbUrl, checkImage, makeThumbnail, uploadAsset, type UploadMeta } from "./asset-upload";
import { plainError } from "./builder-types";
import type { PdfDoc, PdfImage, PdfPageImages } from "./pdf-import";

// Images for the Design Studio: import designer artwork (PNG, JPEG, WebP,
// or PDFs, from which pages and embedded images can be taken), see them in a
// gallery, rename, delete, and pick one for a surface or a reference drawing.
// Files are checked and decoded in the browser, then uploaded in pieces to
// our own server. Nothing is sent to any outside service.

export const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf";
const MAX_READ_BYTES = 100 * 1024 * 1024;

export function useAssets() {
  return useListDesignAssets({ query: { queryKey: getListDesignAssetsQueryKey(), staleTime: 30_000 } });
}

export function AssetThumb({ asset, className, fit = "contain" }: { asset: Pick<DesignAsset, "id" | "name" | "hasThumb">; className?: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("flex items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f8fafc_0%_50%)] bg-[length:16px_16px]", className)}>
      {failed ? (
        <span className="px-1 text-center text-[10px] text-slate-600">Image unavailable</span>
      ) : (
        <img src={asset.hasThumb ? assetThumbUrl(asset.id) : assetFileUrl(asset.id)} alt={asset.name} loading="lazy" decoding="async" className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")} onError={() => setFailed(true)} draggable={false} />
      )}
    </span>
  );
}

const kindLabel = (a: DesignAsset) => (a.kind === "pdf-page" ? `PDF page${a.sourcePage ? ` ${a.sourcePage}` : ""}` : a.kind === "pdf-image" ? `From PDF${a.sourcePage ? `, page ${a.sourcePage}` : ""}` : "Image");
const baseName = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 200) || "Image";

// ------------------------------------------------------------ importing ----

type QueueItem = { id: string; name: string; state: "working" | "done" | "duplicate" | "error"; detail: string; fraction: number; assetId?: number };

/** Checks, previews and uploads one image (from a file or out of a PDF). */
async function importImageBytes(bytes: Uint8Array, meta: UploadMeta, onProgress: (fraction: number, detail: string) => void) {
  onProgress(0, "Checking…");
  const checked = await checkImage(bytes);
  if (!checked.ok) throw new Error(checked.error);
  const thumb = await makeThumbnail(checked.bitmap).catch(() => null);
  checked.bitmap.close();
  return uploadAsset(bytes, meta, thumb, {
    onProgress: (p) => onProgress(p.fraction, p.phase === "uploading" ? `Uploading ${Math.round(p.fraction * 100)}%` : p.phase === "finishing" ? "Saving…" : "Checking…"),
  });
}

function useImporter(onPdf: (bytes: Uint8Array, name: string) => void, onImported?: (asset: DesignAsset) => void) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const patch = (id: string, p: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const runImage = useCallback(
    async (bytes: Uint8Array, meta: UploadMeta) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setQueue((q) => [{ id, name: meta.name, state: "working" as const, detail: "Checking…", fraction: 0 }, ...q].slice(0, 30));
      try {
        const { asset, existed } = await importImageBytes(bytes, meta, (fraction, detail) => patch(id, { fraction, detail }));
        patch(id, { state: existed ? "duplicate" : "done", detail: existed ? `Already in your images as "${asset.name}"` : `${asset.width} × ${asset.height} px`, fraction: 1, assetId: asset.id });
        await qc.invalidateQueries({ queryKey: getListDesignAssetsQueryKey() });
        onImported?.(asset);
        return asset;
      } catch (err) {
        patch(id, { state: "error", detail: plainError(err), fraction: 1 });
        return null;
      }
    },
    [qc, onImported],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_READ_BYTES) {
          setQueue((q) => [{ id: `${Date.now()}${file.name}`, name: file.name, state: "error" as const, detail: `The file is ${(file.size / 1048576).toFixed(0)} MB, too large to import.`, fraction: 1 }, ...q]);
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (sniffKind(bytes) === "pdf") onPdf(bytes, file.name || "Document.pdf");
        else await runImage(bytes, { name: baseName(file.name || "Pasted image"), kind: "image", sourceName: file.name || null });
      }
    },
    [onPdf, runImage],
  );

  return { queue, setQueue, addFiles, runImage };
}

function QueueList({ queue, onClear }: { queue: QueueItem[]; onClear: () => void }) {
  if (!queue.length) return null;
  const busy = queue.some((q) => q.state === "working");
  return (
    <div className="space-y-1.5 rounded-xl border bg-card/60 p-2" data-testid="import-queue" aria-live="polite">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium">{busy ? "Importing…" : "Import finished"}</span>
        {!busy && (
          <button type="button" className="text-[11px] text-muted-foreground underline" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {queue.map((q) => (
        <div key={q.id} className="flex items-start gap-2 rounded-lg px-1 py-1" data-testid="import-item" data-state={q.state}>
          {q.state === "working" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : q.state === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : q.state === "duplicate" ? <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{q.name}</p>
            <p className={cn("text-[11px]", q.state === "error" ? "text-destructive" : "text-muted-foreground")}>{q.detail}</p>
            {q.state === "working" && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(q.fraction * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- PDF picker ----

function PdfPicker({ file, onClose, onImport }: { file: { bytes: Uint8Array; name: string } | null; onClose: () => void; onImport: (bytes: Uint8Array, meta: UploadMeta) => Promise<DesignAsset | null> }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [found, setFound] = useState<Record<number, PdfPageImages | "loading">>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const docRef = useRef<PdfDoc | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setDoc(null);
    setError(null);
    setThumbs({});
    setFound({});
    setPicked(new Set());
    setPage(1);
    (async () => {
      try {
        const { openPdf } = await import("./pdf-import");
        const d = await openPdf(file.bytes);
        if (cancelled) return d.destroy();
        docRef.current = d;
        setDoc(d);
        for (let n = 1; n <= d.shownPages && !cancelled; n++) {
          const url = await d.pageThumb(n).catch(() => "");
          if (!cancelled) setThumbs((t) => ({ ...t, [n]: url }));
        }
      } catch (err) {
        if (!cancelled) setError(plainError(err));
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [file]);

  const scan = useCallback(
    async (n: number) => {
      if (!doc || found[n]) return;
      setFound((f) => ({ ...f, [n]: "loading" }));
      const r = await doc.pageImages(n).catch(() => ({ images: [], skippedSmall: 0, failed: 1, tooLarge: 0 }));
      setFound((f) => ({ ...f, [n]: r }));
    },
    [doc, found],
  );
  useEffect(() => {
    if (doc) void scan(page);
  }, [doc, page, scan]);

  const pdfName = file?.name ?? "Document.pdf";
  const allImages = Object.values(found).flatMap((f) => (f === "loading" ? [] : f.images));
  const current = found[page];

  const importImages = async (imgs: PdfImage[]) => {
    setBusy("images");
    let n = 0;
    for (const img of imgs) {
      n++;
      const bytes = new Uint8Array(await img.blob.arrayBuffer());
      await onImport(bytes, { name: `${baseName(pdfName)} – page ${img.page} image ${n}`, kind: "pdf-image", sourceName: pdfName, sourcePage: img.page });
    }
    setBusy(null);
    setPicked(new Set());
  };
  const importPage = async () => {
    if (!doc) return;
    setBusy("page");
    try {
      const r = await doc.renderPage(page);
      await onImport(new Uint8Array(await r.blob.arrayBuffer()), { name: `${baseName(pdfName)} – page ${page}`, kind: "pdf-page", sourceName: pdfName, sourcePage: page });
    } catch (err) {
      setError(plainError(err));
    }
    setBusy(null);
  };
  const scanAll = async () => {
    if (!doc) return;
    setBusy("scan");
    for (let n = 1; n <= doc.shownPages; n++) await scan(n);
    setBusy(null);
  };

  return (
    <Dialog open={!!file} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-3 sm:max-w-4xl" data-testid="pdf-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {pdfName}
          </DialogTitle>
          <DialogDescription>
            Pick the images embedded in the PDF (at their full resolution), or import a whole page as a picture when the artwork is drawn as vectors.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="pdf-error">
            {error}
          </p>
        ) : !doc ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening the PDF…
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[10rem_1fr]">
            <div className="flex min-h-0 gap-2 overflow-auto pb-1 md:flex-col" role="listbox" aria-label="Pages">
              {Array.from({ length: doc.shownPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={page === n}
                  onClick={() => setPage(n)}
                  className={cn("flex w-28 shrink-0 flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] md:w-full", page === n ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted")}
                  data-testid={`pdf-page-${n}`}
                >
                  {thumbs[n] ? <img src={thumbs[n]} alt={`Page ${n}`} className="max-h-28 w-full object-contain" /> : <Skeleton className="h-20 w-full" />}
                  Page {n}
                </button>
              ))}
              {doc.pageCount > doc.shownPages && <p className="text-[11px] text-muted-foreground">Showing the first {doc.shownPages} of {doc.pageCount} pages.</p>}
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-auto">
              <div className="flex flex-wrap items-center gap-2">
                <Button className="h-11" variant="outline" onClick={importPage} disabled={!!busy} data-testid="pdf-import-page">
                  {busy === "page" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Import page {page} as a picture
                </Button>
                {doc.shownPages > 1 && (
                  <Button className="h-11" variant="ghost" onClick={scanAll} disabled={!!busy}>
                    {busy === "scan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Find images on every page
                  </Button>
                )}
              </div>
              {current === undefined || current === "loading" ? (
                <p className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Looking for images on page {page}…
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground" data-testid="pdf-found">
                    {current.images.length ? `${current.images.length} image${current.images.length === 1 ? "" : "s"} on page ${page}.` : `No embedded images on page ${page}. The artwork may be vector drawing: import the page as a picture instead.`}
                    {current.skippedSmall > 0 && ` ${current.skippedSmall} tiny image${current.skippedSmall === 1 ? "" : "s"} (icons, patterns) skipped.`}
                    {current.tooLarge > 0 && ` ${current.tooLarge} image${current.tooLarge === 1 ? " is" : "s are"} too large to take out on this device; import the page instead.`}
                    {current.failed > 0 && ` ${current.failed} image${current.failed === 1 ? "" : "s"} couldn't be read (an unusual image format inside the PDF).`}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {current.images.map((img) => {
                      const on = picked.has(img.key);
                      return (
                        <button
                          key={img.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPicked((s) => (s.has(img.key) ? new Set([...s].filter((k) => k !== img.key)) : new Set([...s, img.key])))}
                          className={cn("relative flex flex-col gap-1 rounded-lg border p-1.5 text-left", on ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted")}
                          data-testid="pdf-image"
                        >
                          <img src={img.previewUrl} alt="" className="h-28 w-full rounded bg-white object-contain" />
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {img.width} × {img.height} px
                          </span>
                          {on && <Check className="absolute right-2 top-2 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Done
          </Button>
          <Button className="h-11" disabled={!picked.size || !!busy} onClick={() => importImages(allImages.filter((i) => picked.has(i.key)))} data-testid="pdf-import-selected">
            {busy === "images" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import {picked.size || ""} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------- the gallery ----

export type AssetPick = { title: string; description?: string; onPick: (asset: DesignAsset) => void };

export function AssetLibrary({ open, onOpenChange, side = "right", pick }: { open: boolean; onOpenChange: (v: boolean) => void; side?: "left" | "right" | "bottom"; pick?: AssetPick | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const assets = useAssets();
  const [query, setQuery] = useState("");
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  // A fresh picker for every PDF, so nothing from the previous file can show or land late.
  const [pdfKey, setPdfKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DesignAsset | null>(null);
  const [renaming, setRenaming] = useState<DesignAsset | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DesignAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rename = useRenameDesignAsset();
  const remove = useDeleteDesignAsset();
  const onPdf = useCallback((bytes: Uint8Array, name: string) => {
    setPdfKey((k) => k + 1);
    setPdf({ bytes, name });
  }, []);
  const { queue, setQueue, addFiles, runImage } = useImporter(onPdf);

  // Paste an image from the clipboard while the gallery is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, addFiles]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = assets.data ?? [];
    return q ? all.filter((a) => [a.name, a.sourceName ?? ""].some((s) => s.toLowerCase().includes(q))) : all;
  }, [assets.data, query]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(Array.from(e.dataTransfer.files));
  };

  const doRename = () => {
    if (!renaming || !newName.trim()) return;
    rename.mutate(
      { id: renaming.id, data: { name: newName.trim() } },
      {
        onSuccess: () => {
          setRenaming(null);
          void qc.invalidateQueries({ queryKey: getListDesignAssetsQueryKey() });
        },
        onError: (err) => toast({ title: "Couldn't rename", description: plainError(err), variant: "destructive" }),
      },
    );
  };
  const doDelete = () => {
    if (!confirmDelete) return;
    remove.mutate(
      { id: confirmDelete.id },
      {
        onSuccess: () => {
          setConfirmDelete(null);
          void qc.invalidateQueries({ queryKey: getListDesignAssetsQueryKey() });
        },
        onError: (err) => {
          setConfirmDelete(null);
          toast({ title: "This image is still in use", description: plainError(err), variant: "destructive" });
        },
      },
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={side}
          className={cn("flex flex-col gap-3 p-4", side === "bottom" ? "h-[88dvh] rounded-t-2xl" : "w-full sm:max-w-md")}
          data-testid="asset-library"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="flex items-center gap-2">
              <Images className="h-5 w-5" /> {pick ? pick.title : "Images"}
            </SheetTitle>
            <SheetDescription>{pick?.description ?? "Designer artwork and reference drawings. Import PNG, JPEG, WebP or a PDF; drop files here or paste an image."}</SheetDescription>
          </SheetHeader>
          <input ref={fileInput} type="file" accept={ACCEPT} multiple className="hidden" data-testid="asset-file-input" onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addFiles(files);
          }} />
          <div className={cn("flex items-center gap-2 rounded-xl border-2 border-dashed p-2 transition-colors", dragging ? "border-primary bg-primary/5" : "border-border")}>
            <Button className="h-11 flex-1" onClick={() => fileInput.current?.click()} data-testid="asset-import">
              <Upload className="mr-2 h-4 w-4" /> Import images or PDF
            </Button>
          </div>
          <QueueList queue={queue} onClear={() => setQueue([])} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search images" className="h-11 pl-9 text-[16px] md:text-sm" aria-label="Search images" data-testid="asset-search" />
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {assets.isLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-36" />
                ))}
              </div>
            ) : assets.isError ? (
              <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Images couldn't be loaded. {plainError(assets.error)}</p>
            ) : !list.length ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground" data-testid="asset-empty">
                <Images className="h-8 w-8 opacity-50" />
                {query ? "No images match." : "No images yet. Import the artwork your designer sent (PNG, JPEG, WebP or PDF) to put it on backdrops, counters and screens."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pb-4">
                {list.map((a) => (
                  <div key={a.id} className="group relative flex flex-col gap-1 rounded-xl border bg-card p-1.5" data-testid="asset-card" data-asset={a.id}>
                    <button
                      type="button"
                      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => (pick ? (pick.onPick(a), onOpenChange(false)) : setPreview(a))}
                      aria-label={pick ? `Use ${a.name}` : `Preview ${a.name}`}
                      data-testid="asset-pick"
                    >
                      <AssetThumb asset={a} className="h-28 w-full" />
                    </button>
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1 px-0.5">
                        <p className="truncate text-xs font-medium" title={a.name}>
                          {a.name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {kindLabel(a)} · {a.width} × {a.height}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More for ${a.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="min-h-11" onSelect={() => setPreview(a)}>
                            <Images className="mr-2 h-4 w-4" /> Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="min-h-11"
                            onSelect={() => {
                              setRenaming(a);
                              setNewName(a.name);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(a)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PdfPicker key={pdfKey} file={pdf} onClose={() => setPdf(null)} onImport={(bytes, meta) => runImage(bytes, meta)} />

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl" data-testid="asset-preview">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.name}</DialogTitle>
            <DialogDescription>
              {preview && `${kindLabel(preview)} · ${preview.width} × ${preview.height} px · ${(preview.byteSize / 1048576).toFixed(1)} MB${preview.sourceName ? ` · from ${preview.sourceName}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          {preview && <img src={assetFileUrl(preview.id)} alt={preview.name} className="max-h-[65dvh] w-full rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f8fafc_0%_50%)] bg-[length:16px_16px] object-contain" />}
          {pick && preview && (
            <DialogFooter>
              <Button
                className="h-11"
                onClick={() => {
                  pick.onPick(preview);
                  setPreview(null);
                  onOpenChange(false);
                }}
              >
                <Check className="mr-2 h-4 w-4" /> Use this image
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename image</DialogTitle>
            <DialogDescription>Only the name changes; designs using it keep it.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doRename();
            }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} autoFocus className="h-11 text-[16px] md:text-sm" aria-label="Image name" data-testid="asset-rename-input" />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" className="h-11" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" className="h-11" disabled={!newName.trim() || rename.isPending}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete "{confirmDelete?.name}"?</DialogTitle>
            <DialogDescription>The image is removed for everyone. If a design or custom object still uses it, it won't be deleted and you'll see where it's used.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setConfirmDelete(null)}>
              <X className="mr-2 h-4 w-4" /> Keep
            </Button>
            <Button className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doDelete} disabled={remove.isPending} data-testid="asset-delete-confirm">
              {remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Lets any part of the editor (surface pickers, the reference panel) open the gallery.
export const AssetPickerContext = createContext<((pick: AssetPick | null) => void) | null>(null);
export const useAssetPicker = () => useContext(AssetPickerContext);
