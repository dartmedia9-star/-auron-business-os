import { boundsOf, formatArea, formatLength, polygonArea, type ProjectModel, type Vec2, UNIT_LABELS, unitWords } from "@workspace/design-model";
import { textBox, type Crowded } from "./annotation-layout";
import { artRowText, type ArtRow } from "./export-artwork";
import { PRINT_PALETTE, buildPlan, buildPlanPrimitives, layersFromSettings, type Layers, type Prim, type Style } from "./plan-primitives";

// ---------------------------------------------------------------------------
// Client-ready plan exports. The plan is laid out on a white paper sheet at a
// standard architectural scale (1:50, 1:100, …) with a title block, and drawn
// from the same primitives as the screen. PNG goes through a canvas; PDF is
// vector (jsPDF, loaded only when a PDF is requested).
//
// A "px" in the primitives is 0.25 mm on paper, so 12 px labels print at
// about 3 mm (8.5 pt) and stay readable.
// ---------------------------------------------------------------------------

export type PaperSize = "A4" | "A3";
export type Orientation = "landscape" | "portrait";

export type ExportOptions = {
  paper: PaperSize;
  orientation: Orientation;
  layers: Layers;
  includeNotes: boolean;
  includeTitleBlock: boolean;
  /** PDF only: add an artwork schedule page after the plan (when any object carries artwork). */
  includeArtwork: boolean;
};

const PAPER: Record<PaperSize, { w: number; h: number }> = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 } };
const SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000];
const PX_MM = 0.25;
const MARGIN = 10;
const TITLE_H = 26;

export function defaultExportOptions(model: ProjectModel): ExportOptions {
  return { paper: "A4", orientation: "landscape", layers: layersFromSettings(model), includeNotes: true, includeTitleBlock: true, includeArtwork: model.objects.some((o) => !!o.finishes && Object.keys(o.finishes).length > 0) };
}

export type Sheet = {
  w: number;
  h: number;
  denom: number;
  /** Plan mm → paper mm. */
  map: (p: Vec2) => Vec2;
  prims: Prim[];
  /** Labels the layout couldn't place clear of others (drawn anyway). */
  crowded: Crowded[];
  notes: string[];
  plan: { x: number; y: number; w: number; h: number };
  notesBox: { x: number; y: number; w: number; h: number } | null;
};

function notesFor(model: ProjectModel): string[] {
  const out: string[] = [];
  const unit = model.settings.displayUnit;
  const label = { measured: "Measured", estimated: "Estimated", to_confirm: "To confirm", assumption: "Assumption" } as const;
  if (model.venue.ceilingHeight != null) out.push(`Ceiling height: ${formatLength(model.venue.ceilingHeight, unit)} (${label[model.venue.ceilingStatus]})`);
  for (const line of model.venue.notes.split("\n").map((l) => l.trim()).filter(Boolean)) out.push(line);
  for (const n of model.notes) out.push(`[${label[n.status]}] ${n.text.replace(/\s+/g, " ")}`);
  for (const c of model.checklist) if (c.value.trim()) out.push(`${c.label}: ${c.value.trim()}`);
  const toConfirm = [...model.rooms, ...model.pillars, ...model.openings, ...model.sections].filter((e) => e.status === "to_confirm").map((e) => e.name);
  if (toConfirm.length) out.push(`To confirm on site: ${toConfirm.join(", ")}`);
  return out;
}

