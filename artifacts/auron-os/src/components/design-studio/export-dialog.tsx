import { useEffect, useMemo, useState } from "react";
import { Check, Download, FileImage, FileText, Loader2, Share2 } from "lucide-react";
import type { ProjectModel } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SelectField, ToggleRow } from "./fields";
import { defaultExportOptions, downloadBlob, exportPlanPdf, exportPlanPng, layoutSheet, pdfUnsupportedText, renderPlanCanvas, safeFilename, type ExportOptions } from "./export-plan";

// Export the floor plan for a client: choose paper, layers and notes, see a
// preview, then download (or share from the iPad share sheet).

export function ExportDialog({ open, onOpenChange, model, projectName }: { open: boolean; onOpenChange: (v: boolean) => void; model: ProjectModel; projectName: string }) {
  const [opts, setOpts] = useState<ExportOptions>(() => defaultExportOptions(model));
  const [busy, setBusy] = useState<null | "png" | "pdf" | "share">(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [crowded, setCrowded] = useState<string[]>([]);
  const [noPdfText, setNoPdfText] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setOpts(defaultExportOptions(model));
      setDone(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      try {
        setPreview(renderPlanCanvas(model, opts, 60).toDataURL("image/png"));
        setCrowded(layoutSheet(model, opts).crowded.map((c) => c.text));
        setNoPdfText(pdfUnsupportedText(model, opts));
        setPreviewError(null);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Preview failed");
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, model, opts]);

  const filename = safeFilename(model.drawing.title || model.venue.name || projectName);
  const hasContent = model.rooms.length + model.sections.length + model.objects.length + model.partitions.length > 0;

  const run = async (kind: "png" | "pdf" | "share") => {
    setBusy(kind);
    try {
      if (kind === "share") {
        const blob = await exportPlanPdf(model, opts);
        const file = new File([blob], `${filename}.pdf`, { type: "application/pdf" });
        await navigator.share({ files: [file], title: model.drawing.title || projectName });
      } else {
        const blob = kind === "png" ? await exportPlanPng(model, opts) : await exportPlanPdf(model, opts);
        downloadBlob(blob, `${filename}.${kind}`);
        // Confirmed inline rather than with a toast, so Escape still closes the dialog.
        setDone(`${filename}.${kind}`);
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const canShare = useMemo(() => {
    try {
      return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
    } catch {
      return false;
    }
  }, []);

  const L = opts.layers;
  const setLayer = (k: keyof ExportOptions["layers"], v: boolean) => setOpts({ ...opts, layers: { ...L, [k]: v } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-h-[92dvh] sm:max-w-3xl" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>Export floor plan</DialogTitle>
          <DialogDescription>A white, print-ready sheet with your title block. Toolbars and selection marks are never included.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_16rem]">
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border bg-white p-2">
            {previewError ? (
              <p className="text-sm text-destructive">{previewError}</p>
            ) : preview ? (
              <img src={preview} alt="Export preview" className="h-auto max-h-[60dvh] w-full object-contain shadow-sm" data-testid="export-preview" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {crowded.length > 0 && (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" data-testid="export-crowded">
                {crowded.length === 1 ? "1 label has" : `${crowded.length} labels have`} no clear spot at this paper size and may touch other text ({crowded.slice(0, 4).join(", ")}
                {crowded.length > 4 ? ", …" : ""}). Try A3, or drag those labels on the plan. Every dimension is still printed.
              </p>
            )}
            {noPdfText.length > 0 && (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" data-testid="export-pdf-font">
                The PDF's built-in font can't print some text ({noPdfText.slice(0, 3).join(", ")}
                {noPdfText.length > 3 ? ", …" : ""}); it would show as "?". The PNG export prints it correctly.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Paper" value={opts.paper} options={[{ value: "A4", label: "A4" }, { value: "A3", label: "A3" }]} onChange={(paper) => setOpts({ ...opts, paper })} />
              <SelectField label="Orientation" value={opts.orientation} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} onChange={(orientation) => setOpts({ ...opts, orientation })} />
            </div>
            <div className="rounded-lg border px-3 py-1">
              <ToggleRow label="Wall lengths" checked={L.wallDims} onChange={(v) => setLayer("wallDims", v)} />
              <ToggleRow label="Overall dimensions" checked={L.overallDims} onChange={(v) => setLayer("overallDims", v)} />
              <ToggleRow label="External dimensions" checked={L.externalDims} onChange={(v) => setLayer("externalDims", v)} />
              <ToggleRow label="Sections" checked={L.sections} onChange={(v) => setLayer("sections", v)} />
              <ToggleRow label="Section dimensions" checked={L.sectionDims} onChange={(v) => setLayer("sectionDims", v)} />
              <ToggleRow label="Event objects" checked={L.objects} onChange={(v) => setLayer("objects", v)} />
              <ToggleRow label="Object dimensions" checked={L.objectDims} onChange={(v) => setLayer("objectDims", v)} />
              <ToggleRow label="Labels and names" checked={L.labels} onChange={(v) => setOpts({ ...opts, layers: { ...L, labels: v, roomNames: v } })} />
              <ToggleRow label="Notes" checked={opts.includeNotes} onChange={(includeNotes) => setOpts({ ...opts, includeNotes })} />
              <ToggleRow label="Title block" checked={opts.includeTitleBlock} onChange={(includeTitleBlock) => setOpts({ ...opts, includeTitleBlock })} />
            </div>
            {!hasContent && <p className="text-xs text-warning">The plan is empty. Draw a room first.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11" disabled={!!busy || !hasContent} onClick={() => run("pdf")} data-testid="export-pdf">
                {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />} PDF
              </Button>
              <Button variant="outline" className="h-11" disabled={!!busy || !hasContent} onClick={() => run("png")} data-testid="export-png">
                {busy === "png" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />} PNG
              </Button>
            </div>
            {canShare && (
              <Button variant="outline" className={cn("h-11 w-full")} disabled={!!busy || !hasContent} onClick={() => run("share")}>
                {busy === "share" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />} Share PDF…
              </Button>
            )}
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status" data-testid="export-done">
              {done ? <Check className="h-3 w-3 text-success" /> : <Download className="h-3 w-3" />}
              {done ? `Saved ${done} to your Downloads.` : "Saved to your Downloads (Files app on iPad)."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
