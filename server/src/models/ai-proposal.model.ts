import { HydratedDocument, Schema, Types, model } from "mongoose";

/**
 * An AI-suggested ledger action awaiting a trader's decision.
 *
 * INERT DATA (same rule as RepaymentClaim): creating or reading a proposal
 * must never touch FarmerAdvance, Inventory, Payment, CreditSale or
 * Transaction. Only confirmProposal() — a human action — calls the existing
 * services that make money or stock move.
 */
export const PROPOSAL_KINDS = [
  "create_farmer",
  "create_advance",
  "create_repayment",
  "create_credit_sale",
  "create_payment",
  "create_customer",
  "adjust_stock",
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/**
 * `applying` is a short-lived lock state. createAdvance/createFarmer take no
 * idempotency key, so confirm flips pending -> applying in ONE guarded write
 * first; only the winner of that write calls the service.
 */
export const PROPOSAL_STATUSES = ["pending", "applying", "confirmed", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_SOURCES = ["chat", "notebook_image"] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export interface IAiProposal {
  kind: ProposalKind;
  /**
   * Exactly the input the target service expects, minus idempotencyKey
   * (derived from the proposal id on confirm). Validated with the EXISTING
   * create*Schema before it is stored, so a bad proposal fails while the
   * agent can still self-correct, not when the trader clicks confirm.
   */
  payload: Record<string, unknown>;
  status: ProposalStatus;
  /** Human-readable one-liner shown on the review card. */
  summary: string;
  evidence: {
    source: ProposalSource;
    /** The trader's utterance, or the transcribed notebook row. */
    sourceText: string;
    /** Model's self-reported confidence, 0-1. UI hint only — never a gate. */
    confidence: number;
    rationale?: string;
  };
  /** Groups the rows extracted from one notebook photo. */
  batchId?: string;
  requestedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  /** Last service error on a failed confirm (proposal returns to pending). */
  lastError?: string;
  /**
   * The model's payload as first proposed, kept on the first trader edit so
   * the record shows what the AI said vs. what the trader confirmed.
   */
  originalPayload?: Record<string, unknown>;
  editedBy?: Types.ObjectId;
  editedAt?: Date;
  /** _id of the record the confirm produced (farmer, customer, advance, repayment, sale, payment, stock adjustment). */
  resultingId?: Types.ObjectId;
}

export type AiProposalDocument = HydratedDocument<IAiProposal>;

const aiProposalSchema = new Schema<IAiProposal>(
  {
    kind: { type: String, enum: PROPOSAL_KINDS, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: PROPOSAL_STATUSES, required: true, default: "pending" },
    summary: { type: String, required: true, trim: true, maxlength: 300 },
    evidence: {
      source: { type: String, enum: PROPOSAL_SOURCES, required: true },
      sourceText: { type: String, required: true, trim: true, maxlength: 2000 },
      confidence: { type: Number, required: true, min: 0, max: 1 },
      rationale: { type: String, trim: true, maxlength: 1000 },
    },
    batchId: { type: String, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    lastError: { type: String, trim: true, maxlength: 1000 },
    originalPayload: { type: Schema.Types.Mixed },
    editedBy: { type: Schema.Types.ObjectId, ref: "User" },
    editedAt: { type: Date },
    resultingId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false }
);

aiProposalSchema.index({ status: 1, createdAt: -1 });

export const AiProposalModel = model<IAiProposal>("AiProposal", aiProposalSchema);
