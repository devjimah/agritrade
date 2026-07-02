import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginController, meController } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many login attempts, try again later", errors: [] } },
});

router.post("/login", loginLimiter, loginController);
router.get("/me", requireAuth, meController);

export default router;
