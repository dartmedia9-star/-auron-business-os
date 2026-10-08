import { Router, type IRouter } from "express";
import { eq, desc, asc, sql, and, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  operatingExpensesTable,
  eventsTable,
  eventRevenueTable,
  fundAccountsTable,
  fundTransfersTable,
  fundTransactionsTable,
  usersTable,
  clientPaymentsTable,
  clientsTable,
} from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";
import { getReceivablesLedger, receivablesForEvents, totalOutstanding } from "../lib/client-receivables";
import { businessToday, isValidDate } from "../lib/business-date";
import { loadUserNames } from "../lib/user-names";
import { computeBalance, round2, signedEffect, toMoney, type Tx } from "../lib/fund-ledger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Fund ledger model: see lib/fund-ledger.ts for the per-type effects.
//
// transaction_date is the effective business date (transfer date, expense
// date, payment date); reports bucket by it, never by created_at. A reversal
// carries the date of the entry it reverses.
// ---------------------------------------------------------------------------

// Legacy finance-summary fields (auronBalance / rajeshBalance) still report
// these two accounts by name. Nothing else depends on fund names.
const AURON_ACCOUNT_NAME = "Auron Event Productions";
const RAJESH_ACCOUNT_NAME = "Rajesh PR";

// GST handling: `operating_expenses.amount` is the base (pre-tax) value and
// `gst` is an additional tax amount actually paid on top (the UI collects them
// as separate fields and event profitability already treats cost as
// amount + gst). The actual cash leaving a fund is therefore amount + gst.
function expenseCashOut(amount: number, gst: number): number {
  return Math.round((amount + gst) * 100) / 100;
}

// "Other" / "Other - <name>" is the untracked payer label used by the expense
// form, so no fund account may be named like it.
const UNTRACKED_PAYER_PATTERN = /^other(\s*[-–—].*)?$/i;

// Resolves an expense's Paid By label to the fund account with exactly that
// name. Every fund account, including ones created later, is a valid payer.
// Labels that are not a fund account ("Other", "Other - X", null) are
// untracked and never touch a fund.
async function resolvePayerFundAccountId(tx: Tx, paidBy: string | null | undefined): Promise<number | null> {
  if (typeof paidBy !== "string" || paidBy.trim() === "" || UNTRACKED_PAYER_PATTERN.test(paidBy.trim())) return null;
  const [account] = await tx.select({ id: fundAccountsTable.id }).from(fundAccountsTable).where(eq(fundAccountsTable.name, paidBy));
  return account?.id ?? null;
}

// What an expense has actually taken out of each fund so far, from its own
// ledger rows (expense minus expense_reversal), with the date of its latest
// expense row there. Edits and deletes reverse exactly this, so an expense
// that never posted (e.g. paid from a fund before dynamic payers existed)
// cannot credit money back that was never deducted.
async function postedExpenseByFund(tx: Tx, expenseId: number): Promise<Map<number, { net: number; date: string | null }>> {
  const rows = await tx
    .select({
      id: fundTransactionsTable.id,
      fund_account_id: fundTransactionsTable.fund_account_id,
      transaction_type: fundTransactionsTable.transaction_type,
      amount: fundTransactionsTable.amount,
      transaction_date: fundTransactionsTable.transaction_date,
    })
    .from(fundTransactionsTable)
    .where(eq(fundTransactionsTable.related_expense_id, expenseId))
    .orderBy(asc(fundTransactionsTable.id));
  const byFund = new Map<number, { net: number; date: string | null }>();
  for (const r of rows) {
    if (r.transaction_type !== "expense" && r.transaction_type !== "expense_reversal") continue;
    const entry = byFund.get(r.fund_account_id) ?? { net: 0, date: null };
    entry.net = round2(entry.net - signedEffect(r.transaction_type, toMoney(r.amount)));
    if (r.transaction_type === "expense") entry.date = r.transaction_date;
    byFund.set(r.fund_account_id, entry);
  }
  return byFund;
}

