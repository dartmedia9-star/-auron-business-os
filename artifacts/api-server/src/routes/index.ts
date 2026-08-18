import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import clientsRouter from "./clients";
import eventsRouter from "./events";
import leadsRouter from "./leads";
import marketingRouter from "./marketing";
import financeRouter from "./finance";
import vendorsRouter from "./vendors";
import assetsRouter from "./assets";
import employeesRouter from "./employees";
import valuationRouter from "./valuation";
import miscRouter from "./misc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(clientsRouter);
router.use(eventsRouter);
router.use(leadsRouter);
router.use(marketingRouter);
router.use(financeRouter);
router.use(vendorsRouter);
router.use(assetsRouter);
router.use(employeesRouter);
router.use(valuationRouter);
router.use(miscRouter);

export default router;
