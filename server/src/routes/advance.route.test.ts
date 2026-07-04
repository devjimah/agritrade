import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;
let farmerId: string;

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
});

const auth = () => ({ Authorization: `Bearer ${token}` });

// 50,000 pesewas = GHS 500
const validAdvance = () => ({
  farmerId,
  amountGiven: 50_000,
  cropType: "maize",
  expectedBags: 10,
});

describe("POST /api/advances", () => {
  it("creates an advance with pending status", async () => {
    const res = await request(app).post("/api/advances").set(auth()).send(validAdvance());
    expect(res.status).toBe(201);
    expect(res.body.data.advance.amountGiven).toBe(50_000);
    expect(res.body.data.advance.repaymentStatus).toBe("pending");
  });

  it("writes a ledger transaction atomically with the advance", async () => {
    const res = await request(app).post("/api/advances").set(auth()).send(validAdvance());
    const txs = await TransactionModel.find({ referenceId: res.body.data.advance._id });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("advance_given");
    expect(txs[0].amount).toBe(50_000);
    expect(txs[0].description).toContain("Kofi Mensah");
  });

  it("401 without token", async () => {
    const res = await request(app).post("/api/advances").send(validAdvance());
    expect(res.status).toBe(401);
  });

  it("404 on unknown farmer", async () => {
    const res = await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), farmerId: "64b000000000000000000000" });
    expect(res.status).toBe(404);
    expect(await FarmerAdvanceModel.countDocuments()).toBe(0);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("400 on non-integer amount (floats are not pesewas)", async () => {
    const res = await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), amountGiven: 500.5 });
    expect(res.status).toBe(400);
  });

  it("400 on zero or negative amount", async () => {
    const res = await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), amountGiven: 0 });
    expect(res.status).toBe(400);
  });

  it("400 on invalid crop type", async () => {
    const res = await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), cropType: "cocoa" });
    expect(res.status).toBe(400);
  });

  it("400 on fractional expected bags", async () => {
    const res = await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), expectedBags: 2.5 });
    expect(res.status).toBe(400);
  });

  it("rolls back the advance when the ledger write fails (atomicity)", async () => {
    const spy = vi
      .spyOn(TransactionModel, "create")
      .mockRejectedValueOnce(new Error("ledger write failed"));
    const res = await request(app).post("/api/advances").set(auth()).send(validAdvance());
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await FarmerAdvanceModel.countDocuments()).toBe(0);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });
});

describe("advance immutability", () => {
  it("PUT and DELETE are not exposed: advances are financial records", async () => {
    const created = await request(app).post("/api/advances").set(auth()).send(validAdvance());
    const id = created.body.data.advance._id;
    const putRes = await request(app).put(`/api/advances/${id}`).set(auth()).send({ amountGiven: 1 });
    const delRes = await request(app).delete(`/api/advances/${id}`).set(auth());
    expect(putRes.status).toBe(404);
    expect(delRes.status).toBe(404);
  });
});

describe("GET /api/advances", () => {
  it("lists advances newest-first with farmer populated", async () => {
    await request(app).post("/api/advances").set(auth()).send(validAdvance());
    await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), cropType: "beans", amountGiven: 20_000 });
    const res = await request(app).get("/api/advances").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.advances).toHaveLength(2);
    expect(res.body.data.advances[0].cropType).toBe("beans");
    expect(res.body.data.advances[0].farmerId.fullName).toBe("Kofi Mensah");
  });

  it("filters by farmerId", async () => {
    const other = await FarmerModel.create({ fullName: "Abena Osei", phone: "0201112222" });
    await request(app).post("/api/advances").set(auth()).send(validAdvance());
    await request(app)
      .post("/api/advances")
      .set(auth())
      .send({ ...validAdvance(), farmerId: other._id.toString() });
    const res = await request(app).get(`/api/advances?farmerId=${farmerId}`).set(auth());
    expect(res.body.data.advances).toHaveLength(1);
  });

  it("filters by repaymentStatus in both directions", async () => {
    await request(app).post("/api/advances").set(auth()).send(validAdvance());
    await FarmerAdvanceModel.create({
      farmerId,
      amountGiven: 10_000,
      cropType: "millet",
      expectedBags: 2,
      repaymentStatus: "completed",
    });
    const completed = await request(app)
      .get("/api/advances?repaymentStatus=completed")
      .set(auth());
    expect(completed.body.data.advances).toHaveLength(1);
    expect(completed.body.data.advances[0].cropType).toBe("millet");
    const pending = await request(app).get("/api/advances?repaymentStatus=pending").set(auth());
    expect(pending.body.data.advances).toHaveLength(1);
    expect(pending.body.data.advances[0].cropType).toBe("maize");
  });

  it("400 on malformed farmerId filter", async () => {
    const res = await request(app).get("/api/advances?farmerId=nope").set(auth());
    expect(res.status).toBe(400);
  });
});

describe("GET /api/advances/summary", () => {
  it("computes outstanding server-side, excluding completed advances", async () => {
    await request(app).post("/api/advances").set(auth()).send(validAdvance()); // 50,000 pending
    await FarmerAdvanceModel.create({
      farmerId,
      amountGiven: 30_000,
      cropType: "beans",
      expectedBags: 5,
      repaymentStatus: "partial",
    });
    await FarmerAdvanceModel.create({
      farmerId,
      amountGiven: 99_000,
      cropType: "millet",
      expectedBags: 9,
      repaymentStatus: "completed",
    });
    const res = await request(app).get(`/api/advances/summary?farmerId=${farmerId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.summary.outstandingAmount).toBe(80_000);
    expect(res.body.data.summary.totalAdvances).toBe(3);
    expect(res.body.data.summary.pendingAdvances).toBe(2);
  });

  it("pro-rates outstanding by bags repaid on partial advances", async () => {
    // 30,000 pesewas over 10 expected bags, 9 already delivered -> 3,000 left.
    await FarmerAdvanceModel.create({
      farmerId,
      amountGiven: 30_000,
      cropType: "beans",
      expectedBags: 10,
      bagsRepaid: 9,
      repaymentStatus: "partial",
    });
    const res = await request(app).get(`/api/advances/summary?farmerId=${farmerId}`).set(auth());
    expect(res.body.data.summary.outstandingAmount).toBe(3_000);
  });

  it("returns zeros for a farmer with no advances", async () => {
    const res = await request(app).get(`/api/advances/summary?farmerId=${farmerId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.summary.outstandingAmount).toBe(0);
    expect(res.body.data.summary.totalAdvances).toBe(0);
  });

  it("400 without a farmerId", async () => {
    const res = await request(app).get("/api/advances/summary").set(auth());
    expect(res.status).toBe(400);
  });
});

describe("GET /api/advances/:id", () => {
  it("returns an advance", async () => {
    const created = await request(app).post("/api/advances").set(auth()).send(validAdvance());
    const res = await request(app)
      .get(`/api/advances/${created.body.data.advance._id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.advance.expectedBags).toBe(10);
  });

  it("404 on missing advance", async () => {
    const res = await request(app).get("/api/advances/64b000000000000000000000").set(auth());
    expect(res.status).toBe(404);
  });
});
