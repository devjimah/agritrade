import { HydratedDocument, Schema, model } from "mongoose";
import { ICustomer } from "../types";

export type CustomerDocument = HydratedDocument<ICustomer>;

const customerSchema = new Schema<ICustomer>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    // Unique for the same reason as farmers: the phone is the practical
    // identifier, and duplicates would split one customer's debt history.
    phone: { type: String, required: true, unique: true, trim: true },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

customerSchema.index({ createdAt: -1 });

export const CustomerModel = model<ICustomer>("Customer", customerSchema);
