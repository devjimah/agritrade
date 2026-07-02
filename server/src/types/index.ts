import { Request } from "express";
import { HydratedDocument, Types } from "mongoose";

export type UserRole = "admin" | "staff";

export interface IUser {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface IFarmer {
  fullName: string;
  phone: string;
  village?: string;
  notes?: string;
}

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: { id: Types.ObjectId; role: UserRole };
  /** Full user document loaded by requireAuth; avoids a second fetch in handlers. */
  userDoc?: HydratedDocument<IUser>;
}
