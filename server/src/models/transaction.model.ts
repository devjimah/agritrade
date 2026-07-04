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
    farmerId: { type: Schema.Types.ObjectId, ref: "Farmer", index: true },
    // Integer pesewas; direction is implied by `type`. Zero is allowed only
    // for commodity movements (repayment_received), which carry `bags`.
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
      validate: {
        // `this` is the document on create — the only write path for the
        // append-only ledger (update validators never run here).
        validator(this: unknown, v: number) {
          if (!Number.isInteger(v)) return false;
          const doc = this as Partial<ITransaction> | undefined;
          return v >= 1 || doc?.type === "repayment_received";
        },
        message: "Amount must be positive integer pesewas (zero only for commodity movements)",
      },
    },
    bags: {
      type: Number,
      // A commodity entry with no bags would record nothing moving.
      required: [
        function (this: { type?: string }) {
          return this.type === "repayment_received";
        },
        "Commodity transactions must record bags moved",
      ],
      min: [1, "Bags must be positive"],
      validate: { validator: Number.isInteger, message: "Bags must be a whole number" },
    },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

transactionSchema.index({ createdAt: -1 });

export const TransactionModel = model<ITransaction>("Transaction", transactionSchema);
