import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;
let farmerId: string;
let advanceId: string;

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
  const farmer = await FarmerModel.create({ fullName: "Kofi Mensah", phone: "0244123456" });
  farmerId = farmer._id.toString();
  const advance = await FarmerAdvanceModel.create({
    farmerId,
    amountGiven: 50_000,
    cropType: "maize",
    expectedBags: 10,
  });
  advanceId = advance._id.toString();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

const repay = (bags: number, extra: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/repayments")
    .set(auth())
    .send({ advanceId, bagsSupplied: bags, idempotencyKey: randomUUID(), ...extra });

describe("POST /api/repayments", () => {
  it("records a repayment and increments inventory", async () => {
    const res = await repay(4);
    expect(res.status).toBe(201);
    expect(res.body.data.repayment.bagsSupplied).toBe(4);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(4);
  });

  it("transitions advance status pending -> partial -> completed", async () => {
    await repay(4);
    let advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.repaymentStatus).toBe("partial");
    expect(advance?.bagsRepaid).toBe(4);

    await repay(6);
    advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.repaymentStatus).toBe("completed");
    expect(advance?.bagsRepaid).toBe(10);
  });

  it("writes a ledger transaction with bags and farmer linkage", async () => {
    const res = await repay(3);
    const tx = await TransactionModel.findOne({ referenceId: res.body.data.repayment._id });
    expect(tx?.type).toBe("repayment_received");
    expect(tx?.bags).toBe(3);
    expect(tx?.amount).toBe(0);
    expect(tx?.farmerId?.toString()).toBe(farmerId);
    expect(tx?.description).toContain("Kofi Mensah");
  });

  it("rejects over-repayment beyond bags remaining", async () => {
    await repay(8);
    const res = await repay(3); // only 2 remain
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("2 bag(s) remain");
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(8); // unchanged by the rejected attempt
  });

  it("accepts exactly the remaining bags", async () => {
    await repay(8);
    const res = await repay(2);
    expect(res.status).toBe(201);
    const advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.repaymentStatus).toBe("completed");
  });

  it("rejects repayment on a completed advance", async () => {
    await repay(10);
    const res = await repay(1);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("already fully repaid");
  });

  it("idempotent on duplicate key: returns the original repayment, counts nothing twice", async () => {
    const key = randomUUID();
    const first = await repay(2, { idempotencyKey: key });
    expect(first.status).toBe(201);
    const second = await repay(2, { idempotencyKey: key });
    expect(second.status).toBe(201);
    expect(second.body.data.repayment._id).toBe(first.body.data.repayment._id);
    // Nothing double-counted:
    expect(await FarmerRepaymentModel.countDocuments()).toBe(1);
    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(2);
    const advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.bagsRepaid).toBe(2);
  });

  it("rolls back everything when the ledger write fails (atomicity)", async () => {
    const spy = vi
      .spyOn(TransactionModel, "create")
      .mockRejectedValueOnce(new Error("ledger write failed"));
    const res = await repay(5);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await FarmerRepaymentModel.countDocuments()).toBe(0);
    expect(await InventoryModel.countDocuments()).toBe(0);
    const advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.bagsRepaid).toBe(0);
    expect(advance?.repaymentStatus).toBe("pending");
  });

  it("404 on unknown advance", async () => {
    const res = await request(app)
      .post("/api/repayments")
      .set(auth())
      .send({
        advanceId: "64b000000000000000000000",
        bagsSupplied: 1,
        idempotencyKey: randomUUID(),
      });
    expect(res.status).toBe(404);
  });

  it("400 on fractional bags", async () => {
    const res = await repay(2.5);
    expect(res.status).toBe(400);
  });

  it("401 without token", async () => {
    const res = await request(app)
      .post("/api/repayments")
      .send({ advanceId, bagsSupplied: 1, idempotencyKey: randomUUID() });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/repayments", () => {
  it("filters by advanceId", async () => {
    await repay(2);
    const other = await FarmerAdvanceModel.create({
      farmerId,
      amountGiven: 10_000,
      cropType: "beans",
      expectedBags: 5,
    });
    await request(app)
      .post("/api/repayments")
      .set(auth())
      .send({ advanceId: other._id.toString(), bagsSupplied: 1, idempotencyKey: randomUUID() });

    const res = await request(app).get(`/api/repayments?advanceId=${advanceId}`).set(auth());
    expect(res.body.data.repayments).toHaveLength(1);
    expect(res.body.data.repayments[0].cropType).toBe("maize");
  });

  it("filters by farmerId across advances", async () => {
    await repay(2);
    await repay(3);
    const res = await request(app).get(`/api/repayments?farmerId=${farmerId}`).set(auth());
    expect(res.body.data.repayments).toHaveLength(2);
  });
});

describe("repayment immutability", () => {
  it("PUT and DELETE are not exposed", async () => {
    const created = await repay(1);
    const id = created.body.data.repayment._id;
    expect((await request(app).put(`/api/repayments/${id}`).set(auth()).send({})).status).toBe(404);
    expect((await request(app).delete(`/api/repayments/${id}`).set(auth())).status).toBe(404);
  });
});

describe("GET /api/inventory", () => {
  it("returns all crops with zero defaults and live quantities", async () => {
    await repay(4);
    const res = await request(app).get("/api/inventory").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.inventory).toHaveLength(6);
    const maize = res.body.data.inventory.find(
      (i: { cropType: string }) => i.cropType === "maize"
    );
    expect(maize.quantityBags).toBe(4);
    const millet = res.body.data.inventory.find(
      (i: { cropType: string }) => i.cropType === "millet"
    );
    expect(millet.quantityBags).toBe(0);
  });

  it("401 without token", async () => {
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(401);
  });
});
