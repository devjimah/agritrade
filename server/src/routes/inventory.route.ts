import { Router } from "express";
import { getInventoryController } from "../controllers/inventory.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", getInventoryController);

export default router;
