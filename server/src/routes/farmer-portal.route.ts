import { Router } from "express";
import rateLimit from "express-rate-limit";
import { farmerLoginController } from "../controllers/farmer-portal.controller";

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

export default router;
