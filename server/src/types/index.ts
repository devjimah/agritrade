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

export interface ICustomer {
  fullName: string;
  phone: string;
  location?: string;
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
  /** Denormalized running total, updated atomically with each repayment. */
  bagsRepaid: number;
  repaymentStatus: RepaymentStatus;
  notes?: string;
}

export interface IFarmerRepayment {
  advanceId: Types.ObjectId;
  /** Denormalized from the advance so repayments are queryable per farmer. */
  farmerId: Types.ObjectId;
  cropType: CropType;
  bagsSupplied: number;
  /** Client-generated UUID; unique index prevents double-submits (rule 7). */
  idempotencyKey: string;
  notes?: string;
}

export interface IInventory {
  cropType: CropType;
  quantityBags: number;
  /** Set by mongoose timestamps. */
  createdAt?: Date;
  updatedAt?: Date;
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
  /** The farmer or customer counterparty, when there is one (per-party ledger views). */
  farmerId?: Types.ObjectId;
  /**
   * Pesewas; direction implied by type. Zero only for commodity movements
   * (repayment_received), which carry `bags` instead.
   */
  amount: number;
  /** Bags moved, for commodity transactions. */
  bags?: number;
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
