import { HydratedDocument, Schema, model } from "mongoose";
import { CROP_TYPES, IInventory } from "../types";

export type InventoryDocument = HydratedDocument<IInventory>;

/**
 * One document per crop. Mutated only inside the same MongoDB transaction as
 * the financial document that moves stock (repayment adds, credit sale
 * subtracts). quantityBags must never go negative — sales enforce this with a
 * guarded conditional update, and the schema min is the last line of defense.
 */
const inventorySchema = new Schema<IInventory>(
  {
    cropType: { type: String, enum: CROP_TYPES, required: true, unique: true },
    quantityBags: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Inventory cannot go negative"],
      validate: { validator: Number.isInteger, message: "Bags must be a whole number" },
    },
  },
  { timestamps: true, versionKey: false }
);

export const InventoryModel = model<IInventory>("Inventory", inventorySchema);
