import { HydratedDocument, Schema, model } from "mongoose";
import { CROP_TYPES, IFarmerAdvance, REPAYMENT_STATUSES } from "../types";

export type FarmerAdvanceDocument = HydratedDocument<IFarmerAdvance>;

const farmerAdvanceSchema = new Schema<IFarmerAdvance>(
  {
    farmerId: { type: Schema.Types.ObjectId, ref: "Farmer", required: true },
    // Integer pesewas (GHS x 100); floats must never reach this field.
    amountGiven: {
      type: Number,
      required: true,
      min: [1, "Amount must be positive"],
      validate: { validator: Number.isInteger, message: "Amount must be integer pesewas" },
    },
    cropType: { type: String, enum: CROP_TYPES, required: true },
    expectedBags: {
      type: Number,
      required: true,
      min: [1, "Expected bags must be at least 1"],
      validate: { validator: Number.isInteger, message: "Expected bags must be a whole number" },
    },
    repaymentStatus: {
      type: String,
      enum: REPAYMENT_STATUSES,
      required: true,
      default: "pending",
    },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

// Compound index serves the hottest query (per-farmer list, newest first);
// the bare createdAt index serves the unfiltered global list.
farmerAdvanceSchema.index({ farmerId: 1, createdAt: -1 });
farmerAdvanceSchema.index({ createdAt: -1 });

export const FarmerAdvanceModel = model<IFarmerAdvance>("FarmerAdvance", farmerAdvanceSchema);
