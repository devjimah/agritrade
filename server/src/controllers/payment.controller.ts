import { Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import * as paymentService from "../services/payment.service";
import { AuthRequest } from "../types";
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
} from "../validators/payment.validator";

export async function createPaymentController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const input = createPaymentSchema.parse(req.body);
    const payment = await paymentService.createPayment(input, req.user.id);
    res.status(201).json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

export async function listPaymentsController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = listPaymentsQuerySchema.parse(req.query);
    const result = await paymentService.listPayments(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
