/**
 * Integration test for the Rate Calculator catalog API: categories, items,
 * validation, duplicates, rate/unit changes, deactivation, relations, auth,
 * and proof that catalog writes create no financial records.
 *
 * LOCAL / TEST DATABASES ONLY. It creates rate categories and items that are
 * NOT removed afterwards (items can't be deleted by design). Never point it at
 * production.
 *
 * Prerequisites:
 *   - Migration 0006 applied to a disposable database and an API server
 *     running against it, reachable at BASE_URL.
 *   - Credentials for a signed-in user.
 *   - EXPECT_EMPTY_CATALOG=1 additionally asserts the catalog starts empty
 *     (use on a freshly migrated database: proves nothing is seeded).
 *
 * Usage (from the repository root):
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... [EXPECT_EMPTY_CATALOG=1] \
 *   pnpm --filter @workspace/scripts exec tsx ./test-rate-catalog.ts
 */

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function api(method: string, path: string, body?: unknown, opts: { anonymous?: boolean } = {}): Promise<{ status: number; data: Json }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie && !opts.anonymous ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const entry of res.headers.getSetCookie?.() ?? []) {
    if (entry.startsWith("sid=")) cookie = entry.split(";")[0];
  }
  const text = await res.text();
  let data: Json = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: res.status, data };
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (!condition) failures++;
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${condition || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

/** Row counts of every financial record type the app has. */
async function financialCounts() {
  const [ft, ex, ev, cl, rc, au] = await Promise.all([
    api("GET", "/fund-transactions?limit=1"),
    api("GET", "/finance/expenses"),
    api("GET", "/events?limit=1"),
    api("GET", "/clients?limit=1"),
    api("GET", "/finance/client-receivables?limit=1"),
    api("GET", "/audit-logs?limit=1"),
  ]);
  return {
    fundTransactions: ft.data?.total,
    expenses: Array.isArray(ex.data) ? ex.data.length : ex.data?.total,
    events: ev.data?.total,
    clients: cl.data?.total,
    receivables: rc.data?.total,
    auditLogs: au.data?.total,
  };
}

async function main() {
  // Auth
  const anon = await api("GET", "/rate-catalog/items", undefined, { anonymous: true });
  check("Catalog requires sign-in (GET items)", anon.status === 401, anon.status);
  const anonPost = await api("POST", "/rate-catalog/categories", { name: "x" }, { anonymous: true });
  check("Catalog requires sign-in (POST category)", anonPost.status === 401, anonPost.status);

  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("Login", login.status === 200, login.data);
  if (login.status !== 200) return;

  // 30 / 32 / 33. Empty catalog, nothing seeded.
  const startItems = await api("GET", "/rate-catalog/items");
  const startCats = await api("GET", "/rate-catalog/categories");
  check("Items list returns an array", Array.isArray(startItems.data), startItems.data);
  if (process.env.EXPECT_EMPTY_CATALOG === "1") {
    check("32. Fresh database: no seeded items", startItems.data.length === 0, startItems.data.length);
    check("32. Fresh database: no seeded categories", startCats.data.length === 0, startCats.data.length);
  }

  const before = await financialCounts();
  const tag = Date.now().toString(36);

  // 21. Categories
  const cat = await api("POST", "/rate-catalog/categories", { name: `Stage ${tag}` });
  check("21. Create category", cat.status === 201 && cat.data.itemCount === 0, cat.data);
  const cat2 = await api("POST", "/rate-catalog/categories", { name: `Carpet ${tag}` });
  check("21. Create second category", cat2.status === 201, cat2.data);
  const dupCat = await api("POST", "/rate-catalog/categories", { name: `  stage ${tag.toUpperCase()} ` });
  check("21. Duplicate category name (case/space-insensitive) → 409", dupCat.status === 409, dupCat);
  const blankCat = await api("POST", "/rate-catalog/categories", { name: "   " });
  check("21. Blank category name → 400", blankCat.status === 400, blankCat);
  const renamed = await api("PATCH", `/rate-catalog/categories/${cat.data.id}`, { name: `Stage / Platform ${tag}` });
  check("21. Rename category", renamed.status === 200 && renamed.data.name === `Stage / Platform ${tag}`, renamed.data);

  // 20. Items
  const stage = await api("POST", "/rate-catalog/items", {
    name: "Stage",
    categoryId: cat.data.id,
    aliases: ["platform", " riser ", "platform"],
    rate: 30,
    pricingMethod: "per_sqft",
    unitLabel: "ignored for sq ft",
    defaultQuantity: 5,
    description: "Plain stage",
  });
  check("20. Create sq ft item", stage.status === 201, stage.data);
  check("20. Rate stored as a number", stage.data.rate === 30, stage.data.rate);
  check("20. Aliases trimmed and de-duplicated", JSON.stringify(stage.data.aliases) === JSON.stringify(["platform", "riser"]), stage.data.aliases);
  check("20. Settings that don't apply to the method are cleared", stage.data.unitLabel === null && stage.data.defaultQuantity === null, stage.data);
  check("20. Category name included", stage.data.categoryName === `Stage / Platform ${tag}`, stage.data.categoryName);
  check("20. Active by default", stage.data.isActive === true, stage.data.isActive);

  const carpet = await api("POST", "/rate-catalog/items", { name: "Fresh Carpet", categoryId: cat2.data.id, rate: 9, pricingMethod: "per_sqft" });
  check("20. Create second item", carpet.status === 201, carpet.data);

  const listed = await api("GET", "/rate-catalog/items");
  check("20. New items are listed immediately", listed.data.some((i: Json) => i.id === stage.data.id) && listed.data.some((i: Json) => i.id === carpet.data.id));

  // Validation
  const bad = await Promise.all([
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: -1, pricingMethod: "per_sqft" }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 1.234, pricingMethod: "per_sqft" }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 1, pricingMethod: "per_cubic_ft" }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: 999999, rate: 1, pricingMethod: "per_sqft" }),
    api("POST", "/rate-catalog/items", { name: " ", categoryId: cat.data.id, rate: 1, pricingMethod: "per_sqft" }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 10, pricingMethod: "percentage" }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 10, pricingMethod: "percentage", percentageBase: "selected_items", percentageBaseItemIds: [] }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 1, pricingMethod: "per_sqft", minBillable: 10, maxBillable: 5 }),
    api("POST", "/rate-catalog/items", { name: "X", categoryId: cat.data.id, rate: 1, pricingMethod: "per_sqft", relations: [{ relatedItemId: 999999, relationType: "includes" }] }),
  ]);
  const labels = ["negative rate", "3-decimal rate", "unknown pricing method", "unknown category", "blank name", "percentage without base", "selected-items base with no items", "min > max", "relation to missing item"];
  bad.forEach((r, i) => check(`Validation: ${labels[i]} → 400`, r.status === 400 && typeof r.data?.error === "string", r));

  // 17. Missing rate allowed, stored as null (never invented)
  const unpriced = await api("POST", "/rate-catalog/items", { name: "Unpriced item", categoryId: cat.data.id, pricingMethod: "per_unit", unitLabel: "piece" });
  check("17. Item without a rate is stored with rate null", unpriced.status === 201 && unpriced.data.rate === null, unpriced.data);

  // 22. Duplicates
  const dup = await api("POST", "/rate-catalog/items", { name: " stage ", categoryId: cat.data.id, rate: 31, pricingMethod: "per_sqft" });
  check("22. Same name in same category → 409", dup.status === 409, dup);
  const variant = await api("POST", "/rate-catalog/items", { name: "Stage 2 ft height", categoryId: cat.data.id, rate: 35, pricingMethod: "per_sqft" });
  check("22. Similar-named variant is allowed", variant.status === 201, variant.data);
  const otherCat = await api("POST", "/rate-catalog/items", { name: "Stage", categoryId: cat2.data.id, rate: 30, pricingMethod: "per_sqft" });
  check("22. Same name in another category is allowed", otherCat.status === 201, otherCat.data);
  const renameClash = await api("PATCH", `/rate-catalog/items/${variant.data.id}`, { name: "STAGE" });
  check("22. Renaming onto an existing name → 409", renameClash.status === 409, renameClash);

  // 23. Rate and unit changes
  const rateChange = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, { rate: 32.5 });
  check("23. Change rate", rateChange.status === 200 && rateChange.data.rate === 32.5, rateChange.data);
  check("23. Other fields kept on partial update", rateChange.data.description === "Plain stage" && rateChange.data.aliases.length === 2, rateChange.data);
  const unitChange = await api("PATCH", `/rate-catalog/items/${variant.data.id}`, { pricingMethod: "per_unit", unitLabel: "piece", defaultQuantity: 2 });
  check("23. Change pricing method and unit", unitChange.status === 200 && unitChange.data.pricingMethod === "per_unit" && unitChange.data.unitLabel === "piece" && unitChange.data.defaultQuantity === 2, unitChange.data);
  const moveCat = await api("PATCH", `/rate-catalog/items/${variant.data.id}`, { categoryId: cat2.data.id });
  check("Change category", moveCat.status === 200 && moveCat.data.categoryId === cat2.data.id, moveCat.data);

  // Percentage with an explicit base
  const pct = await api("POST", "/rate-catalog/items", {
    name: "Design fee", categoryId: cat.data.id, rate: 10, pricingMethod: "percentage", percentageBase: "selected_items", percentageBaseItemIds: [stage.data.id],
  });
  check("Percentage item with explicit base", pct.status === 201 && pct.data.percentageBase === "selected_items" && pct.data.percentageBaseItemIds[0] === stage.data.id, pct.data);
  const pctOnPct = await api("POST", "/rate-catalog/items", {
    name: "Fee on fee", categoryId: cat.data.id, rate: 5, pricingMethod: "percentage", percentageBase: "selected_items", percentageBaseItemIds: [pct.data.id],
  });
  check("Percentage can't be based on another percentage → 400", pctOnPct.status === 400, pctOnPct);
  const baseToPct = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, { pricingMethod: "percentage", percentageBase: "manual" });
  check("A percentage's base item can't become a percentage → 400", baseToPct.status === 400, baseToPct);

  // 19. Relations
  const related = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, {
    relations: [
      { relatedItemId: carpet.data.id, relationType: "includes", note: "Carpet included" },
      { relatedItemId: carpet.data.id, relationType: "includes", note: "dup" },
      { relatedItemId: unpriced.data.id, relationType: "addon" },
    ],
  });
  check("19. Relations saved (duplicates dropped)", related.status === 200 && related.data.relations.length === 2, related.data?.relations);
  const selfRel = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, { relations: [{ relatedItemId: stage.data.id, relationType: "conflicts" }] });
  check("19. Self relation → 400", selfRel.status === 400, selfRel);
  const keptRel = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, { notes: "kept" });
  check("19. Relations kept when not sent", keptRel.data.relations.length === 2, keptRel.data?.relations);
  const clearedRel = await api("PATCH", `/rate-catalog/items/${stage.data.id}`, { relations: [{ relatedItemId: carpet.data.id, relationType: "includes" }] });
  check("19. Relations replaced when sent", clearedRel.data.relations.length === 1, clearedRel.data?.relations);

  // 24. Safe deactivation (no delete)
  const deact = await api("PATCH", `/rate-catalog/items/${carpet.data.id}`, { isActive: false });
  check("24. Deactivate item", deact.status === 200 && deact.data.isActive === false, deact.data);
  const stillListed = await api("GET", "/rate-catalog/items");
  check("24. Deactivated item is kept (listed as inactive)", stillListed.data.some((i: Json) => i.id === carpet.data.id && i.isActive === false));
  const react = await api("PATCH", `/rate-catalog/items/${carpet.data.id}`, { isActive: true });
  check("24. Reactivate item", react.data.isActive === true, react.data);
  const del = await api("DELETE", `/rate-catalog/items/${carpet.data.id}`);
  check("24. Items can't be deleted (no DELETE route)", del.status === 404 || del.status === 405, del.status);

  // Category delete rules
  const delUsed = await api("DELETE", `/rate-catalog/categories/${cat.data.id}`);
  check("Category with items can't be deleted → 409", delUsed.status === 409, delUsed);
  const emptyCat = await api("POST", "/rate-catalog/categories", { name: `Empty ${tag}` });
  const delEmpty = await api("DELETE", `/rate-catalog/categories/${emptyCat.data.id}`);
  check("Empty category can be deleted", delEmpty.status === 204, delEmpty);
  const cats = await api("GET", "/rate-catalog/categories");
  const catRow = cats.data.find((c: Json) => c.id === cat.data.id);
  check("Category item counts (Stage, Unpriced item, Design fee)", catRow?.itemCount === 3 && catRow?.activeItemCount === 3, catRow);

  // 34. No financial records created by any of the above
  const after = await financialCounts();
  check("34. No fund transactions, expenses, events, clients, receivables or audit entries created", JSON.stringify(before) === JSON.stringify(after), { before, after });
}

main()
  .catch((err) => {
    failures++;
    console.error(err);
  })
  .finally(() => {
    console.log(failures === 0 ? "\nAll rate catalog checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
