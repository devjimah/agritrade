import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  farmerLoginController,
  meController,
  myAdvancesController,
  myRepaymentsController,
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

router.post("/login", loginLimiter, farmerLoginController);

// Applied per-route (not router.use) so /login above stays reachable
// without a token while everything below it requires one.
router.get("/me", requireFarmerAuth, meController);
router.get("/advances", requireFarmerAuth, myAdvancesController);
router.get("/repayments", requireFarmerAuth, myRepaymentsController);

export default router;