export function layoutSheet(model: ProjectModel, opts: ExportOptions): Sheet {
  const paper = PAPER[opts.paper];
  const w = opts.orientation === "landscape" ? paper.w : paper.h;
  const h = opts.orientation === "landscape" ? paper.h : paper.w;
  const notes = opts.includeNotes ? notesFor(model) : [];
  const notesW = notes.length ? (opts.orientation === "landscape" ? 70 : 0) : 0;
  const notesH = notes.length && opts.orientation === "portrait" ? 45 : 0;
  const plan = {
    x: MARGIN,
    y: MARGIN,
    w: w - MARGIN * 2 - (notesW ? notesW + 6 : 0),
    h: h - MARGIN * 2 - (opts.includeTitleBlock ? TITLE_H + 4 : 0) - (notesH ? notesH + 4 : 0),
  };
  const notesBox = notes.length ? (notesW ? { x: w - MARGIN - notesW, y: MARGIN, w: notesW, h: plan.h } : { x: MARGIN, y: MARGIN + plan.h + 4, w: plan.w, h: notesH }) : null;

  // Bounds including dimension lines: build once at a provisional scale.
  const provisional = buildPlanPrimitives(model, { pxPerMm: 1 / (PX_MM * 200), unit: model.settings.displayUnit, layers: opts.layers });
  const pts: Vec2[] = [];
  // Geometry and dimension lines only: label positions depend on the scale
  // being chosen (at the provisional 1:200 a label is ~4x bigger on paper
  // than at 1:50), so counting them would pick a needlessly small scale.
  for (const p of provisional) {
    if (p.k === "poly" && p.style.role !== "muted") pts.push(...p.pts);
    else if (p.k === "circle") pts.push({ x: p.c.x - p.r, y: p.c.y - p.r }, { x: p.c.x + p.r, y: p.c.y + p.r });
  }
  const b = boundsOf(pts) ?? { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  // Smallest standard scale that fits, leaving room for labels.
  const need = Math.max(bw / (plan.w * 0.94), bh / (plan.h * 0.94));
  const first = SCALES.find((s) => s >= need) ?? Math.ceil(need / 1000) * 1000;
  // Then make sure every label actually lands on the sheet; if one would
  // spill off the plan area, step to the next standard scale.
  const tries = [first, ...SCALES.filter((s) => s > first)];
  let sheet: Sheet | null = null;
  for (const denom of tries) {
    const k = 1 / denom;
    const ox = plan.x + (plan.w - bw * k) / 2 - b.minX * k;
    const oy = plan.y + (plan.h - bh * k) / 2 - b.minY * k;
    const map = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
    const pxPerMm = k / PX_MM;
    const { prims, crowded } = buildPlan(model, { pxPerMm, unit: model.settings.displayUnit, layers: opts.layers });
    sheet = { w, h, denom, map, prims, crowded, notes, plan, notesBox };
    const fits = prims.every((p) => {
      if (p.k !== "text") return true;
      return textBox(p, pxPerMm, 0).every((q) => {
        const m = map(q);
        return m.x >= plan.x - 0.5 && m.x <= plan.x + plan.w + 0.5 && m.y >= plan.y - 0.5 && m.y <= plan.y + plan.h + 0.5;
      });
    });
    if (fits) break;
  }
  return sheet!;
}

// ------------------------------------------------------------- painters ----

type Painter = {
  poly: (pts: Vec2[], closed: boolean, fill: string | null, fillOpacity: number, stroke: string | null, width: number, dash?: number[]) => void;
  circle: (c: Vec2, r: number, fill: string | null, fillOpacity: number, stroke: string | null, width: number) => void;
  text: (p: Vec2, text: string, sizeMm: number, angle: number, anchor: "start" | "middle" | "end", baseline: "middle" | "bottom" | "top", bold: boolean, color: string, halo: boolean) => void;
};

function resolve(style: Style) {
  const base = PRINT_PALETTE[style.role];
  return { stroke: style.stroke ?? base.stroke, fill: style.fill ?? base.fill, width: (style.width ?? base.width) * PX_MM, dash: (style.dash ?? base.dash)?.map((d) => d * PX_MM), fillOpacity: style.fillOpacity ?? 1 };
}

function paintPrims(sheet: Sheet, painter: Painter) {
  const m = sheet.map;
  for (const p of sheet.prims) {
    if (p.k === "poly") {
      const s = resolve(p.style);
      const fill = p.closed && s.fill !== "none" ? s.fill : null;
      const stroke = s.stroke !== "none" && s.width > 0 ? s.stroke : null;
      if (p.holes?.length && p.holes[0].length === p.pts.length && fill) {
        // Wall band: fill each wall as a quad (no even-odd needed), then outline both faces.
        const outer = p.pts.map(m);
        const inner = p.holes[0].map(m);
        for (let i = 0; i < outer.length; i++) {
          const j = (i + 1) % outer.length;
          painter.poly([outer[i], outer[j], inner[j], inner[i]], true, fill, s.fillOpacity, fill, 0.05);
        }
        if (stroke) {
          painter.poly(outer, true, null, 1, stroke, s.width);
          painter.poly(inner, true, null, 1, stroke, s.width);
        }
      } else painter.poly(p.pts.map(m), p.closed, fill, s.fillOpacity, stroke, s.width, s.dash);
    } else if (p.k === "circle") {
      const s = resolve(p.style);
      painter.circle(m(p.c), p.r / sheet.denom, s.fill !== "none" ? s.fill : null, s.fillOpacity, s.stroke !== "none" ? s.stroke : null, s.width);
    } else if (p.k === "arrow") {
      const s = resolve(p.style);
      const tip = m(p.tip);
      const len = p.size * PX_MM;
      const w = len * 0.36;
      const bx = tip.x - p.dir.x * len;
      const by = tip.y - p.dir.y * len;
      const color = s.stroke !== "none" ? s.stroke : s.fill;
      painter.poly([tip, { x: bx - p.dir.y * w, y: by + p.dir.x * w }, { x: bx + p.dir.y * w, y: by - p.dir.x * w }], true, color, 1, null, 0);
    } else {
      const s = resolve(p.style);
      painter.text(m(p.p), p.text, p.size * PX_MM, p.angle, p.anchor, p.baseline, p.weight === "bold", s.fill, !!p.halo);
    }
  }
}

const GOLD = "#b8892e";
const INK = "#111111";
const GREY = "#666666";

function paintFrame(model: ProjectModel, sheet: Sheet, painter: Painter, opts: ExportOptions) {
  const { w, h } = sheet;
  // Border.
  painter.poly([{ x: MARGIN - 4, y: MARGIN - 4 }, { x: w - MARGIN + 4, y: MARGIN - 4 }, { x: w - MARGIN + 4, y: h - MARGIN + 4 }, { x: MARGIN - 4, y: h - MARGIN + 4 }], true, null, 1, INK, 0.35);

  if (sheet.notesBox && sheet.notes.length) {
    const nb = sheet.notesBox;
    painter.poly([{ x: nb.x, y: nb.y }, { x: nb.x + nb.w, y: nb.y }, { x: nb.x + nb.w, y: nb.y + nb.h }, { x: nb.x, y: nb.y + nb.h }], true, null, 1, "#bbbbbb", 0.25);
    painter.text({ x: nb.x + 3, y: nb.y + 5 }, "NOTES", 3, 0, "start", "middle", true, INK, false);
    let y = nb.y + 11;
    const lineH = 3.6;
    const maxChars = Math.max(20, Math.floor((nb.w - 6) / 1.45));
    for (const note of sheet.notes) {
      for (const line of wrap(note, maxChars)) {
        if (y > nb.y + nb.h - 3) break;
        painter.text({ x: nb.x + 3, y }, line, 2.5, 0, "start", "middle", false, "#222222", false);
        y += lineH;
      }
      y += 1.2;
    }
  }

  if (!opts.includeTitleBlock) return;
  const unit = model.settings.displayUnit;
  const y0 = h - MARGIN - TITLE_H;
  const x0 = MARGIN;
  const x1 = w - MARGIN;
  painter.poly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y0 + TITLE_H }, { x: x0, y: y0 + TITLE_H }], true, "#ffffff", 1, INK, 0.35);
  painter.poly([{ x: x0, y: y0 }, { x: x0 + 2, y: y0 }, { x: x0 + 2, y: y0 + TITLE_H }, { x: x0, y: y0 + TITLE_H }], true, GOLD, 1, null, 0);
  painter.text({ x: x0 + 6, y: y0 + 7 }, "AURON EVENTS", 4.2, 0, "start", "middle", true, INK, false);
  painter.text({ x: x0 + 6, y: y0 + 12.5 }, "Floor plan", 2.4, 0, "start", "middle", false, GREY, false);
  const title = model.drawing.title || model.venue.name || "Floor plan";
  painter.text({ x: x0 + 6, y: y0 + 19.5 }, title, 3.6, 0, "start", "middle", true, INK, false);

  const area = model.rooms.filter((r) => !r.hidden).reduce((a, r) => a + polygonArea(r.points), 0);
  const fields: Array<[string, string]> = [
    ["Venue", model.venue.name || "—"],
    ["Client", model.drawing.client || "—"],
    ["Revision", model.drawing.revision || "—"],
    ["Date", model.drawing.date || "—"],
    ["Prepared by", model.drawing.preparedBy || "—"],
    ["Scale", `1:${sheet.denom} @ ${opts.paper}`],
    ["Units", UNIT_LABELS[unit]],
    ["Floor area", area ? formatArea(area, unit) : "—"],
  ];
  const colStart = x0 + Math.min(110, (x1 - x0) * 0.38);
  const cols = 4;
  const colW = (x1 - colStart) / cols;
  fields.forEach(([k, v], i) => {
    const cx = colStart + (i % cols) * colW;
    const cy = y0 + (i < cols ? 4 : 4 + TITLE_H / 2);
    painter.poly([{ x: cx, y: y0 + (i < cols ? 0 : TITLE_H / 2) }, { x: cx, y: y0 + (i < cols ? TITLE_H / 2 : TITLE_H) }], false, null, 1, "#cccccc", 0.2);
    painter.text({ x: cx + 2.5, y: cy + 1 }, k.toUpperCase(), 2, 0, "start", "middle", true, GREY, false);
    painter.text({ x: cx + 2.5, y: cy + 6 }, truncate(v, Math.floor(colW / 1.7)), 2.9, 0, "start", "middle", false, INK, false);
  });
  painter.poly([{ x: colStart, y: y0 + TITLE_H / 2 }, { x: x1, y: y0 + TITLE_H / 2 }], false, null, 1, "#cccccc", 0.2);
  painter.text({ x: x1, y: h - MARGIN + 2.5 }, "Dimensions in " + unitWords(unit) + " unless noted. Verify on site before fabrication. Not a structural or fire-safety approval.", 2, 0, "end", "middle", false, GREY, false);
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      if (line) out.push(line);
      line = w.length > max ? w.slice(0, max) : w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

