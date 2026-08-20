import { Router, type IRouter } from "express";
import { eq, isNull } from "drizzle-orm";
import { db, valuationScenariosTable, companySettingsTable, eventsTable, eventRevenueTable, operatingExpensesTable } from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

function computeScenario(scenario: typeof valuationScenariosTable.$inferSelect) {
  const targetValuation = parseFloat(String(scenario.targetValuation));
  const currentRevenue = parseFloat(String(scenario.currentRevenue));
  const revenueGrowthRate = parseFloat(String(scenario.revenueGrowthRate));
  const ebitdaMargin = parseFloat(String(scenario.ebitdaMargin));
  const revenueMultiple = parseFloat(String(scenario.revenueMultiple));
  const ebitdaMultiple = parseFloat(String(scenario.ebitdaMultiple));
  
  const estimatedValuation = Math.max(
    currentRevenue * revenueMultiple,
    currentRevenue * ebitdaMargin * ebitdaMultiple,
  );
  const gapToTarget = targetValuation - estimatedValuation;
  const requiredRevenue = targetValuation / revenueMultiple;
  const requiredEbitda = targetValuation / ebitdaMultiple;
  const requiredEbitdaMargin = requiredEbitda / requiredRevenue;
  
  // Years to reach target at growth rate
  let years = 0;
  let projectedRevenue = currentRevenue;
  while (projectedRevenue < requiredRevenue && years < 50) {
    projectedRevenue *= (1 + revenueGrowthRate);
    years++;
  }
  const requiredAnnualGrowth = years > 0 ? Math.pow(requiredRevenue / Math.max(currentRevenue, 1), 1 / Math.max(years, 1)) - 1 : revenueGrowthRate;
  
  return {
    ...scenario,
    targetValuation,
    currentRevenue,
    currentEbitda: scenario.currentEbitda ? parseFloat(String(scenario.currentEbitda)) : null,
    currentNetProfit: scenario.currentNetProfit ? parseFloat(String(scenario.currentNetProfit)) : null,
    revenueGrowthRate,
    ebitdaMargin,
    revenueMultiple,
    ebitdaMultiple,
    estimatedValuation,
    gapToTarget,
    requiredRevenue,
    requiredEbitda,
    requiredAnnualGrowth,
    requiredEvents: null,
    requiredAvgEventValue: null,
  };
}

router.get("/valuation/scenarios", async (req, res): Promise<void> => {
  const scenarios = await db.select().from(valuationScenariosTable).orderBy(valuationScenariosTable.scenarioType);
  res.json(scenarios.map(computeScenario));
});

router.post("/valuation/scenarios", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, scenarioType = "custom", targetValuation, currentRevenue, revenueGrowthRate, ebitdaMargin, revenueMultiple, ebitdaMultiple, ...rest } = req.body;
  if (!name || !targetValuation || !currentRevenue) { res.status(400).json({ error: "name, targetValuation, currentRevenue required" }); return; }
  const [scenario] = await db.insert(valuationScenariosTable).values({
    name, scenarioType, targetValuation: String(targetValuation), currentRevenue: String(currentRevenue),
    revenueGrowthRate: String(revenueGrowthRate ?? 0.20), ebitdaMargin: String(ebitdaMargin ?? 0.15),
    revenueMultiple: String(revenueMultiple ?? 3), ebitdaMultiple: String(ebitdaMultiple ?? 10), ...rest,
  }).returning();
  res.status(201).json(computeScenario(scenario));
});

router.patch("/valuation/scenarios/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, estimatedValuation, gapToTarget, requiredRevenue, requiredEbitda, requiredAnnualGrowth, requiredEvents, requiredAvgEventValue, ...data } = req.body;
  const [scenario] = await db.update(valuationScenariosTable).set(data).where(eq(valuationScenariosTable.id, id)).returning();
  if (!scenario) { res.status(404).json({ error: "Scenario not found" }); return; }
  res.json(computeScenario(scenario));
});

router.delete("/valuation/scenarios/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [scenario] = await db.delete(valuationScenariosTable).where(eq(valuationScenariosTable.id, id)).returning();
  if (!scenario) { res.status(404).json({ error: "Scenario not found" }); return; }
  res.sendStatus(204);
});

router.get("/valuation/command-center", async (req, res): Promise<void> => {
  const scenarios = await db.select().from(valuationScenariosTable).orderBy(valuationScenariosTable.scenarioType);
  const [settings] = await db.select().from(companySettingsTable).limit(1);

  const events = await db.select().from(eventsTable);
  const revenues = await db.select().from(eventRevenueTable);
  const directCostsByEvent = await getEventDirectCostTotals();
  const opex = await db.select().from(operatingExpensesTable);

  const currentYear = new Date().getFullYear();
  const yearRevenues = revenues.filter(r => {
    const ev = events.find(e => e.id === r.eventId);
    return ev && ev.eventDate.startsWith(String(currentYear));
  });

  const revenue = yearRevenues.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
  const totalCosts = events
    .filter(event => event.eventDate.startsWith(String(currentYear)))
    .reduce((sum, event) => sum + (directCostsByEvent.get(event.id) ?? 0), 0);
  const grossProfit = revenue - totalCosts;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const opexTotal = opex.filter(e => e.year === currentYear && e.eventId === null).reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  const ebitda = grossProfit - opexTotal;
  const netProfit = ebitda;

  const targetValuation = parseFloat(String(settings?.valuationTarget ?? 900000000));

  res.json({
    targetValuation,
    currentMetrics: { revenue, ebitda, netProfit, grossMarginPct },
    scenarios: scenarios.map(computeScenario),
  });
});

export default router;
