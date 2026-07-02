import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { UserModel } from "../models/user.model";
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

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
