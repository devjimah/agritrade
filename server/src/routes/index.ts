import { Router } from "express";
import authRoute from "./auth.route";
import farmerRoute from "./farmer.route";
import farmerPortalRoute from "./farmer-portal.route";
import advanceRoute from "./advance.route";
import repaymentRoute from "./repayment.route";
import inventoryRoute from "./inventory.route";
import customerRoute from "./customer.route";
import creditSaleRoute from "./credit-sale.route";
import paymentRoute from "./payment.route";
import reportRoute, { transactionRouter } from "./report.route";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

router.use("/auth", authRoute);
router.use("/farmers", farmerRoute);
router.use("/farmer-portal", farmerPortalRoute);
router.use("/advances", advanceRoute);
router.use("/repayments", repaymentRoute);
router.use("/inventory", inventoryRoute);
router.use("/customers", customerRoute);
router.use("/credit-sales", creditSaleRoute);
router.use("/payments", paymentRoute);
router.use("/reports", reportRoute);
router.use("/transactions", transactionRouter);

export default router;
