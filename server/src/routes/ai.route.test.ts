import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { AiProposalModel } from "../models/ai-proposal.model";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { CustomerModel } from "../models/customer.model";
import { InventoryModel } from "../models/inventory.model";
import { RepaymentClaimModel } from "../models/repayment-claim.model";
import { StockAdjustmentModel } from "../models/stock-adjustment.model";
import { TransactionModel } from "../models/transaction.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { runTool } from "../ai/tools";
import { ghsToPesewas } from "../validators/ai-proposal.validator";

let app: import("express").Express;
let staffToken: string;
let staffId: Types.ObjectId;
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
    fullName: "Ama Trader", email: "ama@example.com",
    passwordHash: await hashPassword("secret123"), role: "admin",
  });
  staffId = user._id;
  staffToken = signToken({ sub: user._id.toString(), role: user.role });
  const farmer = await FarmerModel.create({ fullName: "Abdul Rahman", phone: "0244123456", village: "Savelugu" });
  farmerId = farmer._id.toString();
  const advance = await FarmerAdvanceModel.create({ farmerId, amountGiven: 50_000, cropType: "maize", expectedBags: 10 });
  advanceId = advance._id.toString();
});

const auth = () => ({ Authorization: `Bearer ${staffToken}` });
const ctx = () => ({ staffId, source: "chat" as const });
const evidence = { summary: "Abdul delivered 4 bags maize", sourceText: "Abdul 4 bags", confidence: 0.9 };

async function proposeRepayment(bags = 4) {
  const out = JSON.parse(await runTool("propose_repayment", JSON.stringify({ advanceId, bagsSupplied: bags, ...evidence }), ctx()));
  return out.proposalId as string;
}

describe("ghsToPesewas", () => {
  it("converts decimal strings without floats", () => {
    expect(ghsToPesewas("300")).toBe(30_000);
    expect(ghsToPesewas("1,250.5")).toBe(125_050);
    expect(ghsToPesewas("0.07")).toBe(7);
  });
  it("rejects junk", () => {
    expect(() => ghsToPesewas("3e2")).toThrow();
    expect(() => ghsToPesewas("-5")).toThrow();
    expect(() => ghsToPesewas("1.234")).toThrow();
  });
});

describe("propose tools", () => {
  it("create an inert proposal: no repayment, no ledger entry, advance untouched", async () => {
    await proposeRepayment();
    expect(await AiProposalModel.countDocuments({ status: "pending" })).toBe(1);
    expect(await FarmerRepaymentModel.countDocuments()).toBe(0);
    expect(await TransactionModel.countDocuments()).toBe(0);
    expect((await FarmerAdvanceModel.findById(advanceId))!.bagsRepaid).toBe(0);
  });

  it("return validation errors to the model instead of storing bad proposals", async () => {
    const out = JSON.parse(await runTool("propose_repayment", JSON.stringify({ advanceId: "nope", bagsSupplied: 0, ...evidence }), ctx()));
    expect(out.error).toBeTruthy();
    expect(await AiProposalModel.countDocuments()).toBe(0);
  });

  it("convert cedis to pesewas server-side for advances", async () => {
    await runTool("propose_advance", JSON.stringify({ farmerId, amountGhs: "300.50", cropType: "maize", expectedBags: 5, ...evidence }), ctx());
    const p = await AiProposalModel.findOne({ kind: "create_advance" });
    expect(p!.payload.amountGiven).toBe(30_050);
  });
});

describe("POST /api/ai/proposals/:id/confirm", () => {
  it("applies via the existing service: repayment + ledger entry + link", async () => {
    const id = await proposeRepayment(4);
    const res = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.proposal.status).toBe("confirmed");
    expect((await FarmerAdvanceModel.findById(advanceId))!.bagsRepaid).toBe(4);
    expect(await TransactionModel.countDocuments({ type: "repayment_received" })).toBe(1);
  });

  it("concurrent confirms produce exactly one advance (no idempotency key on createAdvance)", async () => {
    await runTool("propose_advance", JSON.stringify({ farmerId, amountGhs: "100", cropType: "maize", expectedBags: 2, ...evidence }), ctx());
    const id = (await AiProposalModel.findOne({ kind: "create_advance" }))!._id;
    const results = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth())));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await FarmerAdvanceModel.countDocuments()).toBe(2); // seed + exactly one new
  });

  it("returns to pending with lastError when the service refuses", async () => {
    const id = await proposeRepayment(11); // only 10 bags expected
    const res = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(res.status).toBe(400);
    const p = await AiProposalModel.findById(id);
    expect(p!.status).toBe("pending");
    expect(p!.lastError).toMatch(/remain/);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("cannot confirm a rejected proposal", async () => {
    const id = await proposeRepayment();
    await request(app).post(`/api/ai/proposals/${id}/reject`).set(auth()).send({ reason: "Wrong farmer" });
    const res = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(res.status).toBe(400);
    expect(await FarmerRepaymentModel.countDocuments()).toBe(0);
  });
});

