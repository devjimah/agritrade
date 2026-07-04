import { Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import * as repaymentService from "../services/repayment.service";
import { AuthRequest } from "../types";
import {
  createRepaymentSchema,
  listRepaymentsQuerySchema,
} from "../validators/repayment.validator";

export async function createRepaymentController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const input = createRepaymentSchema.parse(req.body);
    const repayment = await repaymentService.createRepayment(input, req.user.id);
    res.status(201).json({ success: true, data: { repayment } });
  } catch (err) {
    next(err);
  }
}

export async function listRepaymentsController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const query = listRepaymentsQuerySchema.parse(req.query);
    const result = await repaymentService.listRepayments(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
