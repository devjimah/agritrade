import { HydratedDocument, Schema, model } from "mongoose";
import { IFarmer } from "../types";

export type FarmerDocument = HydratedDocument<IFarmer>;

const farmerSchema = new Schema<IFarmer>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    // Unique: the phone number is the trader's practical identifier for a
    // farmer, and duplicates would split one farmer's advance history.
    phone: { type: String, required: true, unique: true, trim: true },
    village: { type: String, trim: true, maxlength: 120, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

// The list endpoint always sorts newest-first; an unanchored case-insensitive
// name regex can't use an index, so this is the only useful secondary index.
farmerSchema.index({ createdAt: -1 });

export const FarmerModel = model<IFarmer>("Farmer", farmerSchema);
