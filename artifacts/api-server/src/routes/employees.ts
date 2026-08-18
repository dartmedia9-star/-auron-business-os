import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, employeesTable, eventsTable } from "@workspace/db";

const router: IRouter = Router();

async function enrichEmployee(employee: typeof employeesTable.$inferSelect) {
  return {
    ...employee,
    salary: employee.salary ? parseFloat(String(employee.salary)) : null,
    eventsAssigned: 0,
    eventsCompleted: 0,
    revenueSupported: 0,
    grossProfitSupported: 0,
  };
}

router.get("/employees", async (req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).orderBy(desc(employeesTable.createdAt));
  res.json(await Promise.all(employees.map(enrichEmployee)));
});

router.post("/employees", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, role, department, joiningDate, ...rest } = req.body;
  if (!name || !role || !department || !joiningDate) { res.status(400).json({ error: "name, role, department, joiningDate required" }); return; }
  const [employee] = await db.insert(employeesTable).values({ name, role, department, joiningDate, ...rest }).returning();
  res.status(201).json(await enrichEmployee(employee));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(await enrichEmployee(employee));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, eventsAssigned, eventsCompleted, revenueSupported, grossProfitSupported, ...data } = req.body;
  const [employee] = await db.update(employeesTable).set(data).where(eq(employeesTable.id, id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(await enrichEmployee(employee));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [employee] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
});

export default router;
