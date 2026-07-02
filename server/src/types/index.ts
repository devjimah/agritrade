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

export const CROP_TYPES = [
  "maize",
  "beans",
  "brown_rice",
  "millet",
  "bambara_beans",
  "groundnuts",
] as const;
export type CropType = (typeof CROP_TYPES)[number];

export const REPAYMENT_STATUSES = ["pending", "partial", "completed"] as const;
export type RepaymentStatus = (typeof REPAYMENT_STATUSES)[number];

/** All money fields are integer pesewas (GHS x 100) — never floats. */
export interface IFarmerAdvance {
  farmerId: Types.ObjectId;
  /** Pesewas. */
  amountGiven: number;
  cropType: CropType;
  expectedBags: number;
  repaymentStatus: RepaymentStatus;
  notes?: string;
}

export const TRANSACTION_TYPES = [
  "advance_given",
  "repayment_received",
  "credit_sale",
  "payment_received",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface ITransaction {
  type: TransactionType;
  /** The financial document this entry records (advance, repayment, sale, payment). */
  referenceId: Types.ObjectId;
  /** Pesewas; always positive, direction implied by type. */
  amount: number;
  description: string;
  createdBy: Types.ObjectId;
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
