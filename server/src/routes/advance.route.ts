import { Router } from "express";
import {
  createAdvanceController,
  getAdvanceController,
  getAdvanceSummaryController,
  listAdvancesController,
} from "../controllers/advance.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createAdvanceController);
router.get("/", listAdvancesController);
// Must be registered before /:id so "summary" isn't parsed as an id.
router.get("/summary", getAdvanceSummaryController);
router.get("/:id", getAdvanceController);

export default router;
