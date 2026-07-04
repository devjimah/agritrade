import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;
let customerId: string;

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
  token = signToken({ sub: user._id.toString(), role: user.role });
  const customer = await CustomerModel.create({ fullName: "Yaw Boateng", phone: "0551234567" });
  customerId = customer._id.toString();
  await InventoryModel.create({ cropType: "maize", quantityBags: 20 });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

// 8 bags at 15,000 pesewas (GHS 150) each = 120,000 pesewas.
const sell = (bags: number, extra: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/credit-sales")
    .set(auth())
    .send({
      customerId,
      cropType: "maize",
      bagsTaken: bags,
      pricePerBag: 15_000,
      idempotencyKey: randomUUID(),
      ...extra,
    });

describe("POST /api/credit-sales", () => {
  it("creates a sale with server-computed total and unpaid status", async () => {
    const res = await sell(8);
    expect(res.status).toBe(201);
    expect(res.body.data.sale.totalAmount).toBe(120_000);
    expect(res.body.data.sale.amountPaid).toBe(0);
    expect(res.body.data.sale.balanceRemaining).toBe(120_000);
    expect(res.body.data.sale.paymentStatus).toBe("unpaid");
  });

  it("ignores any client-supplied totalAmount", async () => {
    const res = await sell(8, { totalAmount: 1, balanceRemaining: 1, amountPaid: 999 });
    expect(res.status).toBe(201);
    expect(res.body.data.sale.totalAmount).toBe(120_000);
    expect(res.body.data.sale.amountPaid).toBe(0);
  });

  it("reduces inventory", async () => {
    await sell(8);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(12);
  });

  it("writes a ledger transaction with amount, bags and customer linkage", async () => {
    const res = await sell(8);
    const tx = await TransactionModel.findOne({ referenceId: res.body.data.sale._id });
    expect(tx?.type).toBe("credit_sale");
    expect(tx?.amount).toBe(120_000);
    expect(tx?.bags).toBe(8);
    expect(tx?.customerId?.toString()).toBe(customerId);
    expect(tx?.description).toContain("Yaw Boateng");
  });

  it("rejects a sale exceeding stock; nothing is written", async () => {
    const res = await sell(21);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Only 20 bag(s)");
    expect(await CreditSaleModel.countDocuments()).toBe(0);
    expect(await TransactionModel.countDocuments()).toBe(0);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(20);
  });

  it("accepts a sale of exactly the available stock, draining it to zero", async () => {
    const res = await sell(20);
    expect(res.status).toBe(201);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(0);
  });

  it("rejects selling a crop with no stock document", async () => {
    const res = await sell(1, { cropType: "millet" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Only 0 bag(s)");
  });

  it("404 on unknown customer", async () => {
    const res = await sell(1, { customerId: "64b000000000000000000000" });
    expect(res.status).toBe(404);
  });

  it("400 on non-integer price (floats are not pesewas)", async () => {
    const res = await sell(1, { pricePerBag: 150.5 });
    expect(res.status).toBe(400);
  });

  it("idempotent on duplicate key: returns the original sale, counts nothing twice", async () => {
    const key = randomUUID();
    const first = await sell(5, { idempotencyKey: key });
    expect(first.status).toBe(201);
    const second = await sell(5, { idempotencyKey: key });
    expect(second.status).toBe(201);
    expect(second.body.data.sale._id).toBe(first.body.data.sale._id);
    expect(await CreditSaleModel.countDocuments()).toBe(1);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(15);
  });

  it("rolls back inventory and sale when the ledger write fails (atomicity)", async () => {
    const spy = vi
      .spyOn(TransactionModel, "create")
      .mockRejectedValueOnce(new Error("ledger write failed"));
    const res = await sell(5);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await CreditSaleModel.countDocuments()).toBe(0);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(20);
  });

  it("401 without token", async () => {
    const res = await request(app).post("/api/credit-sales").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/credit-sales", () => {
  it("filters by customerId and paymentStatus", async () => {
    await sell(5);
    const other = await CustomerModel.create({ fullName: "Esi A", phone: "0209998888" });
    await sell(2, { customerId: other._id.toString() });

    const byCustomer = await request(app)
      .get(`/api/credit-sales?customerId=${customerId}`)
      .set(auth());
    expect(byCustomer.body.data.sales).toHaveLength(1);
    expect(byCustomer.body.data.sales[0].bagsTaken).toBe(5);

    const paid = await request(app).get("/api/credit-sales?paymentStatus=paid").set(auth());
    expect(paid.body.data.sales).toHaveLength(0);
    const unpaid = await request(app).get("/api/credit-sales?paymentStatus=unpaid").set(auth());
    expect(unpaid.body.data.sales).toHaveLength(2);
  });
});

describe("GET /api/credit-sales/summary", () => {
  it("sums balanceRemaining server-side", async () => {
    await sell(5); // 75,000
    await sell(2); // 30,000
    // A fully paid sale must not count toward outstanding:
    await CreditSaleModel.create({
      customerId,
      cropType: "beans",
      bagsTaken: 1,
      pricePerBag: 10_000,
      totalAmount: 10_000,
      amountPaid: 10_000,
      balanceRemaining: 0,
      paymentStatus: "paid",
      idempotencyKey: randomUUID(),
    });
    const res = await request(app)
      .get(`/api/credit-sales/summary?customerId=${customerId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.summary.outstandingBalance).toBe(105_000);
    expect(res.body.data.summary.totalSales).toBe(3);
    expect(res.body.data.summary.unpaidSales).toBe(2);
  });

  it("returns zeros for a customer with no sales", async () => {
    const res = await request(app)
      .get(`/api/credit-sales/summary?customerId=${customerId}`)
      .set(auth());
    expect(res.body.data.summary.outstandingBalance).toBe(0);
  });
});

describe("credit sale immutability", () => {
  it("PUT and DELETE are not exposed: sales are financial records", async () => {
    const created = await sell(1);
    const id = created.body.data.sale._id;
    expect(
      (await request(app).put(`/api/credit-sales/${id}`).set(auth()).send({ bagsTaken: 99 })).status
    ).toBe(404);
    expect((await request(app).delete(`/api/credit-sales/${id}`).set(auth())).status).toBe(404);
  });
});
