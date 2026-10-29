import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import {
  AiProposalDocument,
  AiProposalModel,
  IAiProposal,
  ProposalKind,
} from "../models/ai-proposal.model";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { InventoryModel } from "../models/inventory.model";
import { CropType } from "../types";
import {
  ListProposalsQuery,
  parseProposalEdit,
  parseProposalPayload,
} from "../validators/ai-proposal.validator";
import { createAdvance } from "./advance.service";
import { createCreditSale } from "./credit-sale.service";
import { createCustomer } from "./customer.service";
import { createFarmer } from "./farmer.service";
import { adjustStock } from "./inventory.service";
import { createPayment } from "./payment.service";
import { createRepayment } from "./repayment.service";

/** Proposal-scoped key: a retried confirm can only ever resolve to its own write. */
const keyFor = (id: Types.ObjectId) => `ai:${id.toString()}`;

export async function createProposal(input: {
  kind: ProposalKind;
  payload: unknown;
  summary: string;
  evidence: IAiProposal["evidence"];
  batchId?: string;
  requestedBy: Types.ObjectId;
}): Promise<AiProposalDocument> {
  // Throws ZodError on bad shape -> surfaced to the agent as a tool error,
  // so the model fixes it before a human ever sees it.
  const payload = parseProposalPayload(input.kind, input.payload);
  return AiProposalModel.create({ ...input, payload, status: "pending" });
}

