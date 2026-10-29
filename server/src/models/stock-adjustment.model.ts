import { HydratedDocument, Schema, Types, model } from "mongoose";
import { CROP_TYPES, CropType } from "../types";

/**
 * A manual stock correction (spoiled, lost, miscounted bags). Written in the
 * same MongoDB transaction as the inventory change it explains, so every
 * stock move outside a repayment or sale has an audit record.
 *
 * Deliberately NOT a Transaction: the ledger records money and the
 * commodity side of money deals. A correction has no counterparty and no
 * cash, so it lives here instead of bending the ledger's validators.
 */
export interface IStockAdjustment {
  cropType: CropType;
  /** Signed: +3 found three bags, -2 two bags spoiled. Never zero. */
  changeBags: number;
  reason: string;
  /** Stock after this adjustment, for reading the history without replaying it. */
  quantityAfter: number;
  /** Unique: a retried confirm resolves to the same adjustment. */
  idempotencyKey: string;
  createdBy: Types.ObjectId;
}

export type StockAdjustmentDocument = HydratedDocument<IStockAdjustment>;

const stockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    cropType: { type: String, enum: CROP_TYPES, required: true },
    changeBags: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v !== 0,
        message: "Change must be a whole number of bags, not zero",
      },
    },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    quantityAfter: { type: Number, required: true, min: 0 },
    idempotencyKey: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

stockAdjustmentSchema.index({ createdAt: -1 });

export const StockAdjustmentModel = model<IStockAdjustment>("StockAdjustment", stockAdjustmentSchema);
