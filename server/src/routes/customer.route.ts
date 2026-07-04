import { Router } from "express";
import {
  createCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from "../controllers/customer.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createCustomerController);
router.get("/", listCustomersController);
router.get("/:id", getCustomerController);
router.put("/:id", updateCustomerController);

export default router;
