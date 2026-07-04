import { Router } from "express";
import {
  createPaymentController,
  listPaymentsController,
} from "../controllers/payment.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createPaymentController);
router.get("/", listPaymentsController);

export default router;