describe("PATCH /api/ai/proposals/:id (edit-then-retry)", () => {
  it("fixes a failed confirm: edit bags, keep the original, retry succeeds", async () => {
    const id = await proposeRepayment(11); // only 10 bags expected -> confirm fails
    await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());

    const edit = await request(app).patch(`/api/ai/proposals/${id}`).set(auth()).send({ changes: { bagsSupplied: 10 } });
    expect(edit.status).toBe(200);
    const p = edit.body.data.proposal;
    expect(p.payload.bagsSupplied).toBe(10);
    expect(p.originalPayload.bagsSupplied).toBe(11);
    expect(p.lastError).toBeUndefined();
    expect(await FarmerRepaymentModel.countDocuments()).toBe(0); // edit is still inert

    const retry = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(retry.status).toBe(200);
    expect((await FarmerAdvanceModel.findById(advanceId))!.bagsRepaid).toBe(10);
  });

  it("refuses to repoint a proposal at a different advance", async () => {
    const id = await proposeRepayment();
    const other = await FarmerAdvanceModel.create({ farmerId, amountGiven: 1_000, cropType: "beans", expectedBags: 3 });
    const res = await request(app).patch(`/api/ai/proposals/${id}`).set(auth()).send({ changes: { advanceId: other._id.toString() } });
    expect(res.status).toBe(400);
    expect((await AiProposalModel.findById(id))!.payload.advanceId).toBe(advanceId);
  });

  it("re-validates against the service schema", async () => {
    const id = await proposeRepayment();
    const res = await request(app).patch(`/api/ai/proposals/${id}`).set(auth()).send({ changes: { bagsSupplied: 0 } });
    expect(res.status).toBe(400);
  });

  it("cannot edit a confirmed proposal", async () => {
    const id = await proposeRepayment();
    await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    const res = await request(app).patch(`/api/ai/proposals/${id}`).set(auth()).send({ changes: { bagsSupplied: 2 } });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/ai/proposals", () => {
  it("resolves the target from the DB, not the model's summary", async () => {
    const id = await proposeRepayment(4);
    const res = await request(app).get("/api/ai/proposals").query({ ids: id }).set(auth());
    expect(res.status).toBe(200);
    const [p] = res.body.data.proposals;
    expect(p.target.farmer.fullName).toBe("Abdul Rahman");
    expect(p.target.advance).toMatchObject({ expectedBags: 10, bagsRepaid: 0 });
  });

  it("flags a proposal whose referenced record no longer resolves", async () => {
    const id = await proposeRepayment();
    await FarmerAdvanceModel.deleteOne({ _id: advanceId });
    const res = await request(app).get("/api/ai/proposals").query({ ids: id }).set(auth());
    expect(res.body.data.proposals[0].target).toEqual({ missing: true });
  });
});

describe("tool specs", () => {
  it("leave defaulted args optional and omit $schema", async () => {
    const { TOOL_SPECS } = await import("../ai/tools");
    const spec = TOOL_SPECS.find((t) => t.function.name === "get_debtors")!.function.parameters as Record<string, unknown>;
    expect(spec.$schema).toBeUndefined();
    expect(spec.required ?? []).not.toContain("limit");
  });
});

describe("new customer proposals", () => {
  it("confirm creates the customer through the existing service", async () => {
    const out = JSON.parse(await runTool("propose_customer", JSON.stringify({ fullName: "Ama Buyer", phone: "0201234567", location: "Tamale", ...evidence }), ctx()));
    expect(await CustomerModel.countDocuments()).toBe(0); // inert until confirmed
    const res = await request(app).post(`/api/ai/proposals/${out.proposalId}/confirm`).set(auth());
    expect(res.status).toBe(200);
    const customer = await CustomerModel.findById(res.body.data.proposal.resultingId);
    expect(customer).toMatchObject({ fullName: "Ama Buyer", location: "Tamale" });
  });
});

describe("stock adjustment proposals", () => {
  const adjust = async (changeBags: number) =>
    JSON.parse(await runTool("propose_stock_adjustment", JSON.stringify({ cropType: "maize", changeBags, reason: "Recount", ...evidence }), ctx())).proposalId as string;

  it("refuses to take stock below zero and leaves the proposal pending with lastError", async () => {
    await InventoryModel.create({ cropType: "maize", quantityBags: 2 });
    const id = await adjust(-3);
    const res = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(res.status).toBe(409);
    expect((await AiProposalModel.findById(id))!.lastError).toMatch(/Only 2 bag/);
    expect((await InventoryModel.findOne({ cropType: "maize" }))!.quantityBags).toBe(2);
    expect(await StockAdjustmentModel.countDocuments()).toBe(0);
  });

  it("applies with an audit record and no ledger entry", async () => {
    await InventoryModel.create({ cropType: "maize", quantityBags: 5 });
    const id = await adjust(-3);
    const res = await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    expect(res.status).toBe(200);
    expect((await InventoryModel.findOne({ cropType: "maize" }))!.quantityBags).toBe(2);
    const audit = await StockAdjustmentModel.findById(res.body.data.proposal.resultingId);
    expect(audit).toMatchObject({ changeBags: -3, quantityAfter: 2, reason: "Recount" });
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("adds stock for a crop with no inventory document yet", async () => {
    const id = await adjust(4);
    expect((await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth())).status).toBe(200);
    expect((await InventoryModel.findOne({ cropType: "maize" }))!.quantityBags).toBe(4);
  });

  it("rejects a zero change before a human ever sees it", async () => {
    const out = JSON.parse(await runTool("propose_stock_adjustment", JSON.stringify({ cropType: "maize", changeBags: 0, reason: "Recount", ...evidence }), ctx()));
    expect(out.error).toBeTruthy();
    expect(await AiProposalModel.countDocuments()).toBe(0);
  });

  it("shows current stock on the proposal for review", async () => {
    await InventoryModel.create({ cropType: "maize", quantityBags: 7 });
    const id = await adjust(-2);
    const res = await request(app).get("/api/ai/proposals").query({ ids: id }).set(auth());
    expect(res.body.data.proposals[0].target).toEqual({ stock: { cropType: "maize", quantityBags: 7 } });
  });
});

describe("read tools", () => {
  it("list_repayment_claims returns pending portal claims with the farmer's name", async () => {
    await RepaymentClaimModel.create({ advanceId, farmerId, bagsClaimed: 3, status: "pending", idempotencyKey: crypto.randomUUID() });
    const out = JSON.parse(await runTool("list_repayment_claims", "{}", ctx()));
    expect(out.total).toBe(1);
    expect(out.claims[0]).toMatchObject({ bagsClaimed: 3, farmerId: { fullName: "Abdul Rahman" } });
  });

  it("get_transactions filters by farmer and date range", async () => {
    const id = await proposeRepayment(4);
    await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    const today = new Date().toISOString().slice(0, 10);

    const mine = JSON.parse(await runTool("get_transactions", JSON.stringify({ farmerId, from: today, to: today }), ctx()));
    expect(mine.total).toBe(1);
    expect(mine.transactions[0]).toMatchObject({ type: "repayment_received", bags: 4 });

    const other = JSON.parse(await runTool("get_transactions", JSON.stringify({ farmerId: new Types.ObjectId().toString() }), ctx()));
    expect(other.total).toBe(0);
    const past = JSON.parse(await runTool("get_transactions", JSON.stringify({ to: "2020-01-01" }), ctx()));
    expect(past.total).toBe(0);
  });

  it("get_activity_summary totals each ledger type over the period", async () => {
    const id = await proposeRepayment(4);
    await request(app).post(`/api/ai/proposals/${id}/confirm`).set(auth());
    const today = new Date().toISOString().slice(0, 10);
    const rows = JSON.parse(await runTool("get_activity_summary", JSON.stringify({ from: today, to: today }), ctx()));
    expect(rows.find((r: { type: string }) => r.type === "repayment_received")).toMatchObject({ count: 1, bags: 4 });
    expect(rows.find((r: { type: string }) => r.type === "credit_sale")).toMatchObject({ count: 0 });
  });
});
