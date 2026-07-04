import { HydratedDocument, Schema, model } from "mongoose";
import { IPayment, PAYMENT_METHODS } from "../types";

export type PaymentDocument = HydratedDocument<IPayment>;

const paymentSchema = new Schema<IPayment>(
  {
    creditSaleId: { type: Schema.Types.ObjectId, ref: "CreditSale", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    amountPaid: {
      type: Number,
      required: true,
      min: [1, "Amount must be positive"],
      validate: { validator: Number.isInteger, message: "Amount must be integer pesewas" },
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Unique: a retried or double-clicked submission carries the same key and
    // is answered with the original payment instead of recorded twice.
    idempotencyKey: { type: String, required: true, unique: true },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

paymentSchema.index({ creditSaleId: 1, createdAt: -1 });
paymentSchema.index({ customerId: 1, createdAt: -1 });

export const PaymentModel = model<IPayment>("Payment", paymentSchema);
