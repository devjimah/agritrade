import { HydratedDocument, Schema, model } from "mongoose";
import { IUser } from "../types";

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "staff"], required: true, default: "staff" },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const UserModel = model<IUser>("User", userSchema);
