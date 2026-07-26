import { Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import * as repaymentClaimService from "../services/repayment-claim.service";
import { AuthRequest } from "../types";
import { objectIdSchema } from "../validators/farmer.validator";
import { listClaimsQuerySchema, rejectClaimSchema } from "../validators/repayment-claim.validator";

export async function listClaimsController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = listClaimsQuerySchema.parse(req.query);
    const result = await repaymentClaimService.listClaims(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmClaimController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const id = objectIdSchema.parse(req.params.id);
    const claim = await repaymentClaimService.confirmClaim(id, req.user.id);
    res.json({ success: true, data: { claim } });
  } catch (err) {
    next(err);
  }
}

export async function rejectClaimController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Not authenticated", 401);
    const id = objectIdSchema.parse(req.params.id);
    const { reason } = rejectClaimSchema.parse(req.body);
    const claim = await repaymentClaimService.rejectClaim(id, req.user.id, reason);
    res.json({ success: true, data: { claim } });
  } catch (err) {
    next(err);
  }
}
