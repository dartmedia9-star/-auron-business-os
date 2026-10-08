/**
 * Integration test for event invoice values: contract value (excl. GST),
 * discount and GST give the final invoice value (incl. GST). Receivables use
 * the invoice; P&L revenue stays GST-exclusive; cash and funds move only by
 * the amount actually received.
 *
 * LOCAL / TEST DATABASES ONLY: it creates clients, events, a fund account and
 * payments that are not removed. Never point it at production.
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   npx tsx ./test-gst-invoice.ts      (from scripts/)
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

  const tag = `__gsttest_${Date.now()}`;
  const year = 2200 + (Math.floor(Date.now() / 1000) % 700);

  const fund = (await api("POST", "/fund-accounts", { name: `${tag} Fund`, opening_balance: 0 })).data;
  const client = (await api("POST", "/clients", { name: `${tag} Client`, clientType: "corporate" })).data;

  const mkEvent = async (name: string, revenue: Record<string, unknown>, month = 3, clientId = client.id) => {
    const ev = (await api("POST", "/events", { name: `${tag} ${name}`, clientId, eventType: "corporate", eventDate: `${year}-${String(month).padStart(2, "0")}-15` })).data;
    const saved = await api("POST", `/events/${ev.id}/revenue`, revenue);
    return { ev, saved: saved.data };
  };
  const revenueOf = async (eventId: number) => (await api("GET", `/events/${eventId}/revenue`)).data;
  const receivable = async (id = client.id) => (await api("GET", `/clients/${id}/receivables`)).data;
  const eventRow = async (eventId: number, clientId = client.id) => ((await receivable(clientId)).events as Json[]).find((e) => e.eventId === eventId);
  const balance = async (id: number) => (await api("GET", `/fund-accounts/${id}`)).data.current_balance as number;
  const summary = async () => (await api("GET", `/finance/summary?year=${year}`)).data;

  // 1. Contract 100,000 + GST 18,000 → invoice 118,000.
  const e1 = await mkEvent("Invoice 118k", { contractValue: 100000, gst: 18000 });
  const r1 = await revenueOf(e1.ev.id);
  check("1. Contract 100,000 + GST 18,000 → invoice 118,000", eq(r1.totalInvoiceValue, 118000) && eq(e1.saved.totalInvoiceValue, 118000), r1);
  check("1. P&L revenue (netRevenue) stays 100,000", eq(r1.netRevenue, 100000), r1);

  // 2. Contract 50,000 + GST 9,000 → 59,000.
  const e2 = await mkEvent("Invoice 59k", { contractValue: 50000, gst: 9000 }, 3, (await api("POST", "/clients", { name: `${tag} Second`, clientType: "corporate" })).data.id);
  check("2. Contract 50,000 + GST 9,000 → invoice 59,000", eq((await revenueOf(e2.ev.id)).totalInvoiceValue, 59000));

  // 3. Zero GST: invoice = contract.
  const zeroClient = (await api("POST", "/clients", { name: `${tag} Zero GST`, clientType: "corporate" })).data;
  const e3 = await mkEvent("Zero GST", { contractValue: 75000, gst: 0 }, 3, zeroClient.id);
  const r3 = await revenueOf(e3.ev.id);
  check("3. Zero GST: invoice = revenue = 75,000", eq(r3.totalInvoiceValue, 75000) && eq(r3.netRevenue, 75000), r3);
  check("3. Zero GST: receivable 75,000", eq((await receivable(zeroClient.id)).outstanding, 75000));

  // 4. Decimal values.
  const decClient = (await api("POST", "/clients", { name: `${tag} Decimal`, clientType: "corporate" })).data;
  const e4 = await mkEvent("Decimal", { contractValue: 12345.67, gst: 2222.22 }, 3, decClient.id);
  const r4 = await revenueOf(e4.ev.id);
  check("4. 12,345.67 + 2,222.22 → 14,567.89 exactly", r4.totalInvoiceValue === 14567.89 && r4.netRevenue === 12345.67, r4);
  check("4. Decimal receivable 14,567.89", (await receivable(decClient.id)).outstanding === 14567.89);

  // 5. Existing discount meaning: discount reduces the taxable value; GST is
  //    entered on the discounted value. 100,000 - 10,000 + 16,200 = 106,200.
  const discClient = (await api("POST", "/clients", { name: `${tag} Discount`, clientType: "corporate" })).data;
  const e5 = await mkEvent("Discount", { contractValue: 100000, discount: 10000, gst: 16200 }, 3, discClient.id);
  const r5 = await revenueOf(e5.ev.id);
  check("5. Discount: invoice 106,200", eq(r5.totalInvoiceValue, 106200), r5);
  check("5. Discount: P&L revenue 90,000 (excl. GST, after discount)", eq(r5.netRevenue, 90000), r5);
  check("5. Discount: receivable 106,200", eq((await receivable(discClient.id)).outstanding, 106200));

  // 6. Receivable uses the GST-inclusive invoice value.
  let rc = await receivable();
  check("6. Client billed = invoice 118,000; outstanding 118,000", eq(rc.totalBilled, 118000) && eq(rc.outstanding, 118000), rc);
  check("6. Event outstanding 118,000", eq((await eventRow(e1.ev.id)).outstanding, 118000));
  const evDetail = (await api("GET", `/events/${e1.ev.id}`)).data;
  check("6. Event detail: revenue 100,000, outstanding 118,000", eq(evDetail.totalRevenue, 100000) && eq(evDetail.totalOutstanding, 118000), evDetail);

  // 7. P&L revenue stays GST-exclusive for the year.
  const s = await summary();
  const expectedRevenue = 100000 + 50000 + 75000 + 12345.67 + 90000;
  check("7. Finance Summary revenue = sum of GST-exclusive revenue", eq(s.revenue, expectedRevenue), { revenue: s.revenue, expectedRevenue });
  check("7. Gross profit uses revenue excl. GST", eq(s.grossProfit, expectedRevenue - s.directCosts), s);
  const expectedReceivables = 118000 + 59000 + 75000 + 14567.89 + 106200;
  check("7. Finance Summary receivables use invoice values incl. GST", eq(s.totalReceivables, expectedReceivables), { totalReceivables: s.totalReceivables, expectedReceivables });

  // 8 & 9. Client pays 50,000: received 50,000, outstanding 68,000, fund +50,000.
  const fundBefore = await balance(fund.id);
  const p = await api("POST", `/clients/${client.id}/payments`, { amount: 50000, event_id: e1.ev.id, fund_account_id: fund.id, payment_date: `${year}-04-01` });
  check("8. Payment of 50,000 recorded against the event", p.status === 201 && eq(p.data.allocated, 50000), p.data);
  rc = await receivable();
  check("8. Received 50,000, outstanding 68,000", eq(rc.totalReceived, 50000) && eq(rc.outstanding, 68000), rc);
  check("8. Event outstanding 68,000", eq((await eventRow(e1.ev.id)).outstanding, 68000));
  check("9. Fund +50,000 (actual cash only)", eq((await balance(fund.id)) - fundBefore, 50000));

  // 15. New Transaction caps the event at its invoice; the rest is credit.
  const p2 = await api("POST", `/clients/${client.id}/payments`, { amount: 80000, event_id: e1.ev.id, fund_account_id: fund.id, payment_date: `${year}-04-02` });
  check("15. 80,000 against 68,000 due: 68,000 to event, 12,000 credit", p2.status === 201 && eq(p2.data.allocated, 68000) && eq(p2.data.unallocated, 12000), p2.data);
  rc = await receivable();
  check("15. Client credit 12,000; event fully settled at the invoice", eq(rc.credit, 12000) && eq(rc.outstanding, 0) && eq((await eventRow(e1.ev.id)).outstanding, 0), rc);
  check("15. Fund received the full 130,000", eq((await balance(fund.id)) - fundBefore, 130000));
  const tooMuch = await api("POST", `/clients/${client.id}/payments`, { amount: 1000, fund_account_id: fund.id, payment_date: `${year}-04-03`, allocations: [{ eventId: e1.ev.id, amount: 1000 }] });
  check("15. Manual allocation beyond the invoice is rejected with a formatted amount", tooMuch.status === 400 && /₹0\.00/.test(String(tooMuch.data?.error)), tooMuch);

  // 14. Legacy collections settle against the invoice incl. GST.
  const legacyClient = (await api("POST", "/clients", { name: `${tag} Legacy`, clientType: "corporate" })).data;
  const e14 = await mkEvent("Legacy", { contractValue: 100000, gst: 18000, advanceReceived: 60000, secondPayment: 40000 }, 3, legacyClient.id);
  const r14 = await revenueOf(e14.ev.id);
  check("14. Legacy collected 100,000 of a 118,000 invoice: 18,000 still due", eq(r14.outstandingAmount, 18000) && eq((await receivable(legacyClient.id)).outstanding, 18000), r14);
  const legacyNoGst = await mkEvent("Legacy no GST", { contractValue: 60000, advanceReceived: 50000 }, 3, legacyClient.id);
  check("14. Legacy record without GST unchanged: 10,000 due", eq((await eventRow(legacyNoGst.ev.id, legacyClient.id)).outstanding, 10000));

  // 16. Fund transaction history shows exactly the cash received.
  const hist = (await api("GET", `/fund-transactions?clientId=${client.id}&limit=200`)).data;
  const net = (hist.data as Json[]).reduce((sum, x) => sum + x.signedAmount, 0);
  check("16. Fund history for the client nets 130,000 (no GST/revenue rows)", eq(net, 130000) && (hist.data as Json[]).every((x) => x.category === "client_payment"), hist.totals);

  // 17. Cash flow shows cash received, not invoice or revenue.
  const cfApr = (await api("GET", `/performance/monthly/cashflow?year=${year}&month=4`)).data;
  const cfMar = (await api("GET", `/performance/monthly/cashflow?year=${year}&month=3`)).data;
  check("17. April cash in = 130,000 received", eq(cfApr.totalCashIn, 130000), cfApr.totalCashIn);
  check("17. March (revenue month) has no cash in", eq(cfMar.totalCashIn, 0), cfMar.totalCashIn);

  // Month views report outstanding from the same ledger.
  const monthEvents = (await api("GET", `/performance/monthly/events?year=${year}&month=3`)).data.events as Json[];
  const m14 = monthEvents.find((e) => e.id === e14.ev.id);
  const m1 = monthEvents.find((e) => e.id === e1.ev.id);
  check("Month events: outstanding uses invoice and payments", eq(m14?.outstandingAmount, 18000) && eq(m1?.outstandingAmount, 0) && eq(m1?.totalCollected, 118000), { m1, m14 });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
