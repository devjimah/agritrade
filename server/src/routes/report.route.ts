import { Router } from "express";
import {
  dashboardController,
  debtorsController,
  farmerBalancesController,
  listTransactionsController,
} from "../controllers/report.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/dashboard", dashboardController);
router.get("/debtors", debtorsController);
router.get("/farmer-balances", farmerBalancesController);

export default router;

/** Mounted separately at /transactions. */
export const transactionRouter = Router();
transactionRouter.use(requireAuth);
transactionRouter.get("/", listTransactionsController);
