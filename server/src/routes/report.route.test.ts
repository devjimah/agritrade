import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { InventoryModel } from "../models/inventory.model";
import { PaymentModel } from "../models/payment.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;
let userId: string;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);

beforeEach(async () => {
  await clearTestDb();
  const user = await UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: await hashPassword("secret123"),
    role: "admin",
  });
  userId = user._id.toString();
  token = signToken({ sub: user._id.toString(), role: user.role });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

async function seedWorld() {
  const farmer = await FarmerModel.create({ fullName: "Kofi Mensah", phone: "0244123456" });
  const customer = await CustomerModel.create({ fullName: "Yaw Boateng", phone: "0551234567" });
  // Advance: 30,000 over 10 bags, 5 repaid -> 15,000 outstanding pro-rata.
  await FarmerAdvanceModel.create({
    farmerId: farmer._id,
    amountGiven: 30_000,
    cropType: "maize",
    expectedBags: 10,
    bagsRepaid: 5,
    repaymentStatus: "partial",
  });
  await InventoryModel.create({ cropType: "maize", quantityBags: 12 });
  // Sale today: 120,000 total, 50,000 paid -> 70,000 outstanding.
  const sale = await CreditSaleModel.create({
    customerId: customer._id,
    cropType: "maize",
    bagsTaken: 8,
    pricePerBag: 15_000,
    totalAmount: 120_000,
    amountPaid: 50_000,
    balanceRemaining: 70_000,
    paymentStatus: "partial",
    idempotencyKey: randomUUID(),
  });
  await PaymentModel.create({
    creditSaleId: sale._id,
    customerId: customer._id,
    amountPaid: 50_000,
    paymentMethod: "cash",
    recordedBy: userId,
    idempotencyKey: randomUUID(),
  });
  return { farmer, customer, sale };
}

describe("GET /api/reports/dashboard", () => {
  it("aggregates counts, balances, inventory and today's activity", async () => {
    await seedWorld();
    const res = await request(app).get("/api/reports/dashboard").set(auth());
    expect(res.status).toBe(200);
    const { report } = res.body.data;
    expect(report.counts.farmers).toBe(1);
    expect(report.counts.customers).toBe(1);
    expect(report.outstandingAdvances).toBe(15_000);
    expect(report.outstandingDebt).toBe(70_000);
    expect(report.inventory).toHaveLength(6);
    expect(
      report.inventory.find((i: { cropType: string }) => i.cropType === "maize").quantityBags
    ).toBe(12);
    expect(report.today.salesCount).toBe(1);
    expect(report.today.salesValue).toBe(120_000);
    expect(report.today.paymentsCount).toBe(1);
    expect(report.today.paymentsValue).toBe(50_000);
  });

  it("returns zeros on an empty database", async () => {
    const res = await request(app).get("/api/reports/dashboard").set(auth());
    expect(res.status).toBe(200);
    const { report } = res.body.data;
    expect(report.outstandingAdvances).toBe(0);
    expect(report.outstandingDebt).toBe(0);
    expect(report.today.salesCount).toBe(0);
  });

  it("401 without token", async () => {
    const res = await request(app).get("/api/reports/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/reports/debtors", () => {
  it("lists customers by outstanding balance, excluding settled ones", async () => {
    const { customer } = await seedWorld();
    const settled = await CustomerModel.create({ fullName: "Esi A", phone: "0209998888" });
    await CreditSaleModel.create({
      customerId: settled._id,
      cropType: "beans",
      bagsTaken: 1,
      pricePerBag: 10_000,
      totalAmount: 10_000,
      amountPaid: 10_000,
      balanceRemaining: 0,
      paymentStatus: "paid",
      idempotencyKey: randomUUID(),
    });
    const res = await request(app).get("/api/reports/debtors").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.debtors).toHaveLength(1);
    expect(res.body.data.debtors[0].customerId).toBe(customer._id.toString());
    expect(res.body.data.debtors[0].fullName).toBe("Yaw Boateng");
    expect(res.body.data.debtors[0].outstandingBalance).toBe(70_000);
  });
});

describe("GET /api/reports/farmer-balances", () => {
  it("lists farmers with open advances and pro-rata amounts", async () => {
    await seedWorld();
    const res = await request(app).get("/api/reports/farmer-balances").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.balances).toHaveLength(1);
    expect(res.body.data.balances[0].fullName).toBe("Kofi Mensah");
    expect(res.body.data.balances[0].outstandingAmount).toBe(15_000);
    expect(res.body.data.balances[0].bagsOutstanding).toBe(5);
  });
});

describe("GET /api/transactions", () => {
  it("lists ledger entries newest-first with type filter", async () => {
    // Drive real flows so ledger entries exist: create a farmer + advance via API.
    const farmer = await FarmerModel.create({ fullName: "Abena O", phone: "0201112222" });
    await request(app)
      .post("/api/advances")
      .set(auth())
      .send({
        farmerId: farmer._id.toString(),
        amountGiven: 10_000,
        cropType: "millet",
        expectedBags: 2,
      });
    const all = await request(app).get("/api/transactions").set(auth());
    expect(all.status).toBe(200);
    expect(all.body.data.transactions).toHaveLength(1);
    expect(all.body.data.transactions[0].type).toBe("advance_given");

    const filtered = await request(app)
      .get("/api/transactions?type=payment_received")
      .set(auth());
    expect(filtered.body.data.transactions).toHaveLength(0);
  });

  it("401 without token", async () => {
    const res = await request(app).get("/api/transactions");
    expect(res.status).toBe(401);
  });
});