// ------------------------------------------------------------------ PNG ----

export function renderPlanCanvas(model: ProjectModel, opts: ExportOptions, dpi = 150): HTMLCanvasElement {
  const sheet = layoutSheet(model, opts);
  const k = dpi / 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sheet.w * k);
  canvas.height = Math.round(sheet.h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't create an image canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(k, k);
  ctx.lineJoin = "miter";
  const painter: Painter = {
    poly: (pts, closed, fill, fillOpacity, stroke, width, dash) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) ctx.closePath();
      if (fill) {
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (stroke && width > 0) {
        ctx.setLineDash(dash ?? []);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    circle: (c, r, fill, fillOpacity, stroke, width) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      if (fill) {
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (stroke && width > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    },
    text: (p, text, size, angle, anchor, baseline, bold, color, halo) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (angle) ctx.rotate((angle * Math.PI) / 180);
      ctx.font = `${bold ? 600 : 400} ${size}px Inter, Helvetica, Arial, sans-serif`;
      ctx.textAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
      ctx.textBaseline = baseline === "middle" ? "middle" : baseline === "bottom" ? "bottom" : "top";
      if (halo) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = size * 0.3;
        ctx.lineJoin = "round";
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
  };
  paintPrims(sheet, painter);
  paintFrame(model, sheet, painter, opts);
  return canvas;
}

export async function exportPlanPng(model: ProjectModel, opts: ExportOptions): Promise<Blob> {
  const canvas = renderPlanCanvas(model, opts, opts.paper === "A3" ? 150 : 200);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the PNG"))), "image/png"));
}

// ------------------------------------------------------------------ PDF ----

/** jsPDF's built-in Helvetica only covers WinAnsi; spell out the rest. */
const PDF_UNSUPPORTED = /[^\x20-\x7E\xA0-\xFF—–·×²³½¼¾°⅛⅜⅝⅞…‘’“”\n]/;

/**
 * Text on the sheet that the PDF's built-in fonts can't draw (Malayalam,
 * Devanagari, Arabic, emoji…). It would print as "?", so the export dialog
 * names it and suggests PNG, which uses the device's own fonts.
 */
export function pdfUnsupportedText(model: ProjectModel, opts: ExportOptions): string[] {
  const seen = new Set<string>();
  for (const p of layoutSheet(model, opts).prims) if (p.k === "text" && PDF_UNSUPPORTED.test(p.text)) seen.add(p.text);
  for (const t of [model.drawing.title, model.venue.name, model.drawing.client, model.drawing.revision, model.drawing.preparedBy, ...notesFor(model)]) if (t && PDF_UNSUPPORTED.test(t)) seen.add(t);
  return [...seen];
}

function pdfText(s: string): string {
  return s.replace(/⅛/g, " 1/8").replace(/⅜/g, " 3/8").replace(/⅝/g, " 5/8").replace(/⅞/g, " 7/8").replace(/…/g, "...").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF—–·×²³½¼¾°]/g, "?");
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mixes a colour with white, for translucent fills in PDF. */
function overWhite(hex: string, alpha: number): [number, number, number] {
  const [r, g, b] = hexRgb(hex);
  return [Math.round(255 + (r - 255) * alpha), Math.round(255 + (g - 255) * alpha), Math.round(255 + (b - 255) * alpha)];
}

export type ArtSchedule = { rows: ArtRow[]; thumbs: ReadonlyMap<number, { data: string; w: number; h: number }> };

export async function exportPlanPdf(model: ProjectModel, opts: ExportOptions, art?: ArtSchedule): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const sheet = layoutSheet(model, opts);
  const doc = new jsPDF({ orientation: opts.orientation, unit: "mm", format: opts.paper.toLowerCase() as "a4" | "a3", compress: true });
  doc.setProperties({ title: model.drawing.title || model.venue.name || "Floor plan", creator: "Auron Business OS · Event Design Studio" });
  const painter: Painter = {
    poly: (pts, closed, fill, fillOpacity, stroke, width, dash) => {
      if (pts.length < 2) return;
      const deltas = pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]);
      if (fill) doc.setFillColor(...overWhite(fill, fillOpacity));
      if (stroke) {
        doc.setDrawColor(...hexRgb(stroke));
        doc.setLineWidth(Math.max(0.05, width));
      }
      doc.setLineDashPattern(dash ?? [], 0);
      const style = fill && stroke ? "FD" : fill ? "F" : "S";
      if (!fill && !stroke) return;
      doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], style, closed);
      doc.setLineDashPattern([], 0);
    },
    circle: (c, r, fill, fillOpacity, stroke, width) => {
      if (fill) doc.setFillColor(...overWhite(fill, fillOpacity));
      if (stroke) {
        doc.setDrawColor(...hexRgb(stroke));
        doc.setLineWidth(Math.max(0.05, width));
      }
      if (!fill && !stroke) return;
      doc.circle(c.x, c.y, r, fill && stroke ? "FD" : fill ? "F" : "S");
    },
    text: (p, raw, size, angle, anchor, baseline, bold, color, halo) => {
      const text = pdfText(raw);
      const pt = size / 0.3528;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(pt);
      if (halo && !angle) {
        const tw = doc.getTextWidth(text);
        const x = anchor === "middle" ? p.x - tw / 2 : anchor === "end" ? p.x - tw : p.x;
        const y = baseline === "middle" ? p.y - size * 0.55 : baseline === "bottom" ? p.y - size * 1.05 : p.y - size * 0.05;
        doc.setFillColor(255, 255, 255);
        doc.rect(x - 0.4, y, tw + 0.8, size * 1.1, "F");
      } else if (halo) {
        // Rotated label: a white box rotated with it.
        const tw = doc.getTextWidth(text);
        const a = (angle * Math.PI) / 180;
        const ux = { x: Math.cos(a), y: Math.sin(a) };
        const uy = { x: -Math.sin(a), y: Math.cos(a) };
        const sx = anchor === "middle" ? -tw / 2 : anchor === "end" ? -tw : 0;
        const sy = baseline === "middle" ? -size * 0.55 : baseline === "bottom" ? -size * 1.05 : 0;
        const corner = (lx: number, ly: number) => ({ x: p.x + ux.x * lx + uy.x * ly, y: p.y + ux.y * lx + uy.y * ly });
        const box = [corner(sx - 0.4, sy), corner(sx + tw + 0.4, sy), corner(sx + tw + 0.4, sy + size * 1.1), corner(sx - 0.4, sy + size * 1.1)];
        doc.setFillColor(255, 255, 255);
        doc.lines(box.slice(1).map((q, i) => [q.x - box[i].x, q.y - box[i].y]), box[0].x, box[0].y, [1, 1], "F", true);
      }
      doc.setTextColor(...hexRgb(color.startsWith("#") ? color : "#111111"));
      doc.text(text, p.x, p.y, { angle: angle ? -angle : 0, align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left", baseline: baseline === "middle" ? "middle" : baseline === "bottom" ? "bottom" : "top" });
    },
  };
  paintPrims(sheet, painter);
  paintFrame(model, sheet, painter, opts);
  if (opts.includeArtwork && art?.rows.length) paintArtworkPages(doc, model, sheet, art);
  return doc.output("blob");
}

