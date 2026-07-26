import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerModel } from "../models/farmer.model";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);
beforeEach(clearTestDb);

const validFarmer = {
  fullName: "Kofi Mensah",
  phone: "0244123456",
  village: "Techiman",
  notes: "Maize farmer",
};

async function seedFarmerWithPin(pin = "1234") {
  return FarmerModel.create({ ...validFarmer, pinHash: await hashPassword(pin) });
}

describe("POST /api/farmer-portal/login", () => {
  it("logs in with a valid phone and PIN", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
  });

  it("normalizes +233 format on login", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "+233244123456", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("401 on wrong PIN", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "9999" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("401 on unknown phone, same message as wrong PIN", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0200000000", pin: "1234" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("401 when farmer exists but has no PIN set yet, same message", async () => {
    await FarmerModel.create(validFarmer);
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("never returns the pinHash", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(JSON.stringify(res.body)).not.toContain("pinHash");
  });

  it("400 on malformed body", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "not-a-phone", pin: "1234" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400 when pin is missing", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456" });
    expect(res.status).toBe(400);
  });
});

describe("authenticated farmer-portal endpoints", () => {
  let farmerA: import("../models/farmer.model").FarmerDocument;
  let farmerB: import("../models/farmer.model").FarmerDocument;
  let tokenA: string;
  let staffToken: string;

  beforeEach(async () => {
    farmerA = await seedFarmerWithPin();
    farmerB = await FarmerModel.create({
      fullName: "Abena Osei",
      phone: "0201112222",
      pinHash: await hashPassword("1234"),
    });
    tokenA = signToken({ sub: farmerA._id.toString(), scope: "farmer" });
    staffToken = signToken({ sub: farmerA._id.toString(), role: "admin" });
  });

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authStaff = () => ({ Authorization: `Bearer ${staffToken}` });

  describe("GET /api/farmer-portal/me", () => {
    it("returns the authenticated farmer's own profile", async () => {
      const res = await request(app).get("/api/farmer-portal/me").set(authA());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.farmer._id).toBe(farmerA._id.toString());
      expect(res.body.data.farmer.fullName).toBe("Kofi Mensah");
    });

    it("never includes pinHash", async () => {
      const res = await request(app).get("/api/farmer-portal/me").set(authA());
      expect(JSON.stringify(res.body)).not.toContain("pinHash");
    });

    it("401 with no token", async () => {
      const res = await request(app).get("/api/farmer-portal/me");
      expect(res.status).toBe(401);
    });

    it("401 with a staff token", async () => {
      const res = await request(app).get("/api/farmer-portal/me").set(authStaff());
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/farmer-portal/advances", () => {
    it("returns the authenticated farmer's advances and summary", async () => {
      await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 10,
      });
      const res = await request(app).get("/api/farmer-portal/advances").set(authA());
      expect(res.status).toBe(200);
      expect(res.body.data.advances).toHaveLength(1);
      expect(res.body.data.advances[0].farmerId._id).toBe(farmerA._id.toString());
      expect(res.body.data.summary.totalAdvances).toBe(1);
      expect(res.body.data.summary.outstandingAmount).toBe(50_000);
    });

    it("ignores a tampered farmerId query param and only returns own data", async () => {
      await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 10_000,
        cropType: "maize",
        expectedBags: 2,
      });
      await FarmerAdvanceModel.create({
        farmerId: farmerB._id,
        amountGiven: 99_000,
        cropType: "beans",
        expectedBags: 20,
      });
      const res = await request(app)
        .get(`/api/farmer-portal/advances?farmerId=${farmerB._id.toString()}`)
        .set(authA());
      expect(res.status).toBe(200);
      expect(res.body.data.advances).toHaveLength(1);
      expect(res.body.data.advances[0].farmerId._id).toBe(farmerA._id.toString());
      expect(res.body.data.summary.totalAdvances).toBe(1);
    });

    it("401 with no token", async () => {
      const res = await request(app).get("/api/farmer-portal/advances");
      expect(res.status).toBe(401);
    });

    it("401 with a staff token", async () => {
      const res = await request(app).get("/api/farmer-portal/advances").set(authStaff());
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/farmer-portal/repayments", () => {
    it("returns the authenticated farmer's repayments", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 10,
      });
      await FarmerRepaymentModel.create({
        advanceId: advance._id,
        farmerId: farmerA._id,
        cropType: "maize",
        bagsSupplied: 3,
        idempotencyKey: "11111111-1111-1111-1111-111111111111",
      });
      const res = await request(app).get("/api/farmer-portal/repayments").set(authA());
      expect(res.status).toBe(200);
      expect(res.body.data.repayments).toHaveLength(1);
      expect(res.body.data.repayments[0].farmerId).toBe(farmerA._id.toString());
    });

    it("ignores a tampered farmerId query param and only returns own data", async () => {
      const advanceA = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 10_000,
        cropType: "maize",
        expectedBags: 5,
      });
      const advanceB = await FarmerAdvanceModel.create({
        farmerId: farmerB._id,
        amountGiven: 20_000,
        cropType: "beans",
        expectedBags: 8,
      });
      await FarmerRepaymentModel.create({
        advanceId: advanceA._id,
        farmerId: farmerA._id,
        cropType: "maize",
        bagsSupplied: 2,
        idempotencyKey: "22222222-2222-2222-2222-222222222222",
      });
      await FarmerRepaymentModel.create({
        advanceId: advanceB._id,
        farmerId: farmerB._id,
        cropType: "beans",
        bagsSupplied: 4,
        idempotencyKey: "33333333-3333-3333-3333-333333333333",
      });
      const res = await request(app)
        .get(`/api/farmer-portal/repayments?farmerId=${farmerB._id.toString()}`)
        .set(authA());
      expect(res.status).toBe(200);
      expect(res.body.data.repayments).toHaveLength(1);
      expect(res.body.data.repayments[0].farmerId).toBe(farmerA._id.toString());
    });

    it("401 with no token", async () => {
      const res = await request(app).get("/api/farmer-portal/repayments");
      expect(res.status).toBe(401);
    });

    it("401 with a staff token", async () => {
      const res = await request(app).get("/api/farmer-portal/repayments").set(authStaff());
      expect(res.status).toBe(401);
    });
  });
});
