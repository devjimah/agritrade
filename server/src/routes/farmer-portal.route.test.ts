import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerModel } from "../models/farmer.model";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { RepaymentClaimModel } from "../models/repayment-claim.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
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
    // A real staff user, not a farmer id reused with role: "admin" — so this
    // token fails for the right reason (scope check) if requireFarmerAuth
    // regresses, rather than incidentally via a FarmerModel lookup miss.
    const staffUser = await UserModel.create({
      fullName: "Ama Trader",
      email: "ama@example.com",
      passwordHash: await hashPassword("secret123"),
      role: "admin",
    });
    staffToken = signToken({ sub: staffUser._id.toString(), role: staffUser.role });
  });

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authStaff = () => ({ Authorization: `Bearer ${staffToken}` });
  const authGarbage = () => ({ Authorization: "Bearer garbage" });

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

    it("401 with a garbage token", async () => {
      const res = await request(app).get("/api/farmer-portal/me").set(authGarbage());
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

    it("401 with a garbage token", async () => {
      const res = await request(app).get("/api/farmer-portal/advances").set(authGarbage());
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

    it("401 with a garbage token", async () => {
      const res = await request(app).get("/api/farmer-portal/repayments").set(authGarbage());
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/farmer-portal/repayment-claims", () => {
    it("the single most important test in this milestone: submitting a claim causes ZERO financial side effects", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 10,
      });

      // Capture exact state before submission.
      const txCountBefore = await TransactionModel.countDocuments();
      const invCountBefore = await InventoryModel.countDocuments();
      const maizeInvBefore = await InventoryModel.findOne({ cropType: "maize" });
      const maizeQtyBefore = maizeInvBefore?.quantityBags;
      const advanceBefore = await FarmerAdvanceModel.findById(advance._id);
      const bagsRepaidBefore = advanceBefore!.bagsRepaid;
      const repaymentStatusBefore = advanceBefore!.repaymentStatus;

      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: advance._id.toString(),
          bagsClaimed: 4,
          idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        });
      expect(res.status).toBe(201);

      // Assert byte-identical state afterwards.
      const txCountAfter = await TransactionModel.countDocuments();
      const invCountAfter = await InventoryModel.countDocuments();
      const maizeInvAfter = await InventoryModel.findOne({ cropType: "maize" });
      const advanceAfter = await FarmerAdvanceModel.findById(advance._id);

      expect(txCountAfter).toBe(txCountBefore);
      expect(invCountAfter).toBe(invCountBefore);
      expect(maizeInvAfter?.quantityBags).toBe(maizeQtyBefore);
      expect(advanceAfter!.bagsRepaid).toBe(bagsRepaidBefore);
      expect(advanceAfter!.repaymentStatus).toBe(repaymentStatusBefore);

      const claimCount = await RepaymentClaimModel.countDocuments();
      expect(claimCount).toBe(1);
    });

    it("happy path: creates a claim with status pending", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 10,
      });
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: advance._id.toString(),
          bagsClaimed: 3,
          idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.claim.status).toBe("pending");
      expect(res.body.data.claim.bagsClaimed).toBe(3);
      expect(res.body.data.claim.advanceId).toBe(advance._id.toString());
    });

    it("404 when the advance belongs to another farmer", async () => {
      const advanceB = await FarmerAdvanceModel.create({
        farmerId: farmerB._id,
        amountGiven: 20_000,
        cropType: "beans",
        expectedBags: 8,
      });
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: advanceB._id.toString(),
          bagsClaimed: 2,
          idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        });
      expect(res.status).toBe(404);
    });

    it("404 on a nonexistent advance id", async () => {
      const fakeId = new (await import("mongoose")).Types.ObjectId().toString();
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: fakeId,
          bagsClaimed: 2,
          idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        });
      expect(res.status).toBe(404);
    });

    it("400 when bagsClaimed exceeds remaining", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 5,
      });
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: advance._id.toString(),
          bagsClaimed: 6,
          idempotencyKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        });
      expect(res.status).toBe(400);
    });

    it("400 when the advance is already completed", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 5,
        bagsRepaid: 5,
        repaymentStatus: "completed",
      });
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({
          advanceId: advance._id.toString(),
          bagsClaimed: 1,
          idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        });
      expect(res.status).toBe(400);
    });

    it("idempotent duplicate: same idempotencyKey returns the same claim", async () => {
      const advance = await FarmerAdvanceModel.create({
        farmerId: farmerA._id,
        amountGiven: 50_000,
        cropType: "maize",
        expectedBags: 10,
      });
      const key = "11112222-3333-4444-8555-666677778888";
      const res1 = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({ advanceId: advance._id.toString(), bagsClaimed: 3, idempotencyKey: key });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authA())
        .send({ advanceId: advance._id.toString(), bagsClaimed: 3, idempotencyKey: key });
      expect(res2.status).toBe(201);
      expect(res2.body.data.claim._id).toBe(res1.body.data.claim._id);

      const count = await RepaymentClaimModel.countDocuments();
      expect(count).toBe(1);
    });

    it("401 with no token", async () => {
      const res = await request(app).post("/api/farmer-portal/repayment-claims").send({
        advanceId: farmerA._id.toString(),
        bagsClaimed: 1,
        idempotencyKey: "99998888-7777-4666-8555-444433332222",
      });
      expect(res.status).toBe(401);
    });

    it("401 with a staff token", async () => {
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authStaff())
        .send({
          advanceId: farmerA._id.toString(),
          bagsClaimed: 1,
          idempotencyKey: "99998888-7777-4666-8555-444433332221",
        });
      expect(res.status).toBe(401);
    });

    it("401 with a garbage token", async () => {
      const res = await request(app)
        .post("/api/farmer-portal/repayment-claims")
        .set(authGarbage())
        .send({
          advanceId: farmerA._id.toString(),
          bagsClaimed: 1,
          idempotencyKey: "99998888-7777-4666-8555-444433332223",
        });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/farmer-portal/repayment-claims", () => {
    it("returns only the caller's claims", async () => {
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
      await RepaymentClaimModel.create({
        advanceId: advanceA._id,
        farmerId: farmerA._id,
        bagsClaimed: 2,
        idempotencyKey: "aaaa1111-1111-4111-8111-111111111111",
      });
      await RepaymentClaimModel.create({
        advanceId: advanceB._id,
        farmerId: farmerB._id,
        bagsClaimed: 4,
        idempotencyKey: "bbbb2222-2222-4222-8222-222222222222",
      });

      const res = await request(app).get("/api/farmer-portal/repayment-claims").set(authA());
      expect(res.status).toBe(200);
      expect(res.body.data.claims).toHaveLength(1);
      expect(res.body.data.claims[0].farmerId).toBe(farmerA._id.toString());
    });

    it("401 with no token", async () => {
      const res = await request(app).get("/api/farmer-portal/repayment-claims");
      expect(res.status).toBe(401);
    });

    it("401 with a staff token", async () => {
      const res = await request(app)
        .get("/api/farmer-portal/repayment-claims")
        .set(authStaff());
      expect(res.status).toBe(401);
    });

    it("401 with a garbage token", async () => {
      const res = await request(app)
        .get("/api/farmer-portal/repayment-claims")
        .set(authGarbage());
      expect(res.status).toBe(401);
    });
  });
});
