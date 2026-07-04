import { Router } from "express";
import authRoute from "./auth.route";
import farmerRoute from "./farmer.route";
import advanceRoute from "./advance.route";
import repaymentRoute from "./repayment.route";
import inventoryRoute from "./inventory.route";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

router.use("/auth", authRoute);
router.use("/farmers", farmerRoute);
router.use("/advances", advanceRoute);
router.use("/repayments", repaymentRoute);
router.use("/inventory", inventoryRoute);

export default router;
