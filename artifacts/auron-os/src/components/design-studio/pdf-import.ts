import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// Bundled by Vite as a plain .js worker file, so any web server sends it with a JavaScript type.
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker";

// Reads designer PDFs in the browser with Mozilla PDF.js (Apache-2.0),
// loaded only when a PDF is imported. Nothing is sent anywhere to be
// processed: pages are rendered and images taken out locally, then uploaded
// to our own server like any other image.
//
// Two different things come out of a PDF, and they're kept apart:
//  * "pdf-image": a raster image embedded in the PDF, at its own full
//    resolution. PDF.js hands over decoded pixels (not the original JPEG
//    bytes), so it's saved as a lossless PNG of exactly those pixels.
//  * "pdf-page": a picture of a whole page, for vector artwork that has no
//    embedded image (or to keep the page layout as a reference).

let worker: Worker | null = null;

export const PDF_LIMITS = {
  maxBytes: 100 * 1024 * 1024,
  maxPages: 300,
  /** iPad Safari refuses canvases above about 16.7 million pixels. */
  maxCanvasPixels: 16_000_000,
  /** Longest side of a rendered page. */
  maxRenderSide: 4096,
  /** Embedded images smaller than this (icons, bullets, texture tiles) are skipped. */
  minImageSide: 48,
};

export type PdfImage = {
  key: string;
  page: number;
  width: number;
  height: number;
  blob: Blob;
  previewUrl: string;
};

export type PdfPageImages = { images: PdfImage[]; skippedSmall: number; failed: number; tooLarge: number };

export type PdfDoc = {
  pageCount: number;
  shownPages: number;
  pageThumb: (page: number) => Promise<string>;
  renderPage: (page: number) => Promise<{ blob: Blob; width: number; height: number }>;
  pageImages: (page: number) => Promise<PdfPageImages>;
  destroy: () => void;
};

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This device couldn't encode the image (it may be too large)."))), type, quality));
}

type PdfImageObject = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray; kind?: number };

/** Draws a PDF.js image object (an ImageBitmap, or raw 1-bit / RGB / RGBA pixels) onto a canvas. */
function imageToCanvas(img: PdfImageObject): HTMLCanvasElement | null {
  const { width: w, height: h } = img;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  const src = img.data;
  if (!src) return null;
  const out = ctx.createImageData(w, h);
  const d = out.data;
  if (img.kind === 3 && src.length >= w * h * 4) d.set(src.subarray(0, w * h * 4));
  else if (img.kind === 2 && src.length >= w * h * 3) {
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      d[i * 4] = src[j];
      d[i * 4 + 1] = src[j + 1];
      d[i * 4 + 2] = src[j + 2];
      d[i * 4 + 3] = 255;
    }
  } else if (img.kind === 1) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const on = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const k = (y * w + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = on ? 255 : 0;
        d[k + 3] = 255;
      }
  } else return null;
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function getObj(page: pdfjs.PDFPageProxy, id: string): Promise<PdfImageObject | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30000);
    try {
      store.get(id, (obj: unknown) => {
        clearTimeout(timer);
        resolve((obj as PdfImageObject) ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  if (bytes.length > PDF_LIMITS.maxBytes) throw new Error(`The PDF is ${(bytes.length / 1048576).toFixed(0)} MB; the largest PDF accepted is ${PDF_LIMITS.maxBytes / 1048576} MB.`);
  if (!worker) {
    worker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker;
  }
  // A copy: PDF.js takes ownership of the buffer it's given.
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, stopAtErrors: false });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "PasswordException") throw new Error("This PDF is password-protected. Save an unprotected copy and import that.");
    throw new Error("This PDF couldn't be read (it may be damaged or not really a PDF).");
  }
  const seen = new Set<string>();
  // One page operation at a time: a page's decoded images are released when
  // it's cleaned up, so a thumbnail must never clean up a page being scanned.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const pageThumb = async (n: number) => {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 240 / Math.max(vp1.width, vp1.height);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    await page.render({ canvas, viewport: vp }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.8);
    canvas.width = canvas.height = 0;
    page.cleanup();
    return url;
  };

  const renderPage = async (n: number) => {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    let scale = PDF_LIMITS.maxRenderSide / Math.max(vp1.width, vp1.height);
    scale = Math.min(scale, Math.sqrt(PDF_LIMITS.maxCanvasPixels / (vp1.width * vp1.height)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This device couldn't render the page.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport: vp }).promise;
    const blob = await canvasToBlob(canvas);
    const out = { blob, width: canvas.width, height: canvas.height };
    canvas.width = canvas.height = 0;
    page.cleanup();
    return out;
  };

  const pageImages = async (n: number): Promise<PdfPageImages> => {
    const page = await doc.getPage(n);
    // Drawing the page (small) makes PDF.js decode its images, at full resolution, into page.objs.
    const vp1 = page.getViewport({ scale: 1 });
    const probe = document.createElement("canvas");
    const pv = page.getViewport({ scale: 200 / Math.max(vp1.width, vp1.height) });
    probe.width = Math.ceil(pv.width);
    probe.height = Math.ceil(pv.height);
    await page.render({ canvas: probe, viewport: pv }).promise;
    probe.width = probe.height = 0;
    const ops = await page.getOperatorList();
    const res: PdfPageImages = { images: [], skippedSmall: 0, failed: 0, tooLarge: 0 };
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      let img: PdfImageObject | null = null;
      let key = "";
      if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
        key = String(args[0]);
        if (seen.has(key)) continue;
        img = await getObj(page, key);
      } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
        key = `inline:${n}:${i}`;
        img = args[0] as PdfImageObject;
      } else continue;
      seen.add(key);
      if (!img || !(img.width > 0 && img.height > 0)) {
        res.failed++;
        continue;
      }
      if (img.width < PDF_LIMITS.minImageSide || img.height < PDF_LIMITS.minImageSide) {
        res.skippedSmall++;
        continue;
      }
      if (img.width * img.height > PDF_LIMITS.maxCanvasPixels) {
        res.tooLarge++;
        continue;
      }
      try {
        const canvas = imageToCanvas(img);
        if (!canvas) {
          res.failed++;
          continue;
        }
        const blob = await canvasToBlob(canvas);
        const scale = Math.min(1, 320 / Math.max(img.width, img.height));
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(img.width * scale));
        small.height = Math.max(1, Math.round(img.height * scale));
        small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
        const previewUrl = small.toDataURL("image/jpeg", 0.8);
        canvas.width = canvas.height = small.width = small.height = 0;
        res.images.push({ key, page: n, width: img.width, height: img.height, blob, previewUrl });
      } catch {
        res.failed++;
      }
    }
    page.cleanup();
    return res;
  };

  return {
    pageCount: doc.numPages,
    shownPages: Math.min(doc.numPages, PDF_LIMITS.maxPages),
    pageThumb: (n) => serial(() => pageThumb(n)),
    renderPage: (n) => serial(() => renderPage(n)),
    pageImages: (n) => serial(() => pageImages(n)),
    destroy: () => void doc.destroy(),
  };
}