// Posts an expense_reversal for everything the expense currently has on the
// ledger, fund by fund, each on the date of the entry it reverses.
async function reversePostedExpense(tx: Tx, expense: { id: number; date: string | null }, description: string, userId: string): Promise<void> {
  for (const [fundAccountId, posted] of await postedExpenseByFund(tx, expense.id)) {
    if (posted.net <= 0) continue;
    await tx.insert(fundTransactionsTable).values({
      fund_account_id: fundAccountId,
      transaction_type: "expense_reversal",
      amount: String(posted.net),
      transaction_date: posted.date ?? expense.date ?? businessToday(),
      description,
      related_expense_id: expense.id,
      created_by: userId,
    });
  }
}

// Date of the expense's latest posted ledger entry, so a reversal lands on
// the same date as the entry it reverses. Falls back to the expense date.
async function currentExpenseLedgerDate(tx: Tx, expenseId: number, expenseDate: string | null): Promise<string> {
  const [row] = await tx
    .select({ transaction_date: fundTransactionsTable.transaction_date })
    .from(fundTransactionsTable)
    .where(and(eq(fundTransactionsTable.related_expense_id, expenseId), eq(fundTransactionsTable.transaction_type, "expense")))
    .orderBy(desc(fundTransactionsTable.id))
    .limit(1);
  return row?.transaction_date ?? expenseDate ?? businessToday();
}

async function requireFundAccount(tx: Tx, id: number): Promise<boolean> {
  const [account] = await tx.select({ id: fundAccountsTable.id }).from(fundAccountsTable).where(eq(fundAccountsTable.id, id));
  return !!account;
}

// ---------------------------------------------------------------------------
// Fund accounts
// ---------------------------------------------------------------------------

// GET /fund-accounts - List fund accounts
router.get("/fund-accounts", async (req, res): Promise<void> => {
  const accounts = await db
    .select({
      id: fundAccountsTable.id,
      name: fundAccountsTable.name,
      opening_balance: fundAccountsTable.opening_balance,
      created_at: fundAccountsTable.created_at,
      updated_at: fundAccountsTable.updated_at,
      // True when the account has any ledger row, transfer, or expense linked
      // to it. Lets the UI explain why a protected account cannot be deleted.
      // Fully-qualified raw SQL: interpolated columns from tables outside the
      // query's FROM render unqualified and would bind to the wrong scope.
      has_financial_history:
        sql<boolean>`exists (select 1 from fund_transactions ft where ft.fund_account_id = fund_accounts.id) or exists (select 1 from fund_transfers tr where tr.from_account_id = fund_accounts.id or tr.to_account_id = fund_accounts.id) or exists (select 1 from operating_expenses oe where oe.paid_by = fund_accounts.name)`.mapWith(Boolean),
    })
    .from(fundAccountsTable)
    .orderBy(desc(fundAccountsTable.created_at));
  res.json(accounts);
});

// POST /fund-accounts - Create a fund account. The opening balance establishes
// the account's starting cash position directly (no ledger row is written and
// P&L is untouched).
router.post("/fund-accounts", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, opening_balance } = req.body ?? {};

  const accountName = typeof name === "string" ? name.trim() : "";
  if (!accountName) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (UNTRACKED_PAYER_PATTERN.test(accountName)) {
    res.status(400).json({ error: `"${accountName}" is reserved for untracked expense payers. Choose another name.` });
    return;
  }

  if (!Number.isFinite(Number(opening_balance))) {
    res.status(400).json({ error: "opening_balance must be a number" });
    return;
  }

  const openingBalance = toMoney(opening_balance);
  if (openingBalance < 0) {
    res.status(400).json({ error: "opening_balance cannot be negative" });
    return;
  }

  const [duplicate] = await db
    .select({ id: fundAccountsTable.id })
    .from(fundAccountsTable)
    .where(sql`lower(${fundAccountsTable.name}) = ${accountName.toLowerCase()}`);

  if (duplicate) {
    res.status(400).json({ error: `A fund account named "${accountName}" already exists` });
    return;
  }

  const [created] = await db
    .insert(fundAccountsTable)
    .values({
      name: accountName,
      opening_balance: String(openingBalance),
    })
    .returning();

  res.status(201).json(created);
});

