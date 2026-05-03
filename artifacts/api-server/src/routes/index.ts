import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./googleAuth";
import gmailRouter from "./gmail";
import bankRouter from "./bank";
import bankConnectionsRouter from "./bankConnections";
import transactionsRouter from "./transactions";
import subscriptionsRouter from "./subscriptions";
import cancellationsRouter from "./cancellations";
import notificationsRouter from "./notifications";
import savingsRouter from "./savings";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(gmailRouter);
router.use(bankRouter);
router.use(bankConnectionsRouter);
router.use(transactionsRouter);
router.use(subscriptionsRouter);
router.use(cancellationsRouter);
router.use(notificationsRouter);
router.use(savingsRouter);
router.use(dashboardRouter);
router.use(billingRouter);

export default router;
