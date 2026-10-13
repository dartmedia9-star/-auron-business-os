/**
 * The artwork schedule in the PDF export (V3): one row per surface with an
 * image, sizes in the chosen unit, resolution and cropping, missing images,
 * and the PDF gaining schedule pages only when asked.
 *
 *   cd artifacts/auron-os && npx tsx src/components/design-studio/export-artwork.test.ts
 */
import { DEFAULT_FINISH, createEmptyModel, makeObject, makeRectRoom, type ProjectModel } from "@workspace/design-model";
import { artRowText, artworkSchedule, type ArtAssetInfo } from "./export-artwork";
import { defaultExportOptions, exportPlanPdf } from "./export-plan";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const base = createEmptyModel({ venueName: "Hall", displayUnit: "m" });
const backdrop = { ...makeObject("backdrop", 6000, 3000, { width: 6000, depth: 100, height: 3000 }), name: "Stage backdrop", finishes: { front: { ...DEFAULT_FINISH, assetId: 1, fit: "cover" as const }, rear: { ...DEFAULT_FINISH, assetId: 9, fit: "contain" as const } } };
const plain = makeObject("counter", 3000, 6000, {});
const model: ProjectModel = { ...base, rooms: [makeRectRoom(0, 0, 12000, 9000, { name: "Hall" })], objects: [backdrop, plain] };
const assets = new Map<number, ArtAssetInfo>([[1, { id: 1, name: "gala.png", width: 4000, height: 1500 }]]);

const rows = artworkSchedule(model, assets);
check("one row per surface with artwork; objects without artwork are left out", rows.map((r) => `${r.object}/${r.surface}`), ["Stage backdrop/Front", "Stage backdrop/Rear"]);
const front = rows[0];
// The printable panel sits inside the backdrop's frame: 5.85 m × 2.85 m on a 6 m × 3 m backdrop.
check("the surface is the backdrop's printable panel", [Math.round(front.surfaceW), Math.round(front.surfaceH)], [5850, 2850]);
// Fill: 4000 × 1500 px on 5850 × 2850 mm → scaled to the height, 7600 × 2850 mm.
check("fill prints the image at 7.6 m × 2.85 m (cropped at the sides)", [Math.round(front.printW ?? 0), Math.round(front.printH ?? 0), front.cropped], [7600, 2850, true]);
check("resolution at that size is about 13 ppi", Math.round(front.ppi ?? 0), 13);
check("a missing image is listed, not dropped", [rows[1].image, rows[1].printW], [null, null]);

const m = artRowText(front, "m");
check("sizes in metres", [m.size, m.print], ["5.85 m × 2.85 m", "7.6 m × 2.85 m, 13 ppi, edges cropped"]);
check("sizes in feet and inches follow the chosen unit", artRowText(front, "ft").size, `19' 2⅜" × 9' 4¼"`);
check("sizes in millimetres", artRowText(front, "mm").size, "5850 mm × 2850 mm");
check("the missing image is named by its id", artRowText(rows[1], "m").image, "Missing image #9");

const pages = async (includeArtwork: boolean) => {
  const blob = await exportPlanPdf(model, { ...defaultExportOptions(model), includeArtwork }, { rows, thumbs: new Map() });
  const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  return { pages: (text.match(/\/Type \/Page\b/g) ?? []).length, bytes: blob.size };
};
check("artwork schedule is on by default when the design has artwork", defaultExportOptions(model).includeArtwork, true);
check("…and off for a design without artwork", defaultExportOptions({ ...model, objects: [plain] }).includeArtwork, false);
const withArt = await pages(true);
const without = await pages(false);
check("the PDF gains a schedule page when asked", [without.pages, withArt.pages], [1, 2]);
// 20 rows need more than one schedule page on A4 landscape.
const many = { rows: Array.from({ length: 20 }, () => rows[0]), thumbs: new Map() };
const manyBlob = await exportPlanPdf(model, defaultExportOptions(model), many);
check("a long schedule continues onto further pages", (Buffer.from(await manyBlob.arrayBuffer()).toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 4, true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
