import { NextFunction, Request, Response } from "express";
import { loginFarmer } from "../services/farmer-auth.service";
import { farmerLoginSchema } from "../validators/farmer-auth.validator";

export async function farmerLoginController(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, pin } = farmerLoginSchema.parse(req.body);
    const { token } = await loginFarmer(phone, pin);
    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
}
