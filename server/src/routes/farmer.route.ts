import { Router } from "express";
import {
  createFarmerController,
  getFarmerController,
  listFarmersController,
  updateFarmerController,
} from "../controllers/farmer.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createFarmerController);
router.get("/", listFarmersController);
router.get("/:id", getFarmerController);
router.put("/:id", updateFarmerController);

export default router;
