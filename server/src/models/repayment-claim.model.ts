import { HydratedDocument, Schema, model } from "mongoose";
import { IRepaymentClaim, REPAYMENT_CLAIM_STATUSES } from "../types";

export type RepaymentClaimDocument = HydratedDocument<IRepaymentClaim>;

const repaymentClaimSchema = new Schema<IRepaymentClaim>(
  {
    advanceId: { type: Schema.Types.ObjectId, ref: "FarmerAdvance", required: true },
    // Denormalized so the farmer-scoped list query never has to join advances.
    farmerId: { type: Schema.Types.ObjectId, ref: "Farmer", required: true },
    bagsClaimed: {
      type: Number,
      required: true,
      min: [1, "Bags claimed must be at least 1"],
      validate: { validator: Number.isInteger, message: "Bags claimed must be a whole number" },
    },
    status: {
      type: String,
      enum: REPAYMENT_CLAIM_STATUSES,
      required: true,
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    // Set on confirm (Task 6), links the claim to the real FarmerRepayment it produced.
    resultingRepaymentId: { type: Schema.Types.ObjectId, ref: "FarmerRepayment" },
    // Unique: a retried or double-clicked submission carries the same key and
    // is rejected instead of recorded twice (same rule as FarmerRepaymentModel).
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true, versionKey: false }
);

repaymentClaimSchema.index({ farmerId: 1, createdAt: -1 });
repaymentClaimSchema.index({ status: 1, createdAt: -1 });

export const RepaymentClaimModel = model<IRepaymentClaim>("RepaymentClaim", repaymentClaimSchema);
