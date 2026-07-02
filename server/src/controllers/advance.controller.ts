import { Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import * as advanceService from "../services/advance.service";
import { AuthRequest } from "../types";
import {
  createAdvanceSchema,
  listAdvancesQuerySchema,
} from "../validators/advance.validator";
import { objectIdSchema } from "../validators/farmer.validator";

export async function createAdvanceController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const input = createAdvanceSchema.parse(req.body);
    const advance = await advanceService.createAdvance(input, req.user.id);
    res.status(201).json({ success: true, data: { advance } });
  } catch (err) {
    next(err);
  }
}

export async function listAdvancesController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = listAdvancesQuerySchema.parse(req.query);
    const result = await advanceService.listAdvances(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getAdvanceSummaryController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const farmerId = objectIdSchema.parse(req.query.farmerId);
    const summary = await advanceService.getFarmerAdvanceSummary(farmerId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
}

export async function getAdvanceController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const advance = await advanceService.getAdvanceById(id);
    res.json({ success: true, data: { advance } });
  } catch (err) {
    next(err);
  }
}
