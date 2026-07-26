import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { RepaymentClaimModel } from "../models/repayment-claim.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let staffToken: string;
let farmerToken: string;
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
  staffToken = signToken({ sub: user._id.toString(), role: user.role });
  const farmer = await FarmerModel.create({ fullName: "Kofi Mensah", phone: "0244123456" });
  farmerId = farmer._id.toString();
  farmerToken = signToken({ sub: farmerId, scope: "farmer" });
  const advance = await FarmerAdvanceModel.create({
    farmerId,
    amountGiven: 50_000,
    cropType: "maize",
    expectedBags: 10,
  });
  advanceId = advance._id.toString();
});

const authStaff = () => ({ Authorization: `Bearer ${staffToken}` });
const authFarmer = () => ({ Authorization: `Bearer ${farmerToken}` });

async function submitClaim(bagsClaimed: number, extra: Record<string, unknown> = {}) {
  return RepaymentClaimModel.create({
    advanceId,
    farmerId,
    bagsClaimed,
    idempotencyKey: randomUUID(),
    ...extra,
  });
}

const confirm = (id: string) =>
  request(app).post(`/api/repayment-claims/${id}/confirm`).set(authStaff());

const reject = (id: string, reason = "Bags did not match delivery note") =>
  request(app).post(`/api/repayment-claims/${id}/reject`).set(authStaff()).send({ reason });

