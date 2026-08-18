import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, marketingChannelsTable, marketingSpendTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/marketing/channels", async (req, res): Promise<void> => {
  const channels = await db.select().from(marketingChannelsTable).orderBy(marketingChannelsTable.name);
  res.json(channels);
});

router.post("/marketing/channels", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, isActive = true } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [channel] = await db.insert(marketingChannelsTable).values({ name, isActive }).returning();
  res.status(201).json(channel);
});

router.patch("/marketing/channels/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  const [channel] = await db.update(marketingChannelsTable).set(data).where(eq(marketingChannelsTable.id, id)).returning();
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  res.json(channel);
});

router.get("/marketing/spend", async (req, res): Promise<void> => {
  const { channelId, year, month } = req.query as Record<string, string>;
  const conditions = [];
  if (channelId) conditions.push(eq(marketingSpendTable.channelId, parseInt(channelId, 10)));
  if (year) conditions.push(eq(marketingSpendTable.year, parseInt(year, 10)));
  if (month) conditions.push(eq(marketingSpendTable.month, parseInt(month, 10)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const spend = await db.select({
    spend: marketingSpendTable,
    channelName: marketingChannelsTable.name,
  }).from(marketingSpendTable).leftJoin(marketingChannelsTable, eq(marketingChannelsTable.id, marketingSpendTable.channelId)).where(where).orderBy(desc(marketingSpendTable.year), desc(marketingSpendTable.month));
  res.json(spend.map(s => ({
    ...s.spend, channelName: s.channelName,
    amount: parseFloat(String(s.spend.amount)),
    revenueGenerated: parseFloat(String(s.spend.revenueGenerated)),
    grossProfitGenerated: parseFloat(String(s.spend.grossProfitGenerated)),
  })));
});

router.post("/marketing/spend", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { channelId, amount, year, month, ...rest } = req.body;
  if (!channelId || !amount || !year || !month) { res.status(400).json({ error: "channelId, amount, year, month required" }); return; }
  const [spend] = await db.insert(marketingSpendTable).values({ channelId: parseInt(String(channelId), 10), amount: String(amount), year: parseInt(String(year), 10), month: parseInt(String(month), 10), ...rest }).returning();
  res.status(201).json({ ...spend, amount: parseFloat(String(spend.amount)) });
});

router.patch("/marketing/spend/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  const [spend] = await db.update(marketingSpendTable).set(data).where(eq(marketingSpendTable.id, id)).returning();
  if (!spend) { res.status(404).json({ error: "Spend record not found" }); return; }
  res.json({ ...spend, amount: parseFloat(String(spend.amount)) });
});

router.delete("/marketing/spend/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [spend] = await db.delete(marketingSpendTable).where(eq(marketingSpendTable.id, id)).returning();
  if (!spend) { res.status(404).json({ error: "Spend record not found" }); return; }
  res.sendStatus(204);
});

router.get("/marketing/roi", async (req, res): Promise<void> => {
  const { year } = req.query as Record<string, string>;
  const currentYear = parseInt(year || String(new Date().getFullYear()), 10);
  const channels = await db.select().from(marketingChannelsTable);
  const spend = await db.select().from(marketingSpendTable).where(eq(marketingSpendTable.year, currentYear));

  let totalSpend = 0, totalRevenue = 0, totalGrossProfit = 0;
  const channelResults = channels.map(ch => {
    const chSpend = spend.filter(s => s.channelId === ch.id);
    const spendTotal = chSpend.reduce((s, m) => s + parseFloat(String(m.amount)), 0);
    const leadsGenerated = chSpend.reduce((s, m) => s + m.leadsGenerated, 0);
    const customersAcquired = chSpend.reduce((s, m) => s + m.customersAcquired, 0);
    const revenue = chSpend.reduce((s, m) => s + parseFloat(String(m.revenueGenerated)), 0);
    const grossProfit = chSpend.reduce((s, m) => s + parseFloat(String(m.grossProfitGenerated)), 0);
    const cac = customersAcquired > 0 ? spendTotal / customersAcquired : null;
    const roi = spendTotal > 0 ? ((grossProfit - spendTotal) / spendTotal) * 100 : 0;
    const conversionRate = leadsGenerated > 0 ? (customersAcquired / leadsGenerated) * 100 : 0;
    totalSpend += spendTotal; totalRevenue += revenue; totalGrossProfit += grossProfit;
    return { channelId: ch.id, channelName: ch.name, spend: spendTotal, leadsGenerated, customersAcquired, revenue, grossProfit, cac, roi, conversionRate };
  }).filter(c => c.spend > 0);

  const overallRoi = totalSpend > 0 ? ((totalGrossProfit - totalSpend) / totalSpend) * 100 : 0;
  const totalCustomers = spend.reduce((s, m) => s + m.customersAcquired, 0);
  const overallCac = totalCustomers > 0 ? totalSpend / totalCustomers : null;

  res.json({ totalSpend, totalRevenue, totalGrossProfit, overallRoi, overallCac, channels: channelResults });
});

export default router;
