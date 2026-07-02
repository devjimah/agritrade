import { HydratedDocument, Schema, model } from "mongoose";
import { ITransaction, TRANSACTION_TYPES } from "../types";

export type TransactionDocument = HydratedDocument<ITransaction>;

/**
 * Append-only financial ledger. Every money-moving operation (advance,
 * repayment, credit sale, payment) writes one entry in the same MongoDB
 * transaction as its source document. Never updated or deleted.
 */
const transactionSchema = new Schema<ITransaction>(
  {
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true, index: true },
    // Integer pesewas, always positive; direction is implied by `type`.
    amount: {
      type: Number,
      required: true,
      min: [1, "Amount must be positive"],
      validate: { validator: Number.isInteger, message: "Amount must be integer pesewas" },
    },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

transactionSchema.index({ createdAt: -1 });

export const TransactionModel = model<ITransaction>("Transaction", transactionSchema);
