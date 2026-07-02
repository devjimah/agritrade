import { NextFunction, Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { UserModel } from "../models/user.model";
import { AuthRequest } from "../types";
import { verifyToken } from "../utils/jwt";

export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError("Not authenticated", 401);

    let payload;
    try {
      payload = verifyToken(header.slice("Bearer ".length));
    } catch {
      throw new AppError("Not authenticated", 401);
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) throw new AppError("Not authenticated", 401);

    req.user = { id: user._id as Types.ObjectId, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
