/**
 * Integration test for REQUIREMENT 4 — safe fund account deletion.
 *
 * Exercises DELETE /api/fund-accounts/:id against a RUNNING server:
 *
 *   Unused account   -> 204, disappears from lists, audit log written.
 *   Account with an
 *   expense linked
 *   by payer name    -> 409, account and history remain untouched.
 *
 * Prerequisites:
 *   - A running API server (DATABASE_URL configured) reachable at BASE_URL.
 *   - Credentials for a user allowed to mutate finance data.
 *
 * Usage (from the repository root):
 *
 *   BASE_URL=http://localhost:8080 \
 *   TEST_USERNAME=ceo TEST_PASSWORD=... \
 *   pnpm --filter @workspace/scripts exec tsx ./test-fund-account-deletion.ts
 *
 * The script only creates temporary records whose names start with
 * "__deltest_" and deletes them again wherever the API allows.
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error("TEST_USERNAME and TEST_PASSWORD environment variables are required.");
  process.exit(1);
}

let cookie = "";

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const entry of setCookies) {
    if (entry.startsWith("sid=")) cookie = entry.split(";")[0];
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

function assert(name: string, condition: boolean, detail?: string): boolean {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  return condition;
}

async function main(): Promise<number> {
  let ok = true;

  // ── Login ────────────────────────────────────────────────────────────────
  const login = await api("POST", "/login", { username: USERNAME, password: PASSWORD });
  if (!assert("Login succeeds", login.status === 200)) return 1;

  const suffix = Date.now();
  const unusedName = `__deltest_unused_${suffix}`;
  const usedName = `__deltest_used_${suffix}`;

  // ── Part C: unused account can be deleted ───────────────────────────────
  const created = await api("POST", "/fund-accounts", { name: unusedName, opening_balance: 123.45 });
  ok = assert("1. Create a new unused fund account (201)", created.status === 201, `got ${created.status}`) && ok;
  const unusedId = (created.data as { id?: number })?.id;
  if (!unusedId) return 1;

  const deleted = await api("DELETE", `/fund-accounts/${unusedId}`);
  ok = assert("2. Delete it (204)", deleted.status === 204, `got ${deleted.status}`) && ok;

  const listAfterDelete = await api("GET", "/fund-accounts");
  const listGone = !(listAfterDelete.data as Array<{ id: number }>)?.some((a) => a.id === unusedId);
  ok = assert("3. Disappears from fund accounts list (Fund Transfers)", listGone) && ok;

  const refetchDeleted = await api("GET", `/fund-accounts/${unusedId}`);
  ok = assert("4. GET returns 404 afterwards", refetchDeleted.status === 404, `got ${refetchDeleted.status}`) && ok;

  const summary = await api("GET", "/finance/summary");
  ok = assert("5. Finance summary still resolves after deletion (200)", summary.status === 200, `got ${summary.status}`) && ok;

  const auditLogs = await api(
    "GET",
    `/audit-logs?entityType=fund_account&entityId=${unusedId}`,
  );
  const auditEntries = (auditLogs.data as { data?: Array<{ action: string }> })?.data ?? [];
  ok =
    assert(
      "6. Deletion appears in Activity Logs",
      auditEntries.some((l) => l.action === "delete"),
      `${auditEntries.length} entries`,
    ) && ok;

  // ── Part B/F: account with financial history cannot be deleted ──────────
  const used = await api("POST", "/fund-accounts", { name: usedName, opening_balance: 0 });
  ok = assert("7. Create another fund account (201)", used.status === 201, `got ${used.status}`) && ok;
  const usedId = (used.data as { id?: number })?.id;
  if (!usedId) return 1;

  const now = new Date();
  const expense = await api("POST", "/finance/expenses", {
    category: "Test",
    description: "__deltest__ expense linking payer to fund account",
    amount: 1,
    gst: 0,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    paidBy: usedName,
  });
  ok = assert("8. Create an expense using that account (201)", expense.status === 201, `got ${expense.status}`) && ok;
  const expenseId = (expense.data as { id?: number })?.id;

  const rejectedDelete = await api("DELETE", `/fund-accounts/${usedId}`);
  const conflictBody = rejectedDelete.data as { error?: string } | null;
  ok =
    assert(
      "10. Deletion is rejected with HTTP 409",
      rejectedDelete.status === 409,
      `got ${rejectedDelete.status} ${JSON.stringify(conflictBody)}`,
    ) && ok;
  ok =
    assert(
      "10b. 409 explains financial-history rule",
      typeof conflictBody?.error === "string" &&
        /financial/i.test(conflictBody.error),
    ) && ok;

  const usedStillThere = await api("GET", `/fund-accounts/${usedId}`);
  ok =
    assert(
      "11. Account remains untouched after rejection",
      usedStillThere.status === 200 &&
        (usedStillThere.data as { account?: { name?: string } })?.account?.name === usedName,
    ) && ok;

  if (expenseId) {
    const expensesList = await api(
      "GET",
      `/finance/expenses?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    );
    const preserved = (expensesList.data as Array<{ id: number; description?: string }>)?.some(
      (e) => e.id === expenseId,
    );
    ok = assert("12. Linked expense was not deleted or altered", preserved) && ok;

    // ── Cleanup: remove the test expense, then the now-unused account ────
    await api("DELETE", `/finance/expenses/${expenseId}`);
    const cleanupDelete = await api("DELETE", `/fund-accounts/${usedId}`);
    ok =
      assert(
        "Cleanup: after removing the expense, the account is deletable again (204)",
        cleanupDelete.status === 204,
        `got ${cleanupDelete.status}`,
      ) && ok;
  }

  console.log(ok ? "\nAll checks passed." : "\nSome checks FAILED.");
  return ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
