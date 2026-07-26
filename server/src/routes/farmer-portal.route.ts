import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  farmerLoginController,
  meController,
  myAdvancesController,
  myClaimsController,
  myRepaymentsController,
  submitClaimController,
} from "../controllers/farmer-portal.controller";
import { requireFarmerAuth } from "../middleware/farmer-auth";

const router = Router();

// Separate limiter instance from staff login's: a distinct abuse surface,
// even though the shape (10/min, same message envelope) matches.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many login attempts, try again later", errors: [] } },
});

// The ONLY public route in this file, and it must stay above the router.use
// below — express runs middleware in declaration order.
router.post("/login", loginLimiter, farmerLoginController);

// Fail-CLOSED boundary: every route declared BELOW this line requires a farmer
// token automatically. Do not add per-route requireFarmerAuth, and do not add
// public routes below here — a new route added under this line is authenticated
// by default, which is the behaviour we want when someone forgets.
router.use(requireFarmerAuth);

router.get("/me", meController);
router.get("/advances", myAdvancesController);
router.get("/repayments", myRepaymentsController);
router.post("/repayment-claims", submitClaimController);
router.get("/repayment-claims", myClaimsController);

export default router;