// GET /fund-accounts/:id - Get a fund account with its current balance
router.get("/fund-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [account] = await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Fund account not found" }); return; }

  const transactions = await db.select({
    transaction_type: fundTransactionsTable.transaction_type,
    amount: fundTransactionsTable.amount,
  }).from(fundTransactionsTable).where(eq(fundTransactionsTable.fund_account_id, id));

  res.json({ account, current_balance: computeBalance(account.opening_balance, transactions) });
});

// PATCH /fund-accounts/:id - Update the opening balance for a fund account.
// This establishes the real starting/current cash position without creating
// a transfer or affecting P&L.
router.patch("/fund-accounts/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid fund account id" });
    return;
  }

  const openingBalance = toMoney(req.body?.opening_balance);
  if (openingBalance < 0) {
    res.status(400).json({ error: "Opening balance cannot be negative" });
    return;
  }

  const [existing] = await db
    .select({ id: fundAccountsTable.id })
    .from(fundAccountsTable)
    .where(eq(fundAccountsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Fund account not found" });
    return;
  }

  const [updated] = await db
    .update(fundAccountsTable)
    .set({ opening_balance: String(openingBalance) })
    .where(eq(fundAccountsTable.id, id))
    .returning();

  res.json(updated);
});

class FundAccountDeleteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// DELETE /fund-accounts/:id - Permanently delete a fund account. This is a
// protected financial operation: only accounts with NO financial history may
// be deleted. Any fund transaction, transfer, or linked expense blocks the
// deletion with 409 so historical records always stay reconcilable. Nothing
// is cascade-deleted, rewritten, or rebalanced to make room for deletion.
router.delete("/fund-accounts/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid fund account id" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [account] = await tx.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, id));
      if (!account) {
        throw new FundAccountDeleteError(404, "Fund account not found");
      }

      // Inspect every source of financial history before deleting anything.
      const [transactionCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fundTransactionsTable)
        .where(eq(fundTransactionsTable.fund_account_id, id));

      const [transferCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(fundTransfersTable)
        .where(sql`${fundTransfersTable.from_account_id} = ${id} or ${fundTransfersTable.to_account_id} = ${id}`);

      // Expenses reference the payer by its label (paid_by), so a zero-value
      // expense can mention this account without any ledger row.
      const [expenseCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(operatingExpensesTable)
        .where(eq(operatingExpensesTable.paidBy, account.name));

      // Client payments reference the fund account directly.
      const [clientPaymentCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(clientPaymentsTable)
        .where(eq(clientPaymentsTable.fundAccountId, id));

      const hasHistory =
        Number(transactionCount?.count ?? 0) > 0 ||
        Number(transferCount?.count ?? 0) > 0 ||
        Number(expenseCount?.count ?? 0) > 0 ||
        Number(clientPaymentCount?.count ?? 0) > 0;

      if (hasHistory) {
        throw new FundAccountDeleteError(
          409,
          "Cannot delete this fund account because it has financial transactions. Accounts with financial history cannot be deleted.",
        );
      }

      // Record the audit entry inside the same transaction as the deletion so
      // an account can never disappear without its audit trail.
      await tx.insert(auditLogsTable).values({
        userId: req.user.id,
        userEmail: req.user.email ?? null,
        action: "delete",
        entityType: "fund_account",
        entityId: id,
        oldValues: account,
      });

      await tx.delete(fundAccountsTable).where(eq(fundAccountsTable.id, id));
    });

    res.sendStatus(204);
  } catch (err) {
    if (err instanceof FundAccountDeleteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// GET /fund-accounts/:id/transactions - List fund account transactions with running balance
router.get("/fund-accounts/:id/transactions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [account] = await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Fund account not found" }); return; }

  // Running balances are computed chronologically, then reversed so the API
  // keeps returning newest-first rows.
  const transactions = await db.select({
    id: fundTransactionsTable.id,
    transaction_type: fundTransactionsTable.transaction_type,
    amount: fundTransactionsTable.amount,
    transaction_date: fundTransactionsTable.transaction_date,
    description: fundTransactionsTable.description,
    related_expense_id: fundTransactionsTable.related_expense_id,
    related_transfer_id: fundTransactionsTable.related_transfer_id,
    related_client_payment_id: fundTransactionsTable.related_client_payment_id,
    created_at: fundTransactionsTable.created_at,
  }).from(fundTransactionsTable).where(eq(fundTransactionsTable.fund_account_id, id)).orderBy(asc(fundTransactionsTable.transaction_date), asc(fundTransactionsTable.created_at), asc(fundTransactionsTable.id));

  let runningBalance = toMoney(account.opening_balance);
  const result = transactions.map((t) => {
    const amount = toMoney(t.amount);
    const effect = signedEffect(t.transaction_type, amount);
    runningBalance += effect;
    return {
      ...t,
      amount: amount,
      moneyIn: effect > 0 ? effect : 0,
      moneyOut: effect < 0 ? -effect : 0,
      running_balance: Math.round(runningBalance * 100) / 100,
    };
  }).reverse();

  res.json({ account, transactions: result, current_balance: Math.round(runningBalance * 100) / 100 });
});

