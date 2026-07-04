/**
 * Demo data seeder. Drives the REAL service layer (not raw inserts) so every
 * financial operation runs through the same atomic transactions, ledger
 * writes, and balance updates as production — the dashboard, reports, and
 * detail pages light up with internally consistent data.
 *
 * Deterministic generation (no randomness in the data itself, so re-seeding a
 * fresh DB always produces the same book). Idempotent-ish: exits without
 * writing if any demo farmer already exists. Requires a replica-set MongoDB
 * (npm run db:dev).
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
import { CROP_TYPES, CropType, PAYMENT_METHODS } from "../types";
import { hashPassword } from "../utils/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@agritrade.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const FARMER_COUNT = 25;
const CUSTOMER_COUNT = 20;

const FIRST_NAMES = [
  "Kofi", "Ama", "Yaw", "Akosua", "Kwame", "Efua", "Kojo", "Abena", "Kwabena",
  "Adwoa", "Kwaku", "Yaa", "Kwesi", "Esi", "Kwadwo", "Akua",
];
const SURNAMES = [
  "Mensah", "Osei", "Darko", "Boateng", "Asante", "Mansa", "Antwi", "Serwaa",
  "Ofori", "Amankwah", "Owusu", "Agyemang", "Appiah", "Frimpong",
];
const VILLAGES = ["Techiman", "Wenchi", "Nkoranza", "Kintampo", "Atebubu", "Ejura", "Yeji"];
const LOCATIONS = [
  "Kumasi Central Market", "Techiman Market", "Accra, Agbogbloshie", "Tamale",
  "Sunyani", "Cape Coast", "Ho Market",
];

/** Typical GHS price per bag by crop. */
const PRICE_GHS: Record<CropType, number> = {
  maize: 150,
  beans: 180,
  brown_rice: 220,
  millet: 160,
  bambara_beans: 170,
  groundnuts: 200,
};

const ghs = (amount: number) => Math.round(amount * 100);
const name = (i: number) => `${FIRST_NAMES[i % FIRST_NAMES.length]} ${SURNAMES[(i * 3 + 1) % SURNAMES.length]}`;

async function seedDemo() {
  await connectDb();

  if (await FarmerModel.exists({ phone: "0244100001" })) {
    console.log("Demo data already present (demo farmer phone found) — nothing to do.");
    console.log("To reseed bigger/fresh, drop the database first.");
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

  const farmers = await FarmerModel.create(
    Array.from({ length: FARMER_COUNT }, (_, i) => ({
      fullName: name(i),
      phone: `02441${String(i + 1).padStart(5, "0")}`,
      village: VILLAGES[i % VILLAGES.length],
      notes: i % 5 === 0 ? "Long-standing supplier" : "",
    }))
  );
  console.log(`Created ${farmers.length} farmers.`);

  const customers = await CustomerModel.create(
    Array.from({ length: CUSTOMER_COUNT }, (_, k) => ({
      fullName: name(k + 40),
      phone: `05512${String(k + 1).padStart(5, "0")}`,
      location: LOCATIONS[k % LOCATIONS.length],
      notes: k % 6 === 0 ? "Bulk buyer" : "",
    }))
  );
  console.log(`Created ${customers.length} customers.`);

  // --- Advances + repayments -------------------------------------------
  let advanceCount = 0;
  let repaymentCount = 0;
  let advancedGHS = 0;
  for (let i = 0; i < farmers.length; i++) {
    const advancesForFarmer = 1 + (i % 2); // 1 or 2 advances each
    for (let j = 0; j < advancesForFarmer; j++) {
      const cropType = CROP_TYPES[(i + j * 3) % CROP_TYPES.length];
      const expectedBags = 10 + ((i * 7 + j * 13) % 91); // 10..100 bags
      // Advance roughly 60% of the expected crop value.
      const amountGHS = Math.round(expectedBags * PRICE_GHS[cropType] * 0.6);
      const advance = await createAdvance(
        {
          farmerId: farmers[i]._id.toString(),
          amountGiven: ghs(amountGHS),
          cropType,
          expectedBags,
          notes: "",
        },
        admin._id
      );
      advanceCount++;
      advancedGHS += amountGHS;

      // Repayment pattern: full / half / none / three-quarters.
      const pattern = (i + j) % 4;
      const bagsRepaid =
        pattern === 0
          ? expectedBags
          : pattern === 1
            ? Math.floor(expectedBags / 2)
            : pattern === 2
              ? 0
              : Math.floor(expectedBags * 0.75);
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
        repaymentCount++;
      }
    }
  }
  console.log(
    `Recorded ${advanceCount} advances (GHS ${advancedGHS.toLocaleString()}) and ${repaymentCount} repayments.`
  );

  // --- Credit sales + payments -----------------------------------------
  // Sell from whatever stock the repayments produced, biggest pile first.
  const stockDocs = await InventoryModel.find({ quantityBags: { $gt: 0 } });
  const stock = new Map<CropType, number>(stockDocs.map((s) => [s.cropType, s.quantityBags]));

  let saleCount = 0;
  let paymentCount = 0;
  let soldGHS = 0;
  for (let k = 0; k < customers.length; k++) {
    const salesForCustomer = 1 + (k % 3 === 0 ? 1 : 0); // some customers buy twice
    for (let j = 0; j < salesForCustomer; j++) {
      const [cropType, available] =
        [...stock.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!cropType || !available || available < 2) break;

      const bags = Math.max(1, Math.floor(available * 0.15));
      const priceGHS = PRICE_GHS[cropType] + (k % 5) * 5; // small per-customer haggling spread
      const sale = await createCreditSale(
        {
          customerId: customers[k]._id.toString(),
          cropType,
          bagsTaken: bags,
          pricePerBag: ghs(priceGHS),
          idempotencyKey: randomUUID(),
          notes: "",
        },
        admin._id
      );
      stock.set(cropType, available - bags);
      saleCount++;
      const totalGHS = bags * priceGHS;
      soldGHS += totalGHS;

      // Payment pattern: full / half / none / quarter.
      const pattern = (k + j) % 4;
      const paidGHS =
        pattern === 0
          ? totalGHS
          : pattern === 1
            ? Math.floor(totalGHS / 2)
            : pattern === 2
              ? 0
              : Math.floor(totalGHS / 4);
      if (paidGHS > 0) {
        await createPayment(
          {
            creditSaleId: sale._id.toString(),
            amountPaid: ghs(paidGHS),
            paymentMethod: PAYMENT_METHODS[(k + j) % PAYMENT_METHODS.length],
            idempotencyKey: randomUUID(),
            notes: "",
          },
          admin._id
        );
        paymentCount++;
      }
    }
  }
  console.log(
    `Recorded ${saleCount} credit sales (GHS ${soldGHS.toLocaleString()}) and ${paymentCount} payments.`
  );

  const remaining = await InventoryModel.find({ quantityBags: { $gt: 0 } });
  console.log(
    `Stock after demo: ${remaining.map((s) => `${s.cropType}=${s.quantityBags}`).join(", ") || "empty"}`
  );
  console.log("Demo seed complete.");
  await mongoose.disconnect();
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
