import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { FarmerModel } from "../models/farmer.model";
import * as advanceService from "../services/advance.service";
import * as repaymentService from "../services/repayment.service";
import { AuthRequest } from "../types";
import { loginFarmer } from "../services/farmer-auth.service";
import { farmerLoginSchema } from "../validators/farmer-auth.validator";
import { listMyAdvancesQuerySchema } from "../validators/advance.validator";
import { listMyRepaymentsQuerySchema } from "../validators/repayment.validator";

export async function farmerLoginController(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, pin } = farmerLoginSchema.parse(req.body);
    const { token } = await loginFarmer(phone, pin);
    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
}

export async function meController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.farmer) throw new AppError("Not authenticated", 401);
    // No `.select("+pinHash")` — the schema's `select: false` keeps it out.
    const farmer = await FarmerModel.findById(req.farmer.id);
    if (!farmer) throw new AppError("Farmer not found", 404);
    res.json({ success: true, data: { farmer } });
  } catch (err) {
    next(err);
  }
}

export async function myAdvancesController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.farmer) throw new AppError("Not authenticated", 401);
    const query = listMyAdvancesQuerySchema.parse(req.query);
    const farmerId = req.farmer.id.toString();
    const [result, summary] = await Promise.all([
      advanceService.listAdvances({ ...query, farmerId }),
      advanceService.getFarmerAdvanceSummary(farmerId),
    ]);
    res.json({ success: true, data: { ...result, summary } });
  } catch (err) {
    next(err);
  }
}

export async function myRepaymentsController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.farmer) throw new AppError("Not authenticated", 401);
    const query = listMyRepaymentsQuerySchema.parse(req.query);
    const result = await repaymentService.listRepayments({
      ...query,
      farmerId: req.farmer.id.toString(),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
