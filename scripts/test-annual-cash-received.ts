/**
 * Read-only check: /performance/annual cashReceived (per month and for the
 * year) must equal the monthly cash flow's netClientReceipts, since both use
 * summarizeClientReceipts from lib/fund-ledger. Writes nothing, so it is safe
 * against any database.
 *
 * Usage (from the repository root, against a running API server):
 *
 *   BASE_URL=http://localhost:8080 TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-annual-cash-received.ts
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;

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
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`[PASS] ${name}`);
  else {
    failures++;
    console.log(`[FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const cents = (n: number) => Math.round(n * 100);

async function main(): Promise<void> {
  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  check("Login succeeds", login.status === 200, login.status);

  const { data: yearsData } = await api("GET", "/performance/years");
  for (const year of yearsData.years as number[]) {
    const annual = await api("GET", `/performance/annual?year=${year}`);
    check(`${year}: annual responds`, annual.status === 200, annual.status);
    let sumMonthly = 0;
    for (const m of annual.data.months) {
      const flow = await api("GET", `/performance/monthly/cashflow?year=${year}&month=${m.month}`);
      sumMonthly += flow.data.netClientReceipts;
      if (m.cashReceived !== 0 || flow.data.netClientReceipts !== 0) {
        check(`${year}-${m.month}: annual cashReceived = cash flow netClientReceipts`, cents(m.cashReceived) === cents(flow.data.netClientReceipts), { annual: m.cashReceived, cashflow: flow.data.netClientReceipts });
      } else {
        check(`${year}-${m.month}: no receipts in either`, typeof m.cashReceived === "number");
      }
    }
    check(`${year}: year cashReceived = sum of monthly netClientReceipts`, cents(annual.data.totals.cashReceived) === cents(sumMonthly), { year: annual.data.totals.cashReceived, months: sumMonthly });
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
