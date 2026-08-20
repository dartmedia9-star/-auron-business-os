import { inArray } from "drizzle-orm";
import { db, eventCostsTable, operatingExpensesTable } from "@workspace/db";

/**
 * Returns a total direct-cost amount for each event. A direct cost can be
 * either an existing event_costs record or one operating_expenses record
 * explicitly linked to an event.
 */
export async function getEventDirectCostTotals(eventIds?: number[]): Promise<Map<number, number>> {
  if (eventIds?.length === 0) return new Map();

  const eventCostWhere = eventIds ? inArray(eventCostsTable.eventId, eventIds) : undefined;
  const expenseWhere = eventIds ? inArray(operatingExpensesTable.eventId, eventIds) : undefined;

  const [eventCosts, linkedExpenses] = await Promise.all([
    db.select({
      eventId: eventCostsTable.eventId,
      totalAmount: eventCostsTable.totalAmount,
    }).from(eventCostsTable).where(eventCostWhere),
    db.select({
      eventId: operatingExpensesTable.eventId,
      amount: operatingExpensesTable.amount,
      gst: operatingExpensesTable.gst,
    }).from(operatingExpensesTable).where(expenseWhere),
  ]);

  const totals = new Map<number, number>();
  const add = (eventId: number, amount: number) => {
    totals.set(eventId, (totals.get(eventId) ?? 0) + amount);
  };

  for (const cost of eventCosts) {
    add(cost.eventId, parseFloat(String(cost.totalAmount)));
  }

  for (const expense of linkedExpenses) {
    if (expense.eventId !== null) {
      add(
        expense.eventId,
        parseFloat(String(expense.amount)) + parseFloat(String(expense.gst)),
      );
    }
  }

  return totals;
}