type PdfDoc = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

/** The artwork schedule: one row per surface with an image, as many pages as it takes. */
function paintArtworkPages(doc: PdfDoc, model: ProjectModel, sheet: Sheet, art: ArtSchedule) {
  const unit = model.settings.displayUnit;
  const W = sheet.w;
  const H = sheet.h;
  const ROW = 30;
  const THUMB = { w: 40, h: 26 };
  const x0 = MARGIN + THUMB.w + 4;
  const span = W - MARGIN - x0;
  const cx = [x0, x0 + span * 0.36, x0 + span * 0.62];
  const cw = [span * 0.34, span * 0.24, span * 0.38];
  let y = 0;
  const header = (first: boolean) => {
    doc.addPage();
    doc.setTextColor(17, 17, 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(pdfText(first ? "Artwork schedule" : "Artwork schedule (continued)"), MARGIN, MARGIN + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(pdfText(`${model.drawing.title || model.venue.name || "Design"} · sizes in ${UNIT_LABELS[unit]} · artwork is mapped flat onto each surface as seen from in front of it`), MARGIN, MARGIN + 10.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    ["Object and surface", "Image", "Fit and printed size"].forEach((t, i) => doc.text(t, cx[i], MARGIN + 17));
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, MARGIN + 19, W - MARGIN, MARGIN + 19);
    y = MARGIN + 22;
  };
  header(true);
  const lines = (text: string, w: number) => doc.splitTextToSize(pdfText(text), w) as string[];
  for (const r of art.rows) {
    if (y + ROW > H - MARGIN) header(false);
    const t = artRowText(r, unit);
    const thumb = art.thumbs.get(r.assetId);
    if (thumb) {
      const k = Math.min(THUMB.w / thumb.w, THUMB.h / thumb.h);
      const w = thumb.w * k;
      const h = thumb.h * k;
      doc.addImage(thumb.data, "JPEG", MARGIN + (THUMB.w - w) / 2, y + (THUMB.h - h) / 2, w, h);
    } else {
      doc.setFillColor(243, 244, 246);
      doc.rect(MARGIN, y, THUMB.w, THUMB.h, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(159, 18, 57);
      doc.text(r.image ? "No preview" : "Missing image", MARGIN + THUMB.w / 2, y + THUMB.h / 2, { align: "center", baseline: "middle" });
    }
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, THUMB.w, THUMB.h, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    const head = lines(t.object, cw[0]).slice(0, 2);
    doc.text(head, cx[0], y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text([...lines(t.surface, cw[0]).slice(0, 1), ...lines(t.size, cw[0]).slice(0, 1)], cx[0], y + 3.5 + head.length * 4);
    doc.setTextColor(r.image ? 60 : 159, r.image ? 60 : 18, r.image ? 60 : 57);
    doc.text(lines(t.image, cw[1]).slice(0, 5), cx[1], y + 3.5);
    doc.setTextColor(60, 60, 60);
    doc.text([...lines(t.fit, cw[2]).slice(0, 2), ...lines(t.print, cw[2]).slice(0, 3)], cx[2], y + 3.5);
    doc.setDrawColor(230, 230, 230);
    doc.line(MARGIN, y + ROW - 2, W - MARGIN, y + ROW - 2);
    y += ROW;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function safeFilename(s: string): string {
  return (s || "floor-plan").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "floor-plan";
}