// ---------------------------------------------------------------------------
// Fund transfers
// ---------------------------------------------------------------------------

class TransferError extends Error {}

// GET /fund-transfers - Transfer history feed, newest first. Reads the existing
// fund_transfers records (the single source of truth for transfers) and
// resolves fund names and the creating user for display. `ledger_posted` is
// true when both the transfer_out and transfer_in ledger rows exist, so any
// transfer whose balance effect is incomplete is visible in the feed.
// Transfers are internal movements and never touch revenue, expenses or P&L.
router.get("/fund-transfers", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const transfers = await db
    .select({
      id: fundTransfersTable.id,
      from_account_id: fundTransfersTable.from_account_id,
      to_account_id: fundTransfersTable.to_account_id,
      amount: fundTransfersTable.amount,
      date: fundTransfersTable.date,
      description: fundTransfersTable.description,
      created_by: fundTransfersTable.created_by,
      created_at: fundTransfersTable.created_at,
      // Fully-qualified raw SQL for the same reason as has_financial_history.
      ledger_posted:
        sql<boolean>`exists (select 1 from fund_transactions ft where ft.related_transfer_id = fund_transfers.id and ft.transaction_type = 'transfer_out') and exists (select 1 from fund_transactions ft where ft.related_transfer_id = fund_transfers.id and ft.transaction_type = 'transfer_in')`.mapWith(Boolean),
    })
    .from(fundTransfersTable)
    .orderBy(desc(fundTransfersTable.date), desc(fundTransfersTable.created_at), desc(fundTransfersTable.id));

  const accounts = await db.select({ id: fundAccountsTable.id, name: fundAccountsTable.name }).from(fundAccountsTable);
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));

  const creatorNames = await loadUserNames(transfers.map((t) => t.created_by));

  res.json(transfers.map((t) => ({
    ...t,
    amount: toMoney(t.amount),
    from_account_name: accountNames.get(t.from_account_id) ?? null,
    to_account_name: accountNames.get(t.to_account_id) ?? null,
    created_by_name: t.created_by ? creatorNames.get(t.created_by) ?? null : null,
  })));
});

