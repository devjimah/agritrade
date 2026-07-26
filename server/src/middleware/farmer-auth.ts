import { NextFunction, Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { FarmerModel } from "../models/farmer.model";
import { AuthRequest } from "../types";
import { verifyToken } from "../utils/jwt";

export async function requireFarmerAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError("Not authenticated", 401);

    let payload;
    try {
      payload = verifyToken(header.slice("Bearer ".length));
    } catch {
      throw new AppError("Not authenticated", 401);
    }
    if (!("scope" in payload) || payload.scope !== "farmer") throw new AppError("Not authenticated", 401);

    // Farmers are undeletable, so a missing document here is defense-in-depth
    // rather than a real path.
    const farmer = await FarmerModel.findById(payload.sub);
    if (!farmer) throw new AppError("Not authenticated", 401);

    req.farmer = { id: farmer._id as Types.ObjectId };
    next();
  } catch (err) {
    next(err);
  }
}
