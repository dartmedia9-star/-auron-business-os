import { Router, type IRouter } from "express";
import { eq, desc, asc, sql, and, gte, lte, isNull } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  operatingExpensesTable,
  eventsTable,
  eventRevenueTable,
  fundAccountsTable,
  fundTransfersTable,
  fundTransactionsTable,
} from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Fund ledger model
//
// transaction_type  | effect on the fund's balance
// ------------------+--------------------------------------------------------
// expense           | -amount   money OUT (operating expense paid from fund)
// expense_reversal  | +amount   money IN  (reversal/correction of an expense)
// transfer_out      | -amount   money OUT (sent to another fund account)
// transfer_in       | +amount   money IN  (received from another fund account)
// adjustment        | ±amount   signed value (positive = in, negative = out)
//
// Stored amounts ALWAYS represent the actual cash movement. For expenses this
// includes GST (see expenseCashOut below). Balance =
// account.opening_balance + sum(signed effects). Unknown transaction types
// contribute 0 so legacy/noise rows cannot silently corrupt balances.
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const AURON_ACCOUNT_NAME = "Auron Event Productions";
const RAJESH_ACCOUNT_NAME = "Rajesh PR";

// GST handling: `operating_expenses.amount` is the base (pre-tax) value and
// `gst` is an additional tax amount actually paid on top (the UI collects them
// as separate fields and event profitability already treats cost as
// amount + gst). The actual cash leaving a fund is therefore amount + gst.
function expenseCashOut(amount: number, gst: number): number {
  return Math.round((amount + gst) * 100) / 100;
}

function toMoney(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function signedEffect(transactionType: string, amount: number): number {
  switch (transactionType) {
    case "expense":
    case "transfer_out":
      return -amount;
    case "expense_reversal":
    case "transfer_in":
      return amount;
    case "adjustment":
      return amount;
    default:
      return 0;
  }
}

function computeBalance(openingBalance: unknown, transactions: Array<{ transaction_type: string; amount: unknown }>): number {
  let balance = toMoney(openingBalance);
  for (const t of transactions) {
    balance += signedEffect(t.transaction_type, toMoney(t.amount));
  }
  return Math.round(balance * 100) / 100;
}

// Resolves a payer label to a tracked fund account id. Returns null for any
// payer that does not map to one of the tracked accounts (e.g. "Other" or
// null) — those expenses must not deduct either fund.
async function resolveTrackedFundAccountId(tx: Tx, paidBy: string | null | undefined): Promise<number | null> {
  if (paidBy !== AURON_ACCOUNT_NAME && paidBy !== RAJESH_ACCOUNT_NAME) return null;
  const [account] = await tx.select({ id: fundAccountsTable.id }).from(fundAccountsTable).where(eq(fundAccountsTable.name, paidBy));
  return account?.id ?? null;
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

      const hasHistory =
        Number(transactionCount?.count ?? 0) > 0 ||
        Number(transferCount?.count ?? 0) > 0 ||
        Number(expenseCount?.count ?? 0) > 0;

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
    description: fundTransactionsTable.description,
    related_expense_id: fundTransactionsTable.related_expense_id,
    related_transfer_id: fundTransactionsTable.related_transfer_id,
    created_at: fundTransactionsTable.created_at,
  }).from(fundTransactionsTable).where(eq(fundTransactionsTable.fund_account_id, id)).orderBy(asc(fundTransactionsTable.created_at), asc(fundTransactionsTable.id));

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
        description: description || "Fund transfer",
        related_transfer_id: transferRecord.id,
        created_by: req.user.id,
      });

      // Credit the destination account
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: to_account_id,
        transaction_type: "transfer_in",
        amount: String(amountNum),
        description: description || "Fund transfer",
        related_transfer_id: transferRecord.id,
        created_by: req.user.id,
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

    // Deduct from the payer's tracked fund account. Payers that do not map to
    // a tracked account (e.g. "Other"/null) do not touch either fund.
    const accountId = await resolveTrackedFundAccountId(tx, paidBy);
    if (accountId !== null && cashOut > 0) {
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: accountId,
        transaction_type: "expense",
        amount: String(cashOut),
        description: description || "Expense",
        related_expense_id: created.id,
        created_by: req.user.id,
      });
    }

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

    const fundRelevantChanged =
      oldPayer !== newPayer ||
      Math.round(oldCash * 100) !== Math.round(newCash * 100);

    if (fundRelevantChanged) {
      // Reverse the old effect: money goes back into the previously charged fund.
      const oldAccountId = await resolveTrackedFundAccountId(tx, oldPayer);
      if (oldAccountId !== null && oldCash > 0) {
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: oldAccountId,
          transaction_type: "expense_reversal",
          amount: String(oldCash),
          description: `Reversal of expense #${old.id} paid by ${oldPayer}`,
          related_expense_id: old.id,
          created_by: req.user.id,
        });
      }

      // Apply the new effect: money leaves the newly responsible fund.
      const newAccountId = await resolveTrackedFundAccountId(tx, newPayer);
      if (newAccountId !== null && newCash > 0) {
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: newAccountId,
          transaction_type: "expense",
          amount: String(newCash),
          description: updated.description || "Expense",
          related_expense_id: updated.id,
          created_by: req.user.id,
        });
      }
    }

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

    const cashOut = expenseCashOut(toMoney(expense.amount), toMoney(expense.gst));
    const accountId = await resolveTrackedFundAccountId(tx, expense.paidBy);

    // Reverse the fund transaction (money back into the fund it was paid from).
    if (accountId !== null && cashOut > 0) {
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: accountId,
        transaction_type: "expense_reversal",
        amount: String(cashOut),
        description: `Reversal of deleted expense #${expense.id} paid by ${expense.paidBy}`,
        related_expense_id: expense.id,
        created_by: req.user.id,
      });
    }

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

  const totalReceivables = revenues.reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);
  const overdueReceivables = revenues.filter(r => r.paymentStatus === "overdue").reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);

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
router.get("/finance/receivables", async (req, res): Promise<void> => {
  const revenues = await db.select({ r: eventRevenueTable, e: eventsTable }).from(eventRevenueTable)
    .leftJoin(eventsTable, eq(eventsTable.id, eventRevenueTable.eventId))
    .where(sql`${eventRevenueTable.outstandingAmount} > 0`);

  const today = new Date();
  let totalReceivables = 0, dueToday = 0, dueThisWeek = 0, dueThisMonth = 0;
  let overdue = 0, overdue30 = 0, overdue60 = 0, overdue90 = 0;

  for (const row of revenues) {
    const outstanding = parseFloat(String(row.r.outstandingAmount));
    totalReceivables += outstanding;
    if (row.r.dueDate) {
      const due = new Date(row.r.dueDate);
      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) dueToday += outstanding;
      if (diffDays <= 7 && diffDays >= 0) dueThisWeek += outstanding;
      if (diffDays <= 30 && diffDays >= 0) dueThisMonth += outstanding;
      if (diffDays > 0) { overdue += outstanding; if (diffDays > 30) overdue30 += outstanding; if (diffDays > 60) overdue60 += outstanding; if (diffDays > 90) overdue90 += outstanding; }
    }
  }

  const byEvent = revenues.map(row => ({
    eventId: row.r.eventId, eventName: row.e?.name ?? "Unknown",
    outstanding: parseFloat(String(row.r.outstandingAmount)),
    dueDate: row.r.dueDate, paymentStatus: row.r.paymentStatus,
  }));

  res.json({ totalReceivables, dueToday, dueThisWeek, dueThisMonth, overdue, overdue30, overdue60, overdue90, byClient: [], byEvent });
});

export default router;