// POST /fund-transfers - Create a fund transfer (atomic: transfer record +
// transfer_out + transfer_in are committed together; transfers have no P&L impact).
router.post("/fund-transfers", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { from_account_id, to_account_id, amount, date, description } = req.body;
  if (from_account_id == null || to_account_id == null || amount == null || !date) {
    res.status(400).json({ error: "from_account_id, to_account_id, amount, and date are required" }); return;
  }
  if (from_account_id === to_account_id) {
    res.status(400).json({ error: "From and to accounts must be different" }); return;
  }
  if (!isValidDate(date)) {
    res.status(400).json({ error: "date must be a valid date (YYYY-MM-DD)" }); return;
  }

  const amountNum = toMoney(amount);
  if (amountNum <= 0) {
    res.status(400).json({ error: "amount must be greater than zero" }); return;
  }

  try {
    const transfer = await db.transaction(async (tx) => {
      if (!(await requireFundAccount(tx, from_account_id)) || !(await requireFundAccount(tx, to_account_id))) {
        throw new TransferError("From or to fund account was not found");
      }

      // Create the fund transfer record
      const [transferRecord] = await tx.insert(fundTransfersTable).values({
        from_account_id,
        to_account_id,
        amount: String(amountNum),
        date,
        description,
        created_by: req.user.id,
      }).returning();

      // Debit the source account
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: from_account_id,
        transaction_type: "transfer_out",
        amount: String(amountNum),
        transaction_date: date,
        description: description || "Fund transfer",
        related_transfer_id: transferRecord.id,
        created_by: req.user.id,
      });

      // Credit the destination account
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: to_account_id,
        transaction_type: "transfer_in",
        amount: String(amountNum),
        transaction_date: date,
        description: description || "Fund transfer",
        related_transfer_id: transferRecord.id,
        created_by: req.user.id,
      });

      // Audit entry in the same transaction so a transfer never exists
      // without its audit trail.
      await tx.insert(auditLogsTable).values({
        userId: req.user.id,
        userEmail: req.user.email ?? null,
        action: "create",
        entityType: "fund_transfer",
        entityId: transferRecord.id,
        newValues: transferRecord,
      });

      return transferRecord;
    });

    res.status(201).json(transfer);
  } catch (err) {
    if (err instanceof TransferError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Operating expenses
// ---------------------------------------------------------------------------

// GET /finance/expenses - List operating expenses
router.get("/finance/expenses", async (req, res): Promise<void> => {
  const { year, month, category } = req.query as Record<string, string>;
  const conditions = [];
  if (year) conditions.push(eq(operatingExpensesTable.year, parseInt(year, 10)));
  if (month) conditions.push(eq(operatingExpensesTable.month, parseInt(month, 10)));
  if (category) conditions.push(eq(operatingExpensesTable.category, category));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const expenses = await db.select().from(operatingExpensesTable).where(where).orderBy(desc(operatingExpensesTable.createdAt));
  res.json(expenses.map(e => ({ ...e, amount: parseFloat(String(e.amount)), gst: parseFloat(String(e.gst)) })));
});

// POST /finance/expenses - Create an operating expense (atomic: the expense
// row and its fund transaction are committed together).
router.post("/finance/expenses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { category, description, amount, year, month, gst = 0, eventId, paidBy, paymentMethod, ...rest } = req.body;
  if (!category || !description || !amount || !year || !month) {
    res.status(400).json({ error: "category, description, amount, year, month are required" }); return;
  }
  if (!paidBy || (typeof paidBy === "string" && paidBy.trim() === "")) {
    res.status(400).json({ error: "paidBy is required. Select a fund account or 'Other'." }); return;
  }
  const amountNum = toMoney(amount);
  const gstNum = toMoney(gst);
  if (amountNum < 0) { res.status(400).json({ error: "amount must be zero or greater" }); return; }
  if (gstNum < 0) { res.status(400).json({ error: "gst must be zero or greater" }); return; }

  const linkedEventId = eventId == null ? null : parseInt(String(eventId), 10);
  if (linkedEventId !== null) {
    if (!Number.isInteger(linkedEventId)) { res.status(400).json({ error: "eventId must be a valid event id" }); return; }
    const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, linkedEventId));
    if (!event) { res.status(400).json({ error: "Selected event was not found" }); return; }
  }

  // Actual cash leaving the fund = amount + gst.
  const cashOut = expenseCashOut(amountNum, gstNum);

  const expense = await db.transaction(async (tx) => {
    const [created] = await tx.insert(operatingExpensesTable).values({
      category, description, amount: String(amountNum), gst: String(gstNum), year: parseInt(String(year), 10), month: parseInt(String(month), 10), eventId: linkedEventId, paidBy, paymentMethod, ...rest, createdBy: req.user.id,
    }).returning();

    // Deduct from the paying fund account (any fund, matched by its name).
    // Untracked payers ("Other"/null) do not touch any fund.
    const accountId = await resolvePayerFundAccountId(tx, paidBy);
    if (accountId !== null && cashOut > 0) {
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: accountId,
        transaction_type: "expense",
        amount: String(cashOut),
        transaction_date: created.date ?? businessToday(),
        description: description || "Expense",
        related_expense_id: created.id,
        created_by: req.user.id,
      });
    }

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "create",
      entityType: "operating_expense",
      entityId: created.id,
      newValues: { ...created, fundAccountId: accountId, cashOut: accountId !== null ? cashOut : 0 },
    });

    return created;
  });

  res.status(201).json({ ...expense, amount: parseFloat(String(expense.amount)), gst: parseFloat(String(expense.gst)) });
});

