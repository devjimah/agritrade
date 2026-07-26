import { Router } from "express";
import {
  confirmClaimController,
  listClaimsController,
  rejectClaimController,
} from "../controllers/repayment-claim.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", listClaimsController);
router.post("/:id/confirm", confirmClaimController);
router.post("/:id/reject", rejectClaimController);

export default router;
