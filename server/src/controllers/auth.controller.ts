import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { login } from "../services/auth.service";
import { AuthRequest } from "../types";
import { loginSchema } from "../validators/auth.validator";

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { user, token } = await login(email, password);
    res.json({ success: true, data: { user: user.toJSON(), token } });
  } catch (err) {
    next(err);
  }
}

export async function meController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = req.userDoc;
    if (!user) throw new AppError("Not authenticated", 401);
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (err) {
    next(err);
  }
}