// PATCH /finance/expenses/:id - Update an operating expense (atomic: expense
// changes and any fund corrections are committed together). Payment method is
// metadata only and never affects balances.
router.patch("/finance/expenses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, eventId, createdBy, ...data } = req.body;
  const updateData: Record<string, unknown> = data;

  // Validate event linkage BEFORE touching the expense or the ledger so a
  // validation failure can never leave half-applied corrections behind.
  if (eventId !== undefined) {
    const linkedEventId = eventId == null ? null : parseInt(String(eventId), 10);
    if (linkedEventId !== null) {
      if (!Number.isInteger(linkedEventId)) { res.status(400).json({ error: "eventId must be a valid event id" }); return; }
      const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, linkedEventId));
      if (!event) { res.status(400).json({ error: "Selected event was not found" }); return; }
    }
    updateData.eventId = linkedEventId;
  }

  if (data.amount !== undefined) {
    const amountNum = toMoney(data.amount);
    if (amountNum < 0) { res.status(400).json({ error: "amount must be zero or greater" }); return; }
    updateData.amount = String(amountNum);
  }
  if (data.gst !== undefined) {
    const gstNum = toMoney(data.gst);
    if (gstNum < 0) { res.status(400).json({ error: "gst must be zero or greater" }); return; }
    updateData.gst = String(gstNum);
  }

  const hasFieldUpdates = Object.keys(updateData).length > 0;

  const [expense] = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(operatingExpensesTable).where(eq(operatingExpensesTable.id, id));
    if (!old) return [undefined];

    const updated = hasFieldUpdates
      ? (await tx.update(operatingExpensesTable).set(updateData).where(eq(operatingExpensesTable.id, id)).returning())[0]
      : old;
    if (!updated) return [undefined];

    // --- Fund corrections -------------------------------------------------
    const oldPayer = old.paidBy ?? null;
    const newPayer = updated.paidBy ?? null;
    const oldCash = expenseCashOut(toMoney(old.amount), toMoney(old.gst));
    const newCash = expenseCashOut(toMoney(updated.amount), toMoney(updated.gst));

    // Effective date of the cash movement currently on the ledger. A date
    // change alone also moves the ledger entry (reverse + re-apply).
    const oldDate = await currentExpenseLedgerDate(tx, old.id, old.date);
    const newDate = updated.date ?? oldDate;

    const fundRelevantChanged =
      oldPayer !== newPayer ||
      Math.round(oldCash * 100) !== Math.round(newCash * 100) ||
      oldDate !== newDate;

    if (fundRelevantChanged) {
      // Reverse what the expense actually took out so far (fund by fund).
      await reversePostedExpense(tx, old, `Reversal of expense #${old.id} paid by ${oldPayer}`, req.user.id);

      // Apply the new effect: money leaves the newly responsible fund.
      const newAccountId = await resolvePayerFundAccountId(tx, newPayer);
      if (newAccountId !== null && newCash > 0) {
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: newAccountId,
          transaction_type: "expense",
          amount: String(newCash),
          transaction_date: newDate,
          description: updated.description || "Expense",
          related_expense_id: updated.id,
          created_by: req.user.id,
        });
      }
    }

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "update",
      entityType: "operating_expense",
      entityId: old.id,
      oldValues: old,
      newValues: updated,
    });

    return [updated];
  });

  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json({ ...expense, amount: parseFloat(String(expense.amount)), gst: parseFloat(String(expense.gst)) });
});

