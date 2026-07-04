import { Response, NextFunction } from "express";
import * as reportService from "../services/report.service";
import {
  listTransactions,
  listTransactionsQuerySchema,
} from "../services/transaction.service";
import { AuthRequest } from "../types";

export async function dashboardController(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const report = await reportService.getDashboardReport();
    res.json({ success: true, data: { report } });
  } catch (err) {
    next(err);
  }
}

export async function debtorsController(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const debtors = await reportService.getDebtorsReport();
    res.json({ success: true, data: { debtors } });
  } catch (err) {
    next(err);
  }
}

export async function farmerBalancesController(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const balances = await reportService.getFarmerBalancesReport();
    res.json({ success: true, data: { balances } });
  } catch (err) {
    next(err);
  }
}

export async function listTransactionsController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const query = listTransactionsQuerySchema.parse(req.query);
    const result = await listTransactions(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
