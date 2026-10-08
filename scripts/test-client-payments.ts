/**
 * Integration test for client payments (client-level / unallocated and
 * event-allocated), receivables reconciliation, fund ledger effects, edits,
 * reversals, overpayment credit, legacy compatibility and fund transfers.
 *
 * LOCAL / TEST DATABASES ONLY. It creates clients, events, fund accounts,
 * payments and a transfer that are NOT removed afterwards. Never point it at
 * production.
 *
 * Prerequisites:
 *   - A running API server against a disposable database, reachable at BASE_URL.
 *   - Credentials for a user allowed to mutate finance data.
 *
 * Usage (from the repository root):
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-client-payments.ts
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

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: Json }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
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

const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main(): Promise<number> {
  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("Login succeeds", login.status === 200, login);
  if (login.status !== 200) return 1;

  const tag = `__cptest_${Date.now()}`;
  const year = 2031; // isolated reporting year for the P&L checks

  // ── Setup ──────────────────────────────────────────────────────────────
  const fundA = (await api("POST", "/fund-accounts", { name: `${tag} Fund A`, opening_balance: 0 })).data;
  const fundB = (await api("POST", "/fund-accounts", { name: `${tag} Fund B`, opening_balance: 0 })).data;
  const client = (await api("POST", "/clients", { name: `${tag} ABC`, clientType: "corporate" })).data;
  const other = (await api("POST", "/clients", { name: `${tag} Other`, clientType: "corporate" })).data;

  const mkEvent = async (clientId: number, name: string, revenue: number, legacyCollected = 0, eventYear = year) => {
    const ev = (await api("POST", "/events", { name: `${tag} ${name}`, clientId, eventType: "corporate", eventDate: `${eventYear}-03-15` })).data;
    await api("POST", `/events/${ev.id}/revenue`, { contractValue: revenue, advanceReceived: legacyCollected });
    return ev;
  };
  const e1 = await mkEvent(client.id, "Event 1", 20000);
  const e2 = await mkEvent(client.id, "Event 2", 30000);
  const e3 = await mkEvent(client.id, "Event 3", 50000);
  const otherEvent = await mkEvent(other.id, "Other event", 10000);

  const summary = async () => (await api("GET", `/finance/summary?year=${year}`)).data;
  const receivable = async () => (await api("GET", `/clients/${client.id}/receivables`)).data;
  const balance = async (id: number) => (await api("GET", `/fund-accounts/${id}`)).data.current_balance as number;
  const pnl = (s: Json) => ({ revenue: s.revenue, directCosts: s.directCosts, grossProfit: s.grossProfit, operatingExpenses: s.operatingExpenses, ebitda: s.ebitda, netProfit: s.netProfit });

  const before = await summary();
  check("Setup: revenue for the year is 1,10,000", eq(before.revenue, 110000), before.revenue);
  check("Setup: receivables 1,10,000", eq(before.totalReceivables, 110000), before.totalReceivables);

  // ── Client-level / unallocated payment ─────────────────────────────────
  const p1 = await api("POST", `/clients/${client.id}/payments`, {
    amount: 60000, payment_date: `${year}-04-01`, fund_account_id: fundA.id,
    payment_method: "Bank Transfer", reference: "TXN12345", notes: "Consolidated payment",
  });
  check("P1 ₹60,000 client-level payment created", p1.status === 201 && p1.data.allocations.length === 0 && eq(p1.data.unallocated, 60000), p1.data);

  let r = await receivable();
  check("After P1: billed 1,00,000", eq(r.totalBilled, 100000), r);
  check("After P1: received 60,000", eq(r.totalReceived, 60000), r);
  check("After P1: outstanding 40,000", eq(r.outstanding, 40000), r);
  check("After P1: no event outstanding changed (no invented allocation)", r.events.every((e: Json) => eq(e.allocated, 0)), r.events);
  check("After P1: Fund A +60,000", eq(await balance(fundA.id), 60000));
  let s = await summary();
  check("After P1: P&L unchanged", JSON.stringify(pnl(s)) === JSON.stringify(pnl(before)), { before: pnl(before), after: pnl(s) });
  check("After P1: Finance Summary receivables down by 60,000", eq(s.totalReceivables, 50000), s.totalReceivables);

  // ── Multiple payments incl. event-allocated ────────────────────────────
  const p2 = await api("POST", `/clients/${client.id}/payments`, { amount: 20000, payment_date: `${year}-04-05`, fund_account_id: fundA.id });
  const p3 = await api("POST", `/clients/${client.id}/payments`, {
    amount: 20000, payment_date: `${year}-04-10`, fund_account_id: fundA.id, allocations: [{ eventId: e3.id, amount: 20000 }],
  });
  check("P2 client-level and P3 allocated to Event 3 created", p2.status === 201 && p3.status === 201 && p3.data.allocations[0]?.eventName?.endsWith("Event 3"), { p2: p2.data, p3: p3.data });
  r = await receivable();
  check("After P1-P3: received 1,00,000 and outstanding 0", eq(r.totalReceived, 100000) && eq(r.outstanding, 0) && eq(r.credit, 0), r);
  check("After P1-P3: Event 3 shows 20,000 allocated, 30,000 outstanding", (() => { const e = r.events.find((x: Json) => x.eventId === e3.id); return eq(e.allocated, 20000) && eq(e.outstanding, 30000); })(), r.events);
  check("After P1-P3: unallocated 80,000", eq(r.unallocated, 80000), r);
  const recv = (await api("GET", "/finance/receivables")).data;
  const recvClient = recv.byClient.find((c: Json) => c.clientId === client.id);
  check("Receivables page: client not listed as owing", !recvClient || eq(recvClient.outstanding, 0), recvClient);

  // ── Validation ─────────────────────────────────────────────────────────
  const bad = async (name: string, path: string, body: unknown, method = "POST") => {
    const res = await api(method, path, body);
    check(`Rejects ${name}`, res.status === 400, res);
  };
  const base = { amount: 1000, payment_date: `${year}-05-01`, fund_account_id: fundA.id };
  await bad("zero amount", `/clients/${client.id}/payments`, { ...base, amount: 0 });
  await bad("invalid date", `/clients/${client.id}/payments`, { ...base, payment_date: "2031-02-30" });
  await bad("invalid fund", `/clients/${client.id}/payments`, { ...base, fund_account_id: 999999 });
  await bad("allocation above payment", `/clients/${client.id}/payments`, { ...base, allocations: [{ eventId: e1.id, amount: 2000 }] });
  await bad("event of another client", `/clients/${client.id}/payments`, { ...base, allocations: [{ eventId: otherEvent.id, amount: 500 }] });
  await bad("duplicate event allocation", `/clients/${client.id}/payments`, { ...base, allocations: [{ eventId: e1.id, amount: 300 }, { eventId: e1.id, amount: 300 }] });
  await bad("allocation above event outstanding", `/clients/${client.id}/payments`, { amount: 40000, payment_date: `${year}-05-01`, fund_account_id: fundA.id, allocations: [{ eventId: e3.id, amount: 35000 }] });
  const unknownClient = await api("POST", `/clients/999999/payments`, base);
  check("Rejects unknown client", unknownClient.status === 400, unknownClient);
  check("Rejected requests changed nothing", eq(await balance(fundA.id), 100000));

  // ── Overpayment → client credit ────────────────────────────────────────
  const p4 = await api("POST", `/clients/${client.id}/payments`, { amount: 10000, payment_date: `${year}-04-20`, fund_account_id: fundA.id });
  r = await receivable();
  check("Overpayment: outstanding stays 0, credit 10,000", p4.status === 201 && eq(r.outstanding, 0) && eq(r.credit, 10000), r);
  const recv2 = (await api("GET", "/finance/receivables")).data;
  check("Receivables page lists the client credit", eq(recv2.byClient.find((c: Json) => c.clientId === client.id)?.credit ?? 0, 10000), recv2.byClient);

  // ── Edit: amount + fund change, then allocation change ─────────────────
  const edit = await api("PATCH", `/payments/${p1.data.id}`, { amount: 50000, fund_account_id: fundB.id });
  check("Edit P1 to ₹50,000 into Fund B", edit.status === 200 && eq(edit.data.amount, 50000) && edit.data.fundAccountId === fundB.id, edit);
  check("Edit: Fund A reversed (-60,000) → 50,000", eq(await balance(fundA.id), 50000));
  check("Edit: Fund B +50,000", eq(await balance(fundB.id), 50000));
  const tx = (await api("GET", `/fund-accounts/${fundA.id}/transactions`)).data.transactions as Json[];
  check("Edit: one reversal row on Fund A", tx.filter((t) => t.transaction_type === "client_payment_reversal").length === 1, tx);

  const realloc = await api("PATCH", `/payments/${p2.data.id}`, { allocations: [{ eventId: e1.id, amount: 20000 }] });
  check("Edit P2 to allocate Event 1", realloc.status === 200 && realloc.data.allocations.length === 1, realloc);
  const shrink = await api("PATCH", `/payments/${p3.data.id}`, { amount: 10000 });
  check("Rejects lowering amount below its allocations", shrink.status === 400, shrink);
  const toClientLevel = await api("PUT", `/payments/${p3.data.id}/allocations`, { allocations: [] });
  check("PUT empty allocations makes P3 client-level", toClientLevel.status === 200 && eq(toClientLevel.data.unallocated, 20000), toClientLevel);

  // ── Reversal (delete) ──────────────────────────────────────────────────
  const del = await api("DELETE", `/payments/${p4.data.id}`);
  check("Delete P4 succeeds", del.status === 204, del);
  check("Delete: Fund A reversed → 40,000", eq(await balance(fundA.id), 40000));
  r = await receivable();
  check("After edits/delete: received 90,000, outstanding 10,000, credit 0", eq(r.totalReceived, 90000) && eq(r.outstanding, 10000) && eq(r.credit, 0), r);
  const gone = await api("GET", `/payments/${p4.data.id}`);
  check("Deleted payment no longer exists", gone.status === 404, gone);

  // ── Legacy compatibility ───────────────────────────────────────────────
  const legacyClient = (await api("POST", "/clients", { name: `${tag} Legacy`, clientType: "corporate" })).data;
  // Different reporting year so it does not change the P&L checks below.
  const legacyEvent = await mkEvent(legacyClient.id, "Legacy event", 40000, 10000, year + 1);
  let lr = (await api("GET", `/clients/${legacyClient.id}/receivables`)).data;
  check("Legacy: event-level ₹10,000 collected counts as received", eq(lr.totalReceived, 10000) && eq(lr.outstanding, 30000), lr);
  await api("POST", `/clients/${legacyClient.id}/payments`, { amount: 30000, payment_date: `${year}-06-01`, fund_account_id: fundB.id });
  lr = (await api("GET", `/clients/${legacyClient.id}/receivables`)).data;
  check("Legacy + client-level payment: received 40,000, outstanding 0, no double count", eq(lr.totalReceived, 40000) && eq(lr.outstanding, 0) && eq(lr.credit, 0), lr);
  const legacyEv = (await api("GET", `/events/${legacyEvent.id}`)).data;
  check("Legacy event record itself is untouched", eq(legacyEv.revenue?.totalCollected ?? legacyEv.totalCollected, 10000), legacyEv);

  // ── Fund transfer is internal ──────────────────────────────────────────
  const preTransfer = await summary();
  const transfer = await api("POST", "/fund-transfers", { from_account_id: fundB.id, to_account_id: fundA.id, amount: 5000, date: `${year}-06-02`, description: "Test settlement" });
  const postTransfer = await summary();
  check("Transfer created", transfer.status === 201, transfer);
  check("Transfer: P&L unchanged", JSON.stringify(pnl(preTransfer)) === JSON.stringify(pnl(postTransfer)));
  const history = (await api("GET", "/fund-transfers")).data as Json[];
  check("Transfer appears first in history with fund names", history[0]?.id === transfer.data.id && history[0].from_account_name === fundB.name, history[0]);

  // ── Final reconciliation ───────────────────────────────────────────────
  const final = await summary();
  check("Final: P&L identical to before any payment", JSON.stringify(pnl(final)) === JSON.stringify(pnl(before)), { before: pnl(before), final: pnl(final) });
  check("Final: Finance Summary receivables = 10,000 (ABC) + 10,000 (Other)", eq(final.totalReceivables, 20000), final.totalReceivables);
  const cashIn = (await balance(fundA.id)) + (await balance(fundB.id));
  check("Final: fund cash = new client payments still on record (50k+20k+20k+30k)", eq(cashIn, 120000), cashIn);

  const audit = (await api("GET", "/audit-logs?entityType=client_payment&limit=100")).data.data as Json[];
  check("Audit: create/update/delete entries recorded", ["create", "update", "delete"].every((a) => audit.some((l) => l.action === a)), audit.map((l) => l.action));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