// DELETE /finance/expenses/:id - Delete an operating expense (atomic: the
// deletion and the fund reversal are committed together).
router.delete("/finance/expenses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.transaction(async (tx) => {
    const [expense] = await tx.select().from(operatingExpensesTable).where(eq(operatingExpensesTable.id, id));
    if (!expense) return;

    // Money back into the fund(s) it was actually paid from.
    await reversePostedExpense(tx, expense, `Reversal of deleted expense #${expense.id} paid by ${expense.paidBy}`, req.user.id);

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "delete",
      entityType: "operating_expense",
      entityId: expense.id,
      oldValues: expense,
    });

    await tx.delete(operatingExpensesTable).where(eq(operatingExpensesTable.id, id));
  });

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Finance summary & receivables
// ---------------------------------------------------------------------------

// GET /finance/summary
router.get("/finance/summary", async (req, res): Promise<void> => {
  const { year, month } = req.query as Record<string, string>;
  const currentYear = parseInt(year || String(new Date().getFullYear()), 10);

  let eventWhere;
  if (month) {
    const m = parseInt(month, 10);
    const lastDay = new Date(currentYear, m, 0).getDate();
    const fromDate = `${currentYear}-${String(m).padStart(2, "0")}-01`;
    const toDate = `${currentYear}-${String(m).padStart(2, "0")}-${lastDay}`;
    eventWhere = and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate));
  } else {
    eventWhere = and(gte(eventsTable.eventDate, `${currentYear}-01-01`), lte(eventsTable.eventDate, `${currentYear}-12-31`));
  }

  const events = await db.select({ id: eventsTable.id }).from(eventsTable).where(eventWhere);
  const eventIds = events.map(e => e.id);
  const allRevenues = await db.select().from(eventRevenueTable);
  const directCostsByEvent = await getEventDirectCostTotals(eventIds);

  const revenues = allRevenues.filter(r => eventIds.includes(r.eventId));

  const revenue = revenues.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
  const directCosts = eventIds.reduce((sum, eventId) => sum + (directCostsByEvent.get(eventId) ?? 0), 0);
  const grossProfit = revenue - directCosts;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const opexWhere = month
    ? and(eq(operatingExpensesTable.year, currentYear), eq(operatingExpensesTable.month, parseInt(month, 10)))
    : eq(operatingExpensesTable.year, currentYear);
  const opex = await db.select().from(operatingExpensesTable).where(and(opexWhere, isNull(operatingExpensesTable.eventId)));
  const operatingExpenses = opex.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  const ebitda = grossProfit - operatingExpenses;
  const ebitdaMarginPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const netProfit = ebitda;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // Receivables for the period's events, net of client payments (allocated
  // and client-level). Payments never change revenue or profit above.
  const { total: totalReceivables, overdue: overdueReceivables } = receivablesForEvents(await getReceivablesLedger(), eventIds);

  // Capital & funds: current balance of every fund account.
  const fundAccounts = await db.select().from(fundAccountsTable).orderBy(desc(fundAccountsTable.created_at));
  const fundTxs = await db.select({
    fund_account_id: fundTransactionsTable.fund_account_id,
    transaction_type: fundTransactionsTable.transaction_type,
    amount: fundTransactionsTable.amount,
  }).from(fundTransactionsTable);

  const balancesByAccount = new Map<number, number>();
  for (const account of fundAccounts) {
    balancesByAccount.set(account.id, toMoney(account.opening_balance));
  }
  for (const t of fundTxs) {
    balancesByAccount.set(t.fund_account_id, (balancesByAccount.get(t.fund_account_id) ?? 0) + signedEffect(t.transaction_type, toMoney(t.amount)));
  }
  const balanceOf = (name: string) => {
    const account = fundAccounts.find(a => a.name === name);
    return account ? Math.round((balancesByAccount.get(account.id) ?? 0) * 100) / 100 : 0;
  };

  res.json({
    revenue, directCosts, grossProfit, grossMarginPct, operatingExpenses, ebitda, ebitdaMarginPct, netProfit, netMarginPct, totalReceivables, overdueReceivables,
    auronBalance: balanceOf(AURON_ACCOUNT_NAME),
    rajeshBalance: balanceOf(RAJESH_ACCOUNT_NAME),
    // Dynamic per-account balances so new accounts appear without code changes.
    fundAccounts: fundAccounts.map(a => ({
      id: a.id,
      name: a.name,
      balance: Math.round((balancesByAccount.get(a.id) ?? 0) * 100) / 100,
    })),
  });
});

