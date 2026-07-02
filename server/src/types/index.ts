import { Request } from "express";
import { Types } from "mongoose";

export type UserRole = "admin" | "staff";

export interface IUser {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: { id: Types.ObjectId; role: UserRole };
}
