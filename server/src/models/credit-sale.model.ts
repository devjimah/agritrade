import { HydratedDocument, Schema, model } from "mongoose";
import { CROP_TYPES, ICreditSale, PAYMENT_STATUSES } from "../types";

export type CreditSaleDocument = HydratedDocument<ICreditSale>;

const pesewas = (label: string) => ({
  type: Number,
  required: true,
  min: [0, `${label} cannot be negative`] as [number, string],
  validate: { validator: Number.isInteger, message: `${label} must be integer pesewas` },
});

const creditSaleSchema = new Schema<ICreditSale>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    cropType: { type: String, enum: CROP_TYPES, required: true },
    bagsTaken: {
      type: Number,
      required: true,
      min: [1, "Bags taken must be at least 1"],
      validate: { validator: Number.isInteger, message: "Bags must be a whole number" },
    },
    pricePerBag: {
      ...pesewas("Price per bag"),
      min: [1, "Price per bag must be positive"] as [number, string],
    },
    // Always bagsTaken * pricePerBag; set by the service, never by clients.
    totalAmount: { ...pesewas("Total"), min: [1, "Total must be positive"] as [number, string] },
    // amountPaid/balanceRemaining are only ever mutated atomically (guarded
    // update) inside the payment transaction — same pattern as bagsRepaid.
    amountPaid: pesewas("Amount paid"),
    balanceRemaining: pesewas("Balance"),
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      required: true,
      default: "unpaid",
    },
    // Unique: a retried or double-clicked submission carries the same key and
    // is answered with the original sale instead of recorded twice.
    idempotencyKey: { type: String, required: true, unique: true },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

creditSaleSchema.index({ customerId: 1, createdAt: -1 });
creditSaleSchema.index({ createdAt: -1 });

export const CreditSaleModel = model<ICreditSale>("CreditSale", creditSaleSchema);