// GET /finance/receivables
// totalReceivables is client-level: legacy event collections AND client
// payments (allocated or client-level) both reduce it. Aging buckets and
// byEvent use event-level outstanding after allocations; client-level
// unallocated payments cannot be attributed to a due date, so they are
// reported separately as unallocatedPaymentsApplied (buckets sum may exceed
// the total by exactly that amount).
router.get("/finance/receivables", async (req, res): Promise<void> => {
  const [ledger, events, clients] = await Promise.all([
    getReceivablesLedger(),
    db.select({ id: eventsTable.id, name: eventsTable.name }).from(eventsTable),
    db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable),
  ]);
  const eventNames = new Map(events.map(e => [e.id, e.name]));
  const clientNames = new Map(clients.map(c => [c.id, c.name]));

  const today = new Date();
  let dueToday = 0, dueThisWeek = 0, dueThisMonth = 0;
  let overdue = 0, overdue30 = 0, overdue60 = 0, overdue90 = 0;

  const openEvents = [...ledger.events.values()].filter(e => e.outstanding > 0);
  for (const e of openEvents) {
    const outstanding = e.outstanding;
    if (e.dueDate) {
      const due = new Date(e.dueDate);
      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) dueToday += outstanding;
      if (diffDays <= 7 && diffDays >= 0) dueThisWeek += outstanding;
      if (diffDays <= 30 && diffDays >= 0) dueThisMonth += outstanding;
      if (diffDays > 0) { overdue += outstanding; if (diffDays > 30) overdue30 += outstanding; if (diffDays > 60) overdue60 += outstanding; if (diffDays > 90) overdue90 += outstanding; }
    }
  }

  const totalReceivables = totalOutstanding(ledger);
  const eventOutstandingTotal = openEvents.reduce((s, e) => s + e.outstanding, 0);
  const unallocatedPaymentsApplied = Math.round(Math.max(0, eventOutstandingTotal - totalReceivables) * 100) / 100;

  const byClient = [...ledger.clients.values()]
    .filter(c => c.outstanding > 0 || c.credit > 0)
    .map(c => ({
      clientId: c.clientId,
      clientName: clientNames.get(c.clientId) ?? "Unknown",
      totalBilled: c.totalBilled,
      totalReceived: c.totalReceived,
      outstanding: c.outstanding,
      credit: c.credit,
      unallocated: c.unallocated,
    }))
    .sort((a, b) => b.outstanding - a.outstanding || b.credit - a.credit);

  const byEvent = openEvents.map(e => ({
    eventId: e.eventId, eventName: eventNames.get(e.eventId) ?? "Unknown",
    outstanding: e.outstanding,
    dueDate: e.dueDate, paymentStatus: e.paymentStatus ?? "pending",
  }));

  res.json({ totalReceivables, unallocatedPaymentsApplied, dueToday, dueThisWeek, dueThisMonth, overdue, overdue30, overdue60, overdue90, byClient, byEvent });
});

export default router;
