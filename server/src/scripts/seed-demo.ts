/**
 * Demo data seeder. Drives the REAL service layer (not raw inserts) so every
 * financial operation runs through the same atomic transactions, ledger
 * writes, and balance updates as production — the dashboard, reports, and
 * detail pages light up with internally consistent data.
 *
 * Idempotent-ish: exits without writing if any demo farmer already exists.
 * Requires a replica-set MongoDB (npm run db:dev) and the base seed's admin
 * user (created here too if missing).
 */
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { FarmerModel } from "../models/farmer.model";
import { CustomerModel } from "../models/customer.model";
import { InventoryModel } from "../models/inventory.model";
import { UserModel } from "../models/user.model";
import { createAdvance } from "../services/advance.service";
import { createRepayment } from "../services/repayment.service";
import { createCreditSale } from "../services/credit-sale.service";
import { createPayment } from "../services/payment.service";
import { CROP_TYPES, CropType, PaymentMethod } from "../types";
import { hashPassword } from "../utils/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@agritrade.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const FARMERS = [
  { fullName: "Kofi Mensah", phone: "0244100001", village: "Techiman", notes: "Reliable maize supplier" },
  { fullName: "Abena Osei", phone: "0244100002", village: "Wenchi", notes: "" },
  { fullName: "Yaw Darko", phone: "0244100003", village: "Nkoranza", notes: "Two farms" },
  { fullName: "Akosua Boateng", phone: "0244100004", village: "Kintampo", notes: "" },
  { fullName: "Kwame Asante", phone: "0244100005", village: "Techiman", notes: "Groundnut specialist" },
  { fullName: "Efua Mansa", phone: "0244100006", village: "Atebubu", notes: "" },
];

const CUSTOMERS = [
  { fullName: "Yaw Boateng", phone: "0551200001", location: "Kumasi Central Market", notes: "Bulk maize buyer" },
  { fullName: "Esi Amankwah", phone: "0551200002", location: "Techiman Market", notes: "" },
  { fullName: "Kojo Antwi", phone: "0551200003", location: "Accra, Agbogbloshie", notes: "Pays monthly" },
  { fullName: "Ama Serwaa", phone: "0551200004", location: "Tamale", notes: "" },
  { fullName: "Kwabena Ofori", phone: "0551200005", location: "Sunyani", notes: "" },
];

/** GHS to pesewas. */
const ghs = (amount: number) => Math.round(amount * 100);

// [farmer index, GHS advanced, crop, expected bags, bags repaid so far]
const ADVANCES: Array<[number, number, CropType, number, number]> = [
  [0, 500, "maize", 10, 10], // completed
  [1, 300, "beans", 6, 4], // partial
  [2, 800, "maize", 16, 7], // partial
  [3, 250, "millet", 5, 0], // pending
  [4, 400, "groundnuts", 8, 8], // completed
  [5, 350, "bambara_beans", 7, 2], // partial
];
// Stock produced: maize 17, beans 4, groundnuts 8, bambara_beans 2.

// [customer index, crop, bags, GHS per bag, GHS paid so far, method]
const SALES: Array<[number, CropType, number, number, number, PaymentMethod]> = [
  [0, "maize", 8, 150, 500, "cash"], // partial
  [1, "maize", 4, 155, 620, "mobile_money"], // paid
  [2, "beans", 3, 180, 0, "cash"], // unpaid
  [3, "groundnuts", 5, 200, 400, "bank"], // partial
  [4, "bambara_beans", 2, 170, 340, "mobile_money"], // paid
];
// Stock left: maize 5, beans 1, groundnuts 3, bambara_beans 0.

async function seedDemo() {
  await connectDb();

  if (await FarmerModel.exists({ phone: FARMERS[0].phone })) {
    console.log("Demo data already present (demo farmer phone found) — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  let admin = await UserModel.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await UserModel.create({
      fullName: "AgriTrade Admin",
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: "admin",
    });
    console.log(`Created admin user ${ADMIN_EMAIL} with password: ${ADMIN_PASSWORD}`);
  }
  for (const cropType of CROP_TYPES) {
    await InventoryModel.updateOne(
      { cropType },
      { $setOnInsert: { quantityBags: 0 } },
      { upsert: true }
    );
  }

  const farmers = await FarmerModel.create(FARMERS);
  console.log(`Created ${farmers.length} farmers.`);
  const customers = await CustomerModel.create(CUSTOMERS);
  console.log(`Created ${customers.length} customers.`);

  for (const [farmerIdx, amountGHS, cropType, expectedBags, bagsRepaid] of ADVANCES) {
    const farmer = farmers[farmerIdx];
    const advance = await createAdvance(
      {
        farmerId: farmer._id.toString(),
        amountGiven: ghs(amountGHS),
        cropType,
        expectedBags,
        notes: "",
      },
      admin._id
    );
    if (bagsRepaid > 0) {
      await createRepayment(
        {
          advanceId: advance._id.toString(),
          bagsSupplied: bagsRepaid,
          idempotencyKey: randomUUID(),
          notes: "",
        },
        admin._id
      );
    }
    console.log(
      `Advance: ${farmer.fullName} — GHS ${amountGHS} for ${expectedBags} bags of ${cropType}, ${bagsRepaid} repaid.`
    );
  }

  for (const [customerIdx, cropType, bags, priceGHS, paidGHS, method] of SALES) {
    const customer = customers[customerIdx];
    const sale = await createCreditSale(
      {
        customerId: customer._id.toString(),
        cropType,
        bagsTaken: bags,
        pricePerBag: ghs(priceGHS),
        idempotencyKey: randomUUID(),
        notes: "",
      },
      admin._id
    );
    if (paidGHS > 0) {
      await createPayment(
        {
          creditSaleId: sale._id.toString(),
          amountPaid: ghs(paidGHS),
          paymentMethod: method,
          idempotencyKey: randomUUID(),
          notes: "",
        },
        admin._id
      );
    }
    console.log(
      `Sale: ${customer.fullName} — ${bags} bags of ${cropType} @ GHS ${priceGHS}, GHS ${paidGHS} paid.`
    );
  }

  const stock = await InventoryModel.find({ quantityBags: { $gt: 0 } });
  console.log(
    `Stock after demo: ${stock.map((s) => `${s.cropType}=${s.quantityBags}`).join(", ")}`
  );
  console.log("Demo seed complete.");
  await mongoose.disconnect();
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
