import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, leadsTable, clientsTable, employeesTable } from "@workspace/db";

const router: IRouter = Router();

function formatLead(lead: typeof leadsTable.$inferSelect, clientName?: string | null, salespersonName?: string | null) {
  const expectedValue = lead.expectedValue ? parseFloat(String(lead.expectedValue)) : null;
  const probability = lead.probability ?? null;
  const weightedValue = expectedValue && probability ? (expectedValue * probability) / 100 : null;
  return { ...lead, clientName: clientName ?? null, salespersonName: salespersonName ?? null, expectedValue, expectedProfit: lead.expectedProfit ? parseFloat(String(lead.expectedProfit)) : null, weightedValue };
}

router.get("/leads", async (req, res): Promise<void> => {
  const { status, salespersonId, page = "1", limit = "100" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (status) conditions.push(eq(leadsTable.status, status));
  if (salespersonId) conditions.push(eq(leadsTable.salespersonId, parseInt(salespersonId, 10)));

  const where = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]}`) : undefined;

  const [leads, totalResult] = await Promise.all([
    db.select().from(leadsTable).where(where).orderBy(desc(leadsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(where),
  ]);

  const enriched = await Promise.all(leads.map(async (lead) => {
    let clientName: string | null = null;
    let salespersonName: string | null = null;
    if (lead.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, lead.clientId));
      clientName = client?.name ?? null;
    }
    if (lead.salespersonId) {
      const [sp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, lead.salespersonId));
      salespersonName = sp?.name ?? null;
    }
    return formatLead(lead, clientName, salespersonName);
  }));

  res.json({ data: enriched, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

router.post("/leads", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { contactName, status = "new", ...rest } = req.body;
  if (!contactName) { res.status(400).json({ error: "contactName is required" }); return; }
  const [lead] = await db.insert(leadsTable).values({ contactName, status, ...rest, createdBy: req.user.id }).returning();
  res.status(201).json(formatLead(lead));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(formatLead(lead));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, clientName, salespersonName, weightedValue, ...data } = req.body;
  const [lead] = await db.update(leadsTable).set({ ...data, updatedBy: req.user.id }).where(eq(leadsTable.id, id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(formatLead(lead));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [lead] = await db.delete(leadsTable).where(eq(leadsTable.id, id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.sendStatus(204);
});

router.get("/pipeline/summary", async (req, res): Promise<void> => {
  const leads = await db.select().from(leadsTable);
  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter(l => ["qualified", "requirement_received", "proposal_sent", "negotiation", "won"].includes(l.status)).length;
  const proposalsSent = leads.filter(l => ["proposal_sent", "negotiation", "won"].includes(l.status)).length;
  const wonDeals = leads.filter(l => l.status === "won").length;
  const lostDeals = leads.filter(l => l.status === "lost").length;
  const activeLeads = leads.filter(l => !["won", "lost"].includes(l.status));
  const pipelineValue = activeLeads.reduce((s, l) => s + parseFloat(String(l.expectedValue ?? 0)), 0);
  const weightedPipeline = activeLeads.reduce((s, l) => s + (parseFloat(String(l.expectedValue ?? 0)) * (l.probability ?? 0)) / 100, 0);
  const totalWonLost = wonDeals + lostDeals;
  const winRate = totalWonLost > 0 ? (wonDeals / totalWonLost) * 100 : 0;
  const wonLeads = leads.filter(l => l.status === "won");
  const avgDealSize = wonLeads.length > 0 ? wonLeads.reduce((s, l) => s + parseFloat(String(l.expectedValue ?? 0)), 0) / wonLeads.length : 0;

  const byStatus = ["new", "contacted", "qualified", "requirement_received", "proposal_sent", "negotiation", "won", "lost"].map(status => ({
    status,
    count: leads.filter(l => l.status === status).length,
    value: leads.filter(l => l.status === status).reduce((s, l) => s + parseFloat(String(l.expectedValue ?? 0)), 0),
  }));

  res.json({ totalLeads, qualifiedLeads, proposalsSent, wonDeals, lostDeals, pipelineValue, weightedPipeline, winRate, avgDealSize, byStatus });
});

export default router;
