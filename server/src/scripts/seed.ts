import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { InventoryModel } from "../models/inventory.model";
import { UserModel } from "../models/user.model";
import { CROP_TYPES } from "../types";
import { hashPassword } from "../utils/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@agritrade.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

async function seed() {
  await connectDb();

  const existing = await UserModel.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin user ${ADMIN_EMAIL} already exists — nothing to do.`);
  } else {
    await UserModel.create({
      fullName: "AgriTrade Admin",
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: "admin",
    });
    console.log(`Created admin user ${ADMIN_EMAIL} with password: ${ADMIN_PASSWORD}`);
    console.log("Change this password before deploying anywhere public.");
  }

  // One inventory doc per crop up front, so stock movements are always plain
  // updates (no upsert-insert race inside financial transactions).
  for (const cropType of CROP_TYPES) {
    await InventoryModel.updateOne(
      { cropType },
      { $setOnInsert: { quantityBags: 0 } },
      { upsert: true }
    );
  }
  console.log("Ensured inventory documents exist for all crops.");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
