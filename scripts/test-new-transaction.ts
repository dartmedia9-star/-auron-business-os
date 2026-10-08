/**
 * Integration test for the unified "New Transaction" money flows:
 * Money Received (client-level, event auto-split, excess as client credit,
 * idempotent submits, concurrent submits), the unified fund transaction
 * history and its detail view, cash flow (revenue vs cash, transfers as
 * internal, payment dates), expenses paid from dynamically created funds,
 * and reconciliation across Finance Summary, receivables and fund balances.
 *
 * LOCAL / TEST DATABASES ONLY. It creates clients, events, fund accounts,
 * payments, expenses and transfers that are NOT removed afterwards. Never
 * point it at production.
 *
 * Usage (from the repository root, against a running API server on a
 * disposable database):
 *
 *   ALLOW_TEST_DATA=1 BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-new-transaction.ts
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

  const tag = `__nttest_${Date.now()}`;
  // A reporting year no real data uses, different on every run, so totals
  // for the year/months below only contain this run's records.
  const year = 2200 + (Math.floor(Date.now() / 1000) % 700);

  const fundA = (await api("POST", "/fund-accounts", { name: `${tag} Fund A`, opening_balance: 0 })).data;
  const fundB = (await api("POST", "/fund-accounts", { name: `${tag} Fund B`, opening_balance: 0 })).data;
  const client = (await api("POST", "/clients", { name: `${tag} Ergo`, clientType: "corporate" })).data;
  const other = (await api("POST", "/clients", { name: `${tag} Other`, clientType: "corporate" })).data;

  const mkEvent = async (clientId: number, name: string, revenue: number, legacyCollected = 0, month = 3) => {
    const ev = (await api("POST", "/events", { name: `${tag} ${name}`, clientId, eventType: "corporate", eventDate: `${year}-${String(month).padStart(2, "0")}-15` })).data;
    await api("POST", `/events/${ev.id}/revenue`, { contractValue: revenue, advanceReceived: legacyCollected });
    return ev;
  };

  const summary = async () => (await api("GET", `/finance/summary?year=${year}`)).data;
  const receivable = async (id = client.id) => (await api("GET", `/clients/${id}/receivables`)).data;
  const eventRow = async (eventId: number, clientId = client.id) => ((await receivable(clientId)).events as Json[]).find((e) => e.eventId === eventId);
  const balance = async (id: number) => (await api("GET", `/fund-accounts/${id}`)).data.current_balance as number;
  const pnl = (s: Json) => ({ revenue: s.revenue, directCosts: s.directCosts, grossProfit: s.grossProfit, operatingExpenses: s.operatingExpenses, ebitda: s.ebitda, netProfit: s.netProfit });
  const cashflow = async (m: number) => (await api("GET", `/performance/monthly/cashflow?year=${year}&month=${m}`)).data;
  const ledger = async (query: string) => (await api("GET", `/fund-transactions?${query}`)).data;
  const pay = (body: Record<string, unknown>, clientId = client.id) =>
    api("POST", `/clients/${clientId}/payments`, { payment_date: `${year}-04-01`, fund_account_id: fundA.id, ...body });

  // 1. Revenue with no payment leaves funds unchanged.
  const agm = await mkEvent(client.id, "AGM", 100000);
  check("1. Revenue ₹1,00,000 recorded, no payment: Fund A unchanged", eq(await balance(fundA.id), 0) && eq(await balance(fundB.id), 0));
  const before = await summary();
  check("1. Revenue counts in P&L, receivable is 1,00,000", eq(before.revenue, 100000) && eq(before.totalReceivables, 100000), before);
  const marCash = await cashflow(3);
  check("1. Revenue month has no cash movement for it", eq(marCash.totalCashIn, 0), marCash);

  // 2. Client payment ₹60,000 into Fund A (client-level).
  const p60 = await pay({ amount: 60000, payment_method: "Bank Transfer", reference: "NEFT-1", notes: "Advance" });
  check("2. Payment ₹60,000 created client-level", p60.status === 201 && p60.data.allocations.length === 0, p60.data);
  check("2. Fund A +60,000", eq(await balance(fundA.id), 60000));

  // 4. Payment without event: client-level, no event changed.
  let r = await receivable();
  check("4. Client received 60,000, outstanding 40,000", eq(r.totalReceived, 60000) && eq(r.outstanding, 40000), r);
  check("4. No event received amount changed", (await eventRow(agm.id)).allocated === 0, await eventRow(agm.id));
  check("4. Shows as client-level unallocated 60,000", eq(r.unallocated, 60000), r);

  // 3. Payment linked to an event updates that event.
  const gala = await mkEvent(client.id, "Gala", 60000, 50000); // ₹60k revenue, ₹50k legacy collected
  const pGala = await pay({ amount: 5000, event_id: gala.id, fund_account_id: fundB.id });
  const galaRow = await eventRow(gala.id);
  check("3. Event payment allocated to the event", pGala.status === 201 && pGala.data.allocations[0]?.eventId === gala.id && eq(pGala.data.allocated, 5000), pGala.data);
  check("3. Event outstanding 10,000 → 5,000", eq(galaRow.outstanding, 5000) && eq(galaRow.allocated, 5000), galaRow);
  const galaEvent = (await api("GET", `/events/${gala.id}`)).data;
  check("3. Event detail received = 55,000 (legacy 50k + 5k)", eq(galaEvent.totalCollected, 55000) && eq(galaEvent.totalOutstanding, 5000), galaEvent);

  // 5. Excess over event outstanding becomes client-level credit.
  const pExcess = await pay({ amount: 20000, event_id: gala.id, payment_date: `${year}-04-03` });
  const galaAfter = await eventRow(gala.id);
  check("5. ₹20,000 against ₹5,000 outstanding: ₹5,000 to event, ₹15,000 client-level", pExcess.status === 201 && eq(pExcess.data.allocated, 5000) && eq(pExcess.data.unallocated, 15000), pExcess.data);
  check("5. Event received capped at its revenue (60,000), outstanding 0", eq(galaAfter.legacyCollected + galaAfter.allocated, 60000) && eq(galaAfter.outstanding, 0), galaAfter);
  check("5. Fund A got the full ₹20,000", eq(await balance(fundA.id), 80000));
  const pNothingLeft = await pay({ amount: 1000, event_id: gala.id, payment_date: `${year}-04-04` });
  check("5. Event already settled: whole payment stays client-level", pNothingLeft.status === 201 && pNothingLeft.data.allocations.length === 0 && eq(pNothingLeft.data.unallocated, 1000), pNothingLeft.data);

  // Exact example from the brief: ₹60k revenue, ₹50k received, ₹20k payment.
  const example = (await api("POST", "/clients", { name: `${tag} Example`, clientType: "corporate" })).data;
  const exampleEvent = await mkEvent(example.id, "Example AGM", 60000, 50000);
  const exFundBefore = await balance(fundB.id);
  const ex = await pay({ amount: 20000, event_id: exampleEvent.id, fund_account_id: fundB.id }, example.id);
  const exReceivable = await receivable(example.id);
  const exEvent = (exReceivable.events as Json[])[0];
  check("5. Brief example: ₹10k to event, ₹10k client credit, Fund +₹20k",
    ex.status === 201 && eq(ex.data.allocated, 10000) && eq(ex.data.unallocated, 10000) && eq(exReceivable.credit, 10000) && eq((await balance(fundB.id)) - exFundBefore, 20000),
    { payment: ex.data, receivable: exReceivable });
  check("5. Brief example: event received 60k of 60k, never 70k", eq(exEvent.legacyCollected + exEvent.allocated, 60000) && eq(exEvent.outstanding, 0), exEvent);

  // Validation.
  const bad = async (name: string, res: Promise<{ status: number; data: Json }>, status = 400) => {
    const out = await res;
    check(`Rejects ${name}`, out.status === status, out);
  };
  const otherEvent = await mkEvent(other.id, "Other event", 10000);
  const fundABeforeBad = await balance(fundA.id);
  await bad("event of another client", pay({ amount: 100, event_id: otherEvent.id }));
  await bad("unknown event", pay({ amount: 100, event_id: 99999999 }));
  await bad("event_id together with allocations", pay({ amount: 100, event_id: agm.id, allocations: [{ eventId: agm.id, amount: 100 }] }));
  await bad("negative amount", pay({ amount: -5 }));
  await bad("unknown fund", pay({ amount: 100, fund_account_id: 99999999 }));
  await bad("unknown client", pay({ amount: 100 }, 99999999));
  check("Rejected submissions changed no fund", eq(await balance(fundA.id), fundABeforeBad));

  // Duplicate submission protection.
  const key = `${tag}-key-1`;
  const firstSubmit = await pay({ amount: 777, idempotency_key: key });
  const secondSubmit = await pay({ amount: 777, idempotency_key: key });
  check("Duplicate submit returns the original payment", firstSubmit.status === 201 && secondSubmit.status === 200 && secondSubmit.data.id === firstSubmit.data.id, { firstSubmit, secondSubmit });
  const racingKey = `${tag}-key-2`;
  const racing = await Promise.all([pay({ amount: 333, idempotency_key: racingKey }), pay({ amount: 333, idempotency_key: racingKey })]);
  check("Two identical submits at once record one payment", racing.every((x) => x.status === 200 || x.status === 201) && racing[0].data.id === racing[1].data.id, racing);
  const keyOtherClient = await pay({ amount: 777, idempotency_key: key }, other.id);
  check("Rejects reusing a submission key for another client", keyOtherClient.status === 409, keyOtherClient);
  const dupLedger = await ledger(`clientId=${client.id}&type=client_payment`);
  check("Duplicate submits posted one ledger row each", (dupLedger.data as Json[]).filter((t) => eq(t.amount, 777) || eq(t.amount, 333)).length === 2, dupLedger.data);

  // Concurrent event payments cannot over-allocate the event.
  const raceEvent = await mkEvent(client.id, "Race", 10000);
  const race = await Promise.all([
    pay({ amount: 10000, event_id: raceEvent.id }),
    pay({ amount: 10000, event_id: raceEvent.id }),
  ]);
  const raceRow = await eventRow(raceEvent.id);
  check("Concurrent event payments: event allocated exactly 10,000 in total", race.every((x) => x.status === 201) && eq(raceRow.allocated, 10000) && eq(raceRow.outstanding, 0), { race: race.map((x) => x.data), raceRow });

  // 6. Multiple payments across different funds.
  const aBefore = await balance(fundA.id);
  const bBefore = await balance(fundB.id);
  await pay({ amount: 1500, fund_account_id: fundA.id });
  await pay({ amount: 2500, fund_account_id: fundB.id });
  check("6. Payments into two funds land in each fund", eq((await balance(fundA.id)) - aBefore, 1500) && eq((await balance(fundB.id)) - bBefore, 2500));

  // 10. Unified history includes client payments with client, event, method.
  const hist = await ledger(`clientId=${client.id}`);
  const p60Row = (hist.data as Json[]).find((t) => t.relatedClientPaymentId === p60.data.id);
  check("10. Ledger lists the ₹60,000 payment with client, fund, method, reference",
    p60Row && p60Row.clientName === client.name && p60Row.fundAccountName === fundA.name && p60Row.paymentMethod === "Bank Transfer" && p60Row.reference === "NEFT-1" && p60Row.direction === "in" && p60Row.status === "posted",
    p60Row);
  const excessRow = (hist.data as Json[]).find((t) => t.relatedClientPaymentId === pExcess.data.id);
  check("10. Ledger row shows the event it was allocated to", excessRow?.events?.[0]?.eventId === gala.id && eq(excessRow.events[0].amount, 5000), excessRow);

  // 7. Payment edit.
  const edit = await api("PATCH", `/payments/${p60.data.id}`, { amount: 50000, fund_account_id: fundB.id });
  check("7. Edit ₹60,000 Fund A → ₹50,000 Fund B", edit.status === 200 && eq(edit.data.amount, 50000));
  const editRows = (await ledger(`clientId=${client.id}`)).data as Json[];
  const p60Rows = editRows.filter((t) => t.relatedClientPaymentId === p60.data.id);
  check("7. Ledger: original row reversed, reversal row, new posted row",
    p60Rows.length === 3 && p60Rows.some((t) => t.transactionType === "client_payment" && t.status === "reversed" && t.fundAccountId === fundA.id)
      && p60Rows.some((t) => t.transactionType === "client_payment_reversal" && t.status === "reversal" && t.fundAccountId === fundA.id)
      && p60Rows.some((t) => t.transactionType === "client_payment" && t.status === "posted" && t.fundAccountId === fundB.id && eq(t.amount, 50000)),
    p60Rows);

  // 8. Payment reversal (delete).
  const toDelete = await pay({ amount: 4321, payment_method: "UPI", reference: "UPI-9" });
  const aBeforeDelete = await balance(fundA.id);
  const del = await api("DELETE", `/payments/${toDelete.data.id}`);
  check("8. Reversal: Fund A -4,321", del.status === 204 && eq(aBeforeDelete - (await balance(fundA.id)), 4321));
  const delRows = ((await ledger(`clientId=${client.id}`)).data as Json[]).filter((t) => t.relatedClientPaymentId === toDelete.data.id);
  check("8. Deleted payment still traceable in the ledger with its client and method",
    delRows.length === 2 && delRows.every((t) => t.clientName === client.name && t.paymentDeleted === true && t.paymentMethod === "UPI"),
    delRows);

  // Detail view.
  const detailId = p60Rows.find((t) => t.status === "posted")?.id;
  const detail = (await api("GET", `/fund-transactions/${detailId}`)).data;
  check("Detail: related payment, allocation status, all ledger legs and audit trail",
    detail.related?.payment?.id === p60.data.id && detail.allocationStatus === "client_level"
      && detail.related.ledgerEntries.length === 3 && detail.audit.some((a: Json) => a.action === "create") && detail.audit.some((a: Json) => a.action === "update")
      && typeof detail.createdByName === "string",
    detail);
  const excessDetail = (await api("GET", `/fund-transactions/${excessRow.id}`)).data;
  check("Detail: split payment is partially allocated", excessDetail.allocationStatus === "partially_allocated", excessDetail.allocationStatus);
  const delDetail = (await api("GET", `/fund-transactions/${delRows[0].id}`)).data;
  check("Detail: deleted payment keeps its audit trail", delDetail.related?.payment?.deleted === true && delDetail.audit.some((a: Json) => a.action === "delete"), delDetail);

  // 9. Legacy event-level payment + new client payment without double counting.
  const legacyClient = (await api("POST", "/clients", { name: `${tag} Legacy`, clientType: "corporate" })).data;
  const legacyEvent = await mkEvent(legacyClient.id, "Legacy", 40000, 10000);
  await pay({ amount: 30000, event_id: legacyEvent.id, fund_account_id: fundB.id }, legacyClient.id);
  const lr = await receivable(legacyClient.id);
  check("9. Legacy 10k + new 30k: received 40k, outstanding 0, no credit", eq(lr.totalReceived, 40000) && eq(lr.outstanding, 0) && eq(lr.credit, 0), lr);
  const legacyRow = (lr.events as Json[])[0];
  check("9. Legacy event: legacy 10k + allocated 30k, outstanding 0", eq(legacyRow.legacyCollected, 10000) && eq(legacyRow.allocated, 30000) && eq(legacyRow.outstanding, 0), legacyRow);
  const legacyRaw = (await api("GET", `/events/${legacyEvent.id}/revenue`)).data;
  check("9. Legacy event_revenue record untouched", eq(legacyRaw.totalCollected, 10000) && eq(legacyRaw.outstandingAmount, 30000), legacyRaw);

  // 11. Fund transfer history and cash flow treatment.
  const t = await api("POST", "/fund-transfers", { from_account_id: fundB.id, to_account_id: fundA.id, amount: 7000, date: `${year}-04-20`, description: "Internal move" });
  const transfers = (await api("GET", "/fund-transfers")).data as Json[];
  const listed = transfers.find((x) => x.id === t.data.id);
  check("11. Transfer recorded and listed in transfer history", t.status === 201 && listed?.ledger_posted === true && listed.from_account_name === fundB.name, listed);
  const transferRows = ((await ledger(`category=transfer&fromDate=${year}-04-20&toDate=${year}-04-20`)).data as Json[]).filter((x) => x.relatedTransferId === t.data.id);
  check("11. Unified ledger shows both legs with the other fund named",
    transferRows.length === 2 && transferRows.every((x) => x.isInternalTransfer) && transferRows.some((x) => x.direction === "out" && x.counterpartyFundName === fundA.name),
    transferRows);

  // 12/13. Cash flow: revenue is not cash, payments by payment date, transfers internal.
  const april = await cashflow(4);
  const aprilClientIn = (april.transactions as Json[]).filter((x) => x.type === "client_payment").reduce((s: number, x: Json) => s + x.moneyIn, 0);
  const aprilRows = april.transactions as Json[];
  const aprilNonTransferIn = aprilRows.filter((x) => !x.isInternalTransfer).reduce((s: number, x: Json) => s + x.moneyIn, 0);
  const aprilNonTransferOut = aprilRows.filter((x) => !x.isInternalTransfer).reduce((s: number, x: Json) => s + x.moneyOut, 0);
  check("12. April cash in/out exclude the ₹7,000 transfer legs (still listed as internal)",
    aprilRows.some((x) => x.type === "transfer_in" && x.isInternalTransfer && eq(x.moneyIn, 7000)) && eq(april.totalCashIn, aprilNonTransferIn) && eq(april.totalCashOut, aprilNonTransferOut),
    april);
  check("12. Transfer still listed separately as internal", eq(april.totalTransfers, 7000) && (april.transfers as Json[]).some((x) => x.id === t.data.id));
  check("12. Client payments reported as their own inflow", eq(april.clientPaymentTotal, aprilClientIn) && eq(april.netClientReceipts, april.clientPaymentTotal - april.clientPaymentReversalTotal), april);
  check("12. March (revenue month) has no cash in", eq((await cashflow(3)).totalCashIn, 0));
  const backdated = await pay({ amount: 2222, payment_date: `${year}-02-10` });
  const feb = await cashflow(2);
  check("13. Backdated payment counted in its payment month", backdated.status === 201 && (feb.transactions as Json[]).some((x) => x.type === "client_payment" && eq(x.amount, 2222) && x.transactionDate === `${year}-02-10`), feb.transactions);
  check("13. Feb cash in = the backdated payment", eq(feb.totalCashIn, 2222), feb);

  // Dynamic-fund expense: a newly created fund pays an expense.
  const fundC = (await api("POST", "/fund-accounts", { name: `${tag} Fund C`, opening_balance: 10000 })).data;
  const exp = await api("POST", "/finance/expenses", { category: "Admin", description: `${tag} stationery`, amount: 1000, gst: 180, year, month: 4, date: `${year}-04-25`, paidBy: fundC.name });
  check("Expense paid by a new fund deducts it (amount + GST)", exp.status === 201 && eq(await balance(fundC.id), 8820));
  await api("PATCH", `/finance/expenses/${exp.data.id}`, { paidBy: fundA.name });
  check("Expense moved to another fund: new fund restored", eq(await balance(fundC.id), 10000));
  await api("DELETE", `/finance/expenses/${exp.data.id}`);
  const expRows = (await ledger(`category=expense&fromDate=${year}-04-25&toDate=${year}-04-25`)).data as Json[];
  check("Expense delete reverses only what was posted", expRows.filter((x) => x.transactionType === "expense_reversal").length === 2 && eq(await balance(fundC.id), 10000));
  const reserved = await api("POST", "/fund-accounts", { name: "Other", opening_balance: 0 });
  check("Rejects a fund named like the untracked payer 'Other'", reserved.status === 400, reserved);

  // Historic expense that never posted (payer was not a fund when recorded):
  // editing it must not credit money that was never deducted.
  const lateName = `${tag} Late Fund`;
  const oldExp = await api("POST", "/finance/expenses", { category: "Admin", description: `${tag} old`, amount: 500, year, month: 4, date: `${year}-04-26`, paidBy: lateName });
  const lateFund = (await api("POST", "/fund-accounts", { name: lateName, opening_balance: 2000 })).data;
  check("Historic unposted expense: new fund starts at its opening balance", oldExp.status === 201 && eq(await balance(lateFund.id), 2000));
  await api("PATCH", `/finance/expenses/${oldExp.data.id}`, { amount: 600 });
  check("Editing it posts only the new deduction, no phantom reversal credit", eq(await balance(lateFund.id), 1400));

  // 14. Finance Summary: P&L comes from billed revenue and expenses only.
  // Events this run billed: AGM 100k, Gala 60k, Example 60k, Other 10k,
  // Race 10k, Legacy 40k. The only expense still on record is the 600 one.
  const after = await summary();
  check("14. Revenue = billed events only (2,80,000), unaffected by any payment", eq(after.revenue, 280000), after.revenue);
  check("14. EBITDA = revenue - opex (2,80,000 - 600)", eq(after.operatingExpenses, 600) && eq(after.ebitda, 279400) && eq(after.directCosts, 0), pnl(after));
  check("14. Finance Summary receivables = sum of client outstanding",
    eq(after.totalReceivables, (await Promise.all([client.id, other.id, example.id, legacyClient.id].map(async (id) => (await receivable(id)).outstanding))).reduce((s, x) => s + x, 0)),
    after.totalReceivables);
  const fundSum = (after.fundAccounts as Json[]).filter((a) => String(a.name).startsWith(tag)).reduce((s: number, a: Json) => s + a.balance, 0);
  const tagLedger = await Promise.all([fundA.id, fundB.id, fundC.id, lateFund.id].map((id) => balance(id)));
  check("14. Finance Summary fund balances match each fund's ledger", eq(fundSum, tagLedger.reduce((s, x) => s + x, 0)), { fundSum, tagLedger });

  // 15. Event profitability unchanged by collections.
  const agmProfit = (await api("GET", `/events/${agm.id}`)).data;
  check("15. Event profitability reflects revenue, not cash", eq(agmProfit.totalRevenue, 100000) && eq(agmProfit.grossProfit, 100000) && eq(agmProfit.totalCost, 0), agmProfit);
  const galaProfit = (await api("GET", `/events/${gala.id}`)).data;
  check("15. Collected event keeps the same profit (60,000)", eq(galaProfit.grossProfit, 60000) && eq(galaProfit.totalCollected, 60000), galaProfit);

  // 16/17. Receivables and client credit reconcile.
  r = await receivable();
  const payments = (await api("GET", `/clients/${client.id}/payments?limit=500`)).data.data as Json[];
  const paymentSum = payments.reduce((s, p) => s + p.amount, 0);
  check("16. Client received = sum of client payment history + legacy", eq(r.totalReceived, paymentSum + r.legacyCollected), { r, paymentSum });
  const ledgerNet = ((await ledger(`clientId=${client.id}&limit=200`)).data as Json[]).reduce((s, x) => s + x.signedAmount, 0);
  check("16. Ledger net for the client = its payment history (no double count)", eq(ledgerNet, paymentSum), { ledgerNet, paymentSum });
  check("17. Client credit = received - billed when positive", eq(r.credit, Math.max(0, r.totalReceived - r.totalBilled)) && eq(r.outstanding, Math.max(0, r.totalBilled - r.totalReceived)), r);
  const recv = (await api("GET", "/finance/receivables")).data;
  const recvRow = (recv.byClient as Json[]).find((c) => c.clientId === client.id);
  check("17. Receivables page agrees with the client view", recvRow ? eq(recvRow.outstanding, r.outstanding) && eq(recvRow.credit, r.credit) : eq(r.outstanding, 0) && eq(r.credit, 0), { recvRow, r });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
