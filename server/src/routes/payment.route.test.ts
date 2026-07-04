import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { PaymentModel } from "../models/payment.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;
let customerId: string;
let saleId: string;

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
  // 120,000 pesewas (GHS 1,200) owed.
  const sale = await CreditSaleModel.create({
    customerId,
    cropType: "maize",
    bagsTaken: 8,
    pricePerBag: 15_000,
    totalAmount: 120_000,
    amountPaid: 0,
    balanceRemaining: 120_000,
    idempotencyKey: randomUUID(),
  });
  saleId = sale._id.toString();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

const pay = (amount: number, extra: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/payments")
    .set(auth())
    .send({
      creditSaleId: saleId,
      amountPaid: amount,
      paymentMethod: "cash",
      idempotencyKey: randomUUID(),
      ...extra,
    });

describe("POST /api/payments", () => {
  it("records a payment and updates the sale atomically", async () => {
    const res = await pay(50_000);
    expect(res.status).toBe(201);
    expect(res.body.data.payment.amountPaid).toBe(50_000);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.amountPaid).toBe(50_000);
    expect(sale?.balanceRemaining).toBe(70_000);
    expect(sale?.paymentStatus).toBe("partial");
    // Invariant: amountPaid + balanceRemaining === totalAmount
    expect((sale?.amountPaid ?? 0) + (sale?.balanceRemaining ?? 0)).toBe(120_000);
  });

  it("transitions unpaid -> partial -> paid", async () => {
    await pay(50_000);
    await pay(70_000);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.paymentStatus).toBe("paid");
    expect(sale?.balanceRemaining).toBe(0);
  });

  it("writes a ledger transaction with customer linkage", async () => {
    const res = await pay(50_000, { paymentMethod: "mobile_money" });
    const tx = await TransactionModel.findOne({ referenceId: res.body.data.payment._id });
    expect(tx?.type).toBe("payment_received");
    expect(tx?.amount).toBe(50_000);
    expect(tx?.customerId?.toString()).toBe(customerId);
    expect(tx?.description).toContain("mobile_money");
  });

  it("rejects overpayment beyond the balance (rule 8)", async () => {
    await pay(100_000);
    const res = await pay(30_000); // only 20,000 remains
    expect(res.status).toBe(400);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.balanceRemaining).toBe(20_000); // unchanged by rejection
    expect(await PaymentModel.countDocuments()).toBe(1);
  });

  it("accepts exactly the remaining balance", async () => {
    await pay(100_000);
    const res = await pay(20_000);
    expect(res.status).toBe(201);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.paymentStatus).toBe("paid");
  });

  it("rejects payment on an already paid sale", async () => {
    await pay(120_000);
    const res = await pay(1);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("already fully paid");
  });

  it("idempotent on duplicate key: returns the original payment, counts nothing twice", async () => {
    const key = randomUUID();
    const first = await pay(30_000, { idempotencyKey: key });
    expect(first.status).toBe(201);
    const second = await pay(30_000, { idempotencyKey: key });
    expect(second.status).toBe(201);
    expect(second.body.data.payment._id).toBe(first.body.data.payment._id);
    expect(await PaymentModel.countDocuments()).toBe(1);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.amountPaid).toBe(30_000);
  });

  it("rolls back the sale update when the ledger write fails (atomicity)", async () => {
    const spy = vi
      .spyOn(TransactionModel, "create")
      .mockRejectedValueOnce(new Error("ledger write failed"));
    const res = await pay(30_000);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await PaymentModel.countDocuments()).toBe(0);
    const sale = await CreditSaleModel.findById(saleId);
    expect(sale?.amountPaid).toBe(0);
    expect(sale?.balanceRemaining).toBe(120_000);
    expect(sale?.paymentStatus).toBe("unpaid");
  });

  it("404 on unknown sale", async () => {
    const res = await pay(1, { creditSaleId: "64b000000000000000000000" });
    expect(res.status).toBe(404);
  });

  it("400 on non-integer amount", async () => {
    const res = await pay(100.5);
    expect(res.status).toBe(400);
  });

  it("400 on invalid payment method", async () => {
    const res = await pay(1_000, { paymentMethod: "cowries" });
    expect(res.status).toBe(400);
  });

  it("401 without token", async () => {
    const res = await request(app).post("/api/payments").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/payments", () => {
  it("filters by creditSaleId and customerId", async () => {
    await pay(10_000);
    await pay(5_000);
    const bySale = await request(app).get(`/api/payments?creditSaleId=${saleId}`).set(auth());
    expect(bySale.body.data.payments).toHaveLength(2);
    const byCustomer = await request(app)
      .get(`/api/payments?customerId=${customerId}`)
      .set(auth());
    expect(byCustomer.body.data.payments).toHaveLength(2);
  });
});

describe("payment immutability", () => {
  it("PUT and DELETE are not exposed: payments are financial records", async () => {
    const created = await pay(10_000);
    const id = created.body.data.payment._id;
    expect(
      (await request(app).put(`/api/payments/${id}`).set(auth()).send({ amountPaid: 1 })).status
    ).toBe(404);
    expect((await request(app).delete(`/api/payments/${id}`).set(auth())).status).toBe(404);
  });
});
