import { Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import * as creditSaleService from "../services/credit-sale.service";
import { AuthRequest } from "../types";
import {
  createCreditSaleSchema,
  listCreditSalesQuerySchema,
} from "../validators/credit-sale.validator";
import { objectIdSchema } from "../validators/farmer.validator";

export async function createCreditSaleController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const input = createCreditSaleSchema.parse(req.body);
    const sale = await creditSaleService.createCreditSale(input, req.user.id);
    res.status(201).json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

export async function listCreditSalesController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const query = listCreditSalesQuerySchema.parse(req.query);
    const result = await creditSaleService.listCreditSales(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerDebtSummaryController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const customerId = objectIdSchema.parse(req.query.customerId);
    const summary = await creditSaleService.getCustomerDebtSummary(customerId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
}
