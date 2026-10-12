/**
 * Integration test for the Event Design Studio API: create, list, reopen,
 * save with revisions, overlapping (stale) saves, rename, duplicate, delete,
 * malformed design data, auth, and proof that no financial record changes.
 *
 * LOCAL / TEST DATABASES ONLY. It creates design projects (and deletes the
 * ones it created). Never point it at production.
 *
 * Prerequisites: migration 0007 applied to a disposable database and an API
 * server running against it at BASE_URL; credentials for a user.
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-design-projects.ts
 */
import { createEmptyModel, makeObject, makeRectRoom, makeSectionTL, parseProjectModel } from "../lib/design-model/src/index";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;

if (process.env.ALLOW_TEST_DATA !== "1") {
  console.error("Refusing to run: this test writes data. Set ALLOW_TEST_DATA=1 and use a disposable database.");
  process.exit(1);
}
if (!USERNAME || !PASSWORD) {
  console.error("TEST_USERNAME and TEST_PASSWORD environment variables are required.");
  process.exit(1);
}

let cookie = "";
let failures = 0;
let passes = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function api(method: string, path: string, body?: unknown, opts: { anonymous?: boolean; raw?: string } = {}): Promise<{ status: number; data: Json }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined || opts.raw ? { "content-type": "application/json" } : {}),
      ...(cookie && !opts.anonymous ? { cookie } : {}),
    },
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  for (const entry of res.headers.getSetCookie?.() ?? []) if (entry.startsWith("sid=")) cookie = entry.split(";")[0];
  const text = await res.text();
  let data: Json = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: res.status, data };
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) passes++;
  else failures++;
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${condition || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

async function financialCounts() {
  const [ft, ex, au] = await Promise.all([api("GET", "/fund-transactions?limit=1"), api("GET", "/finance/expenses"), api("GET", "/audit-logs?limit=1")]);
  return JSON.stringify({ ft: ft.data?.total, ex: Array.isArray(ex.data) ? ex.data.length : ex.data?.total, au: Array.isArray(au.data) ? au.data.length : au.data?.total });
}

async function main() {
  const anon = await api("GET", "/design-projects", undefined, { anonymous: true });
  check("List requires sign-in", anon.status === 401, anon.status);
  const anonCreate = await api("POST", "/design-projects", { name: "x" }, { anonymous: true });
  check("Create requires sign-in", anonCreate.status === 401, anonCreate.status);

  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("Login", login.status === 200, login.data);
  if (login.status !== 200) return;
  const before = await financialCounts();
  const created: number[] = [];

  // Create without a model: empty plan with the venue filled in.
  const c1 = await api("POST", "/design-projects", { name: "  Grand Hyatt Ballroom  ", venueName: "Grand Hyatt Kochi", clientName: "Test client" });
  check("Create empty project", c1.status === 201, c1.data);
  const p1 = c1.data;
  created.push(p1.id);
  check("Name is trimmed", p1.name === "Grand Hyatt Ballroom", p1.name);
  check("Starts at revision 1", p1.revision === 1, p1.revision);
  check("Server built a valid empty model", parseProjectModel(p1.model).ok && p1.model.venue.name === "Grand Hyatt Kochi", p1.model?.venue);
  check("Creator recorded", p1.createdByName != null, p1.createdByName);

  // Create with a model.
  let model = createEmptyModel({ venueName: "Reference hall" });
  const room = makeRectRoom(0, 0, 6000, 8000, { name: "Hall" });
  model = { ...model, rooms: [room], sections: [makeSectionTL("section", 0, 0, 1000, 8000, { name: "Left strip" })], objects: [makeObject("stage", 3000, 1500, { width: 4000, depth: 2000, height: 600 })] };
  const c2 = await api("POST", "/design-projects", { name: "Reference 6x8", model });
  check("Create with a design", c2.status === 201, c2.data);
  const p2 = c2.data;
  created.push(p2.id);
  check("Design stored exactly", p2.model.rooms[0].points.map((p: Json) => `${p.id}:${p.x},${p.y}`).join() === room.points.map((p) => `${p.id}:${p.x},${p.y}`).join(), p2.model.rooms[0]);
  check("Counts reported", p2.roomCount === 1 && p2.objectCount === 1, [p2.roomCount, p2.objectCount]);

  // Malformed design data is refused, nothing stored.
  const bad1 = await api("POST", "/design-projects", { name: "Bad", model: { ...model, rooms: [{ ...room, wallHeight: -1 }] } });
  check("Invalid wall height refused", bad1.status === 400 && /wallHeight/.test(bad1.data?.error), bad1.data);
  const bad2 = await api("POST", "/design-projects", { name: "Bad", model: { hello: 1 } });
  check("Model without version refused", bad2.status === 400, bad2.data);
  const bad3 = await api("POST", "/design-projects", { name: "   " });
  check("Blank name refused", bad3.status === 400, bad3.data);
  const bad4 = await api("POST", "/design-projects", undefined, { raw: "{not json" });
  check("Malformed JSON refused", bad4.status === 400, bad4.status);
  const bad5 = await api("POST", "/design-projects", { name: "x", clientId: 999999 });
  check("Unknown client refused", bad5.status === 400, bad5.data);

  // Reopen.
  const g = await api("GET", `/design-projects/${p2.id}`);
  check("Reopen returns the design", g.status === 200 && g.data.model.objects[0].height === 600, g.data);
  check("Missing project is 404", (await api("GET", "/design-projects/99999999")).status === 404);
  check("Bad id is 404", (await api("GET", "/design-projects/abc")).status === 404);

  // Save: revision increments.
  const edited = { ...g.data.model, objects: [{ ...g.data.model.objects[0], x: 3200, rotation: 10 }] };
  const s1 = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 1, model: edited });
  check("Save succeeds", s1.status === 200 && s1.data.revision === 2, s1.data);
  const g2 = await api("GET", `/design-projects/${p2.id}`);
  check("Saved edit persisted", g2.data.model.objects[0].x === 3200 && g2.data.model.objects[0].rotation === 10, g2.data.model.objects[0]);

  // Stale save (another device saved in between) is refused, not applied.
  const stale = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 1, model: { ...edited, objects: [] } });
  check("Stale save refused with 409", stale.status === 409 && stale.data.currentRevision === 2, stale.data);
  const g3 = await api("GET", `/design-projects/${p2.id}`);
  check("Stale save changed nothing", g3.data.model.objects.length === 1 && g3.data.revision === 2, g3.data.revision);

  // Two overlapping saves from the same base: exactly one wins.
  const [o1, o2] = await Promise.all([
    api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 2, model: { ...edited, venue: { ...edited.venue, notes: "A" } } }),
    api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 2, model: { ...edited, venue: { ...edited.venue, notes: "B" } } }),
  ]);
  const statuses = [o1.status, o2.status].sort();
  check("Overlapping saves: one 200, one 409", JSON.stringify(statuses) === "[200,409]", statuses);
  const winner = o1.status === 200 ? "A" : "B";
  const g4 = await api("GET", `/design-projects/${p2.id}`);
  check("Winner's data is stored", g4.data.model.venue.notes === winner && g4.data.revision === 3, [g4.data.model.venue.notes, g4.data.revision]);

  // Force overwrite (explicit user choice after a conflict).
  const forced = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 1, force: true, model: edited });
  check("Force save overwrites deliberately", forced.status === 200 && forced.data.revision === 4, forced.data);

  // Invalid save is refused and leaves the stored design alone.
  const badSave = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 4, model: { ...edited, objects: [{ ...edited.objects[0], width: 0 }] } });
  check("Invalid save refused", badSave.status === 400, badSave.data);
  check("Revision unchanged after refused save", (await api("GET", `/design-projects/${p2.id}`)).data.revision === 4);
  check("Save without baseRevision refused", (await api("PATCH", `/design-projects/${p2.id}`, { name: "x" })).status === 400);

  // Manually placed name labels survive a save; designs saved before labels
  // could be moved (no labelOffset on sections/objects) still open.
  const withLabels = { ...model, sections: model.sections.map((x) => ({ ...x, labelOffset: { x: 0, y: 1500 } })), objects: model.objects.map((o) => ({ ...o, labelOffset: { x: 500, y: -300 } })) };
  const c3 = await api("POST", "/design-projects", { name: "Label offsets", model: withLabels });
  if (c3.status === 201) created.push(c3.data.id);
  const g5 = c3.status === 201 ? await api("GET", `/design-projects/${c3.data.id}`) : c3;
  check("Moved labels are saved", g5.status === 200 && g5.data.model.sections[0].labelOffset.y === 1500 && g5.data.model.objects[0].labelOffset.x === 500, g5.data?.model?.objects?.[0]?.labelOffset);
  const legacy = JSON.parse(JSON.stringify(model));
  for (const x of [...legacy.sections, ...legacy.objects]) delete x.labelOffset;
  const c4 = await api("POST", "/design-projects", { name: "Older design", model: legacy });
  if (c4.status === 201) created.push(c4.data.id);
  check("A design without label offsets still saves and opens (automatic labels)", c4.status === 201 && c4.data.model.objects[0].labelOffset.x === 0 && c4.data.model.objects[0].labelOffset.y === 0, c4.data);

  // Rename.
  const rn = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 4, name: "Reference hall (rev A)" });
  check("Rename", rn.status === 200 && rn.data.revision === 5, rn.data);
  const list = await api("GET", "/design-projects");
  check("List is most recent first", list.status === 200 && list.data[0].id === p2.id && list.data[0].name === "Reference hall (rev A)", list.data?.[0]);
  check("List omits design data", list.data.every((p: Json) => p.model === undefined), list.data?.[0]);

  // Large but valid design (beyond Express's 100 kB default).
  const big = { ...edited, objects: Array.from({ length: 400 }, (_, i) => makeObject("round_table", 1000 + (i % 20) * 250, 1000 + Math.floor(i / 20) * 300, { notes: "x".repeat(200) })) };
  const bigSave = await api("PATCH", `/design-projects/${p2.id}`, { baseRevision: 5, model: big });
  check(`Large design saves (${Math.round(JSON.stringify(big).length / 1024)} kB)`, bigSave.status === 200, bigSave.data);

  // Duplicate.
  const dup = await api("POST", `/design-projects/${p2.id}/duplicate`, {});
  check("Duplicate", dup.status === 201 && dup.data.id !== p2.id && dup.data.name === "Reference hall (rev A) (copy)" && dup.data.revision === 1, dup.data);
  if (dup.status === 201) created.push(dup.data.id);
  check("Duplicate copies the design", dup.data?.model?.objects?.length === 400, dup.data?.model?.objects?.length);
  const dup2 = await api("POST", `/design-projects/${p2.id}/duplicate`, { name: "Option B" });
  check("Duplicate with a name", dup2.status === 201 && dup2.data.name === "Option B", dup2.data);
  if (dup2.status === 201) created.push(dup2.data.id);

  // Delete.
  for (const id of created) {
    const del = await api("DELETE", `/design-projects/${id}`);
    check(`Delete ${id}`, del.status === 204, del.status);
  }
  check("Deleted project is gone", (await api("GET", `/design-projects/${p2.id}`)).status === 404);
  check("Deleting again is 404", (await api("DELETE", `/design-projects/${p2.id}`)).status === 404);

  check("No financial records changed", (await financialCounts()) === before, [before, await financialCounts()]);
}

main()
  .catch((err) => {
    failures++;
    console.error(err);
  })
  .finally(() => {
    console.log(`\n${passes} passed, ${failures} failed`);
    if (failures > 0) process.exit(1);
  });
