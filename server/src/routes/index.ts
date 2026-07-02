import { Router } from "express";
import authRoute from "./auth.route";
import farmerRoute from "./farmer.route";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

router.use("/auth", authRoute);
router.use("/farmers", farmerRoute);

export default router;