export async function listProposals(query: ListProposalsQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.batchId) filter.batchId = query.batchId;
  if (query.ids) filter._id = { $in: query.ids };
  const [proposals, total] = await Promise.all([
    AiProposalModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    AiProposalModel.countDocuments(filter),
  ]);
  return {
    proposals: await withTargets(proposals),
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/**
 * What a proposal points at, read from the DB — never from the model's own
 * summary. The trader reviews "Abdul Rahman, maize advance, 6 of 10 bags
 * left" as the ledger has it, so an AI that wrote "Abdul" in the summary but
 * picked another farmer's advanceId is caught at review. `missing` means the
 * id resolved to nothing; confirm will fail and the proposal should be
 * rejected.
 */
export interface ProposalTarget {
  missing?: boolean;
  farmer?: { _id: Types.ObjectId; fullName: string; phone: string; village?: string };
  customer?: { _id: Types.ObjectId; fullName: string; phone: string; location?: string };
  advance?: {
    _id: Types.ObjectId; cropType: string; amountGiven: number;
    expectedBags: number; bagsRepaid: number; repaymentStatus: string;
  };
  creditSale?: {
    _id: Types.ObjectId; cropType: string; bagsTaken: number;
    totalAmount: number; balanceRemaining: number; paymentStatus: string;
  };
  /** adjust_stock: bags on hand now, so a removal larger than stock is flagged at review. */
  stock?: { cropType: string; quantityBags: number };
}

async function withTargets(proposals: AiProposalDocument[]) {
  const ids = (key: string) =>
    [...new Set(proposals.map((p) => p.payload[key]).filter((v): v is string => typeof v === "string"))];

  // Batch by collection: one query per referenced type, not one per proposal.
  const [advances, sales, stock] = await Promise.all([
    FarmerAdvanceModel.find({ _id: { $in: ids("advanceId") } }).lean(),
    CreditSaleModel.find({ _id: { $in: ids("creditSaleId") } }).lean(),
    InventoryModel.find(
      { cropType: { $in: proposals.filter((p) => p.kind === "adjust_stock").map((p) => p.payload.cropType as CropType) } },
      "cropType quantityBags"
    ).lean(),
  ]);
  const farmerIds = [...ids("farmerId"), ...advances.map((a) => a.farmerId.toString())];
  const customerIds = [...ids("customerId"), ...sales.map((s) => s.customerId.toString())];
  const [farmers, customers] = await Promise.all([
    FarmerModel.find({ _id: { $in: farmerIds } }, "fullName phone village").lean(),
    CustomerModel.find({ _id: { $in: customerIds } }, "fullName phone location").lean(),
  ]);

  const byId = <T extends { _id: Types.ObjectId }>(docs: T[]) =>
    new Map(docs.map((d) => [d._id.toString(), d]));
  const farmerMap = byId(farmers);
  const customerMap = byId(customers);
  const advanceMap = byId(advances);
  const saleMap = byId(sales);
  const stockMap = new Map<string, number>(stock.map((s) => [s.cropType, s.quantityBags]));

  return proposals.map((p) => {
    const payload = p.payload as Record<string, string>;
    let target: ProposalTarget | null = null;
    switch (p.kind) {
      case "create_advance": {
        const farmer = farmerMap.get(payload.farmerId);
        target = farmer ? { farmer } : { missing: true };
        break;
      }
      case "create_repayment": {
        const a = advanceMap.get(payload.advanceId);
        const farmer = a && farmerMap.get(a.farmerId.toString());
        target = a && farmer
          ? {
              farmer,
              advance: {
                _id: a._id, cropType: a.cropType, amountGiven: a.amountGiven,
                expectedBags: a.expectedBags, bagsRepaid: a.bagsRepaid, repaymentStatus: a.repaymentStatus,
              },
            }
          : { missing: true };
        break;
      }
      case "create_credit_sale": {
        const customer = customerMap.get(payload.customerId);
        target = customer ? { customer } : { missing: true };
        break;
      }
      case "create_payment": {
        const s = saleMap.get(payload.creditSaleId);
        const customer = s && customerMap.get(s.customerId.toString());
        target = s && customer
          ? {
              customer,
              creditSale: {
                _id: s._id, cropType: s.cropType, bagsTaken: s.bagsTaken, totalAmount: s.totalAmount,
                balanceRemaining: s.balanceRemaining, paymentStatus: s.paymentStatus,
              },
            }
          : { missing: true };
        break;
      }
      case "adjust_stock":
        target = { stock: { cropType: payload.cropType, quantityBags: stockMap.get(payload.cropType) ?? 0 } };
        break;
      case "create_farmer":
      case "create_customer":
        break; // a new record: nothing to resolve
    }
    return { ...p.toObject(), target };
  });
}

/**
 * Trader corrects a pending proposal's values (typically after a confirm
 * failed with lastError). Writes only the proposal — still inert. Guarded on
 * `pending`, so it can't race a confirm that already holds the lock.
 */
export async function editProposal(
  id: string,
  staff: Types.ObjectId,
  changes: unknown
): Promise<AiProposalDocument> {
  const current = await AiProposalModel.findById(id);
  if (!current) throw new AppError("Proposal not found", 404);
  if (current.status !== "pending") throw new AppError(`This proposal is already ${current.status}`, 400);

  const edit = parseProposalEdit(current.kind, changes);
  const payload = parseProposalPayload(current.kind, { ...current.payload, ...edit });

  const updated = await AiProposalModel.findOneAndUpdate(
    // Matching the updatedAt we read makes this compare-and-set: a concurrent
    // edit that landed in between wins, and this one is refused, not merged.
    { _id: current._id, status: "pending", updatedAt: current.get("updatedAt") },
    {
      $set: {
        payload,
        editedBy: staff,
        editedAt: new Date(),
        ...(current.originalPayload ? {} : { originalPayload: current.payload }),
      },
      // The error described the old values; the retry will report its own.
      $unset: { lastError: 1 },
    },
    { returnDocument: "after" }
  );
  if (!updated) throw new AppError("This proposal changed while you were editing — reload and try again", 409);
  return updated;
}

/** Calls the EXISTING service for this kind. Returns the created document's _id. */
async function apply(p: AiProposalDocument, staff: Types.ObjectId): Promise<Types.ObjectId> {
  // Re-validate: the payload sat in the DB, and schemas may have tightened since.
  const payload = parseProposalPayload(p.kind, p.payload);
  const idempotencyKey = keyFor(p._id);
  switch (p.kind) {
    case "create_farmer":
      return (await createFarmer(payload as Parameters<typeof createFarmer>[0]))._id;
    case "create_advance":
      return (await createAdvance(payload as Parameters<typeof createAdvance>[0], staff))._id;
    case "create_repayment":
      return (await createRepayment({ ...(payload as object), idempotencyKey } as Parameters<typeof createRepayment>[0], staff))._id;
    case "create_credit_sale":
      return (await createCreditSale({ ...(payload as object), idempotencyKey } as Parameters<typeof createCreditSale>[0], staff))._id;
    case "create_payment":
      return (await createPayment({ ...(payload as object), idempotencyKey } as Parameters<typeof createPayment>[0], staff))._id;
    case "create_customer":
      return (await createCustomer(payload as Parameters<typeof createCustomer>[0]))._id;
    case "adjust_stock":
      return (await adjustStock({ ...(payload as object), idempotencyKey } as Parameters<typeof adjustStock>[0], staff))._id;
  }
}

/**
 * Lock-then-apply. The guarded pending->applying flip has exactly one winner,
 * which protects createAdvance/createFarmer (no idempotency key) from a
 * double-click (createCustomer has no key either). Keyed kinds are protected
 * twice over.
 *
 * On a service error the proposal goes back to pending with lastError, so the
 * trader can edit-and-retry or reject. No compensating ledger writes, ever.
 *
 * Known gap: a crash between apply() and the final flip leaves a proposal in
 * `applying` with the write already committed. Surface stale `applying` rows
 * in the UI for manual reconciliation rather than auto-retrying.
 */
export async function confirmProposal(id: string, staff: Types.ObjectId): Promise<AiProposalDocument> {
  const locked = await AiProposalModel.findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: "applying" }, $unset: { lastError: 1 } },
    { returnDocument: "after" }
  );
  if (!locked) {
    const current = await AiProposalModel.findById(id);
    if (!current) throw new AppError("Proposal not found", 404);
    throw new AppError(`This proposal is already ${current.status}`, 400);
  }

  let resultingId: Types.ObjectId;
  try {
    resultingId = await apply(locked, staff);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await AiProposalModel.updateOne(
      { _id: locked._id, status: "applying" },
      { $set: { status: "pending", lastError: message } }
    );
    throw err;
  }

  const done = await AiProposalModel.findOneAndUpdate(
    { _id: locked._id, status: "applying" },
    { $set: { status: "confirmed", resultingId, reviewedBy: staff, reviewedAt: new Date() } },
    { returnDocument: "after" }
  );
  // Only the lock holder writes from `applying`, so this cannot be null
  // unless the document was altered out-of-band.
  if (!done) throw new AppError("Proposal changed during confirm — reconcile manually", 409);
  return done;
}

export async function rejectProposal(
  id: string,
  staff: Types.ObjectId,
  reason: string
): Promise<AiProposalDocument> {
  const updated = await AiProposalModel.findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: "rejected", rejectionReason: reason, reviewedBy: staff, reviewedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (updated) return updated;
  const current = await AiProposalModel.findById(id);
  if (!current) throw new AppError("Proposal not found", 404);
  throw new AppError(`This proposal is already ${current.status}`, 400);
}
