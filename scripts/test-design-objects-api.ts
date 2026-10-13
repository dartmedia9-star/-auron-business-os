/**
 * Integration test for the Design Studio custom object library API and for
 * custom objects inside saved projects: save, list, reopen, rename, stale
 * saves, duplicate, delete, invalid recipes, auth, placing a library object
 * into two projects, editing one instance, and deleting the library entry
 * without touching saved designs.
 *
 * LOCAL / TEST DATABASES ONLY. It creates custom objects and design projects
 * (and deletes the ones it created). Never point it at production.
 *
 * Prerequisites: migrations 0007 and 0008 applied to a disposable database
 * and an API server running against it at BASE_URL.
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-design-objects-api.ts
 */
import {
  applyTemplate,
  buildSpec,
  createEmptyModel,
  customSize,
  makeCustomObject,
  makeRectRoom,
  parseProjectModel,
  updateEntity,
  type CustomSpec,
} from "../lib/design-model/src/index";

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

/** Deep equality ignoring object key order (Postgres jsonb sorts keys). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same((a as Json)[k], (b as Json)[k]));
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) passes++;
  else failures++;
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${condition || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

function definition(template: Parameters<typeof applyTemplate>[0], values: Record<string, number | boolean> = {}) {
  const content = applyTemplate(template, values);
  const r = buildSpec(content);
  if (!r.ok) throw new Error(r.error);
  return { v: 1, ...content, spec: r.spec, color: "#1d1f26", accentColor: "#c8a24a", elevation: 0 };
}

async function main() {
  const anon = await api("GET", "/design-objects", undefined, { anonymous: true });
  check("Library list requires sign-in", anon.status === 401, anon.status);
  const anonCreate = await api("POST", "/design-objects", { name: "x", definition: definition("panel") }, { anonymous: true });
  check("Saving requires sign-in", anonCreate.status === 401, anonCreate.status);

  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("Login", login.status === 200, login.data);
  if (login.status !== 200) return;
  const createdObjects: number[] = [];
  const createdProjects: number[] = [];

  // Save a photo booth made from the exact-size template.
  const booth = definition("photo_booth", { width: 2400, height: 2400, depth: 1200, section: 50, infill: true });
  const c1 = await api("POST", "/design-objects", { name: "  Photo booth  ", category: "Arches & frames", description: "Two frames with a backdrop", definition: booth });
  check("Save a custom object", c1.status === 201, c1.data);
  if (c1.status !== 201) return;
  createdObjects.push(c1.data.id);
  check("Name is trimmed, revision starts at 1", c1.data.name === "Photo booth" && c1.data.revision === 1, c1.data);
  check("Saved definition is the structured recipe, not an image", c1.data.definition.spec.method === "frame" && Array.isArray(c1.data.definition.sketch.shapes), c1.data.definition.spec);

  const list = await api("GET", "/design-objects");
  check("Library lists it", list.status === 200 && list.data.some((o: Json) => o.id === c1.data.id), list.status);

  const got = await api("GET", `/design-objects/${c1.data.id}`);
  check("Reopen returns the same recipe", got.status === 200 && same(got.data.definition.spec, booth.spec), got.data?.definition?.spec);

  // Invalid recipes are refused by the server, not only by the client.
  const crossed = { ...booth, spec: { method: "extrude", plane: "front", depth: 100, profiles: [[{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }]] } };
  const bad = await api("POST", "/design-objects", { name: "Bad", definition: crossed });
  check("A self-intersecting outline is refused (400)", bad.status === 400 && /crosses itself/.test(bad.data?.error ?? ""), bad.data);
  const noName = await api("POST", "/design-objects", { name: "   ", definition: booth });
  check("A blank name is refused", noName.status === 400, noName.data);
  const notObject = await api("POST", "/design-objects", { name: "x", definition: "frame" });
  check("A non-object definition is refused", notObject.status === 400, notObject.data);
  const tooMany = { ...booth, spec: { ...booth.spec, segments: Array.from({ length: 241 }, (_, i) => ({ a: { x: i, y: 0 }, b: { x: i, y: 100 } })) } };
  const huge = await api("POST", "/design-objects", { name: "x", definition: tooMany });
  check("A recipe over the member limit is refused", huge.status === 400, huge.data);

  // Rename with the current revision, then a stale save.
  const ren = await api("PATCH", `/design-objects/${c1.data.id}`, { baseRevision: 1, name: "Photo booth 2.4 m" });
  check("Rename", ren.status === 200 && ren.data.name === "Photo booth 2.4 m" && ren.data.revision === 2, ren.data);
  const stale = await api("PATCH", `/design-objects/${c1.data.id}`, { baseRevision: 1, name: "Stale" });
  check("A stale save is refused with 409", stale.status === 409 && stale.data.currentRevision === 2, stale.data);
  const wider = definition("photo_booth", { width: 3000, height: 2400, depth: 1200, section: 50, infill: true });
  const upd = await api("PATCH", `/design-objects/${c1.data.id}`, { baseRevision: 2, definition: wider });
  check("Update the reusable definition", upd.status === 200 && customSize(upd.data.definition.spec as CustomSpec).width === 3000, upd.data?.definition?.spec);

  const dup = await api("POST", `/design-objects/${c1.data.id}/duplicate`, {});
  check("Duplicate", dup.status === 201 && dup.data.name === "Photo booth 2.4 m (copy)" && dup.data.id !== c1.data.id, dup.data);
  if (dup.status === 201) createdObjects.push(dup.data.id);

  // Place the library object into two projects; edit one instance.
  const spec = upd.data.definition.spec as CustomSpec;
  const room = makeRectRoom(0, 0, 20000, 15000, { name: "Hall" });
  const instance = makeCustomObject(spec, 10000, 7000, { name: "Photo booth", props: { libraryId: c1.data.id, libraryRevision: upd.data.revision } });
  const modelA = { ...createEmptyModel({ venueName: "Venue A" }), rooms: [room], objects: [instance] };
  const pA = await api("POST", "/design-projects", { name: "Custom object test A", model: modelA });
  const pB = await api("POST", "/design-projects", { name: "Custom object test B", model: { ...modelA, venue: { ...modelA.venue, name: "Venue B" } } });
  check("Projects with a custom object save", pA.status === 201 && pB.status === 201, [pA.data, pB.data]);
  if (pA.status !== 201 || pB.status !== 201) return;
  createdProjects.push(pA.data.id, pB.data.id);

  const edited = updateEntity(pA.data.model, instance.id, { height: 2800 });
  const saveA = await api("PATCH", `/design-projects/${pA.data.id}`, { baseRevision: pA.data.revision, model: edited });
  check("Edit the instance in project A and save", saveA.status === 200, saveA.data);
  const reA = await api("GET", `/design-projects/${pA.data.id}`);
  const reB = await api("GET", `/design-projects/${pB.data.id}`);
  const objA = parseProjectModel(reA.data.model);
  const objB = parseProjectModel(reB.data.model);
  check("Reopened project A has the edited geometry", objA.ok && objA.model.objects[0].height === 2800 && customSize(objA.model.objects[0].custom!).height === 2800, objA.ok ? objA.model.objects[0].height : objA);
  check("Project B's instance is unchanged", objB.ok && objB.model.objects[0].height === 2400, objB.ok ? objB.model.objects[0].height : objB);
  const libAfter = await api("GET", `/design-objects/${c1.data.id}`);
  check("The library definition is unchanged by instance edits", customSize(libAfter.data.definition.spec as CustomSpec).height === 2400, libAfter.data?.definition?.spec);

  // A project with a broken recipe is refused.
  const broken = { ...modelA, objects: [{ ...instance, custom: { method: "frame", plane: "front", segments: [], section: 50, round: false, depth: 0, infill: false } }] };
  const pBad = await api("POST", "/design-projects", { name: "Broken", model: broken });
  check("A project with an invalid custom recipe is refused", pBad.status === 400, pBad.data);

  // Delete the library entries: saved projects keep their objects.
  for (const id of createdObjects) {
    const del = await api("DELETE", `/design-objects/${id}`);
    check(`Delete custom object ${id}`, del.status === 204, del.status);
  }
  const gone = await api("GET", `/design-objects/${c1.data.id}`);
  check("Deleted object is gone", gone.status === 404, gone.status);
  const stillA = await api("GET", `/design-projects/${pA.data.id}`);
  check("Project A still opens with its custom object after the library entry is deleted", stillA.status === 200 && stillA.data.model.objects[0].type === "custom", stillA.data?.model?.objects?.[0]?.type);

  for (const id of createdProjects) await api("DELETE", `/design-projects/${id}`);
  console.log(`\n${passes} passed, ${failures} failed`);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    if (failures) process.exit(1);
  });