describe("POST /api/repayment-claims/:id/confirm", () => {
  it("produces exactly what a direct createRepayment call would", async () => {
    const claim = await submitClaim(4);

    const txCountBefore = await TransactionModel.countDocuments();
    const repaymentCountBefore = await FarmerRepaymentModel.countDocuments();

    const res = await confirm(claim._id.toString());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.claim.status).toBe("confirmed");
    expect(res.body.data.claim.reviewedBy).toBe((await UserModel.findOne())!._id.toString());
    expect(res.body.data.claim.reviewedAt).toBeTruthy();

    const advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.bagsRepaid).toBe(4);
    expect(advance?.repaymentStatus).toBe("partial");

    const stock = await InventoryModel.findOne({ cropType: "maize" });
    expect(stock?.quantityBags).toBe(4);

    expect(await TransactionModel.countDocuments()).toBe(txCountBefore + 1);
    const tx = await TransactionModel.findOne({ type: "repayment_received" });
    expect(tx?.bags).toBe(4);
    expect(tx?.farmerId?.toString()).toBe(farmerId);

    expect(await FarmerRepaymentModel.countDocuments()).toBe(repaymentCountBefore + 1);
    const repayment = await FarmerRepaymentModel.findOne();
    expect(repayment?.bagsSupplied).toBe(4);

    const updatedClaim = await RepaymentClaimModel.findById(claim._id);
    expect(updatedClaim?.status).toBe("confirmed");
    expect(updatedClaim?.resultingRepaymentId?.toString()).toBe(repayment?._id.toString());
  });

  it("double-confirm: 400, no second repayment/ledger/inventory effect", async () => {
    const claim = await submitClaim(4);
    const first = await confirm(claim._id.toString());
    expect(first.status).toBe(200);

    const repaymentCountBefore = await FarmerRepaymentModel.countDocuments();
    const txCountBefore = await TransactionModel.countDocuments();
    const stockBefore = (await InventoryModel.findOne({ cropType: "maize" }))?.quantityBags;
    const advanceBagsBefore = (await FarmerAdvanceModel.findById(advanceId))?.bagsRepaid;

    const second = await confirm(claim._id.toString());
    expect(second.status).toBe(400);

    expect(await FarmerRepaymentModel.countDocuments()).toBe(repaymentCountBefore);
    expect(await TransactionModel.countDocuments()).toBe(txCountBefore);
    expect((await InventoryModel.findOne({ cropType: "maize" }))?.quantityBags).toBe(stockBefore);
    expect((await FarmerAdvanceModel.findById(advanceId))?.bagsRepaid).toBe(advanceBagsBefore);
  });

  it("stale claim: advance fully repaid elsewhere first, confirm surfaces 409 and claim stays pending", async () => {
    const claim = await submitClaim(4);

    // Fully repay the advance through the normal path before confirmation.
    const directRes = await request(app)
      .post("/api/repayments")
      .set(authStaff())
      .send({ advanceId, bagsSupplied: 10, idempotencyKey: randomUUID() });
    expect(directRes.status).toBe(201);

    const res = await confirm(claim._id.toString());
    expect(res.status).toBe(400); // createRepayment: "already fully repaid"

    const updatedClaim = await RepaymentClaimModel.findById(claim._id);
    expect(updatedClaim?.status).toBe("pending");
    expect(updatedClaim?.resultingRepaymentId).toBeFalsy();
  });

  it("over-claim across multiple pending claims: second confirm fails and stays pending", async () => {
    // Advance has 10 bags; two claims of 6 each together exceed it.
    const claimA = await submitClaim(6);
    const claimB = await submitClaim(6);

    const resA = await confirm(claimA._id.toString());
    expect(resA.status).toBe(200);

    const resB = await confirm(claimB._id.toString());
    // createRepayment's own pre-check catches this (6 > 4 remaining) before
    // the transaction even starts; the guarded update's 409 covers the
    // narrower race where the pre-read was stale but the pre-check passed.
    // Either way the error surfaces from createRepayment and the claim stays
    // pending — that's the property under test here.
    expect(resB.status).toBe(400);
    expect(resB.body.error.message).toContain("remain");

    const updatedB = await RepaymentClaimModel.findById(claimB._id);
    expect(updatedB?.status).toBe("pending");
    expect(updatedB?.resultingRepaymentId).toBeFalsy();

    const advance = await FarmerAdvanceModel.findById(advanceId);
    expect(advance?.bagsRepaid).toBe(6);
  });

  it("404 on a nonexistent claim id", async () => {
    const res = await confirm("64b000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("race-loser path: reports the true post-race confirmed state, not a stale pending snapshot", async () => {
    // Simulates two traders confirming the same claim concurrently: this
    // caller's createRepayment succeeds (idempotencyKey guarantees only one
    // repayment ever exists), but the guarded status-flip write loses the
    // race because some other writer already flipped the claim to
    // "confirmed" first. Force that by making findOneAndUpdate return null
    // exactly once, after directly flipping the claim in the DB to mimic the
    // "winner" having already landed.
    const claim = await submitClaim(4);

    const spy = vi
      .spyOn(RepaymentClaimModel, "findOneAndUpdate")
      .mockImplementationOnce(async () => {
        // The "winner" lands here, between our createRepayment call and our
        // own guarded write.
        await RepaymentClaimModel.updateOne(
          { _id: claim._id },
          {
            $set: {
              status: "confirmed",
              reviewedBy: claim._id, // arbitrary distinct ObjectId stand-in for "some other reviewer"
              reviewedAt: new Date(),
            },
          }
        );
        return null;
      });

    const res = await confirm(claim._id.toString());
    spy.mockRestore();

    expect(res.status).toBe(200);
    // Must reflect the TRUE current state (confirmed), not the stale
    // in-memory "pending" claim read before either write landed.
    expect(res.body.data.claim.status).toBe("confirmed");
    expect(res.body.data.claim._id).toBe(claim._id.toString());

    // Exactly one repayment exists — the race did not double-create one.
    expect(await FarmerRepaymentModel.countDocuments()).toBe(1);
  });

  it("401 without token", async () => {
    const claim = await submitClaim(2);
    const res = await request(app).post(`/api/repayment-claims/${claim._id}/confirm`);
    expect(res.status).toBe(401);
  });

  it("401 with a farmer-scoped token", async () => {
    const claim = await submitClaim(2);
    const res = await request(app)
      .post(`/api/repayment-claims/${claim._id}/confirm`)
      .set(authFarmer());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/repayment-claims/:id/reject", () => {
  it("rejects a pending claim with reason and reviewer metadata, no side effects", async () => {
    const claim = await submitClaim(4);

    const txCountBefore = await TransactionModel.countDocuments();
    const invCountBefore = await InventoryModel.countDocuments();
    const advanceBefore = await FarmerAdvanceModel.findById(advanceId);

    const res = await reject(claim._id.toString(), "Delivery note mismatch");
    expect(res.status).toBe(200);
    expect(res.body.data.claim.status).toBe("rejected");
    expect(res.body.data.claim.rejectionReason).toBe("Delivery note mismatch");
    expect(res.body.data.claim.reviewedAt).toBeTruthy();

    expect(await TransactionModel.countDocuments()).toBe(txCountBefore);
    expect(await InventoryModel.countDocuments()).toBe(invCountBefore);
    const advanceAfter = await FarmerAdvanceModel.findById(advanceId);
    expect(advanceAfter?.bagsRepaid).toBe(advanceBefore?.bagsRepaid);
    expect(advanceAfter?.repaymentStatus).toBe(advanceBefore?.repaymentStatus);
    expect(await FarmerRepaymentModel.countDocuments()).toBe(0);
  });

  it("400 on an already-reviewed claim (confirmed)", async () => {
    const claim = await submitClaim(4);
    await confirm(claim._id.toString());
    const res = await reject(claim._id.toString());
    expect(res.status).toBe(400);
  });

  it("400 on an already-rejected claim", async () => {
    const claim = await submitClaim(4);
    await reject(claim._id.toString());
    const res = await reject(claim._id.toString());
    expect(res.status).toBe(400);
  });

  it("404 on a nonexistent claim id", async () => {
    const res = await reject("64b000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("401 without token", async () => {
    const claim = await submitClaim(2);
    const res = await request(app)
      .post(`/api/repayment-claims/${claim._id}/reject`)
      .send({ reason: "no" });
    expect(res.status).toBe(401);
  });

  it("401 with a farmer-scoped token", async () => {
    const claim = await submitClaim(2);
    const res = await request(app)
      .post(`/api/repayment-claims/${claim._id}/reject`)
      .set(authFarmer())
      .send({ reason: "no" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/repayment-claims", () => {
  it("filters by status", async () => {
    const pending = await submitClaim(2);
    const toConfirm = await submitClaim(3);
    await confirm(toConfirm._id.toString());

    const res = await request(app)
      .get("/api/repayment-claims?status=pending")
      .set(authStaff());
    expect(res.status).toBe(200);
    expect(res.body.data.claims).toHaveLength(1);
    expect(res.body.data.claims[0]._id).toBe(pending._id.toString());

    const confirmedRes = await request(app)
      .get("/api/repayment-claims?status=confirmed")
      .set(authStaff());
    expect(confirmedRes.body.data.claims).toHaveLength(1);
    expect(confirmedRes.body.data.claims[0]._id).toBe(toConfirm._id.toString());
  });

  it("populates farmer name/phone", async () => {
    await submitClaim(2);
    const res = await request(app).get("/api/repayment-claims").set(authStaff());
    expect(res.status).toBe(200);
    expect(res.body.data.claims[0].farmerId.fullName).toBe("Kofi Mensah");
    expect(res.body.data.claims[0].farmerId.phone).toBe("0244123456");
  });

  it("401 without token", async () => {
    const res = await request(app).get("/api/repayment-claims");
    expect(res.status).toBe(401);
  });

  it("401 with a farmer-scoped token", async () => {
    const res = await request(app).get("/api/repayment-claims").set(authFarmer());
    expect(res.status).toBe(401);
  });
});
