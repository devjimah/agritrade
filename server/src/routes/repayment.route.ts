import { Router } from "express";
import {
  createRepaymentController,
  listRepaymentsController,
} from "../controllers/repayment.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createRepaymentController);
router.get("/", listRepaymentsController);

export default router;
