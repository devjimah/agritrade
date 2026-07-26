import { HydratedDocument, Schema, model } from "mongoose";
import { CROP_TYPES, IFarmerRepayment } from "../types";

export type FarmerRepaymentDocument = HydratedDocument<IFarmerRepayment>;

const farmerRepaymentSchema = new Schema<IFarmerRepayment>(
  {
    advanceId: { type: Schema.Types.ObjectId, ref: "FarmerAdvance", required: true },
    farmerId: { type: Schema.Types.ObjectId, ref: "Farmer", required: true },
    cropType: { type: String, enum: CROP_TYPES, required: true },
    bagsSupplied: {
      type: Number,
      required: true,
      min: [1, "Bags supplied must be at least 1"],
      validate: { validator: Number.isInteger, message: "Bags must be a whole number" },
    },
    // Unique: a retried or double-clicked submission carries the same key and
    // is rejected instead of recorded twice (duplicate-repayment rule).
    // select: false — internal plumbing, and readable keys are dangerous: a
    // farmer who could read one could submit a claim carrying it and make the
    // trader's confirm resolve to that existing repayment with no financial
    // effect. Nothing reads this field back; `unique` and the E11000-recovery
    // lookups filter on it, which select: false does not affect.
    idempotencyKey: { type: String, required: true, unique: true, select: false },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

farmerRepaymentSchema.index({ advanceId: 1, createdAt: -1 });
farmerRepaymentSchema.index({ farmerId: 1, createdAt: -1 });

export const FarmerRepaymentModel = model<IFarmerRepayment>(
  "FarmerRepayment",
  farmerRepaymentSchema
);
