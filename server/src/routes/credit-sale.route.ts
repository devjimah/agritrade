import { Router } from "express";
import {
  createCreditSaleController,
  getCustomerDebtSummaryController,
  listCreditSalesController,
} from "../controllers/credit-sale.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createCreditSaleController);
router.get("/", listCreditSalesController);
router.get("/summary", getCustomerDebtSummaryController);

export default router;
